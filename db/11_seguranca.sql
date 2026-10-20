-- 11_seguranca.sql  — camadas de segurança do banco (pode rodar mais de uma vez sem problema)
SET search_path = seven, public;

-- 1) Sessão revogável: cada login carrega a "versão" da conta.
--    Trocar/redefinir senha ou desativar o acesso muda a versão e derruba na hora todas as sessões abertas.
ALTER TABLE conta_acesso ADD COLUMN IF NOT EXISTS token_versao integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION fn_conta_versao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.senha_hash IS DISTINCT FROM OLD.senha_hash OR NEW.ativa IS DISTINCT FROM OLD.ativa THEN
    NEW.token_versao := OLD.token_versao + 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_conta_versao ON conta_acesso;
CREATE TRIGGER trg_conta_versao BEFORE UPDATE ON conta_acesso FOR EACH ROW EXECUTE FUNCTION fn_conta_versao();

-- mudar o perfil ou desativar a pessoa também derruba as sessões dela
CREATE OR REPLACE FUNCTION fn_usuario_versao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.perfil_acesso IS DISTINCT FROM OLD.perfil_acesso OR NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    UPDATE seven.conta_acesso SET token_versao = token_versao + 1 WHERE usuario_id = NEW.id;
  END IF;
  RETURN NEW;
END $$ SECURITY DEFINER SET search_path = seven, public;
DROP TRIGGER IF EXISTS trg_usuario_versao ON usuario;
CREATE TRIGGER trg_usuario_versao AFTER UPDATE ON usuario FOR EACH ROW EXECUTE FUNCTION fn_usuario_versao();

-- 2) Novos tipos de evento no histórico de acesso
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'seven.conta_acesso_evento'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%acao%'
  LOOP EXECUTE format('ALTER TABLE seven.conta_acesso_evento DROP CONSTRAINT %I', c); END LOOP;
END $$;
ALTER TABLE conta_acesso_evento ADD CONSTRAINT conta_acesso_evento_acao_check CHECK (acao IN
  ('CRIADA','PERFIL_ALTERADO','DESATIVADA','REATIVADA','SENHA_REDEFINIDA','SENHA_TROCADA',
   'LOGIN_OK','LOGIN_FALHOU','BLOQUEADA','SESSOES_ENCERRADAS'));

-- 3) Supabase: fecha a "porta dos fundos" (API pública do Supabase com a chave anon).
--    O sistema só acessa o banco pela nossa API; ninguém de fora deve ler o schema seven.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','public']
  LOOP
    IF r = 'public' OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA seven FROM %s', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA seven FROM %s', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA seven FROM %s', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA seven FROM %s', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA seven REVOKE ALL ON TABLES FROM %s', r);
    END IF;
  END LOOP;
END $$;
-- as funções precisam continuar executáveis pelos perfis do sistema
GRANT USAGE ON SCHEMA seven TO seven_gestor, seven_backoffice, seven_vendedor, seven_lider, seven_coordenador;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA seven TO seven_gestor, seven_backoffice, seven_vendedor, seven_lider, seven_coordenador;

-- 4) Consulta pesada não trava o banco (qualquer comando acima de 20s é cancelado)
DO $$ BEGIN
  EXECUTE format('ALTER ROLE %I SET statement_timeout = %L', current_user, '20s');
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- Conferência: deve mostrar token_versao e "nenhuma linha" para anon
SELECT column_name FROM information_schema.columns WHERE table_schema='seven' AND table_name='conta_acesso' AND column_name='token_versao';
