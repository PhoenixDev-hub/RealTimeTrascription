import asyncio
import json
import logging
import math
import os
import struct
import subprocess
import sys

import websockets

import Configure

SAMPLE_RATE = 16000

CHANNELS = 1

CHUNK_SIZE = 2048

NOISE_THRESHOLD = 0.010

PARTIAL_LINE_LIMIT = 120

PARTIAL_PRINT_STEP = 180

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


def calcular_audio(audio_data):

    if len(audio_data) < 2:
        return 0.0

    samples = struct.unpack(
        "<" + "h" * (len(audio_data) // 2),
        audio_data,
    )

    valores = [abs(sample) for sample in samples]

    if not valores:
        return 0.0

    valores.sort()

    corte = int(len(valores) * 0.85)

    filtrados = valores[:corte]

    if not filtrados:
        return 0.0

    rms = math.sqrt(sum(valor * valor for valor in filtrados) / len(filtrados))

    return rms / 32767.0


async def iniciar_transcricao():

    microfone = selecionar_microfone()

    if not microfone:

        print("\nMicrofone não encontrado.\n")
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

            silencio = 0

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

                        nivel = calcular_audio(buffer)

                        if nivel > NOISE_THRESHOLD:

                            silencio = 0

                            try:

                                await ws.send(buffer)

                            except Exception:
                                break

                        else:

                            silencio += 1

                            if silencio > 20:
                                silencio = 20

                        buffer = b""

            except Exception as e:

                logger.error(e)

        async def receber_texto():

            texto_parcial = ""

            parcial_impresso = 0

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

                        texto = texto.replace(" انا ", "")

                        texto = texto.replace(" the ", "")

                        texto = texto.replace(" and ", "")

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

                            texto_parcial = ""

                            parcial_impresso = 0

                            tamanho_linha_anterior = 0

                        else:

                            if texto != texto_parcial:

                                texto_parcial = texto

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

                        print(
                            dados.get(
                                "error",
                                "Erro desconhecido",
                            )
                        )

                        print()

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

            await asyncio.gather(
                enviar_audio(),
                receber_texto(),
            )

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
