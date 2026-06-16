-- ════════════════════════════════════════════════════════════════════
-- PURSTINLAB · Roteamento multi-pixel por oferta
-- Cada oferta (offer_id/product_id) manda pro SEU pixel + token CAPI.
-- A mesma oferta pode rodar em vários gateways/países → todos caem no
-- mesmo pixel da oferta. Sem mapeamento → usa o pixel default da Vercel.
--
-- SEGURANÇA: o capi_token é sensível. O anon (frontend) pode inserir e
-- atualizar, mas NÃO pode reler o token cru — só enxerga via a view
-- `pixel_routes_public` (sem token). O webhook lê o token com a service key.
-- ════════════════════════════════════════════════════════════════════

create table if not exists pixel_routes (
  id           uuid primary key default gen_random_uuid(),
  label        text,                       -- nome amigável ("Printing 3D", "Pokémon PT")
  offer_id     text,                       -- chave de roteamento (offer_id OU product_id da venda)
  match_type   text default 'offer',       -- 'offer' | 'product' | 'any' (any = fallback geral)
  pixel_id     text not null,              -- Meta Pixel ID de destino
  capi_token   text not null,              -- token CAPI (sensível — não lido pelo anon)
  test_code    text,                       -- test_event_code opcional
  active       boolean default true,
  gateways     text[],                     -- (opcional) limita a quais gateways: {kirvano,hotmart}
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists pixel_routes_offer_idx on pixel_routes (offer_id);
create index if not exists pixel_routes_active_idx on pixel_routes (active);

-- View pública SEM o token: é o que a tela lê. Mostra só os últimos 4 dígitos.
create or replace view pixel_routes_public as
select
  id, label, offer_id, match_type, pixel_id, test_code, active, gateways,
  created_at, updated_at,
  case when capi_token is null or capi_token = '' then false else true end as has_token,
  right(capi_token, 4) as token_last4
from pixel_routes;

-- ── RLS ──────────────────────────────────────────────────────────────
alter table pixel_routes enable row level security;

-- anon pode INSERIR e ATUALIZAR rotas (cadastro pela tela),
-- mas NÃO pode dar SELECT na tabela base (token cru fica protegido).
drop policy if exists "pixel_routes_insert" on pixel_routes;
create policy "pixel_routes_insert" on pixel_routes for insert with check (true);

drop policy if exists "pixel_routes_update" on pixel_routes;
create policy "pixel_routes_update" on pixel_routes for update using (true) with check (true);

drop policy if exists "pixel_routes_delete" on pixel_routes;
create policy "pixel_routes_delete" on pixel_routes for delete using (true);

-- (sem policy de SELECT → anon não lê a tabela base; lê só a view abaixo)

-- a view roda com os direitos do dono (security definer) → consegue ler a base,
-- mas só expõe colunas sem o token. Damos SELECT da view pro anon.
alter view pixel_routes_public set (security_invoker = false);
grant select on pixel_routes_public to anon;

-- updated_at automático
create or replace function touch_pixel_routes() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_touch_pixel_routes on pixel_routes;
create trigger trg_touch_pixel_routes before update on pixel_routes
  for each row execute function touch_pixel_routes();
