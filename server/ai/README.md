# Real-Time Audio Transcription

Aplicação de transcrição de áudio em tempo real em português, utilizando AssemblyAI API V3 e websockets, com tradução para Libras em tempo real.

## Funcionalidades

- Captura de áudio em tempo real via PipeWire
- Transcrição em português com detecção de fala
- Tradução automática para Libras com avatar 3D
- Interface via terminal interativo
- Processamento de áudio com controle de ruído
- Comunicação em tempo real via WebSocket
- **Salvamento automático de transcrições em PDF, TXT e JSON**
- **API REST para gerenciamento de transcrições**

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
cd client
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
OUTPUT_PATH=./output
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
cd client
npm run dev
```

### Acessar a Aplicação
Abra o navegador em `http://localhost:5173`

## APIs de Transcrição

### Salvar Transcrição
```bash
POST /save-transcript
Content-Type: application/json

{
 "text": "Texto da transcrição aqui...",
 "title": "Minha Transcrição",
 "formats": ["pdf", "txt", "json"],
 "metadata": {
 "evento": "Festival 2026",
 "palestrante": "Nome do palestrante"
 }
}
```

**Resposta:**
```json
{
 "success": true,
 "message": "Transcrição salva com sucesso em 3 formato(s)",
 "files": {
 "pdf": "transcripts/pdfs/transcricao_20260603_120000.pdf",
 "txt": "transcripts/texts/transcricao_20260603_120000.txt",
 "json": "transcripts/metadata/transcricao_20260603_120000_metadata.json"
 },
 "metadata": {
 "title": "Minha Transcrição",
 "text_length": 250,
 "formats_saved": ["pdf", "txt", "json"]
 }
}
```

### Listar Transcrições
```bash
GET /transcripts
```

**Resposta:**
```json
{
 "total": 5,
 "pdfs": ["transcricao_20260603_120000.pdf", "..."],
 "texts": ["transcricao_20260603_120000.txt", "..."],
 "metadata": ["transcricao_20260603_120000_metadata.json", "..."]
}
```

### Baixar Transcrição
```bash
GET /transcripts/download/{filename}
```

Serve arquivos PDF, TXT ou JSON.

### Status de Upload
```bash
GET /upload-status
```

**Resposta:**
```json
{
 "paths": {
 "base": "./output",
 "pdfs": "./output/transcripts/pdfs",
 "texts": "./output/transcripts/texts",
 "metadata": "./output/transcripts/metadata"
 },
 "counts": {
 "pdfs": 5,
 "texts": 5,
 "metadata": 5
 },
 "total_size_mb": 1.25,
 "status": "online"
}
```

## Estrutura de Pastas

A aplicação organiza automaticamente as transcrições em uma estrutura clara:

```
output/
 transcripts/
 pdfs/ # Documentos PDF gerados
 transcricao_20260603_120000.pdf
 texts/ # Arquivos de texto plano
 transcricao_20260603_120000.txt
 metadata/ # Informações em JSON
 transcricao_20260603_120000_metadata.json
```

## Como Funciona

1. **Captura de Áudio**: O sistema detecta automaticamente o microfone via PipeWire
2. **Transcrição**: O áudio é enviado para AssemblyAI e convertido em texto em português
3. **Tradução**: O texto é enviado via WebSocket para o frontend
4. **VLibras**: O widget VLibras traduz o texto para Libras com avatar 3D
5. **Salvamento**: As transcrições podem ser salvas em múltiplos formatos via API

## Estrutura do Projeto

```
 server/
 app/
 api.py # API REST e WebSocket
 config.py # Configurações
 transcription.py # Lógica de transcrição
 transcript_manager.py # Gerenciador de PDFs e salvamento
 main.py
 requirements.txt
 .env
 client/
 src/
 App.tsx
 components/
 VLibras.tsx
 services/
 websocket.ts
 package.json
 output/
 transcripts/ # Transcrições salvas (criado automaticamente)
```

## APIs Utilizadas

- **AssemblyAI**: Transcrição de áudio em tempo real
- **VLibras**: Tradução para Libras com avatar 3D
- **WebSocket**: Comunicação em tempo real entre backend e frontend

## Desenvolvimento

### Testes
- Endpoint de saúde: `GET /health`
- Envio de mensagem de teste: `POST /test-message`
- WebSocket: `ws://localhost:5455/ws`

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
