# 🚀 Comandos PM2 - TrackerAds Scraper

## ✅ O QUE O PM2 FAZ:

- ✅ Mantém o scraper rodando em background
- ✅ Reinicia automaticamente se der erro
- ✅ Gerencia logs
- ✅ Monitoramento de CPU/memória
- ✅ Fácil de controlar

---

## 📊 COMANDOS PRINCIPAIS:

### Ver Status
```powershell
pm2 status
```

### Ver Logs em Tempo Real
```powershell
pm2 logs trackerads-scraper
```

### Ver Logs das Últimas Linhas
```powershell
pm2 logs trackerads-scraper --lines 50 --nostream
```

### Parar o Scraper
```powershell
pm2 stop trackerads-scraper
```

### Iniciar o Scraper
```powershell
pm2 start trackerads-scraper
```

### Reiniciar o Scraper
```powershell
pm2 restart trackerads-scraper
```

### Ver Informações Detalhadas
```powershell
pm2 show trackerads-scraper
```

### Monitoramento (Dashboard)
```powershell
pm2 monit
```

### Salvar Configuração Atual
```powershell
pm2 save
```

### Deletar do PM2 (Remover completamente)
```powershell
pm2 delete trackerads-scraper
```

---

## 🔄 INICIAR QUANDO LIGAR O PC (Windows):

### Opção 1: Script Manual (Mais Simples)

**1. Crie um arquivo** `start-scraper.bat`:

```batch
@echo off
pm2 start "C:\Users\Vibox\TRACKERADS\scraper-service\server.js" --name trackerads-scraper
```

**2. Coloque no Startup:**
- Pressione `Win + R`
- Digite: `shell:startup`
- Cole o arquivo `start-scraper.bat` lá

**3. Pronto!** Sempre que ligar o PC, o scraper inicia automaticamente

---

### Opção 2: Task Scheduler (Mais Profissional)

**1. Abra o Task Scheduler:**
- Pressione `Win + R`
- Digite: `taskschd.msc`

**2. Create Basic Task:**
- Name: TrackerAds Scraper
- Trigger: At startup
- Action: Start a program
- Program: `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
- Arguments: `-Command "pm2 resurrect"`

---

### Opção 3: Iniciar Manualmente (Quando Precisar)

**Quando ligar o PC, rode:**
```powershell
pm2 resurrect
```

Ou:
```powershell
pm2 start trackerads-scraper
```

---

## 🎯 WORKFLOW DIÁRIO:

### Primeira Vez (Já Feito!):
```powershell
cd C:\Users\Vibox\TRACKERADS\scraper-service
pm2 start server.js --name trackerads-scraper
pm2 save
```

### Depois de Reiniciar o PC:
```powershell
pm2 resurrect
```

### Verificar se Está Rodando:
```powershell
pm2 status
```

### Ver o que Está Acontecendo:
```powershell
pm2 logs trackerads-scraper --lines 20
```

---

## 🔍 TROUBLESHOOTING:

### Scraper não está respondendo?
```powershell
pm2 restart trackerads-scraper
```

### Quer ver os erros?
```powershell
pm2 logs trackerads-scraper --err --lines 50 --nostream
```

### Quer resetar tudo?
```powershell
pm2 delete trackerads-scraper
cd C:\Users\Vibox\TRACKERADS\scraper-service
pm2 start server.js --name trackerads-scraper
pm2 save
```

---

## 📈 MONITORAMENTO:

### CPU e Memória em Tempo Real:
```powershell
pm2 monit
```

### Ver Quantas Vezes Reiniciou:
```powershell
pm2 status
```
(Veja a coluna "↺")

### Ver Uptime:
```powershell
pm2 status
```
(Veja a coluna "uptime")

---

## 💡 DICAS PRO:

### 1. Limpar Logs Antigos:
```powershell
pm2 flush
```

### 2. Ver Logs Salvos:
```powershell
# Logs de saída:
Get-Content C:\Users\Vibox\.pm2\logs\trackerads-scraper-out.log -Tail 50

# Logs de erro:
Get-Content C:\Users\Vibox\.pm2\logs\trackerads-scraper-error.log -Tail 50
```

### 3. Atualizar o Código:
```powershell
# Depois de editar o código:
pm2 restart trackerads-scraper --update-env
```

---

## 🎉 RESUMO:

**Comandos Mais Usados:**
1. `pm2 status` - Ver status
2. `pm2 logs trackerads-scraper` - Ver logs
3. `pm2 restart trackerads-scraper` - Reiniciar
4. `pm2 resurrect` - Restaurar após reiniciar PC

**Localização dos Logs:**
- `C:\Users\Vibox\.pm2\logs\trackerads-scraper-out.log`
- `C:\Users\Vibox\.pm2\logs\trackerads-scraper-error.log`

**Configuração:**
- `C:\Users\Vibox\.pm2\dump.pm2`

---

✅ **SCRAPER RODANDO 24/7 COM PM2!**
