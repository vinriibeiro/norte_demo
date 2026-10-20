-- ============================================================
-- 32 · Notificações do chat (avisos de nova mensagem no celular)
-- Cada pessoa pode desligar o aviso do chat. Idempotente.
-- ============================================================
SET search_path = seven, public;

ALTER TABLE push_preferencia ADD COLUMN IF NOT EXISTS chat boolean NOT NULL DEFAULT true;
