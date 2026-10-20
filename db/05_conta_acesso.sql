-- =====================================================================
-- Arquivo 5: contas de acesso ao site (login), ligadas aos agentes já existentes
--
--   usuario        = a pessoa/agente (vendedor, líder, backoffice...) -> já existe
--   conta_acesso   = a credencial de login dessa pessoa                -> novo
--   O perfil (gestor / backoffice / vendedor) continua em usuario.perfil_acesso.
--   O e-mail de login é usuario.email (único).
-- Só o gestor cria/altera contas. Nada é apagado: a conta é desativada.
-- =====================================================================
SET search_path = seven, public;

CREATE TABLE IF NOT EXISTS conta_acesso (
    usuario_id          bigint PRIMARY KEY REFERENCES usuario(id),   -- 1 conta por agente
    senha_hash          text NOT NULL,                                -- bcrypt, nunca a senha
    deve_trocar_senha   boolean NOT NULL DEFAULT true,                -- true na criação/redefinição
    ativa               boolean NOT NULL DEFAULT true,
    falhas_login        smallint NOT NULL DEFAULT 0,
    bloqueada_ate       timestamptz,
    ultimo_login        timestamptz,
    criada_por          bigint REFERENCES usuario(id),
    criada_em           timestamptz NOT NULL DEFAULT now(),
    atualizada_em       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conta_acesso_evento (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id    bigint NOT NULL REFERENCES usuario(id),     -- conta afetada
    acao          text NOT NULL CHECK (acao IN
                  ('CRIADA','PERFIL_ALTERADO','DESATIVADA','REATIVADA','SENHA_REDEFINIDA',
                   'SENHA_TROCADA','LOGIN_OK','LOGIN_FALHOU','BLOQUEADA')),
    feito_por     bigint REFERENCES usuario(id),              -- quem fez (NULL = a própria pessoa/sistema)
    detalhe       text,
    em            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_conta_evento_usuario ON conta_acesso_evento (usuario_id, em DESC);

-- Login por e-mail: normaliza para minúsculas
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_email_lower ON usuario (lower(email)) WHERE email IS NOT NULL;

-- Lista para a tela "Usuários" do administrador
CREATE OR REPLACE VIEW v_agentes_acesso AS
SELECT u.id AS usuario_id, u.login, u.nome_completo, u.email, u.perfil_acesso, u.nivel_vendedor,
       u.ativo AS agente_ativo,
       (c.usuario_id IS NOT NULL)                       AS tem_acesso,
       coalesce(c.ativa, false)                         AS acesso_ativo,
       c.ultimo_login, c.deve_trocar_senha,
       (SELECT string_agg(f.funcao, ', ' ORDER BY f.funcao) FROM usuario_funcao f WHERE f.usuario_id = u.id) AS funcoes,
       (SELECT e.nome FROM contrato k JOIN equipe e ON e.id = k.equipe_id
         WHERE k.vendedor_id = u.id ORDER BY k.data_venda DESC LIMIT 1) AS equipes,   -- equipe da venda mais recente
       (SELECT count(*) FROM contrato k WHERE k.vendedor_id = u.id) AS total_vendas
FROM usuario u
LEFT JOIN conta_acesso c ON c.usuario_id = u.id;

-- Permissões: só o gestor enxerga e altera contas
REVOKE ALL ON conta_acesso, conta_acesso_evento, v_agentes_acesso FROM PUBLIC;
GRANT ALL ON conta_acesso, conta_acesso_evento TO seven_gestor;
GRANT SELECT ON v_agentes_acesso TO seven_gestor;
GRANT USAGE ON SEQUENCE conta_acesso_evento_id_seq TO seven_gestor;
-- (backoffice e vendedor não recebem nada aqui)
