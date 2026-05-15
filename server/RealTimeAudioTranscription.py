import asyncio
import json
import logging
import os
import subprocess
import sys
import time
from collections.abc import Awaitable, Callable
from typing import Any

import websockets
import Configure

SAMPLE_RATE = 16000

CHANNELS = 1

CHUNK_SIZE = int(os.getenv("AUDIO_CHUNK_SIZE", "1600"))

PARTIAL_LINE_LIMIT = 120

PARTIAL_PRINT_STEP = 180

PARTIAL_SEND_STEP = int(os.getenv("PARTIAL_SEND_STEP", "1"))

PARTIAL_SEND_INTERVAL_MS = int(os.getenv("PARTIAL_SEND_INTERVAL_MS", "120"))

SPEECH_MODEL = "universal-streaming-multilingual"

URL = (
    "wss://streaming.assemblyai.com/v3/ws"
    f"?sample_rate={SAMPLE_RATE}"
    f"&speech_model={SPEECH_MODEL}"
    "&language_code=pt"
    "&audio_format=pcm16"
    "&format_turns=true"
)

logging.basicConfig(
    level=logging.ERROR,
    format="%(asctime)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)


def selecionar_microfone():

    try:

        result = subprocess.run(
            ["pactl", "list", "short", "sources"],
            capture_output=True,
            text=True,
            timeout=5,
        )

        if result.returncode != 0:
            return None

        linhas = result.stdout.splitlines()

        for linha in linhas:

            partes = linha.split("\t")

            if len(partes) < 2:
                continue

            nome = partes[1].lower()

            if "monitor" in nome:
                continue

            if "input" in nome or "microphone" in nome or "mic" in nome:
                return partes[1]

        return None

    except Exception:
        return None


async def iniciar_transcricao(
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
):

    microfone = selecionar_microfone()

    if not microfone:

        print("\nMicrofone não encontrado.\n")
        if on_text:
            await on_text(
                {
                    "text": "Microfone não encontrado.",
                    "is_final": True,
                    "error": True,
                }
            )
        return

    print("\nMicrofone selecionado:")
    print(microfone)
    print()

    async with websockets.connect(
        URL,
        additional_headers={"Authorization": Configure.AuthKey},
        ping_interval=10,
        ping_timeout=30,
        close_timeout=10,
        max_size=None,
    ) as ws:

        resposta = json.loads(await ws.recv())

        if not resposta.get("id"):

            print("\nErro ao iniciar sessão.\n")
            if on_text:
                await on_text(
                    {
                        "type": "error",
                        "text": "Erro ao iniciar sessão de transcrição.",
                        "is_final": True,
                        "error": True,
                    }
                )
            return

        print("=" * 60)
        print("TRANSCRIÇÃO EM TEMPO REAL")
        print("=" * 60)
        print()

        comando = [
            "pw-record",
            "--target",
            microfone,
            "--rate",
            str(SAMPLE_RATE),
            "--channels",
            str(CHANNELS),
            "--format",
            "s16",
            "--latency",
            "16",
            "--quality",
            "10",
            "-",
        ]

        processo = subprocess.Popen(
            comando,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=0,
        )

        async def enviar_audio():

            loop = asyncio.get_event_loop()

            buffer = b""

            try:

                while True:

                    chunk = await loop.run_in_executor(
                        None,
                        processo.stdout.read,
                        CHUNK_SIZE,
                    )

                    if not chunk:
                        continue

                    buffer += chunk

                    if len(buffer) >= CHUNK_SIZE:

                        try:

                            await ws.send(buffer)

                        except Exception:
                            break

                        buffer = b""

            except Exception as e:

                logger.error(e)

        async def receber_texto():

            texto_parcial = ""

            parcial_impresso = 0

            parcial_enviado = ""

            parcial_enviado_em = 0.0

            tamanho_linha_anterior = 0

            try:

                while True:

                    resposta = await ws.recv()

                    dados = json.loads(resposta)

                    tipo = dados.get("type")

                    if tipo == "Turn":

                        texto = dados.get(
                            "transcript",
                            "",
                        ).strip()

                        if not texto:
                            continue

                        final = dados.get(
                            "turn_is_done",
                            False,
                        )

                        if final:

                            sys.stdout.write("\r" + " " * 150 + "\r")

                            print("-" * 60)
                            print(texto)
                            print("-" * 60)
                            print()

                            if on_text:
                                await on_text(
                                    {
                                        "type": "transcript",
                                        "text": texto,
                                        "is_final": True,
                                    }
                                )

                            texto_parcial = ""

                            parcial_impresso = 0

                            parcial_enviado = ""

                            parcial_enviado_em = 0.0

                            tamanho_linha_anterior = 0

                        else:

                            if texto != texto_parcial:

                                texto_parcial = texto

                                agora = time.monotonic()

                                deve_enviar_parcial = (
                                    not parcial_enviado
                                    or len(texto) - len(parcial_enviado)
                                    >= PARTIAL_SEND_STEP
                                    or (
                                        texto != parcial_enviado
                                        and (agora - parcial_enviado_em) * 1000
                                        >= PARTIAL_SEND_INTERVAL_MS
                                    )
                                )

                                if on_text and deve_enviar_parcial:
                                    await on_text(
                                        {
                                            "type": "transcript",
                                            "text": texto,
                                            "is_final": False,
                                        }
                                    )
                                    parcial_enviado = texto
                                    parcial_enviado_em = agora

                                if len(texto) - parcial_impresso >= PARTIAL_PRINT_STEP:

                                    sys.stdout.write(
                                        "\r"
                                        + " " * max(150, tamanho_linha_anterior)
                                        + "\r"
                                    )

                                    print("Ouvindo:")
                                    print(texto[parcial_impresso:])
                                    print()

                                    parcial_impresso = len(texto)

                                    tamanho_linha_anterior = 0

                                else:

                                    exibicao = texto[-PARTIAL_LINE_LIMIT:]

                                    linha = "Ouvindo: " + exibicao

                                    limpar = max(
                                        0,
                                        tamanho_linha_anterior - len(linha),
                                    )

                                    sys.stdout.write("\r" + linha + " " * (limpar + 20))

                                    tamanho_linha_anterior = len(linha)

                                sys.stdout.flush()

                    elif tipo == "Error":

                        print("\nErro da API:\n")

                        erro = dados.get(
                            "error",
                            "Erro desconhecido",
                        )

                        print(erro)
                        print()

                        if on_text:
                            await on_text(
                                {
                                    "type": "error",
                                    "text": f"Erro da API: {erro}",
                                    "is_final": True,
                                    "error": True,
                                }
                            )

                        break

                    elif tipo == "SessionBegins":

                        print("Sessão iniciada.\n")

                    elif tipo == "SessionTerminated":

                        print("\nSessão encerrada.\n")
                        break

            except websockets.exceptions.ConnectionClosed:

                print("\nConexão encerrada.\n")

            except Exception as e:

                print(f"\nErro: {e}\n")

        try:

            done, pending = await asyncio.wait(
                [
                    asyncio.create_task(enviar_audio()),
                    asyncio.create_task(receber_texto()),
                ],
                return_when=asyncio.FIRST_EXCEPTION,
            )

            # Cancel pending tasks
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        finally:

            processo.terminate()

            try:

                processo.wait(timeout=3)

            except Exception:

                processo.kill()


async def main():
    try:
        await iniciar_transcricao()

    except KeyboardInterrupt:
        print("\nPrograma encerrado.\n")

    except Exception as e:
        print(f"\nErro geral: {e}\n")


if __name__ == "__main__":
    asyncio.run(main())
