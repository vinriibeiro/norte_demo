-- ============================================================
-- 29 · Limpeza e compressão automática dos anexos
-- comprimido: a imagem já passou pela compressão diária (não é refeita)
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================
SET search_path = seven, public;

ALTER TABLE anexo ADD COLUMN IF NOT EXISTS comprimido boolean NOT NULL DEFAULT false;
