# 🔧 Configuração das Variáveis de Ambiente

## ✅ Arquivos .env necessários

Você precisa criar **2 arquivos .env**:

### 1️⃣ `.env` na RAIZ do projeto (para o frontend)

Crie o arquivo `.env` na pasta raiz: `C:\Users\WDAGUtilityAccount\Downloads\TRACKERADS\.env`

```
VITE_SUPABASE_URL=https://asnqphrzfbflpocqcxbr.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzbnFwaHJ6ZmJmbHBvY3FjeGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjcwMTcsImV4cCI6MjA4Mzg0MzAxN30.jmi7bXNpOQma8Tp1T6cfrV0FlYeeDuxX8ibkMMUStVM
```

### 2️⃣ `.env` na pasta `scraper-service` (para o scraper)

Crie o arquivo `.env` na pasta: `C:\Users\WDAGUtilityAccount\Downloads\TRACKERADS\scraper-service\.env`

```
SUPABASE_URL=https://asnqphrzfbflpocqcxbr.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzbnFwaHJ6ZmJmbHBvY3FjeGJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODI2NzAxNywiZXhwIjoyMDgzODQzMDE3fQ.rkvB-mla_nYSPhA2Qkk4OWMDH_nC7NzdrKgNxcV5Le4
```

## ⚠️ IMPORTANTE

- **Frontend** usa `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
- **Scraper** usa `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` (sem o prefixo VITE_)
- **NÃO** use `VITE_SUPABASE_SERVICE_KEY` - isso não existe!

## 📝 Resumo

✅ **Raiz do projeto** (`.env`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

✅ **scraper-service** (`.env`):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

## 🚀 Depois de criar os arquivos

1. Reinicie o servidor frontend: `npm run dev`
2. Reinicie o scraper: `start-scraper-local.bat`

