import asyncio
import json
import logging
import os
import sys
import time
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import urlencode

import Configure
import sounddevice as sd
import websockets

SAMPLE_RATE = int(os.getenv("AUDIO_SAMPLE_RATE", "16000"))
CHANNELS = int(os.getenv("AUDIO_CHANNELS", "1"))
SAMPLE_WIDTH_BYTES = 2
CHUNK_SIZE = int(os.getenv("AUDIO_CHUNK_SIZE", "3200"))
BLOCK_SAMPLES = max(1, CHUNK_SIZE // (CHANNELS * SAMPLE_WIDTH_BYTES))
AUDIO_QUEUE_MAX_SIZE = int(os.getenv("AUDIO_QUEUE_MAX_SIZE", "8"))
READ_TIMEOUT_SECONDS = float(os.getenv("AUDIO_READ_TIMEOUT_SECONDS", "5"))
RECV_TIMEOUT_SECONDS = float(os.getenv("TRANSCRIPTION_RECV_TIMEOUT_SECONDS", "30"))
MAX_RECONNECT_ATTEMPTS = int(os.getenv("MAX_RECONNECT_ATTEMPTS", "5"))
INITIAL_RECONNECT_DELAY = float(os.getenv("INITIAL_RECONNECT_DELAY", "2"))
MAX_RECONNECT_DELAY = float(os.getenv("MAX_RECONNECT_DELAY", "30"))

PARTIAL_LINE_LIMIT = 120
PARTIAL_PRINT_STEP = 180
PARTIAL_SEND_STEP = int(os.getenv("PARTIAL_SEND_STEP", "3"))
PARTIAL_SEND_INTERVAL_MS = int(os.getenv("PARTIAL_SEND_INTERVAL_MS", "120"))

# SPEECH_MODEL = "universal-streaming-multilingual"
SPEECH_MODEL = os.getenv("SPEECH_MODEL", "u3-rt-pro")
TRANSCRIPTION_PROMPT = os.getenv(
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
LANGUAGE_DETECTION = os.getenv("LANGUAGE_DETECTION", "true")
USE_PORTUGUESE_PROMPT = os.getenv("USE_PORTUGUESE_PROMPT", "1") == "1"


def montar_url(use_portuguese_prompt: bool = True) -> str:
    parametros: dict[str, Any] = {
        "sample_rate": SAMPLE_RATE,
        "speech_model": SPEECH_MODEL,
        "encoding": "pcm_s16le",
        "include_partial_turns": "true",
    }

    if use_portuguese_prompt:
        parametros["language_detection"] = LANGUAGE_DETECTION
        parametros["prompt"] = TRANSCRIPTION_PROMPT

        termos = [
            termo.strip()
            for termo in KEYTERMS_PROMPT.split(",")
            if termo.strip()
        ]
        if termos:
            parametros["keyterms_prompt"] = termos

    return "wss://streaming.assemblyai.com/v3/ws?" + urlencode(
        parametros,
        doseq=True,
    )


logging.basicConfig(
    level=logging.ERROR,
    format="%(asctime)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)
DEBUG_LATENCY = os.getenv("DEBUG_LATENCY", "0") == "1"
LIST_AUDIO_DEVICES = os.getenv("LIST_AUDIO_DEVICES", "0") == "1"
LATENCY_LOG_INTERVAL_SECONDS = float(os.getenv("LATENCY_LOG_INTERVAL_SECONDS", "2"))


class AudioStats:
    def __init__(self) -> None:
        self.descartados = 0
        self.enfileirados = 0
        self.enviados = 0
        self.maior_idade_fila_ms = 0.0

    def registrar_descarte(self) -> None:
        self.descartados += 1

    def registrar_entrada(self) -> None:
        self.enfileirados += 1

    def registrar_envio(self, idade_fila_ms: float) -> None:
        self.enviados += 1
        self.maior_idade_fila_ms = max(self.maior_idade_fila_ms, idade_fila_ms)

    def resumo(self) -> str:
        return (
            f"audio_chunks={self.enfileirados} "
            f"enviados={self.enviados} "
            f"descartados={self.descartados} "
            f"maior_fila={self.maior_idade_fila_ms:.0f}ms"
        )


class RecoverableTranscriptionError(Exception):
    pass


class FatalTranscriptionError(Exception):
    pass


def validar_configuracao() -> None:
    if SAMPLE_RATE <= 0:
        raise FatalTranscriptionError("AUDIO_SAMPLE_RATE deve ser maior que zero.")
    if CHANNELS != 1:
        raise FatalTranscriptionError("AUDIO_CHANNELS deve ser 1 para audio_format=pcm16.")
    if CHUNK_SIZE <= 0:
        raise FatalTranscriptionError("AUDIO_CHUNK_SIZE deve ser maior que zero.")
    if CHUNK_SIZE % (CHANNELS * SAMPLE_WIDTH_BYTES) != 0:
        raise FatalTranscriptionError(
            "AUDIO_CHUNK_SIZE deve ser multiplo do tamanho de uma amostra."
        )
    if AUDIO_QUEUE_MAX_SIZE < 1:
        raise FatalTranscriptionError("AUDIO_QUEUE_MAX_SIZE deve ser no minimo 1.")
    if READ_TIMEOUT_SECONDS <= 0 or RECV_TIMEOUT_SECONDS <= 0:
        raise FatalTranscriptionError("Timeouts devem ser maiores que zero.")
    if MAX_RECONNECT_ATTEMPTS < 0:
        raise FatalTranscriptionError("MAX_RECONNECT_ATTEMPTS nao pode ser negativo.")


def obter_auth_key() -> str:
    auth_key = getattr(Configure, "AuthKey", "")
    if not auth_key:
        raise FatalTranscriptionError("ASSEMBLYAI_API_KEY não configurada.")
    return auth_key


def limpar_linha(tamanho_minimo: int = 150) -> None:
    sys.stdout.write("\r" + " " * tamanho_minimo + "\r")


def nome_dispositivo(dispositivo: dict[str, Any]) -> str:
    hostapi = sd.query_hostapis(dispositivo["hostapi"])
    return f"{dispositivo['name']} ({hostapi['name']})"


def selecionar_microfone() -> int | None:
    escolha = os.getenv("AUDIO_DEVICE", "").strip()
    dispositivos = sd.query_devices()

    if escolha:
        if escolha.isdigit():
            indice = int(escolha)
            if 0 <= indice < len(dispositivos):
                dispositivo = dispositivos[indice]
                if dispositivo.get("max_input_channels", 0) > 0:
                    return indice
            return None

        escolha_normalizada = escolha.lower()
        for indice, dispositivo in enumerate(dispositivos):
            if dispositivo.get("max_input_channels", 0) <= 0:
                continue
            if escolha_normalizada in nome_dispositivo(dispositivo).lower():
                return indice

        return None

    dispositivo_padrao = sd.default.device
    indice_padrao = dispositivo_padrao[0]
    if indice_padrao is not None and indice_padrao >= 0:
        dispositivo = dispositivos[indice_padrao]
        if dispositivo.get("max_input_channels", 0) > 0:
            return indice_padrao

    for indice, dispositivo in enumerate(dispositivos):
        if dispositivo.get("max_input_channels", 0) > 0:
            return indice

    return None


def listar_microfones() -> list[str]:
    linhas = []
    for indice, dispositivo in enumerate(sd.query_devices()):
        if dispositivo.get("max_input_channels", 0) > 0:
            linhas.append(f"{indice}: {nome_dispositivo(dispositivo)}")
    return linhas


def imprimir_microfones() -> None:
    microfones = listar_microfones()

    if not microfones:
        print("Nenhum microfone listado.")
        return

    print("Microfones disponíveis:")
    for microfone in microfones:
        print(microfone)


def erro_api_fatal(mensagem: str) -> bool:
    mensagem = mensagem.lower()
    termos_fatais = (
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
    return any(termo in mensagem for termo in termos_fatais)


def erro_parametro_streaming(mensagem: str) -> bool:
    mensagem = mensagem.lower()
    termos_parametro = (
        "prompt",
        "keyterms",
        "language_detection",
        "include_partial",
        "query",
        "parameter",
        "param",
        "unsupported",
        "unknown",
        "invalid",
    )
    return any(termo in mensagem for termo in termos_parametro)


async def notificar(
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None,
    mensagem: dict[str, Any],
) -> None:
    if on_text:
        await on_text(mensagem)


def criar_fila_audio(
    loop: asyncio.AbstractEventLoop,
) -> tuple[asyncio.Queue[tuple[bytes, float]], Callable[[Any, int, Any, Any], None], AudioStats]:
    fila: asyncio.Queue[tuple[bytes, float]] = asyncio.Queue(
        maxsize=AUDIO_QUEUE_MAX_SIZE
    )
    stats = AudioStats()

    def inserir_audio(dados: bytes, capturado_em: float) -> None:
        if fila.full():
            try:
                fila.get_nowait()
                stats.registrar_descarte()
            except asyncio.QueueEmpty:
                pass
        try:
            fila.put_nowait((dados, capturado_em))
            stats.registrar_entrada()
        except asyncio.QueueFull:
            stats.registrar_descarte()
            pass

    def callback(indata, frames, time_info, status) -> None:
        if status:
            logger.warning("Aviso na captura de áudio: %s", status)
        loop.call_soon_threadsafe(inserir_audio, bytes(indata), time.monotonic())

    return fila, callback, stats


async def ler_chunk_audio(fila_audio: asyncio.Queue[tuple[bytes, float]]) -> tuple[bytes, float]:
    try:
        return await asyncio.wait_for(
            fila_audio.get(),
            timeout=READ_TIMEOUT_SECONDS,
        )
    except TimeoutError as exc:
        raise RecoverableTranscriptionError("Captura de áudio sem dados.") from exc


async def enviar_audio(
    ws: Any,
    fila_audio: asyncio.Queue[tuple[bytes, float]],
    stats: AudioStats,
) -> None:
    buffer = bytearray()
    buffer_capturado_em = 0.0
    ultimo_log = time.monotonic()

    while True:
        dados, capturado_em = await ler_chunk_audio(fila_audio)
        if not buffer:
            buffer_capturado_em = capturado_em
        buffer.extend(dados)

        while len(buffer) >= CHUNK_SIZE:
            idade_fila_ms = (time.monotonic() - buffer_capturado_em) * 1000
            await ws.send(bytes(buffer[:CHUNK_SIZE]))
            stats.registrar_envio(idade_fila_ms)
            del buffer[:CHUNK_SIZE]

            if not buffer:
                buffer_capturado_em = 0.0

            agora = time.monotonic()
            if DEBUG_LATENCY and agora - ultimo_log >= LATENCY_LOG_INTERVAL_SECONDS:
                print(f"\nlatencia_audio: {stats.resumo()}\n")
                ultimo_log = agora


def deve_enviar_parcial(texto: str, parcial_enviado: str, enviado_em: float) -> bool:
    agora = time.monotonic()
    return (
        not parcial_enviado
        or len(texto) - len(parcial_enviado) >= PARTIAL_SEND_STEP
        or (
            texto != parcial_enviado
            and (agora - enviado_em) * 1000 >= PARTIAL_SEND_INTERVAL_MS
        )
    )


async def tratar_texto_final(
    texto: str,
    tamanho_linha_anterior: int,
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None,
) -> None:
    limpar_linha(max(150, tamanho_linha_anterior))

    print("-" * 60)
    print(texto)
    print("-" * 60)
    print()

    await notificar(
        on_text,
        {
            "type": "transcript",
            "text": texto,
            "is_final": True,
        },
    )


async def tratar_texto_parcial(
    texto: str,
    parcial_impresso: int,
    parcial_enviado: str,
    parcial_enviado_em: float,
    tamanho_linha_anterior: int,
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None,
) -> tuple[int, str, float, int]:
    agora = time.monotonic()

    if deve_enviar_parcial(texto, parcial_enviado, parcial_enviado_em):
        await notificar(
            on_text,
            {
                "type": "transcript",
                "text": texto,
                "is_final": False,
            },
        )
        parcial_enviado = texto
        parcial_enviado_em = agora

    if len(texto) - parcial_impresso >= PARTIAL_PRINT_STEP:
        limpar_linha(max(150, tamanho_linha_anterior))

        print("Ouvindo:")
        print(texto[parcial_impresso:])
        print()

        parcial_impresso = len(texto)
        tamanho_linha_anterior = 0
    else:
        exibicao = texto[-PARTIAL_LINE_LIMIT:]
        linha = "Ouvindo: " + exibicao
        limpar = max(0, tamanho_linha_anterior - len(linha))

        sys.stdout.write("\r" + linha + " " * (limpar + 20))
        tamanho_linha_anterior = len(linha)

    sys.stdout.flush()
    return parcial_impresso, parcial_enviado, parcial_enviado_em, tamanho_linha_anterior


async def receber_texto(
    ws: Any,
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None,
) -> None:
    texto_parcial = ""
    parcial_impresso = 0
    parcial_enviado = ""
    parcial_enviado_em = 0.0
    tamanho_linha_anterior = 0

    while True:
        try:
            async with asyncio.timeout(RECV_TIMEOUT_SECONDS):
                resposta = await ws.recv()
        except TimeoutError as exc:
            raise RecoverableTranscriptionError("API sem resposta.") from exc

        dados = json.loads(resposta)
        tipo = dados.get("type")

        if tipo == "Turn":
            texto = dados.get("transcript", "").strip()

            if not texto:
                continue

            if dados.get("turn_is_done", False):
                await tratar_texto_final(texto, tamanho_linha_anterior, on_text)
                texto_parcial = ""
                parcial_impresso = 0
                parcial_enviado = ""
                parcial_enviado_em = 0.0
                tamanho_linha_anterior = 0
                continue

            if texto == texto_parcial:
                continue

            texto_parcial = texto
            (
                parcial_impresso,
                parcial_enviado,
                parcial_enviado_em,
                tamanho_linha_anterior,
            ) = await tratar_texto_parcial(
                texto,
                parcial_impresso,
                parcial_enviado,
                parcial_enviado_em,
                tamanho_linha_anterior,
                on_text,
            )

        elif tipo == "Error":
            erro = dados.get("error", "Erro desconhecido")
            if erro_api_fatal(erro):
                raise FatalTranscriptionError(f"Erro fatal da API: {erro}")
            raise RecoverableTranscriptionError(f"Erro da API: {erro}")

        elif tipo == "SessionBegins":
            print("Sessão iniciada.\n")

        elif tipo == "SessionTerminated":
            raise RecoverableTranscriptionError("Sessão encerrada pela API.")


async def aguardar_inicio_sessao(ws: Any) -> None:
    while True:
        try:
            async with asyncio.timeout(RECV_TIMEOUT_SECONDS):
                resposta_bruta = await ws.recv()
        except TimeoutError as exc:
            raise RecoverableTranscriptionError("API sem resposta ao iniciar sessão.") from exc

        try:
            resposta = json.loads(resposta_bruta)
        except json.JSONDecodeError as exc:
            raise RecoverableTranscriptionError(
                f"Resposta inválida ao iniciar sessão: {resposta_bruta!r}"
            ) from exc

        tipo = resposta.get("type")

        if resposta.get("id") and tipo in (None, "Begin", "SessionBegins"):
            return

        if tipo in ("Begin", "SessionBegins") and resposta.get("id"):
            return

        if tipo in ("Error", "error"):
            erro = resposta.get("error") or resposta.get("message") or resposta
            mensagem = f"Erro da API ao iniciar sessão: {erro}"
            if erro_api_fatal(str(erro)):
                raise FatalTranscriptionError(mensagem)
            raise RecoverableTranscriptionError(mensagem)

        if tipo in ("Warning", "warning"):
            aviso = resposta.get("warning") or resposta.get("message") or resposta
            logger.warning("Aviso da API ao iniciar sessão: %s", aviso)
            continue

        raise RecoverableTranscriptionError(
            f"Resposta inesperada ao iniciar sessão: {resposta}"
        )


async def executar_sessao(
    microfone: int,
    auth_key: str,
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None,
    url: str,
) -> None:
    loop = asyncio.get_running_loop()
    fila_audio, callback_audio, stats = criar_fila_audio(loop)

    async with websockets.connect(
        url,
        additional_headers={"Authorization": auth_key},
        ping_interval=10,
        ping_timeout=30,
        close_timeout=10,
        max_size=None,
    ) as ws:
        await aguardar_inicio_sessao(ws)

        print("=" * 60)
        print("TRANSCRIÇÃO EM TEMPO REAL")
        print("=" * 60)
        print()

        try:
            sd.check_input_settings(
                device=microfone,
                channels=CHANNELS,
                samplerate=SAMPLE_RATE,
                dtype="int16",
            )
        except Exception as exc:
            raise FatalTranscriptionError(
                f"Microfone incompatível com {SAMPLE_RATE}Hz mono int16: {exc}"
            ) from exc

        with sd.RawInputStream(
            samplerate=SAMPLE_RATE,
            blocksize=BLOCK_SAMPLES,
            device=microfone,
            channels=CHANNELS,
            dtype="int16",
            callback=callback_audio,
        ):
            tarefas = [
                asyncio.create_task(enviar_audio(ws, fila_audio, stats)),
                asyncio.create_task(receber_texto(ws, on_text)),
            ]
            done, pending = await asyncio.wait(
                tarefas,
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


async def iniciar_transcricao(
    on_text: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
):
    try:
        validar_configuracao()
        if LIST_AUDIO_DEVICES:
            imprimir_microfones()
            return

        auth_key = obter_auth_key()
    except FatalTranscriptionError as exc:
        print(f"\n{exc}\n")
        await notificar(
            on_text,
            {
                "type": "error",
                "text": str(exc),
                "is_final": True,
                "error": True,
            },
        )
        return

    microfone = selecionar_microfone()

    if microfone is None:
        microfones = "\n".join(listar_microfones()) or "Nenhum microfone listado."
        mensagem = f"Microfone não encontrado.\n{microfones}"
        print(f"\n{mensagem}\n")
        await notificar(
            on_text,
            {
                "type": "error",
                "text": mensagem,
                "is_final": True,
                "error": True,
            },
        )
        return

    dispositivo = sd.query_devices(microfone)
    print("\nMicrofone selecionado:")
    print(f"{microfone}: {nome_dispositivo(dispositivo)}")
    print()

    tentativa = 0
    atraso = INITIAL_RECONNECT_DELAY
    usar_prompt_portugues = USE_PORTUGUESE_PROMPT

    while True:
        try:
            url = montar_url(usar_prompt_portugues)
            await executar_sessao(microfone, auth_key, on_text, url)
            return
        except asyncio.CancelledError:
            raise
        except FatalTranscriptionError as exc:
            mensagem = str(exc)
            logger.error("Erro fatal na transcrição: %s", mensagem)
            print(f"\n{mensagem}\n")
            await notificar(
                on_text,
                {
                    "type": "error",
                    "text": mensagem,
                    "is_final": True,
                    "error": True,
                },
            )
            return
        except Exception as exc:
            if usar_prompt_portugues and erro_parametro_streaming(str(exc)):
                usar_prompt_portugues = False
                tentativa = 0
                atraso = INITIAL_RECONNECT_DELAY
                print(
                    "\nA API recusou algum parâmetro de prompt/idioma. "
                    "Tentando novamente com configuração básica.\n"
                )
                continue

            tentativa += 1
            logger.error("Erro na transcrição: %s", exc)

            if tentativa > MAX_RECONNECT_ATTEMPTS:
                mensagem = (
                    "Transcrição encerrada após "
                    f"{MAX_RECONNECT_ATTEMPTS} tentativas de reconexão: {exc}"
                )
                print(f"\n{mensagem}\n")
                await notificar(
                    on_text,
                    {
                        "type": "error",
                        "text": mensagem,
                        "is_final": True,
                        "error": True,
                    },
                )
                return

            print(
                "\nConexão perdida. "
                f"Reconectando em {atraso:.0f}s "
                f"({tentativa}/{MAX_RECONNECT_ATTEMPTS})...\n"
            )
            await asyncio.sleep(atraso)
            atraso = min(atraso * 2, MAX_RECONNECT_DELAY)


async def main():
    try:
        await iniciar_transcricao()

    except asyncio.CancelledError:
        print("\nPrograma encerrado.\n")

    except KeyboardInterrupt:
        print("\nPrograma encerrado.\n")

    except Exception as e:
        print(f"\nErro geral: {e}\n")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nPrograma encerrado.\n")
