# 🚀 Como Usar o Scraper Local

## ✅ O que mudou?

- ❌ **Removido**: Dependência do Railway (nuvem)
- ✅ **Agora**: Tudo roda na sua máquina localmente
- ✅ **Vantagem**: Sem limites, sem restrições, sem custos!

## 📋 Passo a Passo

### 1️⃣ Iniciar o Serviço Local

**Opção A - Script Automático (Recomendado):**
1. Clique duas vezes em `start-scraper-local.bat`
2. Aguarde o serviço iniciar (aparecerá "Servidor rodando em: http://localhost:3001")

**Opção B - Manual:**
```bash
cd scraper-service
npm install
npx playwright install chromium
npm start
```

### 2️⃣ Verificar se Está Funcionando

Abra no navegador: **http://localhost:3001**

Você deve ver uma mensagem JSON confirmando que está online.

### 3️⃣ Usar no Site

1. Abra o site do TrackerAds normalmente
2. Vá para qualquer target que tenha link do Facebook
3. Clique no botão **"SCRAPING AUTOMÁTICO"**
4. Aguarde alguns segundos (pode levar até 2 minutos)
5. O número de anúncios será extraído e salvo automaticamente!

## ⚠️ Importante

- **Mantenha o terminal aberto** enquanto usar o sistema
- O serviço precisa estar rodando para os botões funcionarem
- Para parar, pressione `Ctrl+C` no terminal

## 🔧 Primeira Vez?

Na primeira execução, o script instalará automaticamente:
- Dependências do Node.js
- Navegador Chromium (Playwright)

Isso pode levar alguns minutos na primeira vez.

## ❓ Problemas?

**Erro: "Serviço local não está rodando"**
- Verifique se o terminal está aberto
- Verifique se aparece "Servidor rodando em: http://localhost:3001"
- Tente acessar http://localhost:3001 no navegador

**Erro: "Failed to fetch"**
- O serviço não está rodando
- Inicie o serviço usando o script `start-scraper-local.bat`

**Scraping demora muito**
- Normal! Pode levar até 2 minutos por target
- O Facebook carrega conteúdo dinâmico que precisa de tempo

## 🎉 Pronto!

Agora você pode usar o scraper sem depender de servidor na nuvem. Tudo roda na sua máquina!

