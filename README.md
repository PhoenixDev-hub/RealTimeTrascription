# Projeto Festival 2026 - DualLibras.AI

**Aplicação de transcrição em tempo real com tradução para Libras**, desenvolvida para auxiliar alunos surdos em ambientes educacionais. Captura áudio do professor, transcreve usando IA e traduz em tempo real para Libras usando a integração VLibras.

### Requisitos
- **Backend**: Python 3.9+
- **Frontend**: Node.js 18+
- **Alternativa Docker**: Docker + Docker Compose (recomendado)

## Estrutura

```
.
├── client/                  # Frontend React/Vite + TypeScript
├── server/                   # Backend FastAPI + transcrição IA
│   └── app/                  # API, configuração e transcrição
└── docker-compose.yml        # Orquestração (opcional)
```

## 🚀 Quick Start com Docker (Recomendado)

```bash
# Build das imagens
./build.sh

# Iniciar containers
docker-compose up -d

# Ver logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Parar
docker-compose down
```

**URLs:**
- Frontend: `http://localhost` (80)
- Backend WebSocket: `ws://localhost:5455/ws`
- Health Check: `http://localhost:5455/health`

## 🔧 Setup e Desenvolvimento Manual

### Inicialização Rápida

```bash
./setup.sh  # Configura ambientes automaticamente
```

### Frontend

```bash
cd client
npm install
npm run dev
```

Acessa em: `http://localhost:5173`

### Backend

```bash
cd server
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

O backend estará disponível em: `ws://localhost:5455/ws`

### Variáveis de Ambiente (`.env`)

```env
# Transcrição
SPEECH_MODEL=u3-rt-pro              # Modelo de reconhecimento
AUDIO_SAMPLE_RATE=16000             # Frequência do áudio
LOCAL_FALLBACK=1                    # Fallback para Whisper local
LOCAL_FALLBACK_MODEL=small          # tiny, base, small
USE_PORTUGUESE_PROMPT=1             # Otimização para português

# Audio
AUDIO_CHUNK_SIZE=1600
AUDIO_CHANNELS=1
VAD_ENERGY_THRESHOLD=300            # Sensibilidade VAD (↓ = mais sensível)
VAD_HOLD_SILENCE_MS=240             # Silêncio antes de finalizar

# Servidor
PORT=5455
LOG_LEVEL=INFO

# VAD (Voice Activity Detection)
USE_WEBRTC_VAD=1
VAD_MODE=2                          # 0-3 (recomendado para ruído: 2-3)
```

## Arquivos que não vão para o GitHub

O repositorio ignora dependências, builds, ambientes virtuais, caches e segredos locais:

- `node_modules/`
- `dist/`
- `venv/`
- `__pycache__/`
- `.env`
- `.agents/`
- `.codex/`

---

## 🛡️ Melhorias de Produção Implementadas

### 1. **Voice Activity Detection (VAD) Robusto** ✅
- WebRTC VAD integrado para detecção em ambiente barulhento
- Fallback para detecção de energia RMS
- Configurável via `VAD_MODE` (0=menos agressivo, 3=muito agressivo)
- **Ideal para**: Salas de aula com ruído de fundo

### 2. **Error Handling Avançado** ✅
- Retry automático com backoff exponencial (1s, 2s, 4s)
- Timeouts para evitar travamentos
- Reconexão inteligente no frontend com jitter
- Cache local de transcrições (sessionStorage)

### 3. **Docker & Containerização** ✅
- Dockerfile multi-stage otimizado
- docker-compose.yml com orquestração
- Nginx como reverse proxy + static files
- Health checks configurados

### 4. **Logging Estruturado** ✅
- Logs com contexto, timestamps e níveis
- Rastreabilidade de erros e operações
- Configurável via `LOG_LEVEL`

---

## 📊 Recomendações por Cenário

### 🏫 Ambiente Barulhento (Sala de Aula)
```env
USE_WEBRTC_VAD=1
VAD_MODE=3                    # Muito agressivo
VAD_ENERGY_THRESHOLD=400
VAD_HOLD_SILENCE_MS=300
LOCAL_FALLBACK_MODEL=base     # Modelo mais preciso
```

### 🤫 Ambiente Silencioso
```env
USE_WEBRTC_VAD=1
VAD_MODE=1                    # Normal
VAD_ENERGY_THRESHOLD=250
LOCAL_FALLBACK_MODEL=tiny     # Modelo mais rápido
```

---

## 🚨 Troubleshooting

### Backend não inicia
```bash
docker logs duallibras-backend
# ou
lsof -i :5455
```

### Frontend não conecta
- Verificar health: `http://localhost:5455/health`
- Verificar `VITE_BACKEND_WS_URL` no `.env`
- Checar firewall/CORS

### VAD não detecta fala
- Aumentar `VAD_MODE` para 3
- Aumentar `VAD_ENERGY_THRESHOLD`
- Testar com `DEBUG_LATENCY=1`
