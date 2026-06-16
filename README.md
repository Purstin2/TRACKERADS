# PURSTINLAB

Plataforma unificada de tráfego pago — **Dashboard** (P&L), **Monitor** (campanhas Meta),
**Tracker Ads** (espionagem da Ads Library), **Uploader** (subir campanhas em massa) e
**Pixel** (atribuição própria via Conversions API + webhooks de gateway).

## Rodar local

```bash
npm install
npm run dev      # http://localhost:5180
```

Ou clique em **Iniciar PURSTINLAB.bat**.

## Build

```bash
npm run build    # gera dist/
npm run preview
```

## Variáveis de ambiente (`.env`)

Copie `.env.example` → `.env`. Para o **Tracker Ads** ler seus dados existentes você também
pode colar as credenciais direto na tela de conexão (ficam no navegador).

| Var | Onde usa |
|-----|----------|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Tracker Ads + Pixel (frontend) |

### Variáveis do backend (só na Vercel, não no `.env` do front)

| Var | Função |
|-----|--------|
| `META_PIXEL_ID` | Conversions API |
| `META_CAPI_TOKEN` | token da Conversions API |
| `META_TEST_EVENT_CODE` | (opcional) testes |
| `WEBHOOK_SECRET` | valida o webhook do gateway |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | gravar vendas (`pixel_events`) |

## Deploy

### Frontend + webhook (Vercel)
1. `vercel` (ou conecte o repo no painel). Framework: **Vite**.
2. Defina as variáveis acima em Project Settings → Environment Variables.
3. A função `api/webhook.js` vira `https://SEU-APP.vercel.app/api/webhook`.
4. Rode `supabase/pixel_events.sql` **e** `supabase/kirvano_orders.sql` no SQL Editor da sua Supabase
   (este último cria `kirvano_orders` — pedidos com todos os status + carrinhos abandonados — e `kirvano_webhook_logs`).
5. No módulo **Pixel → Webhook**, copie a URL e, na Kirvano (**Integrações → Webhooks → Criar Webhook**),
   cole-a e marque **TODOS os eventos** (Compra aprovada/recusada, Pix gerado, Reembolso, Chargeback e **Carrinho abandonado**).
   Use o mesmo `WEBHOOK_SECRET` no campo Token.
   - **Pixel → Pedidos**: dashboard de todos os status + filtro de carrinhos abandonados (com botão de recuperação no WhatsApp).
   - **Pixel → Logs**: histórico de cada hit do webhook (pra confirmar que está pegando).

### Scraper do Tracker Ads (Railway / GitHub Actions)
O scraper Playwright continua no projeto TrackerAds original (microserviço separado),
gravando na mesma Supabase. A plataforma só **lê** as tabelas (`offers`, `ad_counts`,
`discovery_keywords`, `discovered_offers`).

## Persistência

- **localStorage** (por enquanto): config do Monitor, log de ações, testador de preços, funil
  manual, diário, layout do Dashboard, parâmetros financeiros.
- **Supabase**: Tracker Ads (existente) + eventos do Pixel.
