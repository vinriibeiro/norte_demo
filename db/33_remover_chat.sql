-- Remove o chat interno do banco (decisão de 2026-10-17).
-- Já foi executado no Supabase. Idempotente: pode rodar de novo sem erro.
-- Antes de rodar em outro ambiente, confira as contagens e faça backup.

BEGIN;
SET search_path = seven, public;

DROP TABLE IF EXISTS chat_mensagem, chat_participante, chat_conversa,
  chat_aceite, chat_arquivo, chat_acesso_log, chat_ideia CASCADE;
DROP VIEW IF EXISTS v_chat_pessoas;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'chat_participa' AND pronamespace = 'seven'::regnamespace LOOP
    EXECUTE 'DROP FUNCTION ' || f.sig;
  END LOOP;
END $$;

ALTER TABLE push_preferencia DROP COLUMN IF EXISTS chat;

COMMIT;
