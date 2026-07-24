from __future__ import annotations

import asyncio
import json
import logging
import math
import sys
import time
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import urlencode

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

try:
    import webrtcvad

    WEBRTCVAD_AVAILABLE = True
except ImportError:
    WEBRTCVAD_AVAILABLE = False
    webrtcvad = None

try:
    from server.app.config import KEYTERMS_PROMPT, PORTUGUESE_PROMPT, SETTINGS
    from server.app.services.local_whisper import run_local_transcription
    from server.app.transcription import (
        AudioBuffer,
        AudioStats,
        TranscriptSaver,
        classify_speaker,
        format_timestamp,
        is_internet_available,
    )
except ImportError:
    from app.config import KEYTERMS_PROMPT, PORTUGUESE_PROMPT, SETTINGS
    from app.services.local_whisper import run_local_transcription
    from app.transcription import (
        AudioBuffer,
        AudioStats,
        TranscriptSaver,
        classify_speaker,
        format_timestamp,
        is_internet_available,
    )

logger = logging.getLogger(__name__)
console = (
    Console(theme=Theme({"info": "cyan", "warning": "yellow", "error": "bold red"}))
    if RICH_AVAILABLE
    else None
)


class RecoverableTranscriptionError(Exception):
    pass


class FatalTranscriptionError(Exception):
    pass


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
            self.live.stop()
            self.live = None

    def _render(self) -> Panel:
        partial = self.partial_text or "Aguardando áudio..."
        metrics = Table.grid(expand=True)
        metrics.add_column(justify="left")
        metrics.add_row(f"Uptime: {self.stats.uptime()}")
        metrics.add_row(
            f"Filas: {self.stats.queued} | Enviados: {self.stats.sent} | "
            f"Descartados: {self.stats.dropped}"
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

    async def handle_turn(
        self,
        text: str,
        final: bool,
        speaker_label: str | None = None,
    ) -> None:
        if final:
            await self._final(text, speaker_label)
        elif text != self.partial_text:
            await self._partial(text, speaker_label)

    async def _final(self, text: str, speaker_label: str | None = None) -> None:
        speaker = (
            f"Palestrante {speaker_label}" if speaker_label else classify_speaker(text)
        )
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
                f"[{format_timestamp(time.monotonic() - self.stats.started_at)}] "
                f"{speaker}: {text}"
            )
            print("-" * 60)
            print()

        if self.saver and SETTINGS.save_transcripts:
            self.saver.save_final(text, speaker)

        await notify(
            self.on_text,
            {"type": "transcript", "text": text, "is_final": True, "speaker": speaker},
        )
        self._reset()

    async def _partial(self, text: str, speaker_label: str | None = None) -> None:
        self.partial_text = text
        now = time.monotonic()

        if self._should_send_partial(text, now):
            speaker = f"Palestrante {speaker_label}" if speaker_label else "Professor"
            await notify(
                self.on_text,
                {
                    "type": "transcript",
                    "text": text,
                    "is_final": False,
                    "speaker": speaker,
                },
            )
            self.partial_sent = text
            self.partial_sent_at = now

        if self.live:
            self.live.update(self._render())
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
    auth_key = SETTINGS.assemblyai_api_key
    if not auth_key:
        raise FatalTranscriptionError("ASSEMBLYAI_API_KEY não configurada.")
    return auth_key


def build_url(use_portuguese_prompt: bool) -> str:
    params: dict[str, Any] = {
        "sample_rate": SETTINGS.sample_rate,
        "speech_model": SETTINGS.speech_model,
        "include_partial_turns": "true",
        "speaker_labels": "true",
    }

    if use_portuguese_prompt:
        params["prompt"] = PORTUGUESE_PROMPT
        keyterms = [term.strip() for term in KEYTERMS_PROMPT.split(",") if term.strip()]
        if keyterms:
            params["keyterms_prompt"] = json.dumps(keyterms, ensure_ascii=False)

    return "wss://streaming.assemblyai.com/v3/ws?" + urlencode(params, doseq=True)


def clear_line(min_size: int = 150) -> None:
    sys.stdout.write("\r" + " " * min_size + "\r")


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
    if default_input is not None and any(index == default_input for index, _ in devices):
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


class VoiceActivityDetector:
    def __init__(self):
        self.use_webrtc = SETTINGS.use_webrtc_vad and WEBRTCVAD_AVAILABLE
        if self.use_webrtc:
            self.vad = webrtcvad.Vad(SETTINGS.vad_mode)
            logger.info("WebRTC VAD ativado (modo %s)", SETTINGS.vad_mode)
        else:
            self.vad = None
            logger.info("Usando fallback de energia para VAD")

    def is_speech(self, data: bytes) -> bool:
        if not data:
            return False

        if self.use_webrtc and self.vad:
            try:
                return self.vad.is_speech(data, SETTINGS.sample_rate)
            except Exception as exc:
                logger.warning("Erro no WebRTC VAD: %s, usando fallback", exc)

        return self._is_voice_energy(data)

    @staticmethod
    def _is_voice_energy(data: bytes) -> bool:
        samples = np.frombuffer(data, dtype=np.int16)
        if samples.size == 0:
            return False
        rms = math.sqrt(float(np.mean(samples.astype(np.float32) ** 2)))
        return rms >= SETTINGS.vad_energy_threshold


def make_audio_queue(
    loop: asyncio.AbstractEventLoop,
) -> tuple[AudioBuffer, Callable[[Any, int, Any, Any], None]]:
    buffer = AudioBuffer(max_size=SETTINGS.audio_queue_size)
    vad_detector = VoiceActivityDetector()
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
        if vad_detector.is_speech(data):
            vad_active = True
            vad_silence_blocks = 0
            loop.call_soon_threadsafe(buffer.push, data, time.monotonic())
            return
        if vad_active and vad_silence_blocks < vad_hold_blocks:
            vad_silence_blocks += 1
            loop.call_soon_threadsafe(buffer.push, data, time.monotonic())

    return buffer, callback


async def read_audio(queue: asyncio.Queue[tuple[bytes, float]]) -> tuple[bytes, float]:
    try:
        return await asyncio.wait_for(queue.get(), timeout=SETTINGS.read_timeout)
    except TimeoutError as exc:
        raise RecoverableTranscriptionError("Captura de áudio sem dados.") from exc


async def send_audio(ws: Any, audio_buffer: AudioBuffer) -> None:
    buffer = bytearray()
    buffer_started_at = 0.0

    while True:
        data, captured_at = await read_audio(audio_buffer.queue)
        if not buffer:
            buffer_started_at = captured_at
        buffer.extend(data)

        while len(buffer) >= SETTINGS.chunk_size:
            queue_age_ms = (time.monotonic() - buffer_started_at) * 1000
            if queue_age_ms >= SETTINGS.max_queue_age_ms:
                logger.warning(
                    "Atraso de fila muito alto: %.0fms. Limpando fila.",
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

            if not buffer:
                buffer_started_at = 0.0


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
            logger.warning("Aviso da API ao iniciar sessão: %s", message)
            continue
        if message_type in ("Error", "error"):
            raise_api_error(message)

        raise RecoverableTranscriptionError(
            f"Resposta inesperada ao iniciar sessão: {message}"
        )


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
                    await terminal.handle_turn(
                        text,
                        bool(message.get("turn_is_done")),
                        message.get("speaker"),
                    )
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
                loop = asyncio.get_running_loop()
                audio_buffer, audio_callback = make_audio_queue(loop)
                with sd.RawInputStream(
                    samplerate=SETTINGS.sample_rate,
                    blocksize=block_samples(),
                    device=microphone,
                    channels=SETTINGS.channels,
                    dtype="int16",
                    callback=audio_callback,
                ):
                    await run_local_transcription(
                        audio_buffer,
                        TranscriptSaver() if SETTINGS.save_transcripts else None,
                        lambda: True,
                        lambda message: notify(on_text, message),
                    )
                return
            await fail(
                on_text,
                "Internet offline. Ative LOCAL_FALLBACK para usar modo local.",
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
