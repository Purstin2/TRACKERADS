-- ════════════════════════════════════════════════════════════════════
-- PURSTINLAB · Trava tudo pra "exige login" (Rode no SQL Editor)
--
-- Até aqui, quase toda tabela de negócio tinha leitura (e algumas até
-- escrita) LIBERADA GERAL — `using (true)` sem `to authenticated` — o que
-- combinado com o app não pedindo login nenhum (agora corrigido em
-- src/App.tsx via RequireAuth) deixava nome/e-mail/telefone/CPF de
-- compradores, rotas de pixel e config de recuperação acessíveis por
-- qualquer pessoa com a anon key (que já é pública, embutida no site),
-- sem precisar de conta nenhuma.
--
-- Isto NÃO é multi-tenant (ainda é uma conta só, compartilhada por quem
-- você convidar) — só fecha o acesso anônimo. Seguro de rodar mais de
-- uma vez.
-- ════════════════════════════════════════════════════════════════════

-- ── kirvano_orders / kirvano_webhook_logs ─────────────────────────────
drop policy if exists "kirvano_orders_read" on kirvano_orders;
create policy "kirvano_orders_read" on kirvano_orders for select to authenticated using (true);

drop policy if exists "kirvano_logs_read" on kirvano_webhook_logs;
create policy "kirvano_logs_read" on kirvano_webhook_logs for select to authenticated using (true);

-- ── wa_messages / wa_config ────────────────────────────────────────────
drop policy if exists "wa_messages_read" on wa_messages;
create policy "wa_messages_read" on wa_messages for select to authenticated using (true);

drop policy if exists "wa_config_all" on wa_config;
create policy "wa_config_all" on wa_config for all to authenticated using (true) with check (true);

-- ── pixel_events (legado, sem uso no código atual, mas continua live) ──
drop policy if exists "pixel_events_read" on pixel_events;
create policy "pixel_events_read" on pixel_events for select to authenticated using (true);

-- ── pixel_routes: antes o anon (sem login) podia inserir/editar/apagar
-- rotas de pixel de QUALQUER oferta — agora só quem está logado ────────
drop policy if exists "pixel_routes_insert" on pixel_routes;
create policy "pixel_routes_insert" on pixel_routes for insert to authenticated with check (true);

drop policy if exists "pixel_routes_update" on pixel_routes;
create policy "pixel_routes_update" on pixel_routes for update to authenticated using (true) with check (true);

drop policy if exists "pixel_routes_delete" on pixel_routes;
create policy "pixel_routes_delete" on pixel_routes for delete to authenticated using (true);

drop policy if exists "pixel_routes_select" on pixel_routes;
create policy "pixel_routes_select" on pixel_routes for select to authenticated using (true);

-- revoga os grants de COLUNA que tinham sido dados ao anon — no Postgres um
-- "revoke select on tabela" genérico NÃO desfaz um "grant select (colunas)"
-- anterior; precisa repetir a mesma lista de colunas que foi concedida.
revoke select (id, label, offer_id, match_type, pixel_id, test_code, active,
  gateways, checkout_selector, checkout_keywords, fire_on_pix, created_at, updated_at)
  on pixel_routes from anon;
revoke select (has_token, token_last4) on pixel_routes from anon;
revoke select on pixel_routes from anon;
revoke select on pixel_routes_public from anon;
grant select on pixel_routes_public to authenticated;

-- ── app_state / ads_daily / push_subscriptions ─────────────────────────
-- Sem arquivo .sql próprio no repo (criadas direto no painel) — trava
-- defensivamente só se existirem.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'app_state') then
    alter table app_state enable row level security;
    drop policy if exists "app_state_authenticated" on app_state;
    create policy "app_state_authenticated" on app_state for all to authenticated using (true) with check (true);
    -- nenhuma policy pra anon: fica só a service key (backend) + quem logou.
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ads_daily') then
    alter table ads_daily enable row level security;
    drop policy if exists "ads_daily_authenticated" on ads_daily;
    create policy "ads_daily_authenticated" on ads_daily for all to authenticated using (true) with check (true);
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'push_subscriptions') then
    alter table push_subscriptions enable row level security;
    -- sem policy pra anon/authenticated de propósito: só api/mobile.js e
    -- api/notify.js mexem aqui, e os dois usam a service key (ignora RLS).
  end if;
end $$;
