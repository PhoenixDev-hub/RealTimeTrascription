#!/bin/bash
# Script para build das imagens Docker
set -e

echo "================================"
echo "DualLibras.AI - Docker Builder"
echo "================================"
echo ""

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Build Backend
echo -e "${BLUE} Building backend...${NC}"
docker build -t duallibras-backend:latest ./server

# Build Frontend
echo -e "${BLUE} Building frontend...${NC}"
docker build -t duallibras-frontend:latest ./client

echo ""
echo -e "${GREEN} Build completo!${NC}"
echo ""
echo "Próximos passos:"
echo "1. docker-compose up -d       # Inicia os containers"
echo "2. Acesse http://localhost    # Frontend"
echo "3. WebSocket: ws://localhost:5455/ws"
echo ""
