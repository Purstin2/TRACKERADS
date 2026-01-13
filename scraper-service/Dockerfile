# Use Node.js 20 (mais recente e recomendado)
FROM node:20-slim

# Instalar dependências do sistema necessárias para Playwright
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Definir diretório de trabalho
WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependências do Node.js
RUN npm ci

# Instalar Playwright e Chromium
RUN npx playwright install chromium
RUN npx playwright install-deps chromium

# Copiar o resto do código
COPY . .

# Expor porta
EXPOSE 3001

# Comando para iniciar
CMD ["node", "server.js"]
