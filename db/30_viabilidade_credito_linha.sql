-- ============================================================
-- 30 · Viabilidade: resultado do crédito e limite da linha móvel
-- Crédito passa a ser Aprovado / Reprovado / Aprovado (Oferta Single), sem limite.
-- O limite liberado passa a ser informado na checagem de linha móvel.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================
SET search_path = seven, public;

ALTER TABLE viabilidade
  ADD COLUMN IF NOT EXISTS credito_oferta_single boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linha_limite numeric(12,2) CHECK (linha_limite IS NULL OR linha_limite >= 0);
