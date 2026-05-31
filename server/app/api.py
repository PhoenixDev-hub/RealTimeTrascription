import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)
PORT = int(os.getenv("PORT", "5455"))

SEND_TIMEOUT = 5.0

clientes: set[WebSocket] = set()
transcricao_task: asyncio.Task | None = None


async def enviar_para_front(mensagem: dict[str, Any] | str) -> None:
    desconectados = []
    payload = mensagem if isinstance(mensagem, str) else json.dumps(mensagem)

    if not payload:
        logger.warning("Tentativa de enviar mensagem vazia")
        return

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
