-- Tabela para os eventos de venda recebidos do gateway (módulo Pixel).
-- Rode no SQL Editor da MESMA Supabase do TrackerAds.
create table if not exists pixel_events (
  id          uuid primary key default gen_random_uuid(),
  event_name  text default 'Purchase',
  tx_id       text,
  product     text,
  value       numeric,
  payment     text,
  gateway     text,
  capi_ok     boolean default false,
  created_at  timestamptz default now()
);

create index if not exists pixel_events_created_idx on pixel_events (created_at desc);

-- Leitura pública (anon) só de leitura; escrita só pela service key (a função serverless usa service key).
alter table pixel_events enable row level security;

drop policy if exists "pixel_events_read" on pixel_events;
create policy "pixel_events_read" on pixel_events for select using (true);
