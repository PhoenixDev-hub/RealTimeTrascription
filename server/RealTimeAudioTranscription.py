from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import socket
import sys
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import Configure
import numpy as np
import sounddevice as sd
import websockets

try:
    from rich.console import Console
    from rich.live import Live
    from rich.panel import Panel
    from rich.table import Table
    from rich.text import Text
    from rich.theme import Theme

    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False

logger = logging.getLogger(__name__)
console = (
    Console(theme=Theme({"info": "cyan", "warning": "yellow", "error": "bold red"}))
    if RICH_AVAILABLE
    else None
)


@dataclass(frozen=True)
class Settings:
    sample_rate: int = int(os.getenv("AUDIO_SAMPLE_RATE", "16000"))
    channels: int = int(os.getenv("AUDIO_CHANNELS", "1"))
    chunk_size: int = int(os.getenv("AUDIO_CHUNK_SIZE", "1600"))
    audio_queue_size: int = int(os.getenv("AUDIO_QUEUE_MAX_SIZE", "8"))
    max_queue_age_ms: float = float(os.getenv("AUDIO_MAX_QUEUE_AGE_MS", "1200"))
    read_timeout: float = float(os.getenv("AUDIO_READ_TIMEOUT_SECONDS", "5"))
    recv_timeout: float = float(os.getenv("TRANSCRIPTION_RECV_TIMEOUT_SECONDS", "30"))
    max_reconnects: int = int(os.getenv("MAX_RECONNECT_ATTEMPTS", "5"))
    reconnect_delay: float = float(os.getenv("INITIAL_RECONNECT_DELAY", "2"))
    max_reconnect_delay: float = float(os.getenv("MAX_RECONNECT_DELAY", "30"))
    speech_model: str = os.getenv("SPEECH_MODEL", "u3-rt-pro")
    audio_device: str = os.getenv("AUDIO_DEVICE", "").strip()
    list_audio_devices: bool = os.getenv("LIST_AUDIO_DEVICES", "0") == "1"
    debug_latency: bool = os.getenv("DEBUG_LATENCY", "0") == "1"
    use_portuguese_prompt: bool = os.getenv("USE_PORTUGUESE_PROMPT", "1") == "1"
    latency_log_interval: float = float(os.getenv("LATENCY_LOG_INTERVAL_SECONDS", "2"))
    metrics_log_interval: float = float(os.getenv("METRICS_LOG_INTERVAL_SECONDS", "5"))
    partial_send_step: int = int(os.getenv("PARTIAL_SEND_STEP", "2"))
    partial_send_interval_ms: int = int(os.getenv("PARTIAL_SEND_INTERVAL_MS", "80"))
    vad_energy_threshold: int = int(os.getenv("VAD_ENERGY_THRESHOLD", "300"))
    vad_hold_silence_ms: int = int(os.getenv("VAD_HOLD_SILENCE_MS", "240"))
    save_transcripts: bool = os.getenv("SAVE_TRANSCRIPTS", "1") == "1"
    transcript_output_dir: str = os.getenv("TRANSCRIPT_OUTPUT_DIR", "transcripts")
    local_fallback: bool = os.getenv("LOCAL_FALLBACK", "1") == "1"
    local_fallback_model: str = os.getenv("LOCAL_FALLBACK_MODEL", "small")
    probe_host: str = os.getenv("INTERNET_PROBE_HOST", "1.1.1.1")
    probe_port: int = int(os.getenv("INTERNET_PROBE_PORT", "53"))
    probe_timeout: float = float(os.getenv("INTERNET_PROBE_TIMEOUT", "2"))
    log_level: str = os.getenv("LOG_LEVEL", "INFO").upper()


SETTINGS = Settings()

PORTUGUESE_PROMPT = os.getenv(
    "TRANSCRIPTION_PROMPT",
    (
        "Transcreva exclusivamente em português do Brasil. "
        "Priorize falas de sala de aula, explicações de professor, perguntas de aluno, "
        "instruções pedagógicas, vocabulário escolar e termos técnicos. "
        "Mantenha a pontuação simples e natural. Não traduza para inglês."
    ),
)

KEYTERMS_PROMPT = os.getenv(
    "KEYTERMS_PROMPT",
    (
        "português do Brasil,aula,professor,aluno,escola,ensino,ensino médio,fundamental,"
        "vestibular,prova,exercício,simulado,apresentação,console,presença,"
        "Libras,inclusão,acessibilidade,exemplo,atividade,conteúdo,projeto,atividade prática,"
        "tarefa,declaração,pergunta,resposta,explicação"
    ),
)


class RecoverableTranscriptionError(Exception):
    pass


class FatalTranscriptionError(Exception):
    pass


@dataclass
class AudioStats:
    queued: int = 0
    sent: int = 0
    dropped: int = 0
    max_queue_age_ms: float = 0.0
    total_bytes_sent: int = 0
    started_at: float = field(default_factory=time.monotonic)
    last_metrics_log: float = field(default_factory=time.monotonic)

    def summary(self) -> str:
        return (
            f"audio_chunks={self.queued} "
            f"enviados={self.sent} "
            f"descartados={self.dropped} "
            f"bytes={self.total_bytes_sent} "
            f"maior_fila={self.max_queue_age_ms:.0f}ms"
        )

    def average_latency_ms(self) -> float:
        elapsed = max(1.0, time.monotonic() - self.started_at)
        return (self.max_queue_age_ms / elapsed) * 1000 if elapsed else 0.0

    def uptime(self) -> str:
        return str(timedelta(seconds=int(time.monotonic() - self.started_at)))


class AudioBuffer:
    def __init__(self, max_size: int) -> None:
        self.queue: asyncio.Queue[tuple[bytes, float]] = asyncio.Queue(maxsize=max_size)
        self.stats = AudioStats()

    def push(self, data: bytes, captured_at: float) -> None:
        while True:
            try:
                self.queue.put_nowait((data, captured_at))
                self.stats.queued += 1
                return
            except asyncio.QueueFull:
                self.drop_oldest()

    def drop_oldest(self) -> None:
        try:
            self.queue.get_nowait()
            self.stats.dropped += 1
        except asyncio.QueueEmpty:
            return

    def drain_stale(self) -> None:
        dropped = 0
        while not self.queue.empty():
            try:
                self.queue.get_nowait()
                dropped += 1
            except asyncio.QueueEmpty:
                break
        self.stats.dropped += dropped
        if dropped:
            logger.warning(
                "Filtrando %s quadros antigos da fila para reduzir atraso.", dropped
            )

    def queue_size(self) -> int:
        return self.queue.qsize()


def format_timestamp(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    seconds = int(seconds % 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def classify_speaker(text: str) -> str:
    lower = text.lower()
    if any(
        keyword in lower
        for keyword in ("professor", "professora", "docente", "instrutor")
    ):
        return "Professor"
    if any(
        keyword in lower for keyword in ("aluno", "aluna", "turma", "pessoal", "gente")
    ):
        return "Aluno"
    if "?" in lower or any(
        keyword in lower for keyword in ("por que", "como", "quando", "onde", "o que")
    ):
        return "Aluno"
    return "Professor"


class TranscriptSaver:
    def __init__(self) -> None:
        self.entries: list[dict[str, Any]] = []
        self.dir = Path(SETTINGS.transcript_output_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.start_at = time.monotonic()
        self.sequence = 1
        self.text_file = self.dir / "transcricao.txt"
        self.json_file = self.dir / "transcricao.json"
        self.srt_file = self.dir / "transcricao.srt"

    def save_final(self, text: str, speaker: str) -> None:
        timestamp = time.monotonic() - self.start_at
        entry = {
            "timestamp": format_timestamp(timestamp),
            "seconds": round(timestamp, 2),
            "speaker": speaker,
            "text": text,
        }
        self.entries.append(entry)
        self._append_txt(entry)
        self._write_json()
        self._write_srt()

    def _append_txt(self, entry: dict[str, Any]) -> None:
        with self.text_file.open("a", encoding="utf-8") as handle:
            handle.write(
                f"[{entry['timestamp']}] {entry['speaker']}: {entry['text']}\n"
            )

    def _write_json(self) -> None:
        with self.json_file.open("w", encoding="utf-8") as handle:
            json.dump(self.entries, handle, ensure_ascii=False, indent=2)

    def _write_srt(self) -> None:
        with self.srt_file.open("w", encoding="utf-8") as handle:
            for index, entry in enumerate(self.entries, start=1):
                start_seconds = entry["seconds"]
                duration = max(1.5, min(7.0, len(entry["text"]) / 15))
                end_seconds = start_seconds + duration
                handle.write(f"{index}\n")
                handle.write(
                    f"{self._srt_timecode(start_seconds)} --> {self._srt_timecode(end_seconds)}\n"
                )
                handle.write(f"{entry['speaker']}: {entry['text']}\n\n")

    def _srt_timecode(self, seconds: float) -> str:
        ms = int((seconds - int(seconds)) * 1000)
        total_seconds = int(seconds)
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        secs = total_seconds % 60
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


class TerminalTranscript:
    line_limit = 120
    print_step = 180

    def __init__(
        self,
        on_text: Callable[[dict[str, Any]], Awaitable[None]] | None,
        stats: AudioStats,
        saver: TranscriptSaver | None = None,
    ) -> None:
        self.on_text = on_text
        self.stats = stats
        self.saver = saver
        self.partial_text = ""
        self.partial_printed = 0
        self.partial_sent = ""
        self.partial_sent_at = 0.0
        self.previous_line_size = 0
        self.live: Live | None = None
        if RICH_AVAILABLE and console:
            self.live = Live(self._render(), console=console, refresh_per_second=4)
            self.live.start()

    def stop(self) -> None:
        if self.live:
            try:
                self.live.stop()
            except Exception:
                pass
            self.live = None

    def _render(self) -> Panel:
        partial = self.partial_text or "Aguardando áudio..."
        metrics = Table.grid(expand=True)
        metrics.add_column(justify="left")
        metrics.add_row(f"Uptime: {self.stats.uptime()}")
        metrics.add_row(
            f"Filas: {self.stats.queued} | Enviados: {self.stats.sent} | Descartados: {self.stats.dropped}"
        )
        metrics.add_row(f"Maior fila: {self.stats.max_queue_age_ms:.0f}ms")
        metrics.add_row(f"Latência média: {self.stats.average_latency_ms():.1f}ms")

        content = Table.grid(expand=True)
        content.add_column(ratio=3)
        content.add_column(ratio=1)
        content.add_row(Text(partial[-self.line_limit :], style="info"), metrics)

        return Panel(
            content,
            title="Transcrição em tempo real",
            subtitle=f"Conectado há {self.stats.uptime()}",
        )

    async def handle_turn(self, text: str, final: bool) -> None:
        if final:
            await self._final(text)
            return

        if text != self.partial_text:
            await self._partial(text)

    async def _final(self, text: str) -> None:
        speaker = classify_speaker(text)
        if self.live:
            self.live.stop()
        if console:
            console.print(
                Panel(Text(text, style="bold white"), title=f"Final - {speaker}")
            )
        else:
            clear_line(max(150, self.previous_line_size))
            print("-" * 60)
            print(
                f"[{format_timestamp(time.monotonic() - self.stats.started_at)}] {speaker}: {text}"
            )
            print("-" * 60)
            print()

        if self.saver and SETTINGS.save_transcripts:
            self.saver.save_final(text, speaker)

        await notify(
            self.on_text,
            {
                "type": "transcript",
                "text": text,
                "is_final": True,
                "speaker": speaker,
            },
        )
        self._reset()

    async def _partial(self, text: str) -> None:
        self.partial_text = text
        now = time.monotonic()

        if self._should_send_partial(text, now):
            await notify(
                self.on_text,
                {"type": "transcript", "text": text, "is_final": False},
            )
            self.partial_sent = text
            self.partial_sent_at = now

        if self.live:
            self.live.update(self._render())
        else:
            if len(text) - self.partial_printed >= self.print_step:
                clear_line(max(150, self.previous_line_size))
                print("Ouvindo:")
                print(text[self.partial_printed :])
                print()
                self.partial_printed = len(text)
                self.previous_line_size = 0
            else:
                display = text[-self.line_limit :]
                line = "Ouvindo: " + display
                padding = max(0, self.previous_line_size - len(line))
                sys.stdout.write("\r" + line + " " * (padding + 20))
                self.previous_line_size = len(line)
            sys.stdout.flush()

    def _should_send_partial(self, text: str, now: float) -> bool:
        elapsed_ms = (now - self.partial_sent_at) * 1000
        return (
            not self.partial_sent
            or len(text) - len(self.partial_sent) >= SETTINGS.partial_send_step
            or (
                text != self.partial_sent
                and elapsed_ms >= SETTINGS.partial_send_interval_ms
            )
        )

    def _reset(self) -> None:
        self.partial_text = ""
        self.partial_printed = 0
        self.partial_sent = ""
        self.partial_sent_at = 0.0
        self.previous_line_size = 0
        if self.live:
            self.live.update(self._render())


def validate_settings() -> None:
    if SETTINGS.sample_rate <= 0:
        raise FatalTranscriptionError("AUDIO_SAMPLE_RATE deve ser maior que zero.")
    if SETTINGS.channels != 1:
        raise FatalTranscriptionError("AUDIO_CHANNELS deve ser 1 para pcm16.")
    if SETTINGS.chunk_size <= 0:
        raise FatalTranscriptionError("AUDIO_CHUNK_SIZE deve ser maior que zero.")
    if SETTINGS.chunk_size % 2 != 0:
        raise FatalTranscriptionError("AUDIO_CHUNK_SIZE deve ser par para pcm16.")
    if SETTINGS.audio_queue_size < 1:
        raise FatalTranscriptionError("AUDIO_QUEUE_MAX_SIZE deve ser no minimo 1.")


def block_samples() -> int:
    return max(1, SETTINGS.chunk_size // (SETTINGS.channels * 2))


def get_auth_key() -> str:
    auth_key = getattr(Configure, "AuthKey", "")
    if not auth_key:
        raise FatalTranscriptionError("ASSEMBLYAI_API_KEY não configurada.")
    return auth_key


def build_url(use_portuguese_prompt: bool) -> str:
    params: dict[str, Any] = {
        "sample_rate": SETTINGS.sample_rate,
        "speech_model": SETTINGS.speech_model,
        "include_partial_turns": "true",
    }

    if use_portuguese_prompt:
        params["prompt"] = PORTUGUESE_PROMPT
        keyterms = [term.strip() for term in KEYTERMS_PROMPT.split(",") if term.strip()]
        if keyterms:
            params["keyterms_prompt"] = json.dumps(keyterms, ensure_ascii=False)

    return "wss://streaming.assemblyai.com/v3/ws?" + urlencode(params, doseq=True)


def clear_line(min_size: int = 150) -> None:
    sys.stdout.write("\r" + " " * min_size + "\r")


def is_internet_available() -> bool:
    try:
        with socket.create_connection(
            (SETTINGS.probe_host, SETTINGS.probe_port),
            timeout=SETTINGS.probe_timeout,
        ):
            return True
    except OSError as exc:
        logger.warning("Falha na checagem de internet: %s", exc)
        return False


def device_name(device: dict[str, Any]) -> str:
    hostapi = sd.query_hostapis(device["hostapi"])
    return f"{device['name']} ({hostapi['name']})"


def input_devices() -> list[tuple[int, dict[str, Any]]]:
    return [
        (index, device)
        for index, device in enumerate(sd.query_devices())
        if device.get("max_input_channels", 0) > 0
    ]


def print_audio_devices() -> None:
    devices = input_devices()
    if not devices:
        print("Nenhum microfone listado.")
        return

    print("Microfones disponíveis:")
    for index, device in devices:
        print(f"{index}: {device_name(device)}")


def select_microphone() -> int | None:
    devices = input_devices()
    if not devices:
        return None

    choice = SETTINGS.audio_device
    if choice.isdigit():
        selected = int(choice)
        return selected if any(index == selected for index, _ in devices) else None

    if choice:
        choice = choice.lower()
        for index, device in devices:
            if choice in device_name(device).lower():
                return index
        return None

    default_input = sd.default.device[0]
    if default_input is not None and any(
        index == default_input for index, _ in devices
    ):
        return default_input

    return devices[0][0]


def api_error_is_fatal(message: str) -> bool:
    message = message.lower()
    return any(
        term in message
        for term in (
            "401",
            "403",
            "unauthorized",
            "forbidden",
            "api key",
            "authentication",
            "authorization",
            "quota",
            "billing",
            "invalid api",
            "invalid token",
            "invalid model",
        )
    )


def api_error_is_prompt_related(message: str) -> bool:
    message = message.lower()
    return any(
        term in message
        for term in (
            "prompt",
            "keyterms",
            "language_detection",
            "include_partial",
            "query",
            "parameter",
            "unsupported",
            "unknown",
            "invalid",
        )
    )


async def notify(
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None,
    message: dict[str, Any],
) -> None:
    if on_text:
        await on_text(message)


def is_voice_energy(data: bytes) -> bool:
    if not data:
        return False
    samples = np.frombuffer(data, dtype=np.int16)
    if samples.size == 0:
        return False
    rms = math.sqrt(float(np.mean(samples.astype(np.float32) ** 2)))
    if logger.isEnabledFor(logging.DEBUG):
        logger.debug("VAD RMS=%s", rms)
    return rms >= SETTINGS.vad_energy_threshold


def make_audio_queue(
    loop: asyncio.AbstractEventLoop,
) -> tuple[
    AudioBuffer,
    Callable[[Any, int, Any, Any], None],
]:
    buffer = AudioBuffer(max_size=SETTINGS.audio_queue_size)
    vad_active = False
    vad_silence_blocks = 0
    vad_hold_blocks = max(
        1,
        int(
            SETTINGS.vad_hold_silence_ms
            / (SETTINGS.chunk_size / SETTINGS.sample_rate * 1000)
        ),
    )

    def callback(indata, frames, time_info, status) -> None:
        nonlocal vad_active, vad_silence_blocks
        if status:
            logger.warning("Aviso na captura de áudio: %s", status)
        data = bytes(indata)
        if is_voice_energy(data):
            vad_active = True
            vad_silence_blocks = 0
            loop.call_soon_threadsafe(buffer.push, data, time.monotonic())
            return

        if vad_active and vad_silence_blocks < vad_hold_blocks:
            vad_silence_blocks += 1
            loop.call_soon_threadsafe(buffer.push, data, time.monotonic())
            return

        # Não enviar silêncio prolongado
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug("Silêncio detectado, pulando envio de bloco de áudio.")

    return buffer, callback


async def read_audio(queue: asyncio.Queue[tuple[bytes, float]]) -> tuple[bytes, float]:
    try:
        return await asyncio.wait_for(queue.get(), timeout=SETTINGS.read_timeout)
    except TimeoutError as exc:
        raise RecoverableTranscriptionError("Captura de áudio sem dados.") from exc


async def send_audio(
    ws: Any,
    audio_buffer: AudioBuffer,
) -> None:
    buffer = bytearray()
    buffer_started_at = 0.0
    last_log = time.monotonic()

    while True:
        data, captured_at = await read_audio(audio_buffer.queue)
        if not buffer:
            buffer_started_at = captured_at
        buffer.extend(data)

        while len(buffer) >= SETTINGS.chunk_size:
            queue_age_ms = (time.monotonic() - buffer_started_at) * 1000
            if queue_age_ms >= SETTINGS.max_queue_age_ms:
                logger.warning(
                    "Atraso de fila muito alto: %.0fms. Limpando fila para reduzir latency.",
                    queue_age_ms,
                )
                audio_buffer.drain_stale()
                buffer.clear()
                buffer_started_at = 0.0
                break

            chunk = bytes(buffer[: SETTINGS.chunk_size])
            await ws.send(chunk)
            del buffer[: SETTINGS.chunk_size]

            stats = audio_buffer.stats
            stats.sent += 1
            stats.total_bytes_sent += len(chunk)
            stats.max_queue_age_ms = max(stats.max_queue_age_ms, queue_age_ms)

            now = time.monotonic()
            if (
                SETTINGS.debug_latency
                and now - last_log >= SETTINGS.latency_log_interval
            ):
                print(f"\nlatencia_audio: {stats.summary()}\n")
                last_log = now

            if not buffer:
                buffer_started_at = 0.0


async def receive_transcripts(
    ws: Any,
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None,
    stats: AudioStats,
    saver: TranscriptSaver | None = None,
) -> None:
    terminal = TerminalTranscript(on_text, stats, saver)
    try:
        while True:
            message = await receive_json(ws)
            message_type = message.get("type")

            if message_type == "Turn":
                text = message.get("transcript", "").strip()
                if text:
                    await terminal.handle_turn(text, bool(message.get("turn_is_done")))
                continue

            if message_type in ("SessionBegins", "Begin"):
                print("Sessão iniciada.\n")
                continue

            if message_type in ("SessionTerminated", "Termination"):
                raise RecoverableTranscriptionError("Sessão encerrada pela API.")

            if message_type in ("Error", "error"):
                raise_api_error(message)
    finally:
        terminal.stop()


async def receive_json(ws: Any) -> dict[str, Any]:
    try:
        async with asyncio.timeout(SETTINGS.recv_timeout):
            raw = await ws.recv()
    except TimeoutError as exc:
        raise RecoverableTranscriptionError("API sem resposta.") from exc

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RecoverableTranscriptionError(
            f"Resposta inválida da API: {raw!r}"
        ) from exc


def raise_api_error(message: dict[str, Any]) -> None:
    error = message.get("error") or message.get("message") or message
    text = str(error)
    if api_error_is_fatal(text):
        raise FatalTranscriptionError(f"Erro fatal da API: {text}")
    raise RecoverableTranscriptionError(f"Erro da API: {text}")


async def wait_session_start(ws: Any) -> None:
    start_types = {"Begin", "SessionBegins"}

    while True:
        message = await receive_json(ws)
        message_type = message.get("type")

        if message_type in start_types and message.get("id"):
            return

        if message_type is None and message.get("id"):
            logger.info("Sessão iniciada com resposta sem campo type: %s", message)
            return

        if message_type in ("Warning", "warning"):
            warning = message.get("warning") or message.get("message") or message
            logger.warning("Aviso da API ao iniciar sessão: %s", warning)
            continue

        if message_type in ("Error", "error"):
            raise_api_error(message)

        raise RecoverableTranscriptionError(
            f"Resposta inesperada ao iniciar sessão: {message}"
        )


async def run_session(
    microphone: int,
    auth_key: str,
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None,
    url: str,
) -> None:
    loop = asyncio.get_running_loop()
    audio_buffer, audio_callback = make_audio_queue(loop)

    async with websockets.connect(
        url,
        additional_headers={"Authorization": auth_key},
        ping_interval=10,
        ping_timeout=30,
        close_timeout=10,
        max_size=None,
    ) as ws:
        await wait_session_start(ws)
        print("=" * 60)
        print("TRANSCRIÇÃO EM TEMPO REAL")
        print("=" * 60)
        print()

        check_microphone(microphone)

        with sd.RawInputStream(
            samplerate=SETTINGS.sample_rate,
            blocksize=block_samples(),
            device=microphone,
            channels=SETTINGS.channels,
            dtype="int16",
            callback=audio_callback,
        ):
            saver = TranscriptSaver() if SETTINGS.save_transcripts else None
            tasks = [
                asyncio.create_task(send_audio(ws, audio_buffer)),
                asyncio.create_task(
                    receive_transcripts(ws, on_text, audio_buffer.stats, saver)
                ),
            ]
            done, pending = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()

            for task in done:
                task.result()

            for task in pending:
                try:
                    await task
                except asyncio.CancelledError:
                    pass


async def run_local_fallback(
    microphone: int,
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None,
) -> None:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise FatalTranscriptionError(
            "Fallback local ativado, mas faster-whisper não está instalado."
        ) from exc

    model = WhisperModel(SETTINGS.local_fallback_model, device="auto")
    loop = asyncio.get_running_loop()
    audio_buffer, audio_callback = make_audio_queue(loop)
    saver = TranscriptSaver() if SETTINGS.save_transcripts else None

    if console:
        console.print(Panel("Modo local ativado: transcrição com faster-whisper."))
    else:
        print("Modo local ativado: transcrição com faster-whisper.")

    with sd.RawInputStream(
        samplerate=SETTINGS.sample_rate,
        blocksize=block_samples(),
        device=microphone,
        channels=SETTINGS.channels,
        dtype="int16",
        callback=audio_callback,
    ):
        local_data = bytearray()
        while True:
            data, _ = await read_audio(audio_buffer.queue)
            local_data.extend(data)
            if len(local_data) < SETTINGS.sample_rate * 2:
                continue

            audio_np = (
                np.frombuffer(local_data, dtype=np.int16).astype(np.float32) / 32768.0
            )
            local_data.clear()
            segments, _ = model.transcribe(
                audio_np,
                beam_size=1,
                language="pt",
                word_timestamps=False,
                vad_filter=True,
            )
            for segment in segments:
                text = segment.text.strip()
                if not text:
                    continue
                speaker = classify_speaker(text)
                if saver and SETTINGS.save_transcripts:
                    saver.save_final(text, speaker)
                await notify(
                    on_text,
                    {
                        "type": "transcript",
                        "text": text,
                        "is_final": True,
                        "speaker": speaker,
                    },
                )


def check_microphone(microphone: int) -> None:
    try:
        sd.check_input_settings(
            device=microphone,
            channels=SETTINGS.channels,
            samplerate=SETTINGS.sample_rate,
            dtype="int16",
        )
    except Exception as exc:
        raise FatalTranscriptionError(
            f"Microfone incompatível com {SETTINGS.sample_rate}Hz mono int16: {exc}"
        ) from exc


async def iniciar_transcricao(
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
) -> None:
    try:
        validate_settings()
        if SETTINGS.list_audio_devices:
            print_audio_devices()
            return
        auth_key = get_auth_key()
    except FatalTranscriptionError as exc:
        await fail(on_text, str(exc))
        return

    microphone = select_microphone()
    if microphone is None:
        devices = "\n".join(f"{i}: {device_name(d)}" for i, d in input_devices())
        await fail(
            on_text,
            "Microfone não encontrado.\n" + (devices or "Nenhum microfone listado."),
        )
        return

    device = sd.query_devices(microphone)
    print("\nMicrofone selecionado:")
    print(f"{microphone}: {device_name(device)}")
    print()

    await reconnecting_loop(microphone, auth_key, on_text)


async def reconnecting_loop(
    microphone: int,
    auth_key: str,
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None,
) -> None:
    attempts = 0
    delay = SETTINGS.reconnect_delay
    use_prompt = SETTINGS.use_portuguese_prompt

    while True:
        if not is_internet_available():
            if SETTINGS.local_fallback:
                logger.warning("Internet offline detectada. Iniciando fallback local.")
                await run_local_fallback(microphone, on_text)
                return
            await fail(
                on_text, "Internet offline. Ative LOCAL_FALLBACK para usar modo local."
            )
            return

        try:
            await run_session(microphone, auth_key, on_text, build_url(use_prompt))
            return
        except asyncio.CancelledError:
            raise
        except FatalTranscriptionError as exc:
            await fail(on_text, str(exc))
            return
        except Exception as exc:
            if use_prompt and api_error_is_prompt_related(str(exc)):
                use_prompt = False
                attempts = 0
                delay = SETTINGS.reconnect_delay
                logger.warning("A API recusou parâmetros de prompt. Usando URL básica.")
                continue

            attempts += 1
            logger.exception("Erro na transcrição")
            print(f"\nErro na transcrição: {exc}\n")

            if not is_internet_available() and SETTINGS.local_fallback:
                logger.warning(
                    "Perda de conexão especial detectada. Iniciando fallback local."
                )
                await run_local_fallback(microphone, on_text)
                return

            if attempts > SETTINGS.max_reconnects:
                await fail(
                    on_text,
                    "Transcrição encerrada após "
                    f"{SETTINGS.max_reconnects} tentativas de reconexão: {exc}",
                )
                return

            print(
                "\nConexão perdida. "
                f"Reconectando em {delay:.0f}s "
                f"({attempts}/{SETTINGS.max_reconnects})...\n"
            )
            await asyncio.sleep(delay)
            delay = min(delay * 2, SETTINGS.max_reconnect_delay)


async def fail(
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None,
    text: str,
) -> None:
    print(f"\n{text}\n")
    await notify(
        on_text,
        {"type": "error", "text": text, "is_final": True, "error": True},
    )


async def main() -> None:
    try:
        await iniciar_transcricao()
    except (KeyboardInterrupt, asyncio.CancelledError):
        print("\nPrograma encerrado.\n")
    except Exception as exc:
        print(f"\nErro geral: {exc}\n")


if __name__ == "__main__":
    try:
        log_level = getattr(logging, SETTINGS.log_level, logging.INFO)
        logging.basicConfig(
            level=log_level,
            format="%(asctime)s - %(levelname)s - %(message)s",
        )
        logger.setLevel(log_level)
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nPrograma encerrado.\n")
