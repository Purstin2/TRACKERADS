-- ============================================================================
--  MIGRAÇÃO: veredito da oferta (aba Trajetória)
--  Execute no SQL Editor do Supabase. Seguro rodar mais de uma vez.
--
--  A aba Trajetória deduz automaticamente se cada oferta foi um ACERTO
--  (escalou) ou ERRO (morreu sem vingar). Esta coluna guarda APENAS quando
--  você sobrescreve manualmente o veredito automático.
--    NULL    → usa o veredito automático calculado pelo histórico
--    'win'   → você marcou como ACERTO
--    'loss'  → você marcou como ERRO
--    'pending'→ você marcou como EM ANDAMENTO
-- ============================================================================

ALTER TABLE offers ADD COLUMN IF NOT EXISTS outcome text
  CHECK (outcome IS NULL OR outcome IN ('win', 'loss', 'pending'));
