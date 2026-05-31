#!/bin/bash
# Script para rodar em desenvolvimento
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Cores
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}==================================${NC}"
echo -e "${BLUE}DualLibras.AI - Dev Environment${NC}"
echo -e "${BLUE}==================================${NC}"
echo ""

# Setup Backend
echo -e "${YELLOW} Setup Backend...${NC}"
cd "$SCRIPT_DIR/server"

if [ ! -d "venv" ]; then
    echo "Criando virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate 2>/dev/null || . venv/Scripts/activate 2>/dev/null || true

if [ ! -f ".env" ]; then
    echo "Copiando .env.example para .env..."
    cp .env.example .env
    echo -e "${YELLOW}  Configure o .env conforme necessário${NC}"
fi

echo "Instalando dependências..."
pip install -r requirements.txt -q

echo -e "${GREEN} Backend pronto${NC}"
echo ""

# Setup Frontend
echo -e "${YELLOW} Setup Frontend...${NC}"
cd "$SCRIPT_DIR/client"

if [ ! -d "node_modules" ]; then
    echo "Instalando dependências..."
    npm install
fi

echo -e "${GREEN} Frontend pronto${NC}"
echo ""

# Info
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN} Ambiente configurado!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Para iniciar:"
echo ""
echo "  Backend:"
echo "    cd $SCRIPT_DIR/server"
echo -e "    ${BLUE}source venv/bin/activate${NC}  # Unix/Mac"
echo -e "    ${BLUE}venv\\Scripts\\activate${NC}     # Windows"
echo -e "    ${BLUE}python main.py${NC}"
echo ""
echo "  Frontend:"
echo "    cd $SCRIPT_DIR/client"
echo -e "    ${BLUE}npm run dev${NC}"
echo ""
