# 🚀 Deploy do TrackerAds Scraper no Railway

## 📋 Passo a Passo Completo

### 1️⃣ Criar Conta no Railway (2 min)

1. Acesse: **https://railway.app**
2. Clique em: **"Start a New Project"** ou **"Login"**
3. Faça login com **GitHub** (recomendado)
   - Autorize o Railway a acessar seus repositórios

### 2️⃣ Conectar com GitHub (3 min)

#### Opção A: Se você JÁ TEM o código no GitHub:
1. No Railway, clique em: **"New Project"**
2. Selecione: **"Deploy from GitHub repo"**
3. Escolha o repositório do TrackerAds
4. Selecione a pasta: `scraper-service`

#### Opção B: Se NÃO TEM no GitHub ainda (vou te ajudar):
Precisa fazer upload do código pro GitHub primeiro.

### 3️⃣ Configurar Variáveis de Ambiente

Depois de conectar o repositório:

1. No painel do Railway, clique em: **"Variables"**
2. Adicione as variáveis:

```
SUPABASE_URL = https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY = sua-service-key
PORT = 3001
```

**IMPORTANTE**: Use as MESMAS credenciais que você configurou localmente!

### 4️⃣ Deploy Automático

O Railway vai:
- ✅ Instalar dependências (`npm install`)
- ✅ Instalar Playwright
- ✅ Iniciar o servidor (`node server.js`)
- ✅ Gerar uma URL pública

### 5️⃣ Pegar a URL do Serviço

Depois do deploy:
1. Clique em: **"Settings"**
2. Role até: **"Domains"**
3. Clique em: **"Generate Domain"**
4. Copie a URL (ex: `trackerads-scraper.up.railway.app`)

### 6️⃣ Atualizar o Frontend

No seu app (frontend), atualize a URL da API de:
```javascript
http://localhost:3001
```

Para:
```javascript
https://trackerads-scraper.up.railway.app
```

---

## ✅ PRONTO!

Agora o scraper:
- ✅ Roda 24/7 na nuvem
- ✅ Não depende do seu PC
- ✅ Auto-reinicia se der erro
- ✅ Scraping automático às 00:00 e 12:00
- ✅ 100% grátis (até 500 horas/mês)

---

## 🔍 MONITORAMENTO:

### Ver Logs no Railway:
1. Acesse o painel do Railway
2. Clique no seu projeto
3. Vá em: **"Deployments"**
4. Clique em: **"View Logs"**

### Testar a API:
```powershell
Invoke-RestMethod -Uri https://sua-url.railway.app/api/status
```

---

## 🎯 PLANO GRÁTIS DO RAILWAY:

- ✅ 500 horas/mês (suficiente para rodar 24/7)
- ✅ Deploy ilimitado
- ✅ Logs em tempo real
- ✅ Auto-deploy do GitHub
- ✅ SSL automático (HTTPS)

**Depois de 500 horas, você pode:**
- Adicionar $5 de crédito para continuar
- Ou migrar para Render.com (também grátis)

---

## 🐛 TROUBLESHOOTING:

### Deploy falhou?
1. Verifique os logs no Railway
2. Certifique-se que as variáveis de ambiente estão corretas
3. Tente fazer redeploy

### Playwright não instalou?
O Railway instala automaticamente, mas pode demorar alguns minutos no primeiro deploy.

### Porta incorreta?
O Railway usa a variável `PORT` automaticamente. Não precisa configurar nada adicional.

---

## 📊 CUSTOS:

```
✅ GRÁTIS: Até 500 horas/mês
💰 PAGO: $5/mês = 500 horas extras
```

Para rodar 24/7 o mês todo = ~720 horas
Você precisaria de: $5/mês (muito barato!)

Ou use o plano grátis de 2 serviços:
- Railway (500h) + Render (750h) = 1250 horas grátis! 🎉

---

## 🎉 RESULTADO FINAL:

**Antes (Local):**
- ❌ PC precisa estar ligado
- ❌ Dependente da sua máquina
- ❌ Se cair a luz, para

**Depois (Railway):**
- ✅ Roda 24/7 na nuvem
- ✅ Independente do seu PC
- ✅ 99.9% uptime
- ✅ Auto-recovery

---

**PRÓXIMO PASSO**: Vou te ajudar a fazer o deploy! 🚀
