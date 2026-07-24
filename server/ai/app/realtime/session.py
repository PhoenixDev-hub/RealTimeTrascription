import asyncio
import json
import logging
import os
import time
from typing import Any

from fastapi import WebSocket

try:
    from aiortc import (
        RTCConfiguration,
        RTCIceServer,
        RTCPeerConnection,
        RTCSessionDescription,
    )

    AIORTC_AVAILABLE = True
except ImportError:
    AIORTC_AVAILABLE = False

try:
    from server.app.config import SETTINGS
    from server.app.services import assemblyai
    from server.app.services.local_whisper import run_local_transcription
    from server.app.transcript_manager import TranscriptManager
    from server.app.transcription import (
        AudioBuffer,
        TranscriptSaver,
        classify_speaker,
        is_internet_available,
    )
except ImportError:
    from app.config import SETTINGS
    from app.services import assemblyai
    from app.services.local_whisper import run_local_transcription
    from app.transcript_manager import TranscriptManager
    from app.transcription import (
        AudioBuffer,
        TranscriptSaver,
        classify_speaker,
        is_internet_available,
    )

logger = logging.getLogger(__name__)


class ClientSession:
    def __init__(
        self,
        websocket: WebSocket,
        transcript_manager: TranscriptManager | None = None,
    ):
        self.websocket = websocket
        self.audio_buffer = AudioBuffer(max_size=SETTINGS.audio_queue_size)
        self.pc = None
        self.dc = None
        self.assembly_ws = None
        self.tasks: list[asyncio.Task[Any]] = []
        self.active = True
        self.saver = TranscriptSaver() if SETTINGS.save_transcripts else None
        self.transcript_manager = transcript_manager

    async def send_to_client(self, message: dict[str, Any]) -> None:
        if not self.active:
            return
        try:
            payload = json.dumps(message)
            await self.websocket.send_text(payload)
            if self.dc and self.dc.readyState == "open":
                self.dc.send(payload)
        except Exception as exc:
            logger.warning("Erro ao enviar mensagem para o cliente: %s", exc)

    async def start(self) -> None:
        auth_key = SETTINGS.assemblyai_api_key
        internet = is_internet_available()

        if internet and auth_key:
            try:
                self.assembly_ws = await assemblyai.connect()
                self.tasks.append(
                    asyncio.create_task(
                        assemblyai.send_audio(
                            self.audio_buffer,
                            lambda: self.assembly_ws,
                            lambda: self.active,
                        )
                    )
                )
                self.tasks.append(
                    asyncio.create_task(
                        assemblyai.receive_transcripts(
                            lambda: self.assembly_ws,
                            lambda: self.active,
                            self.handle_assembly_turn,
                        )
                    )
                )

                await self.send_to_client(
                    {
                        "type": "status",
                        "text": "Conectado com AssemblyAI",
                        "connected": True,
                        "mode": "assemblyai",
                    }
                )
                return
            except Exception as exc:
                logger.error(
                    "Falha ao conectar na AssemblyAI: %s. Iniciando fallback local.",
                    exc,
                )

        if SETTINGS.local_fallback:
            self.tasks.append(
                asyncio.create_task(
                    run_local_transcription(
                        self.audio_buffer,
                        self.saver,
                        lambda: self.active,
                        self.send_to_client,
                    )
                )
            )
            await self.send_to_client(
                {
                    "type": "status",
                    "text": "Conectado via Fallback Local",
                    "connected": True,
                    "mode": "local",
                }
            )
        else:
            await self.send_to_client(
                {
                    "type": "error",
                    "text": "Sem conexão de internet e fallback local desativado.",
                    "error": True,
                    "is_final": True,
                }
            )

    async def handle_assembly_turn(
        self,
        text: str,
        is_final: bool,
        speaker: str | None = None,
    ) -> None:
        speaker = speaker or classify_speaker(text)

        if is_final:
            if self.saver:
                self.saver.save_final(text, speaker)

            if (
                self.transcript_manager
                and os.getenv("AUTO_SAVE_TRANSCRIPTS", "0") == "1"
            ):
                formats = os.getenv("AUTO_SAVE_FORMATS", "pdf,txt,json").split(",")
                try:
                    self.transcript_manager.save_transcript(
                        text=text,
                        title="Transcrição Automática",
                        formats=[fmt.strip() for fmt in formats if fmt.strip()],
                        speaker=speaker,
                    )
                except Exception as exc:
                    logger.error("Auto-save falhou: %s", exc)

        await self.send_to_client(
            {
                "type": "transcript",
                "text": text,
                "is_final": is_final,
                "speaker": speaker,
            }
        )

    async def handle_webrtc_offer(self, sdp: str) -> None:
        if not AIORTC_AVAILABLE:
            logger.warning("aiortc não disponível. Ignorando offer WebRTC.")
            return

        try:
            config = RTCConfiguration(
                iceServers=[RTCIceServer(urls="stun:stun.l.google.com:19302")]
            )
            pc = RTCPeerConnection(configuration=config)
            self.pc = pc

            @pc.on("datachannel")
            def on_datachannel(channel):
                self.dc = channel
                logger.info("WebRTC Data Channel criado e aberto pelo cliente!")

                @channel.on("message")
                def on_message(message):
                    if isinstance(message, bytes):
                        self.audio_buffer.push(message, time.monotonic())
                    elif isinstance(message, str):
                        try:
                            data = json.loads(message)
                            if data.get("type") == "ping":
                                channel.send(json.dumps({"type": "pong"}))
                        except Exception as exc:
                            logger.error(
                                "Erro ao processar mensagem texto no Data Channel: %s",
                                exc,
                            )

                @channel.on("close")
                def on_close():
                    logger.info("WebRTC Data Channel fechado.")

            @pc.on("iceconnectionstatechange")
            async def on_iceconnectionstatechange():
                logger.info(
                    "ICE Connection State mudou para: %s",
                    pc.iceConnectionState,
                )
                if pc.iceConnectionState in ["failed", "closed"]:
                    await pc.close()

            ice_gathering_complete = asyncio.Event()

            @pc.on("icegatheringstatechange")
            def on_icegatheringstatechange():
                logger.info(
                    "ICE Gathering State mudou para: %s",
                    pc.iceGatheringState,
                )
                if pc.iceGatheringState == "complete":
                    ice_gathering_complete.set()

            await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type="offer"))
            answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)

            if pc.iceGatheringState != "complete":
                logger.info("Aguardando gathering de ICE completar...")
                try:
                    await asyncio.wait_for(ice_gathering_complete.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    logger.warning(
                        "Timeout aguardando gathering de ICE completar. Enviando SDP parcial."
                    )

            await self.send_to_client(
                {"type": "webrtc_answer", "sdp": pc.localDescription.sdp}
            )
        except Exception as exc:
            logger.error("Erro ao processar offer WebRTC: %s", exc)

    async def stop(self) -> None:
        self.active = False

        for task in self.tasks:
            task.cancel()
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)
            self.tasks.clear()

        if self.pc:
            await self.pc.close()
            self.pc = None
            self.dc = None

        if self.assembly_ws:
            try:
                await self.assembly_ws.close()
            except Exception:
                pass
            self.assembly_ws = None

        logger.info("Sessão limpa com sucesso.")
