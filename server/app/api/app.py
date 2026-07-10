import json
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

try:
    from server.app.api.schemas import (
        SaveTranscriptRequest,
        TranscriptListResponse,
        TranscriptResponse,
    )
    from server.app.documentation_generator import DocumentationGenerator
    from server.app.realtime.session import AIORTC_AVAILABLE, ClientSession
    from server.app.transcript_manager import TranscriptManager
except ImportError:
    from app.api.schemas import (
        SaveTranscriptRequest,
        TranscriptListResponse,
        TranscriptResponse,
    )
    from app.documentation_generator import DocumentationGenerator
    from app.realtime.session import AIORTC_AVAILABLE, ClientSession
    from app.transcript_manager import TranscriptManager

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)
PORT = int(os.getenv("PORT", "5455"))

transcript_manager = TranscriptManager()
doc_generator = DocumentationGenerator()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Iniciando DualLibras Backend na porta %s", PORT)
    try:
        yield
    finally:
        logger.info("Finalizando aplicação...")


app = FastAPI(
    title="DualLibras.AI Backend",
    description="API de transcrição em tempo real para Libras",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "porta": PORT,
        "webrtc_suportado": AIORTC_AVAILABLE,
    }


@app.post("/test-message")
async def test_message():
    return {"status": "ok", "message": "Teste do backend. Conexão ok."}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    try:
        await websocket.accept()
    except Exception as exc:
        logger.error("Erro ao aceitar conexão WebSocket: %s", exc)
        raise

    logger.info("Novo cliente WebSocket conectado. Criando sessão.")
    session = ClientSession(websocket, transcript_manager=transcript_manager)
    await session.start()

    try:
        while True:
            message = await websocket.receive()

            if "bytes" in message:
                session.audio_buffer.push(message["bytes"], time.monotonic())
                if session.audio_buffer.stats.queued % 100 == 1:
                    logger.info(
                        "WebSocket recebeu chunk de áudio %s. Tamanho da fila: %s",
                        session.audio_buffer.stats.queued,
                        session.audio_buffer.queue.qsize(),
                    )

            elif "text" in message:
                try:
                    data = json.loads(message["text"])
                    msg_type = data.get("type")

                    if msg_type == "webrtc_offer":
                        logger.info("Recebeu WebRTC offer do cliente pelo WebSocket")
                        await session.handle_webrtc_offer(data.get("sdp"))
                    elif msg_type == "ping":
                        await session.send_to_client({"type": "pong"})
                except Exception as exc:
                    logger.error("Erro ao processar mensagem JSON: %s", exc)

    except WebSocketDisconnect:
        logger.info("Cliente WebSocket desconectado")
    except Exception as exc:
        logger.error("Erro na conexão do WebSocket: %s: %s", type(exc).__name__, exc)
    finally:
        await session.stop()


@app.post("/save-transcript", response_model=TranscriptResponse)
async def save_transcript(request: SaveTranscriptRequest) -> TranscriptResponse:
    try:
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Texto não pode estar vazio")

        logger.info("Recebendo requisição de salvamento de transcrição: %s", request.title)
        files = transcript_manager.save_transcript(
            text=request.text,
            title=request.title,
            formats=request.formats,
            **request.metadata,
        )

        files_dict = {
            fmt: str(files[fmt].relative_to(transcript_manager.base_path))
            for fmt in files
        }

        response = TranscriptResponse(
            success=True,
            message=f"Transcrição salva com sucesso em {len(files)} formato(s)",
            files=files_dict,
            metadata={
                "title": request.title,
                "text_length": len(request.text),
                "formats_saved": list(files.keys()),
                **request.metadata,
            },
        )
        logger.info("Transcrição salva: %s", response.message)
        return response

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Erro ao salvar transcrição: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao salvar transcrição: {str(exc)}",
        )


@app.get("/transcripts", response_model=TranscriptListResponse)
async def list_transcripts() -> TranscriptListResponse:
    try:
        transcripts = transcript_manager.list_transcripts()
        total = sum(len(files) for files in transcripts.values())

        response = TranscriptListResponse(
            total=total,
            pdfs=transcripts["pdfs"],
            texts=transcripts["texts"],
            metadata=transcripts["metadata"],
        )
        logger.info("Listadas %s transcrições", total)
        return response

    except Exception as exc:
        logger.error("Erro ao listar transcrições: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao listar transcrições: {str(exc)}",
        )


@app.get("/transcripts/download/{filename}")
async def download_transcript(filename: str):
    try:
        if ".." in filename or "/" in filename or "\\" in filename:
            raise HTTPException(status_code=400, detail="Nome de arquivo inválido")

        for directory in [
            transcript_manager.pdfs_dir,
            transcript_manager.texts_dir,
            transcript_manager.metadata_dir,
        ]:
            filepath = directory / filename
            if filepath.exists() and filepath.is_file():
                logger.info("Baixando arquivo: %s", filename)
                media_type = (
                    "application/pdf" if filename.endswith(".pdf") else "text/plain"
                )
                return FileResponse(
                    path=filepath,
                    media_type=media_type,
                    filename=filename,
                )

        raise HTTPException(
            status_code=404,
            detail=f"Arquivo não encontrado: {filename}",
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Erro ao baixar arquivo: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao baixar arquivo: {str(exc)}",
        )


@app.get("/transcripts/pdf/{filename}")
async def get_pdf(filename: str):
    try:
        filepath = transcript_manager.pdfs_dir / filename
        if not filepath.exists():
            raise HTTPException(
                status_code=404,
                detail=f"PDF não encontrado: {filename}",
            )

        return FileResponse(
            path=filepath,
            media_type="application/pdf",
            filename=filename,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Erro ao servir PDF: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao servir PDF: {str(exc)}")


@app.get("/upload-status")
async def upload_status():
    try:
        transcripts = transcript_manager.list_transcripts()
        total_size = 0
        for directory in [
            transcript_manager.pdfs_dir,
            transcript_manager.texts_dir,
            transcript_manager.metadata_dir,
        ]:
            total_size += sum(
                file.stat().st_size for file in directory.glob("*") if file.is_file()
            )

        return {
            "paths": {
                "base": str(transcript_manager.base_path),
                "pdfs": str(transcript_manager.pdfs_dir),
                "texts": str(transcript_manager.texts_dir),
                "metadata": str(transcript_manager.metadata_dir),
            },
            "counts": {
                "pdfs": len(transcripts["pdfs"]),
                "texts": len(transcripts["texts"]),
                "metadata": len(transcripts["metadata"]),
            },
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "status": "online",
        }

    except Exception as exc:
        logger.error("Erro ao obter status de upload: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao obter status: {str(exc)}")


@app.get("/documentation/generate")
async def generate_documentation():
    try:
        logger.info("Gerando documentação do projeto...")
        pdf_path = doc_generator.generate_project_documentation()

        return {
            "success": True,
            "message": "Documentação gerada com sucesso",
            "file": str(pdf_path),
            "download_url": "/documentation/download",
        }
    except Exception as exc:
        logger.error("Erro ao gerar documentação: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao gerar documentação: {str(exc)}",
        )


@app.get("/documentation/download")
async def download_documentation():
    try:
        doc_path = doc_generator.output_dir / "Festival2026_Documentacao.pdf"
        if not doc_path.exists():
            doc_path = doc_generator.generate_project_documentation()

        logger.info("Servindo documentação: %s", doc_path)
        return FileResponse(
            path=doc_path,
            media_type="application/pdf",
            filename="Festival2026_Documentacao.pdf",
        )
    except Exception as exc:
        logger.error("Erro ao servir documentação: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao servir documentação: {str(exc)}",
        )
