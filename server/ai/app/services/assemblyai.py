import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import websockets

try:
    from server.app.config import SETTINGS
    from server.app.transcription import AudioBuffer
except ImportError:
    from app.config import SETTINGS
    from app.transcription import AudioBuffer

logger = logging.getLogger(__name__)


def build_streaming_url() -> str:
    return (
        "wss://streaming.assemblyai.com/v3/ws"
        f"?sample_rate={SETTINGS.sample_rate}&speech_model={SETTINGS.speech_model}"
    )


async def connect() -> Any:
    url = build_streaming_url()
    logger.info("Conectando ao AssemblyAI em %s", url)
    websocket = await websockets.connect(
        url,
        additional_headers={"Authorization": SETTINGS.assemblyai_api_key},
        ping_interval=10,
        ping_timeout=30,
    )
    first_msg = await websocket.recv()
    logger.info("AssemblyAI Session iniciada: %s", first_msg)
    return websocket


async def send_audio(
    audio_buffer: AudioBuffer,
    get_websocket: Callable[[], Any],
    is_active: Callable[[], bool],
) -> None:
    try:
        buffer = bytearray()
        while is_active():
            try:
                data, _captured_at = await asyncio.wait_for(
                    audio_buffer.queue.get(),
                    timeout=1.0,
                )
            except asyncio.TimeoutError:
                continue

            buffer.extend(data)
            while len(buffer) >= SETTINGS.chunk_size:
                chunk = bytes(buffer[: SETTINGS.chunk_size])
                del buffer[: SETTINGS.chunk_size]

                websocket = get_websocket()
                if websocket:
                    await websocket.send(chunk)
                    if audio_buffer.stats.sent % 50 == 0:
                        logger.info(
                            "Enviado chunk de áudio %s para AssemblyAI.",
                            audio_buffer.stats.sent,
                        )

                audio_buffer.stats.sent += 1
                audio_buffer.stats.total_bytes_sent += len(chunk)
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.error("Erro ao transmitir áudio para AssemblyAI: %s", exc)


async def receive_transcripts(
    get_websocket: Callable[[], Any],
    is_active: Callable[[], bool],
    on_turn: Callable[[str, bool, str | None], Awaitable[None]],
) -> None:
    try:
        while is_active():
            websocket = get_websocket()
            if not websocket:
                await asyncio.sleep(0.1)
                continue

            raw = await websocket.recv()
            message = json.loads(raw)
            message_type = message.get("type")
            logger.info("Mensagem recebida da AssemblyAI: %s", message_type)

            if message_type == "Turn":
                text = message.get("transcript", "").strip()
                logger.info(
                    "Transcrição parcial recebida: %r (is_final=%s)",
                    text,
                    message.get("turn_is_done"),
                )
                if text:
                    await on_turn(
                        text,
                        bool(message.get("turn_is_done")),
                        message.get("speaker"),
                    )
            elif message_type == "SessionBegins":
                logger.info("AssemblyAI SessionBegins: %s", message.get("id"))
            elif message_type == "Error":
                logger.error("AssemblyAI Error message: %s", message)
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.error("Erro ao receber dados da AssemblyAI: %s", exc)
