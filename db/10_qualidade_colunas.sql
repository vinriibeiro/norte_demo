-- Colunas de qualidade (FPD) que o importador de qualidade adiciona em fatura.
-- Necessário em bancos novos (Supabase / Heroku) antes de carregar os dados.
SET search_path = seven, public;
ALTER TABLE fatura ALTER COLUMN vencimento DROP NOT NULL;
ALTER TABLE fatura ADD COLUMN IF NOT EXISTS situacao text
  CHECK (situacao IN ('PAGA_NO_PRAZO','PAGA_FORA_DO_PRAZO','NAO_PAGA','EM_ABERTO'));
ALTER TABLE fatura ADD COLUMN IF NOT EXISTS fpd_planilha text CHECK (fpd_planilha IN ('OK','NAO_OK','PRAZO'));
ALTER TABLE fatura ADD COLUMN IF NOT EXISTS fpd_apos_prazo_planilha text CHECK (fpd_apos_prazo_planilha IN ('OK','NAO_OK','PRAZO'));
