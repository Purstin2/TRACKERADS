# 🎯 TrackerAds - Sistema de Rastreamento de Anúncios

Sistema completo para rastreamento e análise de anúncios de concorrentes, com scraping automático da Biblioteca de Anúncios do Facebook.

## 🚀 Funcionalidades

### 📊 Sistema Principal
- ✅ Dashboard com análise de performance
- ✅ Rastreamento de ofertas/targets
- ✅ Histórico de contagem de anúncios
- ✅ Gráficos e análises de tendências
- ✅ Sistema de alertas e notificações
- ✅ Notas táticas para cada target
- ✅ Filtros e busca avançada
- ✅ Exportação de dados

### 🤖 Scraping Automático (NOVO!)
- ✅ **Extração automática** do número de anúncios do Facebook
- ✅ **Agendamento automático** a cada 12 horas
- ✅ **Scraping manual** via interface ou API
- ✅ **Atualização automática** no banco de dados
- ✅ **Screenshots para debug**
- ✅ **Múltiplas estratégias** de extração

## 🛠️ Stack Tecnológico

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL)
- **Scraping**: Node.js + Playwright + Express
- **Gráficos**: Recharts
- **Agendamento**: node-cron

## 📦 Instalação

### 1. Instalar dependências do projeto principal

```powershell
npm install
```

### 2. Configurar Supabase

1. Crie um projeto no [Supabase](https://supabase.com)
2. Execute as migrations em `supabase/migrations/`
3. Crie um arquivo `.env` na raiz:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-aqui
```

### 3. Iniciar o projeto principal

```powershell
npm run dev
```

Acesse: http://localhost:5173

### 4. Configurar o Scraper Automático (Opcional)

📖 **Guia completo**: Veja [SCRAPER-SETUP.md](./SCRAPER-SETUP.md)

**Resumo rápido**:

```powershell
# 1. Instalar dependências
cd scraper-service
npm install

# 2. Instalar navegador
npx playwright install chromium

# 3. Configurar .env
Copy-Item env-example.txt .env
# Edite o .env com suas credenciais

# 4. Iniciar o serviço
npm start
```

O scraper ficará rodando em: http://localhost:3001

## 🎮 Como Usar

### Adicionar um Target

1. Clique em **"REGISTRAR CONTAGEM"**
2. Preencha:
   - **Nome**: Nome do concorrente
   - **Link**: URL da Biblioteca do Facebook (opcional)
   - **Tags**: Tags para organização
3. Salve

### Usar o Scraping Automático

#### Método 1: Via Interface (Recomendado)
1. Abra um target que tenha link do Facebook
2. Clique no botão roxo **"SCRAPING AUTOMÁTICO"**
3. Aguarde 15-30 segundos
4. O número de anúncios será extraído e salvo automaticamente!

#### Método 2: Automático (Background)
O scraper roda automaticamente **a cada 12 horas** (00:00 e 12:00) e atualiza todos os targets.

### Registrar Contagem Manualmente

1. Abra um target
2. Digite o número de anúncios no campo
3. Clique em **"REGISTRAR MANUALMENTE"**

### Ver Análises

- **Dashboard**: Visão geral de todos os targets
- **Análise Comparativa**: Compare múltiplos targets
- **Alertas**: Configure alertas para mudanças significativas

## 📁 Estrutura do Projeto

```
TRACKERADS/
├── src/
│   ├── components/
│   │   ├── auth/           # Autenticação
│   │   ├── modals/         # Modais (adicionar/editar)
│   │   ├── screens/        # Telas principais
│   │   ├── targets/        # Componentes de ofertas
│   │   └── ui/             # Componentes UI reutilizáveis
│   ├── styles/             # Temas e estilos
│   └── utils/              # Helpers e Supabase client
│
├── scraper-service/        # 🤖 Serviço de scraping automático
│   ├── server.js           # Servidor Express
│   ├── scraper.js          # Lógica de scraping
│   ├── scheduler.js        # Agendamento automático
│   ├── supabaseService.js  # Integração com Supabase
│   ├── screenshots/        # Screenshots de debug
│   └── README.md           # Documentação do scraper
│
├── supabase/
│   └── migrations/         # Migrations do banco
│
├── SCRAPER-SETUP.md        # 📖 Guia de setup do scraper
└── README.md               # Este arquivo
```

## 🔑 API do Scraper Service

### Endpoints Disponíveis

#### `GET /api/status`
Retorna status do serviço

```json
{
  "status": "running",
  "offersMonitored": 5,
  "schedulerActive": true,
  "nextRun": "A cada 12 horas (00:00 e 12:00)"
}
```

#### `POST /api/scrape/run`
Executa scraping para todos os targets

```powershell
Invoke-RestMethod -Uri http://localhost:3001/api/scrape/run -Method POST
```

#### `POST /api/scrape/test`
Testa scraping de uma URL específica

```powershell
$body = @{ url = "https://facebook.com/ads/library/..." } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3001/api/scrape/test -Method POST -Body $body -ContentType "application/json"
```

#### `GET /api/offers`
Lista todos os targets monitorados

```powershell
Invoke-RestMethod -Uri http://localhost:3001/api/offers
```

## 🐛 Troubleshooting

### Projeto principal não inicia

```powershell
# Reinstalar dependências
Remove-Item -Recurse -Force node_modules
npm install

# Verificar se a porta 5173 está livre
npm run dev
```

### Scraper não funciona

```powershell
# Verificar se o serviço está rodando
Invoke-RestMethod -Uri http://localhost:3001/api/status

# Se não estiver, inicie:
cd scraper-service
npm start
```

### Erro de autenticação no Supabase

1. Verifique se o arquivo `.env` está configurado
2. Confira se as credenciais estão corretas no Supabase Dashboard
3. Certifique-se de que RLS (Row Level Security) está configurado

### Scraping falha

1. Verifique os screenshots em `scraper-service/screenshots/`
2. Teste a URL manualmente no navegador
3. Veja os logs no terminal do scraper
4. Verifique se o Playwright está instalado: `npx playwright install chromium`

## 🔐 Segurança

⚠️ **IMPORTANTE**:
- Nunca commite o arquivo `.env`
- Use a **SERVICE KEY** apenas no backend (scraper)
- Use a **ANON KEY** no frontend
- Em produção, configure CORS adequadamente
- Ative Row Level Security (RLS) no Supabase

## 📊 Database Schema

### Tabela `offers`
```sql
- id (uuid)
- name (text)
- link (text)
- tags (text[])
- user_id (uuid)
- last_ad_count (integer)
- last_ad_count_timestamp (timestamptz)
- is_archived (boolean)
- created_at (timestamptz)
- updated_at (timestamptz)
```

### Tabela `ad_counts`
```sql
- id (uuid)
- offer_id (uuid)
- count (integer)
- user_id (uuid)
- timestamp (timestamptz)
```

### Tabela `comments`
```sql
- id (uuid)
- offer_id (uuid)
- text (text)
- user_id (uuid)
- timestamp (timestamptz)
```

### Tabela `alerts`
```sql
- id (uuid)
- offer_id (uuid)
- type (text)
- message (text)
- is_read (boolean)
- created_at (timestamptz)
```

## 🚀 Deploy

### Frontend (Vercel/Netlify)
1. Conecte o repositório
2. Configure as variáveis de ambiente
3. Build command: `npm run build`
4. Publish directory: `dist`

### Scraper Service (Railway/Render)
1. Conecte o repositório
2. Configure as variáveis de ambiente
3. Start command: `cd scraper-service && npm start`
4. Ative auto-deploy

### Ou use PM2 em VPS
```powershell
npm install -g pm2
pm2 start scraper-service/server.js --name trackerads-scraper
pm2 startup
pm2 save
```

## 📈 Roadmap

- [ ] Dashboard web para o scraper
- [ ] Suporte para outras plataformas (Google Ads, TikTok, etc)
- [ ] Notificações via email/webhook
- [ ] Análise de criativos dos anúncios
- [ ] Comparação automática de performance
- [ ] Exportação de relatórios em PDF
- [ ] Mobile app (React Native)

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se livre para abrir issues ou pull requests.

## 📄 Licença

MIT License - Sinta-se livre para usar este projeto.

## 📞 Suporte

Para dúvidas ou problemas:

1. Consulte [SCRAPER-SETUP.md](./SCRAPER-SETUP.md) para setup do scraper
2. Verifique os logs no terminal
3. Consulte a documentação do [Supabase](https://supabase.com/docs)
4. Veja exemplos na pasta `supabase/migrations/`

---

Feito com ❤️ para simplificar o rastreamento de anúncios de concorrentes

**✨ Aproveite o scraping automático e deixe o bot trabalhar por você!**
