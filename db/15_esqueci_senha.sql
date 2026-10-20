-- =====================================================================
-- Arquivo 15: "Esqueci a senha" na tela de login
--   O pedido fica registrado no histórico da conta; o gerente vê o aviso em Usuários e acessos e gera a senha temporária.
-- =====================================================================
SET search_path TO seven, public;
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'seven.conta_acesso_evento'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%acao%'
  LOOP EXECUTE format('ALTER TABLE seven.conta_acesso_evento DROP CONSTRAINT %I', c); END LOOP;
END $$;
ALTER TABLE seven.conta_acesso_evento ADD CONSTRAINT conta_acesso_evento_acao_check CHECK (acao IN
  ('CRIADA','PERFIL_ALTERADO','DESATIVADA','REATIVADA','SENHA_REDEFINIDA','SENHA_TROCADA',
   'LOGIN_OK','LOGIN_FALHOU','BLOQUEADA','SESSOES_ENCERRADAS','SENHA_SOLICITADA'));
