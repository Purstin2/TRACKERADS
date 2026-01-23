# 🤖 Scraper Local - Guia Rápido

Este serviço roda **localmente na sua máquina** sem precisar de servidor na nuvem.

## 🚀 Como Iniciar

### Opção 1: Script Automático (Windows)
1. Clique duas vezes em `start-scraper-local.bat` na raiz do projeto
2. O serviço iniciará automaticamente na porta 3001

### Opção 2: Manual
```bash
cd scraper-service
npm install
npx playwright install chromium
npm start
```

## ✅ Verificar se está Rodando

Abra no navegador: http://localhost:3001

Você deve ver:
```json
{
  "status": "online",
  "service": "TrackerAds Scraper Service",
  "version": "1.0.0"
}
```

## 🎯 Como Usar

1. **Inicie o serviço local** (use o script acima)
2. **Abra o site** do TrackerAds
3. **Clique em "SCRAPING AUTOMÁTICO"** em qualquer target
4. O scraping será executado na sua máquina e os dados serão salvos no Supabase

## ⚠️ Importante

- O serviço precisa estar rodando para os botões de scraping funcionarem
- Mantenha a janela do terminal aberta enquanto usar o sistema
- Para parar o serviço, pressione `Ctrl+C` no terminal

## 🔧 Configuração

O serviço usa as mesmas variáveis de ambiente do Supabase:
- `SUPABASE_URL` - URL do seu projeto Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Chave de serviço do Supabase

Crie um arquivo `.env` na pasta `scraper-service` com:
```
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-chave-aqui
```

## 📝 Notas

- O scraping pode levar até 2 minutos por target
- Não há limites de requisições (roda na sua máquina!)
- Funciona offline (apenas precisa do Supabase para salvar dados)

