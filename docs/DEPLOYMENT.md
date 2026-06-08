# 🚀 Guia de Deployment - DualLibras.AI

## Pré-requisitos

- Docker 20.10+
- Docker Compose 2.0+
- Git

## Deployment Local com Docker

### 1. Clonar repositório
```bash
git clone <https://github.com/PhoenixDev-hub/RealTimeTrascription>
cd ProjetoFestival2026
```

### 2. Configurar variáveis
```bash
cp server/.env.example server/.env
# Editar .env conforme necessário
```

### 3. Build e iniciar
```bash
# Opção A: Usar scripts
./build.sh
docker-compose up -d

# Opção B: Comando único
docker-compose up -d --build
```

### 4. Verificar status
```bash
# Health check
curl http://localhost:5455/health

# Logs
docker-compose logs -f
```

## Deployment em Produção

### Recomendações

1. **Usar variáveis de ambiente seguras**
   ```bash
   # Não commitar .env em produção
   docker-compose --env-file /secure/.env up -d
   ```

2. **Configurar reverse proxy (Nginx/Apache)**
   ```nginx
   location /ws {
     proxy_pass http://backend:5455/ws;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
   }
   ```

3. **Volumes persistentes**
   ```yaml
   volumes:
     - ./transcripts:/app/transcripts
     - ./logs:/app/logs
   ```

4. **Backup de transcrições**
   ```bash
   docker cp duallibras-backend:/app/transcripts ./backup/
   ```

## Scaling & Performance

### Para múltiplas instituições
```yaml
services:
  backend1:
    build: ./server
    ports: ["5455:5455"]
  backend2:
    build: ./server
    ports: ["5456:5455"]
  # Load balancer configura port 5000 → 5455/5456
```

### Otimizações
- Usar modelo `small` ou `base` no LOCAL_FALLBACK_MODEL
- Aumentar VAD_MODE em ambientes barulhentos
- Implementar cache Redis para histórico

## Monitoramento

### Logs estruturados
```bash
# Ver erros
docker-compose logs backend | grep ERROR

# Filtrar por timestamp
docker-compose logs backend | grep "2026-"
```

### Health checks
```bash
# Backend
curl -s http://localhost:5455/health | jq

# Frontend
curl -s http://localhost/health.html
```

## Troubleshooting Deployment

### Porta já em uso
```bash
# Encontrar processo
lsof -i :5455

# Mudar porta no docker-compose.yml
ports:
  - "5456:5455"  # Host:Container
```

### Problemas de memória
```bash
# Limitar Whisper model
LOCAL_FALLBACK_MODEL=tiny  # em vez de base/small

# Reduzir audio queue
AUDIO_QUEUE_MAX_SIZE=4
```

### WebSocket timeouts
```env
# Aumentar timeouts
TRANSCRIPTION_RECV_TIMEOUT_SECONDS=60
AUDIO_READ_TIMEOUT_SECONDS=10
```

---

## Checklist de Deploy

- [ ] Variáveis de ambiente configuradas
- [ ] Porta 80/443 disponível (ou reverse proxy)
- [ ] Porta 5455 acessível (ou via proxy)
- [ ] Docker e Docker Compose instalados
- [ ] Imagens built com sucesso
- [ ] Health checks retornam status ok
- [ ] Transcrições salvando no volume
- [ ] Logs configurados
- [ ] Backup de dados configurado
