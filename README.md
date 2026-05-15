# Projeto Festival 2026

Aplicacao com backend de transcricao em tempo real e frontend para exibicao de legenda com integracao VLibras.

## Estrutura

```text
.
├── client/
│   └── DualLibras.AI/        # Frontend React/Vite
└── server/                   # Backend FastAPI + transcricao em tempo real
```

## Frontend

```bash
cd client/DualLibras.AI
npm install
npm run dev
```

## Backend

```bash
cd server
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python main.py
```

Configure `ASSEMBLYAI_API_KEY` no arquivo `server/.env`.

## Arquivos que nao vao para o GitHub

O repositorio ignora dependencias, builds, ambientes virtuais, caches e segredos locais:

- `node_modules/`
- `dist/`
- `venv/`
- `__pycache__/`
- `.env`
- `.agents/`
- `.codex/`
