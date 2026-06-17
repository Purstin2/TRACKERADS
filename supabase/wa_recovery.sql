-- ════════════════════════════════════════════════════════════════════
-- PURSTINLAB · Recuperação de carrinho abandonado via WhatsApp
-- Estrutura genérica: serve pra QUALQUER provedor (360dialog, Gupshup,
-- Cloud API oficial, Zenvia...) — só troca a credencial/URL na Vercel.
-- ════════════════════════════════════════════════════════════════════

-- ── controle de envio por pedido ──
-- (kirvano_orders já tem wa_sent_at; adicionamos status + tentativas)
alter table kirvano_orders add column if not exists wa_status   text default 'pending';
  -- pending | sent | failed | skipped | done | converted
alter table kirvano_orders add column if not exists wa_attempts int  default 0;
alter table kirvano_orders add column if not exists wa_step     int  default 0;  -- cadência: 0→1→2→3 (qual dia já mandou)
alter table kirvano_orders add column if not exists wa_error    text;
alter table kirvano_orders add column if not exists wa_last_try timestamptz;

create index if not exists kirvano_orders_wa_idx
  on kirvano_orders (status, wa_status, created_at);

-- ── histórico de cada disparo (pra auditar/medir recuperação) ──
create table if not exists wa_messages (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references kirvano_orders(id) on delete cascade,
  phone       text,
  body        text,            -- mensagem enviada (com variáveis já preenchidas)
  provider    text,            -- 360dialog | gupshup | cloud | custom...
  ok          boolean,
  http_status int,
  response    jsonb,           -- resposta crua do provedor (id da msg, erro...)
  created_at  timestamptz default now()
);
create index if not exists wa_messages_order_idx on wa_messages (order_id);

-- ── configuração da campanha de recuperação (1 linha) ──
-- O template e os tempos ficam aqui (editável na tela). As CREDENCIAIS do
-- provedor ficam só na Vercel (env), nunca no banco.
create table if not exists wa_config (
  id            int primary key default 1,
  enabled       boolean default false,   -- liga/desliga o disparo automático
  delay_minutes int default 20,          -- espera após o abandono antes de mandar
  max_attempts  int default 1,           -- quantas mensagens por carrinho
  window_hours  int default 24,          -- não recupera carrinho mais velho que isso
  template      text default 'Oi {nome}! Vi que você começou a compra do {produto} mas não finalizou 😊 Quer que eu te ajude a concluir? {link}',
  provider      text default 'custom',   -- qual adaptador usar
  only_with_phone boolean default true,
  updated_at    timestamptz default now(),
  constraint wa_config_singleton check (id = 1)
);
insert into wa_config (id) values (1) on conflict (id) do nothing;

-- ── RLS ──
alter table wa_messages enable row level security;
alter table wa_config   enable row level security;

drop policy if exists "wa_messages_read" on wa_messages;
create policy "wa_messages_read" on wa_messages for select using (true);

drop policy if exists "wa_config_all" on wa_config;
create policy "wa_config_all" on wa_config for all using (true) with check (true);
