# 🚀 Guia Rápido - Salvar Transcrições em PDF

## Estrutura de Pastas 📁

A aplicação organiza automaticamente as transcrições em:

```
output/
└── transcripts/
    ├── pdfs/              ← Documentos PDF
    ├── texts/             ← Arquivos de texto plano
    └── metadata/          ← Informações em JSON
```

## Como Usar

### 1. Setup Inicial

```bash
# Navegar para o diretório do servidor
cd server

# Criar virtual environment
python3 -m venv venv
source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt
```

### 2. Rodar o Servidor

```bash
source venv/bin/activate
python main.py
```

O servidor estará disponível em: `http://localhost:5455`

### 3. Salvar uma Transcrição

#### Usando curl:

```bash
curl -X POST http://localhost:5455/save-transcript \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Olá, este é meu texto transcrito!",
    "title": "Minha Transcrição",
    "formats": ["pdf", "txt", "json"],
    "metadata": {
      "evento": "Festival 2026",
      "palestrante": "João Silva"
    }
  }'
```

#### Usando Python:

```python
import httpx

response = httpx.post(
    "http://localhost:5455/save-transcript",
    json={
        "text": "Olá, este é meu texto transcrito!",
        "title": "Minha Transcrição",
        "formats": ["pdf", "txt", "json"],
        "metadata": {
            "evento": "Festival 2026",
            "palestrante": "João Silva"
        }
    }
)

print(response.json())
```

#### Usando JavaScript/TypeScript:

```typescript
const response = await fetch("http://localhost:5455/save-transcript", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: "Olá, este é meu texto transcrito!",
    title: "Minha Transcrição",
    formats: ["pdf", "txt", "json"],
    metadata: {
      evento: "Festival 2026",
      palestrante: "João Silva"
    }
  })
});

const data = await response.json();
console.log(data);
```

### 4. Endpoints Disponíveis

#### ✅ Salvar Transcrição
```
POST /save-transcript
```
Salva em múltiplos formatos (PDF, TXT, JSON)

**Parâmetros:**
- `text` (string, obrigatório): Texto da transcrição
- `title` (string): Título do documento
- `formats` (array): Formatos a salvar: `["pdf", "txt", "json"]`
- `metadata` (object): Dados adicionais customizados

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

#### 📋 Listar Transcrições
```
GET /transcripts
```
Lista todas as transcrições salvas

**Resposta:**
```json
{
  "total": 5,
  "pdfs": ["transcricao_20260603_120000.pdf", "..."],
  "texts": ["transcricao_20260603_120000.txt", "..."],
  "metadata": ["transcricao_20260603_120000_metadata.json", "..."]
}
```

#### 📥 Baixar Arquivo
```
GET /transcripts/download/{filename}
```
Baixa um arquivo específico (PDF, TXT ou JSON)

**Exemplo:**
```
GET /transcripts/download/transcricao_20260603_120000.pdf
GET /transcripts/download/transcricao_20260603_120000.txt
```

#### 📊 Status de Armazenamento
```
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

#### ❤️ Health Check
```
GET /health
```

## Exemplos Práticos

### Exemplo 1: Salvar transcrição de uma apresentação

```bash
curl -X POST http://localhost:5455/save-transcript \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Bem-vindo ao Festival 2026. Hoje vamos falar sobre inovação em tecnologia assistiva. Lorem ipsum dolor sit amet...",
    "title": "Apresentação Festival 2026 - Tecnologia Assistiva",
    "formats": ["pdf", "txt", "json"],
    "metadata": {
      "evento": "Festival 2026",
      "palestrante": "Dra. Maria Silva",
      "data": "2026-06-03",
      "duração": "45 minutos",
      "tópico": "Tecnologia Assistiva"
    }
  }'
```

### Exemplo 2: Apenas salvar em PDF

```bash
curl -X POST http://localhost:5455/save-transcript \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Minha transcrição aqui...",
    "title": "Documento Importante",
    "formats": ["pdf"]
  }'
```

### Exemplo 3: Com dados de identificação

```bash
curl -X POST http://localhost:5455/save-transcript \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Conteúdo da transcrição...",
    "title": "Reunião com Stakeholders",
    "formats": ["pdf", "txt", "json"],
    "metadata": {
      "empresa": "Tech Festival",
      "departamento": "Inovação",
      "responsável": "João Pedro",
      "confidencial": true,
      "palavras_chave": ["inovação", "tecnologia", "acessibilidade"]
    }
  }'
```

## Testes

### Rodar testes do TranscriptManager

```bash
cd server
source venv/bin/activate
python test_transcript_manager.py
```

### Rodar testes da API

```bash
# Terminal 1: Iniciar servidor
cd server
source venv/bin/activate
python main.py

# Terminal 2: Rodar testes
cd server
source venv/bin/activate
python test_api.py
```

## Troubleshooting

### Porta 5455 já está em uso

```bash
# Matar processo usando a porta
lsof -i :5455
kill -9 <PID>
```

### Permissão negada ao criar pasta

```bash
# Verificar permissões
ls -la output/
chmod -R 755 output/
```

### ImportError ao rodar servidor

```bash
# Resetar virtual environment
rm -rf server/venv
python3 -m venv server/venv
source server/venv/bin/activate
pip install -r server/requirements.txt
```

## Estrutura de Dados Salva

### Arquivo PDF
- Título do documento
- Data e hora
- Texto formatado com paragrafação
- Rodapé com metadados

### Arquivo TXT
- Texto simples em UTF-8
- Perfeito para busca e indexação

### Arquivo JSON
- Metadata estruturada
- Fácil de processar e integrar
- Exemplo:
```json
{
  "title": "Minha Transcrição",
  "text": "Conteúdo aqui...",
  "timestamp": "2026-06-03T13:20:47.123456",
  "filename_base": "transcricao_20260603_132047",
  "formats": ["pdf", "txt", "json"],
  "evento": "Festival 2026",
  "palestrante": "Nome"
}
```

## 🎯 Próximos Passos

1. **Integrar com frontend**: Chamar `/save-transcript` ao finalizar uma transcrição
2. **Dashboard**: Criar página para listar e baixar transcrições
3. **Busca**: Implementar busca em transcrições salvas
4. **Exportação**: Adicionar suporte para mais formatos (DOCX, RTF, etc.)
5. **Backup**: Automatizar backup das transcrições salvas

## 📞 Suporte

Para problemas ou dúvidas, consulte:
- [README.md](../README.md) - Documentação completa
- [transcript_manager.py](../server/app/transcript_manager.py) - Código do gerenciador
- [api.py](../server/app/api.py) - Endpoints da API
