"""
Transcrição em tempo real com estratégia de janela deslizante.
Não espera o silêncio para transcrever — processa a cada 1s de fala
e mostra resultado parcial enquanto a pessoa ainda fala.
"""

import numpy as np
import os
import queue
import sounddevice as sd
import threading
import time as time_mod
from collections import deque
from faster_whisper import WhisperModel

# ─── Configurações ────────────────────────────────────────────────────────────

SAMPLE_RATE = 16000
CHUNK_SAMPLES = int(os.getenv("CHUNK_SAMPLES", "320"))  # 20ms
CHUNK_SECONDS = CHUNK_SAMPLES / SAMPLE_RATE

# VAD
MIN_SPEECH_RMS = float(os.getenv("MIN_SPEECH_RMS", "2500"))
NOISE_MULTIPLIER = float(os.getenv("NOISE_MULTIPLIER", "3.2"))
START_SPEECH_CHUNKS = int(os.getenv("START_SPEECH_CHUNKS", "2"))
SILENCE_CHUNKS = int(os.getenv("SILENCE_CHUNKS", "18"))  # ~360ms
MIN_SPEECH_CHUNKS = int(os.getenv("MIN_SPEECH_CHUNKS", "12"))
PRE_ROLL_CHUNKS = int(os.getenv("PRE_ROLL_CHUNKS", "6"))

# Janela deslizante — transcreve a cada N segundos SEM esperar silêncio
PARTIAL_EVERY_S = float(os.getenv("PARTIAL_EVERY_S", "1.2"))
PARTIAL_CHUNKS = int(PARTIAL_EVERY_S / CHUNK_SECONDS)

MAX_SPEECH_SECONDS = float(os.getenv("MAX_SPEECH_SECONDS", "6.0"))
MAX_SPEECH_CHUNKS = int(MAX_SPEECH_SECONDS / CHUNK_SECONDS)

MIN_TRANSCRIBE_SECONDS = float(os.getenv("MIN_TRANSCRIBE_SECONDS", "0.35"))
MIN_PEAK = int(os.getenv("MIN_PEAK", "1200"))

# Whisper — tiny é o único viável para tempo real em CPU
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "tiny")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
WHISPER_CPU_THREADS = int(os.getenv("WHISPER_CPU_THREADS", str(os.cpu_count() or 4)))

DEBUG_LATENCY = os.getenv("DEBUG_LATENCY", "0") == "1"

# ─── Carrega modelo + warmup ──────────────────────────────────────────────────

print(f"Carregando modelo Whisper ({WHISPER_MODEL})...")
model = WhisperModel(
    WHISPER_MODEL,
    device=WHISPER_DEVICE,
    compute_type=WHISPER_COMPUTE_TYPE,
    cpu_threads=WHISPER_CPU_THREADS,
    num_workers=1,
)
# Warmup elimina spike de latência na primeira fala
_w = np.zeros(SAMPLE_RATE, dtype=np.float32)
list(model.transcribe(_w, language="pt")[0])
print(f"Pronto! threads={WHISPER_CPU_THREADS} | partial a cada {PARTIAL_EVERY_S}s\n")

# ─── Filas ────────────────────────────────────────────────────────────────────

audio_queue = queue.Queue()
transcription_queue = queue.Queue(maxsize=2)

# ─── Callback ────────────────────────────────────────────────────────────────


def callback(indata, frames, time_info, status):
    audio_queue.put(indata[:, 0].copy())


# ─── Validação + enfileiramento ───────────────────────────────────────────────


def enqueue(audio: np.ndarray, is_partial: bool = False) -> bool:
    seconds = len(audio) / SAMPLE_RATE
    rms = float(np.sqrt(np.mean(audio.astype(np.float32) ** 2)))
    peak = int(np.max(np.abs(audio.astype(np.int32))))

    if seconds < MIN_TRANSCRIBE_SECONDS:
        return False
    if rms < MIN_SPEECH_RMS * 0.6:
        return False
    if peak < MIN_PEAK:
        return False

    payload = (audio, time_mod.monotonic(), is_partial)
    try:
        transcription_queue.put_nowait(payload)
    except queue.Full:
        try:
            transcription_queue.get_nowait()
        except queue.Empty:
            pass
        transcription_queue.put_nowait(payload)
    return True


# ─── Anti-alucinação ─────────────────────────────────────────────────────────

_ALUCINACOES = {
    "obrigado",
    "obrigada",
    "obrigado.",
    "obrigada.",
    "[música]",
    "[aplausos]",
    "[risadas]",
    "...",
    "…",
    "inscreva-se no canal",
    "transcrição automática",
}


def e_alucinacao(texto: str) -> bool:
    if not texto:
        return True
    tl = texto.lower().strip(".,!? ")
    if tl in _ALUCINACOES:
        return True

    palavras = [
        p.strip(".,!?;:\"'").lower() for p in texto.split() if p.strip(".,!?;:\"'")
    ]
    if not palavras:
        return True
    if len(palavras) > 12 and len(set(palavras)) <= 3:
        return True

    for tam in range(2, 5):
        if len(palavras) < tam * 3:
            continue
        blocos = [
            tuple(palavras[i : i + tam]) for i in range(0, len(palavras) - tam + 1, tam)
        ]
        if blocos and max(blocos.count(b) for b in set(blocos)) >= 3:
            return True
    return False


# ─── Transcrição ─────────────────────────────────────────────────────────────

ultimo_texto = ""  # evita repetir resultado idêntico em parciais


def transcrever(audio: np.ndarray, queued_at: float, is_partial: bool) -> None:
    global ultimo_texto
    t0 = time_mod.monotonic()
    audio_float = audio.astype(np.float32) / 32768.0

    segments, _ = model.transcribe(
        audio_float,
        language="pt",
        task="transcribe",
        beam_size=1,  # greedy — mais rápido
        best_of=1,
        temperature=0.0,
        repetition_penalty=1.2,
        compression_ratio_threshold=2.0,
        log_prob_threshold=-0.65,
        no_speech_threshold=0.50,
        hallucination_silence_threshold=0.5,
        condition_on_previous_text=False,
        suppress_blank=True,
        vad_filter=True,
        vad_parameters={
            "threshold": 0.45,
            "min_speech_duration_ms": 150,
            "min_silence_duration_ms": 300,
            "speech_pad_ms": 150,
        },
        initial_prompt="Português brasileiro.",
    )

    partes = []
    for seg in segments:
        txt = seg.text.strip()
        if not txt:
            continue
        if getattr(seg, "no_speech_prob", 0.0) > 0.80:
            continue
        if getattr(seg, "avg_logprob", 0.0) < -0.85:
            continue
        partes.append(txt)

    texto = " ".join(partes).strip()

    if not texto or e_alucinacao(texto):
        return

    # parcial: mostra só se mudou desde a última vez
    if is_partial:
        if texto != ultimo_texto:
            print(f"\r⏳ {texto}    ", end="", flush=True)
            ultimo_texto = texto
    else:
        # resultado final — linha nova limpa
        print(f"\r🤟 {texto}                    ")
        ultimo_texto = ""

    if DEBUG_LATENCY:
        fim = time_mod.monotonic()
        audio_s = len(audio) / SAMPLE_RATE
        fila_s = t0 - queued_at
        whisper_s = fim - t0
        print(
            f"  ⏱  audio={audio_s:.2f}s fila={fila_s:.3f}s whisper={whisper_s:.2f}s {'[parcial]' if is_partial else '[final]'}"
        )


def loop_worker() -> None:
    while True:
        audio, queued_at, is_partial = transcription_queue.get()
        transcrever(audio, queued_at, is_partial)


# ─── VAD + janela deslizante ──────────────────────────────────────────────────


def loop_vad() -> None:
    buffer = []
    pre_roll = deque(maxlen=PRE_ROLL_CHUNKS)
    speech_start = []
    silence_count = 0
    speaking = False
    chunks_desde_parcial = 0
    noise_floor = MIN_SPEECH_RMS * 0.4

    while True:
        chunk = audio_queue.get()
        rms = np.sqrt(np.mean(chunk.astype(np.float32) ** 2))

        threshold = max(MIN_SPEECH_RMS, noise_floor * NOISE_MULTIPLIER)
        is_speech = rms > threshold

        if is_speech:
            silence_count = 0

            if not speaking:
                speech_start.append(chunk)
                if len(speech_start) < START_SPEECH_CHUNKS:
                    continue
                speaking = True
                chunks_desde_parcial = 0
                buffer.extend(pre_roll)
                buffer.extend(speech_start)
                speech_start = []
                print("🎙️  ouvindo...", end="\r")
            else:
                buffer.append(chunk)
                chunks_desde_parcial += 1

                # ── transcrição parcial a cada PARTIAL_CHUNKS ──
                if chunks_desde_parcial >= PARTIAL_CHUNKS:
                    audio_parcial = np.concatenate(buffer)
                    enqueue(audio_parcial, is_partial=True)
                    chunks_desde_parcial = 0

            # corte por tamanho máximo
            if len(buffer) >= MAX_SPEECH_CHUNKS:
                audio = np.concatenate(buffer)
                enqueue(audio, is_partial=False)
                buffer = list(buffer[-PRE_ROLL_CHUNKS:])
                silence_count = 0
                chunks_desde_parcial = 0

        elif speaking:
            buffer.append(chunk)
            silence_count += 1

            if silence_count >= SILENCE_CHUNKS:
                speaking = False
                chunks_desde_parcial = 0
                if len(buffer) >= MIN_SPEECH_CHUNKS:
                    audio = np.concatenate(buffer)
                    enqueue(audio, is_partial=False)  # resultado final
                buffer = []
                silence_count = 0

        else:
            speech_start = []
            pre_roll.append(chunk)
            noise_floor = (noise_floor * 0.97) + (rms * 0.03)


# ─── Inicia ───────────────────────────────────────────────────────────────────

threading.Thread(target=loop_vad, daemon=True).start()
threading.Thread(target=loop_worker, daemon=True).start()

with sd.InputStream(
    samplerate=SAMPLE_RATE,
    channels=1,
    dtype="int16",
    blocksize=CHUNK_SAMPLES,
    callback=callback,
):
    print("Ctrl+C para parar\n")
    try:
        while True:
            sd.sleep(100)
    except KeyboardInterrupt:
        print("\nEncerrando.")
