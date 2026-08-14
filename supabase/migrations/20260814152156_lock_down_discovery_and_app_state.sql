/*
  # Tranca discovery_keywords, discovered_offers e app_state pra multi-tenant

  Essas três tabelas já existem e estão em uso (código em src/ e
  scraper-service/), mas não têm migração no repositório — foram criadas
  direto no painel do Supabase, então não dá pra confirmar por aqui se RLS
  estava configurado. Esta migração é segura de rodar mesmo se elas já
  tiverem RLS/policies (idempotente, não mexe em dados).

  1. discovery_keywords / discovered_offers
     - Lidas e escritas direto pelo navegador (chave anon + sessão do
       usuário) em src/components/screens/DiscoveryScreen.jsx.
     - Sem RLS por user_id, um usuário logado conseguiria ler/editar/apagar
       as keywords e descobertas de QUALQUER outro usuário.

  2. app_state
     - Só é lida/escrita pelo scraper-service usando a service key (que
       ignora RLS) — o navegador nunca chama esta tabela diretamente.
     - Mas toda tabela pública do Supabase também fica exposta via REST
       (PostgREST) usando só a anon key, que já é pública no bundle do
       site. Sem RLS aqui, qualquer pessoa (nem precisa estar logada)
       poderia ler/escrever direto em app_state pelo REST e, por exemplo,
       forjar um "discovery_stop" pra travar o robô ou mudar os filtros —
       mesmo sem passar pelo scraper-service.
     - RLS habilitado e SEM nenhuma policy pra anon/authenticated = só a
       service key consegue mexer, que é exatamente como o serviço já
       funciona hoje. Não quebra nada em uso.
*/

-- ── discovery_keywords ────────────────────────────────────────────────────
ALTER TABLE discovery_keywords ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'discovery_keywords' AND cmd = 'SELECT') THEN
    CREATE POLICY "Users can read their own discovery keywords"
      ON discovery_keywords FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'discovery_keywords' AND cmd = 'INSERT') THEN
    CREATE POLICY "Users can create their own discovery keywords"
      ON discovery_keywords FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'discovery_keywords' AND cmd = 'UPDATE') THEN
    CREATE POLICY "Users can update their own discovery keywords"
      ON discovery_keywords FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'discovery_keywords' AND cmd = 'DELETE') THEN
    CREATE POLICY "Users can delete their own discovery keywords"
      ON discovery_keywords FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── discovered_offers ─────────────────────────────────────────────────────
ALTER TABLE discovered_offers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'discovered_offers' AND cmd = 'SELECT') THEN
    CREATE POLICY "Users can read their own discovered offers"
      ON discovered_offers FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'discovered_offers' AND cmd = 'UPDATE') THEN
    CREATE POLICY "Users can update their own discovered offers"
      ON discovered_offers FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'discovered_offers' AND cmd = 'DELETE') THEN
    CREATE POLICY "Users can delete their own discovered offers"
      ON discovered_offers FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  -- Sem policy de INSERT de propósito: quem grava aqui é só o scraper-service
  -- (service key, ignora RLS) depois de rodar o discovery. O navegador só lê/atualiza.
END $$;

-- ── app_state ──────────────────────────────────────────────────────────────
-- Só existe se o scraper-service já rodou pelo menos uma vez e criou a tabela.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_state') THEN
    ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;
    -- Nenhuma policy adicionada de propósito: bloqueia anon/authenticated via REST,
    -- só a service key (usada pelo scraper-service) continua acessando.
  END IF;
END $$;
