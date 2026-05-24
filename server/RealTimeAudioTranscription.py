import asyncio
import json
import logging
import os
import sys
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import Configure
import sounddevice as sd
import websockets

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Settings:
    sample_rate: int = int(os.getenv("AUDIO_SAMPLE_RATE", "16000"))
    channels: int = int(os.getenv("AUDIO_CHANNELS", "1"))
    chunk_size: int = int(os.getenv("AUDIO_CHUNK_SIZE", "3200"))
    audio_queue_size: int = int(os.getenv("AUDIO_QUEUE_MAX_SIZE", "8"))
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
    partial_send_step: int = int(os.getenv("PARTIAL_SEND_STEP", "3"))
    partial_send_interval_ms: int = int(os.getenv("PARTIAL_SEND_INTERVAL_MS", "120"))

    @property
    def block_samples(self) -> int:
        return max(1, self.chunk_size // (self.channels * 2))


SETTINGS = Settings()

PORTUGUESE_PROMPT = os.getenv(
    "TRANSCRIPTION_PROMPT",
    (
        "Transcreva exclusivamente em português do Brasil. "
        "Priorize fala de sala de aula, explicações de professor e perguntas de alunos. "
        "Use pontuação simples. Não traduza para inglês."
    ),
)

KEYTERMS_PROMPT = os.getenv(
    "KEYTERMS_PROMPT",
    "português do Brasil,aula,professor,aluno,Libras,inclusão,acessibilidade",
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

    def summary(self) -> str:
        return (
            f"audio_chunks={self.queued} "
            f"enviados={self.sent} "
            f"descartados={self.dropped} "
            f"maior_fila={self.max_queue_age_ms:.0f}ms"
        )


class TerminalTranscript:
    line_limit = 120
    print_step = 180

    def __init__(
        self,
        on_text: Callable[[dict[str, Any]], Awaitable[None]] | None,
    ) -> None:
        self.on_text = on_text
        self.partial_text = ""
        self.partial_printed = 0
        self.partial_sent = ""
        self.partial_sent_at = 0.0
        self.previous_line_size = 0

    async def handle_turn(self, text: str, final: bool) -> None:
        if final:
            await self._final(text)
            return

        if text != self.partial_text:
            await self._partial(text)

    async def _final(self, text: str) -> None:
        clear_line(max(150, self.previous_line_size))
        print("-" * 60)
        print(text)
        print("-" * 60)
        print()
        await notify(
            self.on_text,
            {"type": "transcript", "text": text, "is_final": True},
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


def get_auth_key() -> str:
    auth_key = getattr(Configure, "AuthKey", "")
    if not auth_key:
        raise FatalTranscriptionError("ASSEMBLYAI_API_KEY não configurada.")
    return auth_key


def build_url(use_portuguese_prompt: bool) -> str:
    params: dict[str, Any] = {
        "sample_rate": SETTINGS.sample_rate,
        "speech_model": SETTINGS.speech_model,
        "encoding": "pcm_s16le",
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


def make_audio_queue(
    loop: asyncio.AbstractEventLoop,
) -> tuple[
    asyncio.Queue[tuple[bytes, float]],
    Callable[[Any, int, Any, Any], None],
    AudioStats,
]:
    queue: asyncio.Queue[tuple[bytes, float]] = asyncio.Queue(
        maxsize=SETTINGS.audio_queue_size
    )
    stats = AudioStats()

    def push_audio(data: bytes, captured_at: float) -> None:
        if queue.full():
            try:
                queue.get_nowait()
                stats.dropped += 1
            except asyncio.QueueEmpty:
                pass

        try:
            queue.put_nowait((data, captured_at))
            stats.queued += 1
        except asyncio.QueueFull:
            stats.dropped += 1

    def callback(indata, frames, time_info, status) -> None:
        if status:
            logger.warning("Aviso na captura de áudio: %s", status)
        loop.call_soon_threadsafe(push_audio, bytes(indata), time.monotonic())

    return queue, callback, stats


async def read_audio(queue: asyncio.Queue[tuple[bytes, float]]) -> tuple[bytes, float]:
    try:
        return await asyncio.wait_for(queue.get(), timeout=SETTINGS.read_timeout)
    except TimeoutError as exc:
        raise RecoverableTranscriptionError("Captura de áudio sem dados.") from exc


async def send_audio(
    ws: Any,
    audio_queue: asyncio.Queue[tuple[bytes, float]],
    stats: AudioStats,
) -> None:
    buffer = bytearray()
    buffer_started_at = 0.0
    last_log = time.monotonic()

    while True:
        data, captured_at = await read_audio(audio_queue)
        if not buffer:
            buffer_started_at = captured_at
        buffer.extend(data)

        while len(buffer) >= SETTINGS.chunk_size:
            queue_age_ms = (time.monotonic() - buffer_started_at) * 1000
            await ws.send(bytes(buffer[: SETTINGS.chunk_size]))
            del buffer[: SETTINGS.chunk_size]

            stats.sent += 1
            stats.max_queue_age_ms = max(stats.max_queue_age_ms, queue_age_ms)

            now = time.monotonic()
            if SETTINGS.debug_latency and now - last_log >= SETTINGS.latency_log_interval:
                print(f"\nlatencia_audio: {stats.summary()}\n")
                last_log = now

            if not buffer:
                buffer_started_at = 0.0


async def receive_transcripts(
    ws: Any,
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None,
) -> None:
    terminal = TerminalTranscript(on_text)

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

        if message_type == "SessionTerminated":
            raise RecoverableTranscriptionError("Sessão encerrada pela API.")

        if message_type in ("Error", "error"):
            raise_api_error(message)


async def receive_json(ws: Any) -> dict[str, Any]:
    try:
        async with asyncio.timeout(SETTINGS.recv_timeout):
            raw = await ws.recv()
    except TimeoutError as exc:
        raise RecoverableTranscriptionError("API sem resposta.") from exc

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RecoverableTranscriptionError(f"Resposta inválida da API: {raw!r}") from exc


def raise_api_error(message: dict[str, Any]) -> None:
    error = message.get("error") or message.get("message") or message
    text = str(error)
    if api_error_is_fatal(text):
        raise FatalTranscriptionError(f"Erro fatal da API: {text}")
    raise RecoverableTranscriptionError(f"Erro da API: {text}")


async def wait_session_start(ws: Any) -> None:
    while True:
        message = await receive_json(ws)
        message_type = message.get("type")

        if message.get("id") and message_type in (None, "Begin", "SessionBegins"):
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
    audio_queue, audio_callback, stats = make_audio_queue(loop)

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
            blocksize=SETTINGS.block_samples,
            device=microphone,
            channels=SETTINGS.channels,
            dtype="int16",
            callback=audio_callback,
        ):
            tasks = [
                asyncio.create_task(send_audio(ws, audio_queue, stats)),
                asyncio.create_task(receive_transcripts(ws, on_text)),
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
            logger.error("Erro na transcrição: %s", exc)

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
        logging.basicConfig(
            level=logging.ERROR,
            format="%(asctime)s - %(levelname)s - %(message)s",
        )
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nPrograma encerrado.\n")
