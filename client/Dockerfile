# Multi-stage: build y runtime
FROM node:20-alpine as builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci --no-optional

# Copiar código
COPY . .

# Build
RUN npm run build


# Stage final - nginx para servir arquivos estáticos
FROM nginx:alpine

WORKDIR /usr/share/nginx/html

# Remover configuração padrão
RUN rm -rf ./*

# Copiar build do stage anterior
COPY --from=builder /app/dist .

# Copiar configuração nginx customizada
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/health.html || exit 1

# Expor porta
EXPOSE 80

# Nginx já inicia por padrão
CMD ["nginx", "-g", "daemon off;"]
