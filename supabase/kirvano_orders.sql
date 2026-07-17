-- ════════════════════════════════════════════════════════════════════
-- PURSTINLAB · Pedidos Kirvano + Logs de Webhook
-- Rode no SQL Editor da MESMA Supabase do TrackerAds/Pixel.
-- A função serverless (api/webhook.js) escreve aqui via service key.
-- ════════════════════════════════════════════════════════════════════

-- ── Pedidos: TODO evento de venda/carrinho vira/atualiza uma linha aqui ──
-- A chave é o checkout_id (Kirvano manda o mesmo p/ carrinho → pix → aprovado),
-- então a venda "evolui" no mesmo registro em vez de duplicar.
create table if not exists kirvano_orders (
  id              uuid primary key default gen_random_uuid(),
  checkout_id     text unique,            -- chave de upsert (carrinho → venda)
  sale_id         text,                   -- preenche quando vira venda
  event           text,                   -- último evento recebido (SALE_APPROVED, ABANDONED_CART, PIX_GENERATED...)
  status          text,                   -- APPROVED | REFUSED | PENDING | CANCELED | REFUNDED | CHARGEBACK | ABANDONED
  value           numeric default 0,      -- total em R$ (numérico, já parseado)
  currency        text default 'BRL',
  product         text,                   -- nome do produto principal
  products        jsonb,                  -- array completo (com order bumps)
  payment_method  text,                   -- PIX | CREDIT_CARD | BANK_SLIP
  -- cliente (pra recuperação no WhatsApp depois)
  customer_name   text,
  customer_email  text,
  customer_phone  text,
  customer_doc    text,
  -- rastreio
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  checkout_url    text,                   -- link pro cliente retomar a compra
  capi_ok         boolean default false,  -- se reenviou Purchase pro Meta
  -- recuperação (uso futuro pelo WhatsApp Business)
  recovered       boolean default false,  -- virou venda depois de abandonar?
  wa_sent_at      timestamptz,            -- quando disparamos a mensagem de recuperação
  raw             jsonb,                  -- payload bruto do último evento
  ordered_at      timestamptz,           -- created_at vindo da Kirvano
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- De qual gateway veio a venda (kirvano | kiwify | hotmart). Antes só existia a
-- Kirvano e a coluna não era necessária; com a Kiwify entrando na mesma tabela,
-- sem isto não dá pra separar a operação por plataforma.
-- ⚠ RODE ISTO ANTES de subir o webhook novo: o upsert grava `gateway` e falha se
-- a coluna não existir (aí nenhuma venda é registrada).
alter table kirvano_orders add column if not exists gateway text;
create index if not exists kirvano_orders_gateway_idx on kirvano_orders (gateway);

create index if not exists kirvano_orders_status_idx   on kirvano_orders (status);
create index if not exists kirvano_orders_created_idx  on kirvano_orders (created_at desc);
create index if not exists kirvano_orders_campaign_idx on kirvano_orders (utm_campaign);

-- ── Logs crus de cada hit no webhook (pra saber se "tá pegando mesmo") ──
create table if not exists kirvano_webhook_logs (
  id           uuid primary key default gen_random_uuid(),
  gateway      text,
  event        text,        -- evento recebido
  status       text,        -- status parseado
  ok           boolean,     -- processou sem erro?
  http_status  int,         -- código que devolvemos
  secret_ok    boolean,     -- o segredo bateu?
  capi_ok      boolean,     -- reenviou pro Meta?
  message      text,        -- nota curta (ex.: "skipped: not approved", erro...)
  ip           text,
  raw          jsonb,       -- payload bruto recebido
  created_at   timestamptz default now()
);

create index if not exists kirvano_logs_created_idx on kirvano_webhook_logs (created_at desc);

-- ── RLS: leitura pública (anon) só leitura; escrita pela service key ──
alter table kirvano_orders       enable row level security;
alter table kirvano_webhook_logs enable row level security;

drop policy if exists "kirvano_orders_read" on kirvano_orders;
create policy "kirvano_orders_read" on kirvano_orders for select using (true);

drop policy if exists "kirvano_logs_read" on kirvano_webhook_logs;
create policy "kirvano_logs_read" on kirvano_webhook_logs for select using (true);

-- Caso já exista a tabela de uma versão anterior, garante as colunas novas:
alter table kirvano_orders add column if not exists recovered  boolean default false;
alter table kirvano_orders add column if not exists wa_sent_at timestamptz;
alter table kirvano_orders add column if not exists products   jsonb;
alter table kirvano_orders add column if not exists raw        jsonb;
