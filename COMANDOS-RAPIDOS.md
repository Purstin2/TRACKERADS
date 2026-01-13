# ⚡ Comandos Rápidos - TrackerAds

## 🚀 Iniciar o Sistema

### Terminal 1: App Principal
```powershell
cd C:\Users\Vibox\TRACKERADS
npm run dev
```
✅ App: http://localhost:5173

### Terminal 2: Scraper Service
```powershell
cd C:\Users\Vibox\TRACKERADS\scraper-service
npm start
```
✅ Scraper: http://localhost:3001

## 🔧 Setup Inicial (Primeira Vez)

### Instalar Tudo
```powershell
# App principal
npm install

# Scraper service
cd scraper-service
npm install
npm run install-browser
```

### Configurar .env

**App principal** (`.env` na raiz):
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

**Scraper** (`scraper-service/.env`):
```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY=sua-service-key
PORT=3001
```

## 🧪 Testar

### Teste do Scraper
```powershell
cd scraper-service
npm test "https://www.facebook.com/ads/library/..."
```

### Verificar Status
```powershell
# Via PowerShell
Invoke-RestMethod -Uri http://localhost:3001/api/status

# Via navegador
# Acesse: http://localhost:3001/api/status
```

### Scraping Manual (API)
```powershell
# Todos os targets
Invoke-RestMethod -Uri http://localhost:3001/api/scrape/run -Method POST

# URL específica
$body = @{ url = "URL_AQUI" } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3001/api/scrape/test -Method POST -Body $body -ContentType "application/json"
```

## 📊 Usar o Sistema

### Via Interface (Recomendado)
1. Abra: http://localhost:5173
2. Adicione um target com link do Facebook
3. Clique no target
4. Clique em **"SCRAPING AUTOMÁTICO"**
5. Pronto! ✨

### Via API
```powershell
# Status
Invoke-RestMethod -Uri http://localhost:3001/api/status

# Rodar scraping
Invoke-RestMethod -Uri http://localhost:3001/api/scrape/run -Method POST

# Ver ofertas
Invoke-RestMethod -Uri http://localhost:3001/api/offers
```

## 🛠️ Troubleshooting

### App não inicia
```powershell
# Limpar e reinstalar
Remove-Item -Recurse -Force node_modules
npm install
npm run dev
```

### Scraper não funciona
```powershell
# Verificar se está rodando
Invoke-RestMethod -Uri http://localhost:3001

# Reinstalar navegador
cd scraper-service
npx playwright install chromium

# Ver logs
# Os logs aparecem no terminal onde o scraper está rodando
```

### Erro de credenciais
```powershell
# Verificar arquivo .env existe
Test-Path .env
Test-Path scraper-service\.env

# Recriar .env
cd scraper-service
Copy-Item env-example.txt .env
# Editar o .env com suas credenciais
```

## 📦 Manutenção

### Atualizar Dependências
```powershell
# App principal
npm update

# Scraper
cd scraper-service
npm update
```

### Limpar Screenshots
```powershell
cd scraper-service\screenshots
Remove-Item *.png
```

### Ver Logs do Scraper
Os logs aparecem em tempo real no terminal onde você executou `npm start`

## 🔄 Deploy

### PM2 (Produção)
```powershell
# Instalar PM2
npm install -g pm2

# Iniciar scraper
cd scraper-service
pm2 start server.js --name trackerads-scraper

# Configurar auto-start
pm2 startup
pm2 save

# Ver status
pm2 status

# Ver logs
pm2 logs trackerads-scraper

# Parar
pm2 stop trackerads-scraper

# Reiniciar
pm2 restart trackerads-scraper
```

## 📝 Atalhos Úteis

### Windows Terminal
Crie um perfil para abrir 2 terminais automaticamente:

**Terminal 1**: `cd C:\Users\Vibox\TRACKERADS; npm run dev`  
**Terminal 2**: `cd C:\Users\Vibox\TRACKERADS\scraper-service; npm start`

### VS Code Tasks
Adicione em `.vscode/tasks.json`:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start App",
      "type": "shell",
      "command": "npm run dev",
      "problemMatcher": []
    },
    {
      "label": "Start Scraper",
      "type": "shell",
      "command": "cd scraper-service && npm start",
      "problemMatcher": []
    }
  ]
}
```

## 🔗 Links Rápidos

- **App**: http://localhost:5173
- **Scraper**: http://localhost:3001
- **Status**: http://localhost:3001/api/status
- **Supabase**: https://app.supabase.com
- **Facebook Ads Library**: https://www.facebook.com/ads/library

## 📚 Documentação

- [QUICK-START.md](./QUICK-START.md) - Início rápido
- [README.md](./README.md) - Documentação completa
- [SCRAPER-SETUP.md](./SCRAPER-SETUP.md) - Setup do scraper
- [HOW-TO-GET-FACEBOOK-LINK.md](./HOW-TO-GET-FACEBOOK-LINK.md) - Como obter links
- [IMPLEMENTATION-SUMMARY.md](./IMPLEMENTATION-SUMMARY.md) - Resumo técnico

## ⌨️ Comandos Git

```powershell
# Status
git status

# Adicionar alterações
git add .

# Commit
git commit -m "feat: Add automatic scraping system"

# Push
git push origin main
```

## 🎯 Workflow Diário

### Manhã
```powershell
# Terminal 1
cd C:\Users\Vibox\TRACKERADS
npm run dev

# Terminal 2  
cd scraper-service
npm start
```

### Durante o dia
- Use a interface para adicionar/editar targets
- Clique em "SCRAPING AUTOMÁTICO" quando quiser atualizar
- Veja análises e gráficos

### Noite
- O scraper roda automaticamente à meia-noite e ao meio-dia
- Você pode deixar os terminais abertos ou fechar
- Se usar PM2, o scraper roda em background 24/7

## ✨ Dicas Pro

### Scraping em Lote
```powershell
# Rodar para todos os targets de uma vez
Invoke-RestMethod -Uri http://localhost:3001/api/scrape/run -Method POST
```

### Monitorar Logs
```powershell
# Se usar PM2
pm2 logs trackerads-scraper --lines 100
```

### Backup do Banco
Use o Supabase Dashboard para fazer backups automáticos

---

**💡 Salve este arquivo nos favoritos para consulta rápida!**
