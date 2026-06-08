# 🔊 Otimizações para Ambiente Barulhento

## O Desafio

Salas de aula geralmente têm:
- Múltiplas vozes simultâneas
- Ruído de fundo (ar condicionado, tráfego)
- Áudio de baixa qualidade (microfones baratos)
- Picos de ruído (portas, buzinas)

## Soluções Implementadas

### 1. Voice Activity Detection (VAD) Avançado

**O que é**: Detecta apenas fala humana, ignorando ruído

**Configurações por cenário**:

```env
# MUITO BARULHENTO (sala com vários alunos falando)
USE_WEBRTC_VAD=1
VAD_MODE=3                  # Máxima agressividade
VAD_ENERGY_THRESHOLD=500    # Alto threshold
VAD_HOLD_SILENCE_MS=300     # Manter fala por mais tempo

# BARULHENTO (sala normal com ventilador)
USE_WEBRTC_VAD=1
VAD_MODE=2                  # Normal (recomendado)
VAD_ENERGY_THRESHOLD=350
VAD_HOLD_SILENCE_MS=240

# SILENCIOSO (sala isolada)
USE_WEBRTC_VAD=1
VAD_MODE=1                  # Menos agressivo
VAD_ENERGY_THRESHOLD=250
VAD_HOLD_SILENCE_MS=200
```

### 2. Modelo de Transcrição

**Recomendações**:

```env
# Mais preciso mas mais lento (para fala difícil)
LOCAL_FALLBACK_MODEL=base

# Balanço (recomendado)
LOCAL_FALLBACK_MODEL=small

# Rápido mas menos preciso (para muita fala)
LOCAL_FALLBACK_MODEL=tiny
```

### 3. Qualidade de Áudio

**Como melhorar**:

1. **Usar bom microfone**
   - Headset com cancellation de ruído
   - Microfone USB de boa qualidade
   - Evitar microfones integrados de notebook

2. **Posicionamento**
   - Microfone próximo da boca (10-15cm)
   - Afastado do ventilador/AC
   - Evitar eco (não na esquina/parede)

3. **Configuração do sistema**
   - Aumentar volume do microfone (não ao máximo)
   - Usar driver atualizado
   - Testar com: `DEBUG_LATENCY=1`

## Testes Recomendados

### 1. Teste de VAD em seu ambiente
```bash
# Ativar debug e analisar logs
LOG_LEVEL=DEBUG python main.py

# Procurar por linhas como:
# WebRTC VAD: True/False
# VAD RMS=2450 (threshold=300)
```

### 2. Gravar amostra de áudio
```bash
# Gravar 10 segundos
sox -d -r 16000 -b 16 -c 1 teste.wav trim 0 10

# Testar transcrição offline
python -c "
from faster_whisper import WhisperModel
model = WhisperModel('tiny')
segments, _ = model.transcribe('teste.wav', language='pt')
for segment in segments:
    print(segment.text)
"
```

### 3. Medir latência
```bash
# Com debug
DEBUG_LATENCY=1 LOG_LEVEL=DEBUG python main.py

# Observar: 'latencia_audio:' nos logs
```

## Troubleshooting

### ❌ VAD detecta tudo como fala
```env
# Aumentar aggressividade
VAD_MODE=3
VAD_ENERGY_THRESHOLD=400
```

### ❌ VAD não detecta fala do professor
```env
# Diminuir aggressividade
VAD_MODE=1
VAD_ENERGY_THRESHOLD=200
```

### ❌ Muitos erros de transcrição
```env
# Usar modelo mais preciso
LOCAL_FALLBACK_MODEL=base

# Pré-processar áudio (próxima versão)
# Adicionar filtro de frequência
```

### ❌ Latência alta
```env
# Usar modelo mais rápido
LOCAL_FALLBACK_MODEL=tiny

# Reduzir fila de áudio
AUDIO_QUEUE_MAX_SIZE=4

# Processar em GPU (se disponível)
WHISPER_DEVICE=cuda
```

## Próximas Melhorias (Roadmap)

- [ ] Noise suppression (noisereducer)
- [ ] Spectral analysis para detectar ruído constante
- [ ] Filtros de frequência para remover buzz elétrico
- [ ] GPU acceleration para Whisper
- [ ] Modelo otimizado para português
- [ ] Multi-speaker diarization (saber quem falou)

## Referências

- WebRTC VAD: https://github.com/wiseman/py-webrtcvad
- Faster Whisper: https://github.com/SYSTRAN/faster-whisper
- Audio Processing: https://scipy.org/doc/scipy/reference/signal.html

---

**💡 Dica**: Teste em seu próprio ambiente primeiro! Cada sala tem características únicas.
