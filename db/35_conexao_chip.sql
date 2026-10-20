-- =====================================================================
-- Sistema A: campo "Possui chip?" (sim/não). Vendas com chip sobem como prioridade
-- e só podem ser finalizadas com a foto do chip anexada.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- =====================================================================
SET search_path = seven, public;

ALTER TABLE venda_externa ADD COLUMN IF NOT EXISTS possui_chip boolean;
GRANT UPDATE (possui_chip) ON venda_externa TO seven_vendedor;
CREATE INDEX IF NOT EXISTS ix_venda_externa_chip ON venda_externa (possui_chip) WHERE possui_chip;
