# 🚀 Deploy no Railway.app - PASSO A PASSO COMPLETO

## ✅ CÓDIGO JÁ ESTÁ NO GITHUB!

URL do seu repositório: https://github.com/Purstin2/TRACKERADS

---

## 📋 DEPLOY EM 5 MINUTOS:

### 1️⃣ CRIAR CONTA NO RAILWAY (1 min)

**a)** Abra: **https://railway.app**

**b)** Clique em: **"Start a New Project"** ou **"Login"**

**c)** Faça login com **GitHub**:
- Clique em: **"Login with GitHub"**
- Autorize o Railway a acessar seus repositórios
- ✅ Pronto! Conta criada

---

### 2️⃣ CRIAR NOVO PROJETO (2 min)

**a)** No dashboard do Railway, clique em: **"New Project"**

**b)** Selecione: **"Deploy from GitHub repo"**

**c)** Procure por: **"TRACKERADS"** (seu repositório)

**d)** Clique no repositório **"Purstin2/TRACKERADS"**

**e)** ⚠️ **IMPORTANTE**: 
- Vai aparecer: **"Configure Build"**
- Em **"Root Directory"**, digite: `scraper-service`
- Isso diz pro Railway pra usar só a pasta do scraper!

**f)** Clique em: **"Deploy"**

**g)** ⏳ Aguarde 2-3 minutos (vai instalar dependências e Playwright)

---

### 3️⃣ CONFIGURAR VARIÁVEIS DE AMBIENTE (1 min)

Enquanto faz o deploy, configure as variáveis:

**a)** No painel do projeto, clique em: **"Variables"** (aba no topo)

**b)** Clique em: **"+ New Variable"**

**c)** Adicione **3 variáveis**:

```
Variable 1:
Name: SUPABASE_URL
Value: https://seu-projeto.supabase.co

Variable 2:
Name: SUPABASE_SERVICE_KEY
Value: sua-service-key-aqui

Variable 3:
Name: PORT
Value: 3001
```

**⚠️ IMPORTANTE**: Use as MESMAS credenciais que você configurou localmente!

**d)** Clique em: **"Add"** para cada variável

**e)** O Railway vai **redeploy automaticamente** com as novas variáveis

---

### 4️⃣ GERAR URL PÚBLICA (1 min)

Depois do deploy finalizar:

**a)** Clique em: **"Settings"** (aba no topo)

**b)** Role até a seção: **"Networking"** ou **"Domains"**

**c)** Clique em: **"Generate Domain"**

**d)** ✅ Vai gerar uma URL tipo: `trackerads-scraper-production.up.railway.app`

**e)** **COPIE ESSA URL!** Você vai usar no app frontend

---

### 5️⃣ TESTAR SE FUNCIONOU (1 min)

**a)** Clique em: **"Deployments"** (aba no topo)

**b)** Clique no deployment mais recente

**c)** Clique em: **"View Logs"**

**d)** Você deve ver:

```
╔════════════════════════════════════════╗
║   TRACKERADS SCRAPER SERVICE           ║
╚════════════════════════════════════════╝

🌐 Servidor rodando em: http://0.0.0.0:3001
⏰ Scheduler iniciado!
✅ Scheduler configurado e rodando!
```

**e)** Teste a URL no navegador ou PowerShell:

```powershell
Invoke-RestMethod -Uri https://sua-url.railway.app/api/status
```

Deve retornar:
```json
{
  "status": "running",
  "offersMonitored": 2,
  "schedulerActive": true
}
```

---

### 6️⃣ ATUALIZAR O FRONTEND (IMPORTANTE!)

Agora que o scraper está na nuvem, atualize o app frontend para usar a nova URL:

**a)** Abra: `src/components/screens/OfferDetailScreen.jsx`

**b)** Procure por: `http://localhost:3001`

**c)** Substitua por: `https://sua-url.railway.app`

Exemplo:
```javascript
// De:
const response = await fetch('http://localhost:3001/api/scrape/test', {

// Para:
const response = await fetch('https://trackerads-scraper-production.up.railway.app/api/scrape/test', {
```

**d)** Salve o arquivo

**e)** Faça commit e push:
```powershell
git add .
git commit -m "Update scraper URL to Railway"
git push
```

---

## ✅ PRONTO! SISTEMA 100% NA NUVEM!

```
╔═══════════════════════════════════════════════╗
║         TRACKERADS - 100% NA NUVEM            ║
╚═══════════════════════════════════════════════╝

✅ Scraper rodando 24/7 no Railway
   └─ https://sua-url.railway.app

✅ Não depende do seu PC
   └─ Pode desligar quando quiser

✅ Auto-reinicia se der erro
   └─ 99.9% uptime

✅ Scraping automático
   └─ 00:00 e 12:00 todo dia

✅ Grátis
   └─ 500 horas/mês
```

---

## 🎯 CHECKLIST FINAL:

- [ ] Conta no Railway criada
- [ ] Repositório conectado
- [ ] Root Directory: `scraper-service`
- [ ] 3 variáveis de ambiente configuradas
- [ ] Deploy finalizado com sucesso
- [ ] Logs mostram servidor rodando
- [ ] URL pública gerada
- [ ] Testei a URL e funciona
- [ ] Frontend atualizado com nova URL
- [ ] Commit e push do frontend

---

## 📊 MONITORAMENTO:

### Ver Logs em Tempo Real:
1. Railway Dashboard → Seu projeto
2. **Deployments** → Último deployment
3. **View Logs**

### Ver Métricas:
1. Railway Dashboard → Seu projeto
2. **Metrics** → CPU, RAM, Network

### Redeploy Manual:
1. Railway Dashboard → Seu projeto
2. **Deployments** → **Redeploy**

---

## 💰 CUSTOS:

**Plano Grátis:**
- ✅ 500 horas/mês (suficiente!)
- ✅ 512MB RAM
- ✅ 1GB disco
- ✅ Deploy ilimitado

**Se precisar de mais:**
- 💳 $5/mês = 500 horas extras
- Para rodar 24/7 o mês todo (~720h) = $5/mês

**Alternativa:**
- Use Railway (500h) + Render.com (750h) grátis
- Total: 1250 horas grátis! 🎉

---

## 🐛 PROBLEMAS COMUNS:

### Deploy falhou?
- Verifique se o Root Directory está: `scraper-service`
- Verifique se as variáveis de ambiente estão corretas
- Veja os logs de erro no Railway

### "Cannot find module"?
- O Railway instala automaticamente
- Aguarde o deploy finalizar completamente

### Playwright não instalou?
- Railway instala automaticamente
- Pode demorar 2-3 minutos no primeiro deploy
- Veja os logs: deve aparecer "Downloading Chromium..."

### Timeout / 504 error?
- Espere alguns minutos após o deploy
- O scraper pode estar iniciando ainda
- Verifique os logs

---

## 🔄 UPDATES FUTUROS:

Quando você mudar o código:

1. Faça as alterações localmente
2. Commit:
   ```powershell
   git add .
   git commit -m "sua mensagem"
   git push
   ```
3. O Railway faz **auto-deploy** automaticamente! ✨

---

## 🎉 RESULTADO FINAL:

**ANTES:**
```
Seu PC (Liga/Desliga)
  └─ Scraper LOCAL
      └─ Para quando desliga PC ❌
```

**DEPOIS:**
```
Railway (Nuvem - 24/7)
  └─ Scraper NA NUVEM
      └─ Sempre rodando! ✅
```

---

## 📞 SUPORTE:

- **Railway Docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **Logs do Railway**: Sempre o primeiro lugar pra verificar erros

---

## 🏆 PARABÉNS!

Você agora tem um sistema profissional rodando 24/7 na nuvem!

✅ Scraping automático  
✅ Independente do seu PC  
✅ 99.9% uptime  
✅ Auto-recovery  
✅ Praticamente grátis!  

**AGORA É SÓ DOMINAR O MERCADO! 💰🚀**
