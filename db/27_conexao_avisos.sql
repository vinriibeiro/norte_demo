-- ============================================================
-- 27 · Avisos da venda Sistema A / Sistema B
-- Guarda quando o vendedor abriu a venda pela última vez; as mensagens do chat
-- posteriores a essa hora (de outra pessoa) viram aviso para ele.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================
SET search_path = seven, public;

ALTER TABLE venda_externa ADD COLUMN IF NOT EXISTS visto_chat_vendedor_em timestamptz;
GRANT UPDATE (visto_chat_vendedor_em) ON venda_externa TO seven_vendedor;
