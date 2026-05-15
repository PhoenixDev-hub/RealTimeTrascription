import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)
PORT = int(os.getenv("PORT", "5455"))

clientes: set[WebSocket] = set()
transcricao_task: asyncio.Task | None = None


async def enviar_para_front(mensagem: dict[str, Any] | str):
    desconectados = []
    payload = mensagem if isinstance(mensagem, str) else json.dumps(mensagem)

    logger.debug("Enviando para %s cliente(s): %s", len(clientes), payload)

    for cliente in list(clientes):
        try:
            await cliente.send_text(payload)
        except Exception:
            desconectados.append(cliente)

    for cliente in desconectados:
        clientes.discard(cliente)


async def executar_transcricao():
    try:
        from RealTimeAudioTranscription import iniciar_transcricao

        await iniciar_transcricao(on_text=enviar_para_front)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.exception("Erro ao executar transcrição")
        await enviar_para_front(
            {
                "type": "error",
                "text": f"Erro ao executar transcrição: {exc}",
                "is_final": True,
                "error": True,
            }
        )


async def iniciar_transcricao_se_necessario():
    global transcricao_task

    if transcricao_task and not transcricao_task.done():
        return

    logger.info("Iniciando transcrição")
    transcricao_task = asyncio.create_task(executar_transcricao())


async def parar_transcricao():
    global transcricao_task

    if not transcricao_task:
        return

    transcricao_task.cancel()
    try:
        await transcricao_task
    except asyncio.CancelledError:
        pass
    finally:
        transcricao_task = None


async def parar_transcricao_se_sem_clientes():
    if clientes:
        return

    await parar_transcricao()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        yield
    finally:
        await parar_transcricao()


app = FastAPI(lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "clientes": len(clientes),
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
        "sent": True,
        "clientes": len(clientes),
        "message": mensagem,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    clientes.add(websocket)
    logger.info("Cliente conectado. Total: %s", len(clientes))
    await websocket.send_text(
        json.dumps(
            {
                "type": "status",
                "text": "",
                "is_final": False,
                "connected": True,
            }
        )
    )
    await iniciar_transcricao_se_necessario()

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        clientes.discard(websocket)
        logger.info("Cliente desconectado. Total: %s", len(clientes))
        await parar_transcricao_se_sem_clientes()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
