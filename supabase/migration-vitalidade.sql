-- ============================================================================
--  MIGRAÇÃO: sinais de vitalidade da oferta
--  Execute no SQL Editor do Supabase. Seguro rodar mais de uma vez.
--  O scraper já funciona sem isto — estas colunas só ENRIQUECEM os dados
--  (saber há quantos dias a oferta roda e se está viva ou morta).
-- ============================================================================

ALTER TABLE offers ADD COLUMN IF NOT EXISTS oldest_ad_date date;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS days_running integer;
-- 'active' = tem anúncios ativos | 'dead' = 0 anúncios (oferta morreu)
ALTER TABLE offers ADD COLUMN IF NOT EXISTS last_scrape_status text;

-- Índice opcional para filtrar rapidamente ofertas vivas/mortas
CREATE INDEX IF NOT EXISTS offers_last_scrape_status_idx ON offers(last_scrape_status);

-- ============================================================================
--  Pronto. O job de scraping passa a gravar:
--   • oldest_ad_date      → data do anúncio ativo mais antigo
--   • days_running        → há quantos dias a oferta está no ar
--   • last_scrape_status  → 'active' ou 'dead'
-- ============================================================================
