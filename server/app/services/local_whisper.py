import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import numpy as np

try:
    from server.app.config import SETTINGS
    from server.app.transcription import AudioBuffer, TranscriptSaver, classify_speaker
except ImportError:
    from app.config import SETTINGS
    from app.transcription import AudioBuffer, TranscriptSaver, classify_speaker

logger = logging.getLogger(__name__)

local_model = None


def get_local_model() -> Any:
    global local_model
    if local_model is None:
        from faster_whisper import WhisperModel

        logger.info("Carregando modelo Faster-Whisper: %s", SETTINGS.local_fallback_model)
        local_model = WhisperModel(SETTINGS.local_fallback_model, device="auto")
    return local_model


def transcribe_audio(model: Any, audio_bytes: bytes) -> list[str]:
    audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    segments, _ = model.transcribe(
        audio_np,
        beam_size=1,
        language="pt",
        word_timestamps=False,
        vad_filter=True,
    )
    return [segment.text.strip() for segment in segments if segment.text.strip()]


async def run_local_transcription(
    audio_buffer: AudioBuffer,
    saver: TranscriptSaver | None,
    is_active: Callable[[], bool],
    send_to_client: Callable[[dict[str, Any]], Awaitable[None]],
) -> None:
    try:
        model = get_local_model()
    except Exception as exc:
        logger.error("Não foi possível carregar o modelo local Faster-Whisper: %s", exc)
        await send_to_client(
            {
                "type": "error",
                "text": f"Erro no modelo local: {exc}",
                "error": True,
                "is_final": True,
            }
        )
        return

    local_data = bytearray()
    logger.info("Fallback local de transcrição iniciado.")

    while is_active():
        try:
            try:
                data, _ = await asyncio.wait_for(audio_buffer.queue.get(), timeout=1.5)
                local_data.extend(data)

                if len(local_data) >= SETTINGS.sample_rate * 2 * 8:
                    chunk = bytes(local_data)
                    local_data.clear()
                    await _send_texts(model, chunk, saver, send_to_client)
            except asyncio.TimeoutError:
                if len(local_data) >= SETTINGS.sample_rate * 2 * 0.5:
                    chunk = bytes(local_data)
                    local_data.clear()
                    try:
                        await _send_texts(model, chunk, saver, send_to_client)
                    except Exception as exc:
                        logger.error(
                            "Erro ao processar áudio acumulado no silêncio: %s",
                            exc,
                        )
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Erro no loop do fallback local: %s", exc)
            await asyncio.sleep(1)


async def _send_texts(
    model: Any,
    chunk: bytes,
    saver: TranscriptSaver | None,
    send_to_client: Callable[[dict[str, Any]], Awaitable[None]],
) -> None:
    texts = await asyncio.to_thread(transcribe_audio, model, chunk)
    for text in texts:
        speaker = classify_speaker(text)
        if saver:
            saver.save_final(text, speaker)
        await send_to_client(
            {
                "type": "transcript",
                "text": text,
                "is_final": True,
                "speaker": speaker,
            }
        )
