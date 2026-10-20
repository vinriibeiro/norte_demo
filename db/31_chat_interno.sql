-- ============================================================
-- 31 · Chat interno (Fase 1: somente texto)
-- Conversas diretas e grupos, aceite do aviso de privacidade, arquivo morto
-- (gravado pela rotina de arquivamento, sem acesso dos perfis de aplicação),
-- registro de acesso do gerente/administrador e aba de ideias anônima.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================
SET search_path = seven, public;

CREATE TABLE IF NOT EXISTS chat_conversa (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo          text NOT NULL CHECK (tipo IN ('DIRETA','GRUPO')),
    nome          text CHECK (nome IS NULL OR length(nome) BETWEEN 1 AND 80),
    chave_direta  text UNIQUE,                        -- 'menor_id:maior_id' para não duplicar conversa direta
    criada_por    bigint NOT NULL REFERENCES usuario(id),
    criada_em     timestamptz NOT NULL DEFAULT now(),
    CHECK ((tipo = 'DIRETA') = (chave_direta IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS chat_participante (
    conversa_id       bigint NOT NULL REFERENCES chat_conversa(id) ON DELETE CASCADE,
    usuario_id        bigint NOT NULL REFERENCES usuario(id),
    entrou_em         timestamptz NOT NULL DEFAULT now(),
    saiu_em           timestamptz,
    ultima_leitura_id bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (conversa_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS ix_chat_part_usuario ON chat_participante (usuario_id);

CREATE TABLE IF NOT EXISTS chat_mensagem (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversa_id   bigint NOT NULL REFERENCES chat_conversa(id) ON DELETE CASCADE,
    autor_id      bigint NOT NULL REFERENCES usuario(id),
    texto         text NOT NULL CHECK (length(texto) BETWEEN 1 AND 2000),
    criada_em     timestamptz NOT NULL DEFAULT now(),
    apagada_em    timestamptz,                         -- apagar = sai da tela de todos; a cópia segue no arquivo morto
    arquivada_em  timestamptz                          -- preenchido pela rotina de arquivamento (a cada 15 dias)
);
CREATE INDEX IF NOT EXISTS ix_chat_msg_conversa ON chat_mensagem (conversa_id, id);
CREATE INDEX IF NOT EXISTS ix_chat_msg_arquivar ON chat_mensagem (criada_em) WHERE arquivada_em IS NULL;

CREATE TABLE IF NOT EXISTS chat_aceite (
    usuario_id    bigint PRIMARY KEY REFERENCES usuario(id),
    versao_aviso  text NOT NULL,
    aceito_em     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_arquivo (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    periodo_ini    date NOT NULL,
    periodo_fim    date NOT NULL,
    conteudo       bytea NOT NULL,                     -- JSON compactado (gzip) com as mensagens do período
    sha256         text NOT NULL,
    qtd_mensagens  integer NOT NULL CHECK (qtd_mensagens >= 0),
    gerado_em      timestamptz NOT NULL DEFAULT now(),
    eliminar_em    date NOT NULL,                      -- gerado_em + 12 meses; a rotina elimina depois disso
    eliminado_em   timestamptz
);

CREATE TABLE IF NOT EXISTS chat_acesso_log (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id   bigint NOT NULL REFERENCES usuario(id),
    conversa_id  bigint,
    arquivo_id   bigint,
    motivo       text NOT NULL CHECK (length(motivo) BETWEEN 3 AND 300),
    em           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_ideia (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    texto       text NOT NULL CHECK (length(texto) BETWEEN 5 AND 1000),
    categoria   text NOT NULL DEFAULT 'GERAL' CHECK (length(categoria) <= 40),
    status      text NOT NULL DEFAULT 'NOVA' CHECK (status IN ('NOVA','EM_AVALIACAO','ACEITA','RECUSADA')),
    criada_em   timestamptz NOT NULL DEFAULT now()
    -- sem coluna de autor: a ideia nunca identifica quem enviou
);

-- ---------- função auxiliar (evita recursão de RLS entre as tabelas do chat) ----------
CREATE OR REPLACE FUNCTION chat_participa(p_conversa bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = seven, public AS $$
    SELECT EXISTS (SELECT 1 FROM chat_participante p
                    WHERE p.conversa_id = p_conversa AND p.usuario_id = app_usuario_id() AND p.saiu_em IS NULL)
$$;

-- ---------- RLS ----------
ALTER TABLE chat_conversa     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_participante ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_mensagem     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_aceite       ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_arquivo      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_acesso_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_ideia        ENABLE ROW LEVEL SECURITY;

-- conversa: a pessoa vê as que participa (ou que criou); o gerente vê todas (com registro na API)
DROP POLICY IF EXISTS chat_conversa_ver ON chat_conversa;
CREATE POLICY chat_conversa_ver ON chat_conversa FOR SELECT TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor
    USING (criada_por = app_usuario_id() OR chat_participa(id));
DROP POLICY IF EXISTS chat_conversa_criar ON chat_conversa;
CREATE POLICY chat_conversa_criar ON chat_conversa FOR INSERT TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor
    WITH CHECK (criada_por = app_usuario_id());
DROP POLICY IF EXISTS chat_conversa_gestor ON chat_conversa;
CREATE POLICY chat_conversa_gestor ON chat_conversa FOR SELECT TO seven_gestor USING (true);

-- participantes: a pessoa vê a própria linha e as das conversas que participa
DROP POLICY IF EXISTS chat_part_ver ON chat_participante;
CREATE POLICY chat_part_ver ON chat_participante FOR SELECT TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor
    USING (usuario_id = app_usuario_id() OR chat_participa(conversa_id));
DROP POLICY IF EXISTS chat_part_entrar ON chat_participante;
CREATE POLICY chat_part_entrar ON chat_participante FOR INSERT TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor
    WITH CHECK (EXISTS (SELECT 1 FROM chat_conversa c WHERE c.id = conversa_id AND c.criada_por = app_usuario_id()));
DROP POLICY IF EXISTS chat_part_propria ON chat_participante;
CREATE POLICY chat_part_propria ON chat_participante FOR UPDATE TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor
    USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id());
DROP POLICY IF EXISTS chat_part_gestor ON chat_participante;
CREATE POLICY chat_part_gestor ON chat_participante FOR SELECT TO seven_gestor USING (true);

-- mensagens: só quem participa lê e envia; só o autor pode apagar (apagada_em)
DROP POLICY IF EXISTS chat_msg_ver ON chat_mensagem;
CREATE POLICY chat_msg_ver ON chat_mensagem FOR SELECT TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor
    USING (chat_participa(conversa_id));
DROP POLICY IF EXISTS chat_msg_enviar ON chat_mensagem;
CREATE POLICY chat_msg_enviar ON chat_mensagem FOR INSERT TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor
    WITH CHECK (autor_id = app_usuario_id() AND chat_participa(conversa_id));
DROP POLICY IF EXISTS chat_msg_apagar ON chat_mensagem;
CREATE POLICY chat_msg_apagar ON chat_mensagem FOR UPDATE TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor
    USING (autor_id = app_usuario_id()) WITH CHECK (autor_id = app_usuario_id());
DROP POLICY IF EXISTS chat_msg_gestor ON chat_mensagem;
CREATE POLICY chat_msg_gestor ON chat_mensagem FOR SELECT TO seven_gestor USING (true);

-- aceite do aviso: cada um vê e grava o próprio
DROP POLICY IF EXISTS chat_aceite_proprio ON chat_aceite;
CREATE POLICY chat_aceite_proprio ON chat_aceite FOR ALL TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor
    USING (usuario_id = app_usuario_id()) WITH CHECK (usuario_id = app_usuario_id());
DROP POLICY IF EXISTS chat_aceite_gestor ON chat_aceite;
CREATE POLICY chat_aceite_gestor ON chat_aceite FOR SELECT TO seven_gestor USING (true);

-- arquivo morto e registro de acesso: só o gerente (e administrador) do perfil gestor; o restante é feito pela rotina do dono
DROP POLICY IF EXISTS chat_arquivo_gestor ON chat_arquivo;
CREATE POLICY chat_arquivo_gestor ON chat_arquivo FOR SELECT TO seven_gestor USING (true);
DROP POLICY IF EXISTS chat_log_gestor ON chat_acesso_log;
CREATE POLICY chat_log_gestor ON chat_acesso_log FOR SELECT TO seven_gestor USING (true);
DROP POLICY IF EXISTS chat_log_registrar ON chat_acesso_log;
CREATE POLICY chat_log_registrar ON chat_acesso_log FOR INSERT TO seven_gestor WITH CHECK (usuario_id = app_usuario_id());

-- ideias: qualquer perfil de equipe envia; ninguém da aplicação lê (a leitura é só do master, pelo servidor)
DROP POLICY IF EXISTS chat_ideia_enviar ON chat_ideia;
CREATE POLICY chat_ideia_enviar ON chat_ideia FOR INSERT TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador
    WITH CHECK (true);


-- nomes das pessoas para o chat: só id e nome, só de quem está ativo e não é o master (a tabela usuario não é liberada inteira)
CREATE OR REPLACE VIEW v_chat_pessoas AS
    SELECT id, nome_completo AS nome FROM usuario WHERE ativo AND perfil_acesso <> 'master';
REVOKE ALL ON v_chat_pessoas FROM PUBLIC;
GRANT SELECT ON v_chat_pessoas TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor;

-- ---------- permissões ----------
REVOKE ALL ON chat_conversa, chat_participante, chat_mensagem, chat_aceite, chat_arquivo, chat_acesso_log, chat_ideia FROM PUBLIC;
GRANT SELECT, INSERT ON chat_conversa TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor;
GRANT SELECT, INSERT, UPDATE ON chat_participante TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor;
GRANT UPDATE (saiu_em, ultima_leitura_id) ON chat_participante TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor;
GRANT SELECT, INSERT ON chat_mensagem TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor;
GRANT UPDATE (apagada_em) ON chat_mensagem TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor;
GRANT SELECT, INSERT, UPDATE ON chat_aceite TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor;
GRANT SELECT ON chat_conversa, chat_participante, chat_mensagem, chat_aceite, chat_arquivo TO seven_gestor;
GRANT SELECT, INSERT ON chat_acesso_log TO seven_gestor;
GRANT INSERT ON chat_ideia TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador;
GRANT USAGE ON SEQUENCE chat_conversa_id_seq, chat_mensagem_id_seq, chat_acesso_log_id_seq, chat_arquivo_id_seq, chat_ideia_id_seq
    TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor, seven_gestor;
GRANT EXECUTE ON FUNCTION chat_participa(bigint) TO seven_vendedor, seven_backoffice, seven_lider, seven_coordenador, seven_gestor, seven_gestor;
