-- =====================================================================
-- Arquivo 18: notificações no celular (Web Push) para Gerente e Administrador
-- NÃO PRECISA RODAR: o servidor cria estas tabelas sozinho na primeira vez que sobe.
-- Fica aqui como registro (e para quem quiser criar à mão no SQL Editor).
-- =====================================================================
SET search_path TO seven, public;

-- chaves VAPID do servidor (geradas automaticamente; nenhum perfil do banco lê)
CREATE TABLE IF NOT EXISTS push_config (
  id smallint PRIMARY KEY CHECK (id = 1), publica text NOT NULL, privada text NOT NULL, criado_em timestamptz NOT NULL DEFAULT now());
-- cada celular/navegador que ativou as notificações
CREATE TABLE IF NOT EXISTS push_inscricao (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth text NOT NULL, aparelho text,
  criado_em timestamptz NOT NULL DEFAULT now(), ultimo_envio timestamptz, falhas int NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_push_inscricao_usuario ON push_inscricao (usuario_id);
-- o que cada pessoa quer receber
CREATE TABLE IF NOT EXISTS push_preferencia (
  usuario_id bigint PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
  nova_venda boolean NOT NULL DEFAULT true, relatorio boolean NOT NULL DEFAULT true);
-- resumos já enviados (garante 1 envio por horário, mesmo com reinício do servidor)
CREATE TABLE IF NOT EXISTS notificacao_envio (
  tipo text NOT NULL, chave text NOT NULL, enviado_em timestamptz NOT NULL DEFAULT now(), destinatarios int, resumo text,
  PRIMARY KEY (tipo, chave));
ALTER TABLE push_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_inscricao ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_preferencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacao_envio ENABLE ROW LEVEL SECURITY;

-- Conferir os resumos enviados:
-- SELECT * FROM seven.notificacao_envio ORDER BY enviado_em DESC LIMIT 20;
