import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

try:
    from server.app.documentation_generator import DocumentationGenerator
    from server.app.transcript_manager import TranscriptManager
except ImportError:
    from app.documentation_generator import DocumentationGenerator
    from app.transcript_manager import TranscriptManager

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)
PORT = int(os.getenv("PORT", "5455"))

SEND_TIMEOUT = 5.0

transcript_manager = TranscriptManager()
doc_generator = DocumentationGenerator()


class SaveTranscriptRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Texto da transcrição")
    title: str = Field(default="Transcrição", description="Título do documento")
    formats: list[str] = Field(
        default=["pdf", "txt", "json"], description="Formatos a salvar"
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict, description="Dados adicionais"
    )


class TranscriptResponse(BaseModel):

    success: bool
    message: str
    files: dict[str, str]
    metadata: dict[str, Any]


class TranscriptListResponse(BaseModel):

    total: int
    pdfs: list[str]
    texts: list[str]
    metadata: list[str]


clientes: set[WebSocket] = set()
transcricao_task: asyncio.Task | None = None


async def enviar_para_front(mensagem: dict[str, Any] | str) -> None:
    desconectados = []
    payload = mensagem if isinstance(mensagem, str) else json.dumps(mensagem)

    if not payload:
        logger.warning("Tentativa de enviar mensagem vazia")
        return

    try:
        if isinstance(mensagem, dict):
            msg = mensagem
            if msg.get("type") == "transcript" and msg.get("is_final"):
                if os.getenv("AUTO_SAVE_TRANSCRIPTS", "0") == "1":
                    formats = os.getenv("AUTO_SAVE_FORMATS", "pdf,txt,json").split(",")
                    try:
                        transcript_manager.save_transcript(
                            text=msg.get("text", ""),
                            title=msg.get("title", "Transcrição"),
                            formats=[f.strip() for f in formats if f.strip()],
                            evento=msg.get("evento"),
                            speaker=msg.get("speaker"),
                        )
                        logger.info(
                            "Transcrição final salva automaticamente (AUTO_SAVE_TRANSCRIPTS=1)"
                        )
                    except Exception as e:
                        logger.error(
                            f"Falha ao salvar transcrição automaticamente: {e}"
                        )
    except Exception:
        logger.exception("Erro ao processar auto-save de transcrição")

    logger.debug(f"Enviando para {len(clientes)} cliente(s): {payload[:100]}...")

    for cliente in list(clientes):
        try:
            await asyncio.wait_for(cliente.send_text(payload), timeout=SEND_TIMEOUT)
        except asyncio.TimeoutError:
            logger.warning(f"Timeout ao enviar para cliente {cliente.client}")
            desconectados.append(cliente)
        except Exception as exc:
            logger.warning(f"Erro ao enviar para cliente: {type(exc).__name__}: {exc}")
            desconectados.append(cliente)

    for cliente in desconectados:
        clientes.discard(cliente)
        logger.debug(f"Cliente removido. Restantes: {len(clientes)}")


async def executar_transcricao_com_retry(max_tentativas: int = 3) -> None:
    for tentativa in range(max_tentativas):
        try:
            try:
                from server.app.transcription import iniciar_transcricao
            except ImportError:
                from app.transcription import iniciar_transcricao

            logger.info(
                f"Iniciando transcrição (tentativa {tentativa + 1}/{max_tentativas})"
            )
            await iniciar_transcricao(on_text=enviar_para_front)
            return

        except asyncio.CancelledError:
            logger.info("Transcrição cancelada")
            raise

        except Exception as exc:
            logger.exception(f"Erro na tentativa {tentativa + 1}: {exc}")

            if tentativa < max_tentativas - 1:
                delay = 2**tentativa
                logger.info(f"Aguardando {delay}s antes de tentar novamente...")
                await asyncio.sleep(delay)
            else:
                logger.error("Todas as tentativas falharam")
                await enviar_para_front(
                    {
                        "type": "error",
                        "text": f"Erro ao executar transcrição: {exc}",
                        "is_final": True,
                        "error": True,
                    }
                )


async def iniciar_transcricao_se_necessario() -> None:
    global transcricao_task

    if transcricao_task and not transcricao_task.done():
        logger.debug("Transcrição já em executação")
        return

    logger.info("Iniciando transcrição para cliente(s) conectado(s)")
    transcricao_task = asyncio.create_task(executar_transcricao_com_retry())


async def parar_transcricao() -> None:
    global transcricao_task

    if not transcricao_task:
        return

    if transcricao_task.done():
        logger.debug("Transcrição já finalizou")
        return

    logger.info("Parando transcrição...")
    transcricao_task.cancel()

    try:
        await asyncio.wait_for(transcricao_task, timeout=5.0)
    except asyncio.CancelledError:
        logger.debug("Transcrição cancelada com sucesso")
    except asyncio.TimeoutError:
        logger.warning("Timeout ao parar transcrição")
    except Exception as exc:
        logger.error(f"Erro ao parar transcrição: {exc}")
    finally:
        transcricao_task = None


async def parar_transcricao_se_sem_clientes() -> None:
    if clientes:
        logger.debug(f"Ainda há {len(clientes)} cliente(s) conectado(s)")
        return

    await parar_transcricao()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Iniciando DualLibras Backend na porta {PORT}")
    try:
        yield
    finally:
        logger.info("Finalizando aplicação...")
        await parar_transcricao()
        logger.info("Transcrição finalizada")


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
        "clientes_conectados": len(clientes),
        "transcricao_ativa": bool(transcricao_task and not transcricao_task.done()),
        "porta": PORT,
    }


@app.post("/test-message")
async def test_message():
    mensagem = {
        "type": "transcript",
        "text": "Mensagem de teste do backend.",
        "is_final": True,
    }
    await enviar_para_front(mensagem)
    return {
        "enviado": True,
        "clientes": len(clientes),
        "mensagem": mensagem,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    try:
        await websocket.accept()
    except Exception as exc:
        logger.error(f"Erro ao aceitar conexão WebSocket: {exc}")
        raise

    clientes.add(websocket)
    logger.info(f"Cliente conectado de {websocket.client}. Total: {len(clientes)}")

    try:
        await asyncio.wait_for(
            websocket.send_text(
                json.dumps(
                    {
                        "type": "status",
                        "text": "",
                        "is_final": False,
                        "connected": True,
                    }
                )
            ),
            timeout=SEND_TIMEOUT,
        )
    except Exception as exc:
        logger.warning(f"Erro ao enviar status inicial: {exc}")

    await iniciar_transcricao_se_necessario()

    try:
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=60.0,
                )
                logger.debug(f"Mensagem recebida: {data[:50]}...")
            except asyncio.TimeoutError:
                logger.debug("Timeout na recepção, client ainda conectado")
                continue

    except WebSocketDisconnect:
        logger.info(f"Cliente desconectado de {websocket.client}")
    except Exception as exc:
        logger.error(f"Erro no WebSocket: {type(exc).__name__}: {exc}")
    finally:
        clientes.discard(websocket)
        logger.info(f"Cliente removido. Total: {len(clientes)}")
        await parar_transcricao_se_sem_clientes()


@app.post("/save-transcript", response_model=TranscriptResponse)
async def save_transcript(request: SaveTranscriptRequest) -> TranscriptResponse:
    try:
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Texto não pode estar vazio")

        logger.info(
            f"Recebendo requisição de salvamento de transcrição: {request.title}"
        )

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

        logger.info(f"Transcrição salva: {response.message}")
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao salvar transcrição: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Erro ao salvar transcrição: {str(e)}"
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

        logger.info(f"Listadas {total} transcrições")
        return response

    except Exception as e:
        logger.error(f"Erro ao listar transcrições: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Erro ao listar transcrições: {str(e)}"
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
                logger.info(f"Baixando arquivo: {filename}")

                media_type = (
                    "application/pdf" if filename.endswith(".pdf") else "text/plain"
                )

                return FileResponse(
                    path=filepath,
                    media_type=media_type,
                    filename=filename,
                )

        raise HTTPException(
            status_code=404, detail=f"Arquivo não encontrado: {filename}"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao baixar arquivo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao baixar arquivo: {str(e)}")


@app.get("/transcripts/pdf/{filename}")
async def get_pdf(filename: str):
    try:
        filepath = transcript_manager.pdfs_dir / filename
        if not filepath.exists():
            raise HTTPException(
                status_code=404, detail=f"PDF não encontrado: {filename}"
            )

        return FileResponse(
            path=filepath, media_type="application/pdf", filename=filename
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao servir PDF: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao servir PDF: {str(e)}")


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
                f.stat().st_size for f in directory.glob("*") if f.is_file()
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

    except Exception as e:
        logger.error(f"Erro ao obter status de upload: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao obter status: {str(e)}")


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
    except Exception as e:
        logger.error(f"Erro ao gerar documentação: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Erro ao gerar documentação: {str(e)}"
        )


@app.get("/documentation/download")
async def download_documentation():
    try:
        doc_path = doc_generator.output_dir / "Festival2026_Documentacao.pdf"
        if not doc_path.exists():
            doc_path = doc_generator.generate_project_documentation()

        logger.info(f"Servindo documentação: {doc_path}")
        return FileResponse(
            path=doc_path,
            media_type="application/pdf",
            filename="Festival2026_Documentacao.pdf",
        )
    except Exception as e:
        logger.error(f"Erro ao servir documentação: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Erro ao servir documentação: {str(e)}"
        )
