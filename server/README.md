# Real-Time Audio Transcription

Aplicação de transcrição de áudio em tempo real em português, utilizando AssemblyAI API V3 e websockets, com tradução para Libras em tempo real.

## Funcionalidades

-  Captura de áudio em tempo real via PipeWire
-  Transcrição em português com detecção de fala
-  Tradução automática para Libras com avatar 3D
-  Interface via terminal interativo
-  Processamento de áudio com controle de ruído
-  Comunicação em tempo real via WebSocket

## Requisitos

- Python 3.8+
- PipeWire (para captura de áudio).
- Chave de API AssemblyAI
- Node.js 18+ e npm (para o frontend)

## Instalação Rápida

### Backend (Python)
```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend (React)
```bash
cd client/DualLibras.AI
npm install
```

## Configuração

1. Copie o arquivo `.env.example` para `.env`:

```bash
cp .env.example .env
```

2. Edite o arquivo `.env` e adicione sua chave de API AssemblyAI:

```
ASSEMBLYAI_API_KEY=sua_chave_aqui
```

O arquivo `.env` não será enviado para o repositório (está no .gitignore).

## Uso

### Iniciar Backend
```bash
cd server
source venv/bin/activate
python main.py
```

### Iniciar Frontend
```bash
cd client/DualLibras.AI
npm run dev
```

### Acessar a Aplicação
Abra o navegador em `http://localhost:5173`

## Como Funciona

1. **Captura de Áudio**: O sistema detecta automaticamente o microfone via PipeWire
2. **Transcrição**: O áudio é enviado para AssemblyAI e convertido em texto em português
3. **Tradução**: O texto é enviado via WebSocket para o frontend
4. **VLibras**: O widget VLibras traduz o texto para Libras com avatar 3D

## Estrutura do Projeto

```
├── server/                    # Backend Python
│   ├── main.py               # Servidor FastAPI com WebSocket
│   ├── RealTimeAudioTranscription.py  # Lógica de transcrição
│   ├── RealTimeTest.py       # Versão de teste
│   ├── Configure.py          # Configuração da API
│   ├── requirements.txt      # Dependências Python
│   └── .env                  # Chave da API (não versionado)
├── client/DualLibras.AI/     # Frontend React
│   ├── src/
│   │   ├── App.tsx          # Componente principal
│   │   ├── components/
│   │   │   └── VLibras.tsx  # Integração com VLibras
│   │   └── services/
│   │       └── websocket.ts # Comunicação WebSocket
│   └── package.json         # Dependências Node.js
```

## APIs Utilizadas

- **AssemblyAI**: Transcrição de áudio em tempo real
- **VLibras**: Tradução para Libras com avatar 3D
- **WebSocket**: Comunicação em tempo real entre backend e frontend

## Desenvolvimento

### Testes
- Endpoint de saúde: `GET /health`
- Envio de mensagem de teste: `POST /test-message`
- WebSocket: `ws://localhost:8888/ws`

### Logs
Os logs são exibidos no terminal do backend, mostrando:
- Conexões de clientes
- Status da transcrição
- Erros da API

## Troubleshooting

### Microfone não encontrado
- Verifique se PipeWire está instalado e funcionando
- Execute `pactl list short sources` para listar microfones disponíveis

### Erro na API AssemblyAI
- Verifique se a chave da API está correta em `.env`
- Confirme se há créditos disponíveis na conta AssemblyAI

### VLibras não aparece
- Verifique se há conexão com a internet
- O widget VLibras é carregado do site oficial `vlibras.gov.br`

## Licença

Este projeto é distribuído sob a licença MIT.
