-- ════════════════════════════════════════════════════════════════════
-- PURSTINLAB · Roteamento multi-pixel por oferta
-- Cada oferta (offer_id/product_id) manda pro SEU pixel + token CAPI.
-- A mesma oferta pode rodar em vários gateways/países → todos caem no
-- mesmo pixel da oferta. Sem rota casada → o evento NÃO é enviado (não
-- contamina outro pixel). Pra catch-all proposital, crie uma rota match_type='any'.
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

-- anon pode INSERIR, ATUALIZAR e EXCLUIR rotas (cadastro pela tela).
drop policy if exists "pixel_routes_insert" on pixel_routes;
create policy "pixel_routes_insert" on pixel_routes for insert with check (true);

drop policy if exists "pixel_routes_update" on pixel_routes;
create policy "pixel_routes_update" on pixel_routes for update using (true) with check (true);

drop policy if exists "pixel_routes_delete" on pixel_routes;
create policy "pixel_routes_delete" on pixel_routes for delete using (true);

-- IMPORTANTE: UPDATE/DELETE com WHERE precisam de policy de SELECT pra LOCALIZAR
-- a linha — sem ela o Postgres afeta 0 linhas e o PATCH vira no-op silencioso
-- (retorna 204 "ok" mas nada muda; era o bug do Test Event Code que "voltava").
-- Então damos SELECT (using true), e protegemos o TOKEN por privilégio de COLUNA.
drop policy if exists "pixel_routes_select" on pixel_routes;
create policy "pixel_routes_select" on pixel_routes for select using (true);

-- token secreto: revoga SELECT total e concede em TODAS as colunas MENOS capi_token.
-- (o webhook usa a service key e ignora isto.)
revoke select on pixel_routes from anon;
revoke select on pixel_routes from authenticated;
grant select (id, label, offer_id, match_type, pixel_id, test_code, active,
  gateways, checkout_selector, checkout_keywords, fire_on_pix, created_at, updated_at)
  on pixel_routes to anon;
grant select (id, label, offer_id, match_type, pixel_id, test_code, active,
  gateways, checkout_selector, checkout_keywords, fire_on_pix, created_at, updated_at)
  on pixel_routes to authenticated;

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

-- ─── Migration: novos campos (safe to re-run) ────────────────────────────────
alter table pixel_routes add column if not exists checkout_selector text;
alter table pixel_routes add column if not exists checkout_keywords  text[];
alter table pixel_routes add column if not exists fire_on_pix        boolean default false;

-- Recria a view pública incluindo os novos campos (sem o token)
create or replace view pixel_routes_public as
select
  id, label, offer_id, match_type, pixel_id, test_code, active, gateways,
  checkout_selector, checkout_keywords, fire_on_pix,
  created_at, updated_at,
  case when capi_token is null or capi_token = '' then false else true end as has_token,
  right(capi_token, 4) as token_last4
from pixel_routes;

alter view pixel_routes_public set (security_invoker = false);
grant select on pixel_routes_public to anon;
