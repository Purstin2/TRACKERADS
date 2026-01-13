# 🤖 TrackerAds Scraper Service

Serviço de scraping automático que monitora a Biblioteca de Anúncios do Facebook e atualiza automaticamente o número de anúncios ativos dos concorrentes.

## 🚀 Funcionalidades

- ✅ **Scraping Automático**: Extrai o número de anúncios da Biblioteca do Facebook
- ⏰ **Agendamento**: Roda automaticamente a cada 12 horas (00:00 e 12:00)
- 💾 **Atualização Automática**: Salva os dados diretamente no Supabase
- 🔄 **API REST**: Endpoints para controle manual e testes
- 📸 **Screenshots**: Salva screenshots para debug
- 🛡️ **Retry Logic**: Múltiplas estratégias de scraping para garantir sucesso

## 📋 Pré-requisitos

- Node.js 18+ instalado
- Conta no Supabase configurada
- Projeto principal TrackerAds rodando

## 🔧 Instalação

### 1. Instalar dependências

```bash
cd scraper-service
npm install
```

### 2. Instalar o Playwright (navegador)

```bash
npx playwright install chromium
```

### 3. Configurar variáveis de ambiente

Crie um arquivo `.env` na pasta `scraper-service`:

```env
# Supabase Configuration
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY=sua-service-key-aqui

# Server Configuration
PORT=3001

# Scraping Configuration
SCRAPING_INTERVAL=12h
```

**IMPORTANTE**: Use a **SERVICE KEY** (não a anon key) do Supabase. Você encontra em:
- Supabase Dashboard → Settings → API → `service_role` key

### 4. Criar pasta para screenshots

```bash
mkdir screenshots
```

## 🎮 Como Usar

### Iniciar o serviço

```bash
npm start
```

O serviço irá:
- ✅ Iniciar na porta 3001
- ⏰ Agendar scraping automático a cada 12 horas
- 🔄 Ficar rodando em background

### Executar scraping manualmente

Você pode executar o scraping manualmente através da API:

```bash
# Via curl (PowerShell)
Invoke-RestMethod -Uri http://localhost:3001/api/scrape/run -Method POST

# Via navegador (interface do app principal)
# POST http://localhost:3001/api/scrape/run
```

### Testar uma URL específica

```bash
curl -X POST http://localhost:3001/api/scrape/test \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=576413898805490\"}"
```

## 📡 API Endpoints

### `GET /`
Health check do serviço

### `GET /api/status`
Retorna status do serviço e número de ofertas monitoradas

### `POST /api/scrape/run`
Executa o scraping manualmente para todas as ofertas

### `POST /api/scrape/test`
Testa scraping de uma URL específica

Body:
```json
{
  "url": "https://facebook.com/ads/library/..."
}
```

### `GET /api/offers`
Lista todas as ofertas monitoradas

## ⚙️ Configuração do Agendamento

Por padrão, o scraping roda a cada 12 horas (00:00 e 12:00).

Para alterar o agendamento, edite `scheduler.js`:

```javascript
// A cada 12 horas (00:00 e 12:00)
const cronExpression = '0 0,12 * * *';

// Outras opções:
// '*/30 * * * *'  - A cada 30 minutos
// '0 * * * *'     - A cada 1 hora
// '0 */6 * * *'   - A cada 6 horas
// '0 9,21 * * *'  - Às 9h e 21h
```

## 🐛 Troubleshooting

### Erro: "Não foi possível encontrar o número de anúncios"

**Solução**: O Facebook pode ter mudado a estrutura da página. Verifique o screenshot gerado em `screenshots/` e ajuste os seletores em `scraper.js`.

### Erro: "SUPABASE_URL e SUPABASE_SERVICE_KEY devem estar definidas"

**Solução**: Certifique-se de que o arquivo `.env` existe e está configurado corretamente.

### Scraping muito lento

**Solução**: Ajuste o `waitForTimeout` em `scraper.js` para valores menores (cuidado para não ser detectado como bot).

### Playwright não instalado

**Solução**: Execute `npx playwright install chromium`

## 🔄 Integração com o App Principal

O app principal (React) pode chamar a API do scraper para:

1. **Executar scraping manual**: Botão para atualizar imediatamente
2. **Ver status**: Mostrar última atualização e próxima execução
3. **Ver logs**: Histórico de scraping

Exemplo de integração no React:

```javascript
// Executar scraping manual
const runManualScraping = async () => {
  try {
    const response = await fetch('http://localhost:3001/api/scrape/run', {
      method: 'POST'
    });
    const data = await response.json();
    console.log('Scraping iniciado:', data);
  } catch (error) {
    console.error('Erro:', error);
  }
};
```

## 📊 Estrutura de Dados

O serviço atualiza os seguintes campos na tabela `offers`:

- `last_ad_count`: Número de anúncios ativos
- `last_ad_count_timestamp`: Data/hora da última atualização

## 🔐 Segurança

- ✅ Use a **SERVICE KEY** apenas no servidor backend (nunca no frontend)
- ✅ O serviço deve rodar em servidor privado (não expor publicamente)
- ✅ Configure CORS adequadamente em produção
- ✅ Use HTTPS em produção

## 📝 Logs

O serviço gera logs detalhados:

- ✅ Início/fim de cada job
- ✅ Resultados de cada oferta processada
- ✅ Erros e falhas
- ✅ Estatísticas de sucesso/falha

## 🚀 Deploy em Produção

### Opção 1: VPS (Recomendado)

1. Faça upload do código para seu servidor
2. Instale dependências: `npm install`
3. Instale Playwright: `npx playwright install chromium`
4. Configure `.env` com credenciais de produção
5. Use PM2 para manter o serviço rodando:

```bash
npm install -g pm2
pm2 start server.js --name trackerads-scraper
pm2 startup
pm2 save
```

### Opção 2: Heroku

1. Adicione Playwright buildpack
2. Configure variáveis de ambiente
3. Deploy: `git push heroku main`

### Opção 3: Railway/Render

1. Conecte o repositório
2. Configure variáveis de ambiente
3. Deploy automático

## 📈 Melhorias Futuras

- [ ] Dashboard web para visualizar logs
- [ ] Notificações quando anúncios mudarem muito
- [ ] Suporte para outras plataformas além do Facebook
- [ ] Rate limiting e retry automático
- [ ] Tabela de logs no Supabase
- [ ] Webhook para notificações em tempo real

## 🆘 Suporte

Se tiver problemas, verifique:

1. ✅ As credenciais do Supabase estão corretas?
2. ✅ O Playwright está instalado?
3. ✅ A porta 3001 está livre?
4. ✅ Os screenshots mostram a página carregando corretamente?

## 📄 Licença

MIT
