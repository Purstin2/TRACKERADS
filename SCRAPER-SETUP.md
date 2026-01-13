# 🤖 Guia de Setup do Scraper Automático

Este guia vai te ajudar a configurar o sistema de scraping automático em **5 minutos**!

## 🎯 O que o Scraper faz?

✅ Acessa automaticamente a Biblioteca de Anúncios do Facebook  
✅ Extrai o número de anúncios ativos do concorrente  
✅ Atualiza automaticamente no seu sistema a cada 12 horas  
✅ Funciona em background sem você precisar fazer nada  

## 📋 Pré-requisitos

- ✅ Node.js instalado
- ✅ Projeto principal TrackerAds rodando
- ✅ Credenciais do Supabase

## 🚀 Setup Rápido (5 minutos)

### 1️⃣ Instalar Dependências

Abra um **novo terminal** e execute:

```powershell
cd C:\Users\Vibox\TRACKERADS\scraper-service
npm install
```

### 2️⃣ Instalar Navegador (Playwright)

```powershell
npx playwright install chromium
```

Isso vai baixar o navegador Chromium que o scraper usa para acessar as páginas.

### 3️⃣ Configurar Variáveis de Ambiente

1. Crie um arquivo `.env` dentro da pasta `scraper-service`:

```powershell
Copy-Item env-example.txt .env
```

2. Abra o arquivo `.env` e preencha com suas credenciais do Supabase:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY=sua-service-key-aqui
PORT=3001
```

**⚠️ IMPORTANTE**: Use a **SERVICE KEY**, não a anon key!

📍 **Onde encontrar as credenciais**:
- Acesse o [Supabase Dashboard](https://app.supabase.com)
- Vá em: **Settings** → **API** → Copie `service_role` key

### 4️⃣ Iniciar o Scraper Service

```powershell
npm start
```

Você verá algo assim:

```
╔════════════════════════════════════════╗
║   TRACKERADS SCRAPER SERVICE           ║
╚════════════════════════════════════════╝

🌐 Servidor rodando em: http://localhost:3001
📅 Timezone: America/Sao_Paulo

⏰ Scheduler iniciado!
📅 Agendamento: A cada 12 horas (00:00 e 12:00)
✅ Scheduler configurado e rodando!
```

### 5️⃣ Testar o Scraping

Volte para o seu app TrackerAds no navegador:

1. Abra um **Target** que tenha link da Biblioteca do Facebook
2. Você verá um botão roxo **"SCRAPING AUTOMÁTICO"**
3. Clique nele e aguarde (15-30 segundos)
4. O número de anúncios será extraído automaticamente! 🎉

## 🎮 Como Usar

### Scraping Automático (Recomendado)

O scraper roda **automaticamente** a cada 12 horas (00:00 e 12:00) e atualiza todos os targets que têm link do Facebook.

**Você não precisa fazer nada!** ✨

### Scraping Manual

Você pode executar o scraping manualmente de 3 formas:

#### 1. Pelo App (Interface)
- Abra um target com link do Facebook
- Clique no botão **"SCRAPING AUTOMÁTICO"**

#### 2. Pela API
```powershell
# Rodar scraping para todos os targets
Invoke-RestMethod -Uri http://localhost:3001/api/scrape/run -Method POST

# Testar uma URL específica
$body = @{ url = "https://facebook.com/ads/library/..." } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3001/api/scrape/test -Method POST -Body $body -ContentType "application/json"
```

#### 3. Via Navegador
Acesse: http://localhost:3001/api/status

## ⚙️ Configurações

### Alterar Frequência do Agendamento

Edite o arquivo `scraper-service/scheduler.js`:

```javascript
// Linha 56
const cronExpression = '0 0,12 * * *'; // A cada 12 horas

// Outras opções:
// '*/30 * * * *'  - A cada 30 minutos
// '0 * * * *'     - A cada 1 hora
// '0 */6 * * *'   - A cada 6 horas
// '0 9,21 * * *'  - Às 9h e 21h
```

### Rodar Imediatamente ao Iniciar

Edite o arquivo `scraper-service/server.js`:

```javascript
// Linha 118
// De:
startScheduler();

// Para:
startSchedulerWithInitialRun();
```

## 🐛 Problemas Comuns

### ❌ "Scraper service não está rodando"

**Solução**: Certifique-se de que o scraper está rodando em outro terminal:

```powershell
cd scraper-service
npm start
```

### ❌ "Não foi possível encontrar o número de anúncios"

**Causas possíveis**:
1. O Facebook mudou a estrutura da página
2. O link não é válido
3. Timeout (página demorou muito para carregar)

**Solução**: 
- Verifique o screenshot em `scraper-service/screenshots/`
- Teste com outro link do Facebook

### ❌ "SUPABASE_URL e SUPABASE_SERVICE_KEY devem estar definidas"

**Solução**: Configure o arquivo `.env` corretamente com suas credenciais

### ❌ Playwright não instalado

```
Error: browserType.launch: Executable doesn't exist
```

**Solução**:
```powershell
cd scraper-service
npx playwright install chromium
```

## 📊 Monitoramento

### Ver Status do Serviço

```powershell
Invoke-RestMethod -Uri http://localhost:3001/api/status
```

### Ver Targets Monitorados

```powershell
Invoke-RestMethod -Uri http://localhost:3001/api/offers
```

### Ver Logs

Os logs aparecem no terminal onde o scraper está rodando.

## 🎯 Como Adicionar Novos Targets para Monitorar

1. No app, clique em **"REGISTRAR CONTAGEM"**
2. Preencha o **NOME** do target
3. Cole o **LINK** da Biblioteca do Facebook do concorrente
   - Exemplo: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=Nome%20do%20Concorrente`
4. Salve

O scraper vai automaticamente detectar e monitorar este target! 🎉

## 🔐 Segurança

⚠️ **NUNCA** compartilhe sua SERVICE KEY  
⚠️ **NÃO** coloque a SERVICE KEY no frontend  
⚠️ Em produção, proteja o endpoint com autenticação  

## 🚀 Deploy em Produção

Para manter o scraper rodando 24/7:

### Opção 1: PM2 (Recomendado)

```powershell
npm install -g pm2
pm2 start server.js --name trackerads-scraper
pm2 startup
pm2 save
```

### Opção 2: Railway.app / Render.com

1. Faça push do código para GitHub
2. Conecte no Railway/Render
3. Configure as variáveis de ambiente
4. Deploy automático

## 📞 Suporte

Se tiver problemas:

1. ✅ Verifique se o scraper está rodando: http://localhost:3001
2. ✅ Verifique os logs no terminal
3. ✅ Verifique os screenshots em `scraper-service/screenshots/`
4. ✅ Teste a URL manualmente no navegador

## 🎉 Pronto!

Seu sistema de scraping automático está configurado! 

- ✅ Scraping automático a cada 12 horas
- ✅ Botão manual no app
- ✅ Atualizações automáticas no banco de dados
- ✅ Histórico de registros

Agora é só relaxar e deixar o bot trabalhar por você! 🤖✨
