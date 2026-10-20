-- =====================================================================
-- Arquivo 13: melhorias de outubro/2026 (reunião com a Norte Link)
--   1. Backoffice em dois setores: CADASTRO e QUALIDADE
--   2. Viabilidade: pedido do vendedor -> resposta do backoffice, com observações
--   3. Confirmação de venda D-1 e D-15 (contados da data da venda)
--   4. Observações do cliente (histórico com data e autor)
--   5. Visão da equipe: vendas detalhadas por vendedor para supervisor e coordenador
-- Rode no banco seven (pgAdmin ou SQL Editor do Supabase), depois dos arquivos 01 a 12.
-- Pode rodar de novo sem problema.
-- =====================================================================
SET search_path = seven, public;

-- ---------------------------------------------------------------------
-- 1. SETOR DO BACKOFFICE
-- ---------------------------------------------------------------------
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS setor text;
ALTER TABLE usuario DROP CONSTRAINT IF EXISTS usuario_setor_check;
ALTER TABLE usuario ADD CONSTRAINT usuario_setor_check CHECK (setor IN ('CADASTRO','QUALIDADE'));
UPDATE usuario SET setor = 'CADASTRO' WHERE perfil_acesso = 'backoffice' AND setor IS NULL;

-- mesma lista da tela "Usuários", agora com o setor no fim
CREATE OR REPLACE VIEW v_agentes_acesso AS
SELECT u.id AS usuario_id, u.login, u.nome_completo, u.email, u.perfil_acesso, u.nivel_vendedor,
       u.ativo AS agente_ativo,
       (c.usuario_id IS NOT NULL)                       AS tem_acesso,
       coalesce(c.ativa, false)                         AS acesso_ativo,
       c.ultimo_login, c.deve_trocar_senha,
       (SELECT string_agg(f.funcao, ', ' ORDER BY f.funcao) FROM usuario_funcao f WHERE f.usuario_id = u.id) AS funcoes,
       coalesce(
         (SELECT e.nome FROM equipe_membro m JOIN equipe e ON e.id = m.equipe_id
           WHERE m.usuario_id = u.id AND m.fim IS NULL ORDER BY m.inicio DESC LIMIT 1),
         (SELECT e.nome FROM contrato k JOIN equipe e ON e.id = k.equipe_id
           WHERE k.vendedor_id = u.id ORDER BY k.data_venda DESC LIMIT 1)) AS equipes,
       (SELECT count(*) FROM contrato k WHERE k.vendedor_id = u.id) AS total_vendas,
       (SELECT m.equipe_id FROM equipe_membro m WHERE m.usuario_id = u.id AND m.fim IS NULL ORDER BY m.inicio DESC LIMIT 1) AS equipe_id,
       u.data_entrada,
       u.setor
FROM usuario u
LEFT JOIN conta_acesso c ON c.usuario_id = u.id;
GRANT SELECT ON v_agentes_acesso TO seven_gestor;

-- ---------------------------------------------------------------------
-- 2. VIABILIDADE
-- O vendedor pede pelo sistema (endereço + CEP); o backoffice de cadastro responde se atende.
-- Linha a linha: o vendedor só enxerga os próprios pedidos (regra no banco, RLS).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viabilidade (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vendedor_id       bigint NOT NULL REFERENCES usuario(id),
    cep               char(8) NOT NULL CHECK (cep ~ '^[0-9]{8}$'),
    logradouro        text NOT NULL CHECK (length(logradouro) BETWEEN 2 AND 200),
    numero            text CHECK (length(numero) <= 20),
    complemento       text CHECK (length(complemento) <= 100),
    bairro            text CHECK (length(bairro) <= 100),
    cidade            text CHECK (length(cidade) <= 100),
    uf                char(2),
    referencia        text CHECK (length(referencia) <= 200),
    cliente_nome      text CHECK (length(cliente_nome) <= 150),
    cliente_contato   text CHECK (length(cliente_contato) <= 40),
    status            text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','EM_ANALISE','ATENDE','NAO_ATENDE')),
    em_analise_por    bigint REFERENCES usuario(id),
    respondido_por    bigint REFERENCES usuario(id),
    respondido_em     timestamptz,
    visto_vendedor_em timestamptz,               -- quando o vendedor abriu a resposta (tira o aviso dele)
    criado_em         timestamptz NOT NULL DEFAULT now(),
    atualizado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_viab_status   ON viabilidade (status, criado_em);
CREATE INDEX IF NOT EXISTS ix_viab_vendedor ON viabilidade (vendedor_id, criado_em DESC);

-- Aba de observações do pedido (vendedor e backoffice escrevem; ninguém edita nem apaga)
CREATE TABLE IF NOT EXISTS viabilidade_obs (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    viabilidade_id  bigint NOT NULL REFERENCES viabilidade(id) ON DELETE CASCADE,
    autor_id        bigint NOT NULL REFERENCES usuario(id),
    texto           text NOT NULL CHECK (length(texto) BETWEEN 1 AND 1000),
    em              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_viab_obs ON viabilidade_obs (viabilidade_id, em);

DROP TRIGGER IF EXISTS viabilidade_atualizado_em ON viabilidade;
CREATE TRIGGER viabilidade_atualizado_em BEFORE UPDATE ON viabilidade FOR EACH ROW EXECUTE FUNCTION trg_atualizado_em();
DROP TRIGGER IF EXISTS trg_log_viabilidade ON viabilidade;
CREATE TRIGGER trg_log_viabilidade AFTER INSERT OR UPDATE OR DELETE ON viabilidade FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();

ALTER TABLE viabilidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE viabilidade_obs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS viab_vendedor ON viabilidade;
CREATE POLICY viab_vendedor ON viabilidade FOR ALL TO seven_vendedor
    USING (vendedor_id = app_usuario_id()) WITH CHECK (vendedor_id = app_usuario_id());
DROP POLICY IF EXISTS viab_staff ON viabilidade;
CREATE POLICY viab_staff ON viabilidade FOR ALL TO seven_gestor, seven_backoffice USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS viab_obs_vendedor ON viabilidade_obs;
CREATE POLICY viab_obs_vendedor ON viabilidade_obs FOR ALL TO seven_vendedor
    USING (EXISTS (SELECT 1 FROM viabilidade v WHERE v.id = viabilidade_id))       -- a RLS de viabilidade já limita ao vendedor
    WITH CHECK (autor_id = app_usuario_id() AND EXISTS (SELECT 1 FROM viabilidade v WHERE v.id = viabilidade_id));
DROP POLICY IF EXISTS viab_obs_staff ON viabilidade_obs;
CREATE POLICY viab_obs_staff ON viabilidade_obs FOR ALL TO seven_gestor, seven_backoffice USING (true) WITH CHECK (true);

REVOKE ALL ON viabilidade, viabilidade_obs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON viabilidade, viabilidade_obs TO seven_gestor;
GRANT SELECT, INSERT, UPDATE ON viabilidade, viabilidade_obs TO seven_backoffice;
GRANT SELECT, INSERT ON viabilidade, viabilidade_obs TO seven_vendedor;
GRANT UPDATE (visto_vendedor_em) ON viabilidade TO seven_vendedor;
GRANT USAGE ON SEQUENCE viabilidade_id_seq, viabilidade_obs_id_seq TO seven_gestor, seven_backoffice, seven_vendedor;
-- nome de quem respondeu / escreveu (o vendedor não tem acesso à tabela de usuários)
GRANT SELECT (id, nome_completo) ON usuario TO seven_vendedor;

-- ---------------------------------------------------------------------
-- 3. CONFIRMAÇÃO DA VENDA: D-1 e D-15 (dias contados da data da venda)
-- Cada ligação vira uma linha; vale a mais recente de cada etapa.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS confirmacao_venda (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contrato_id  bigint NOT NULL REFERENCES contrato(id) ON DELETE CASCADE,
    etapa        text NOT NULL CHECK (etapa IN ('D1','D15')),
    resultado    text NOT NULL CHECK (resultado IN ('CONFIRMADO','NAO_ATENDEU','PROBLEMA')),
    observacao   text CHECK (length(observacao) <= 1000),
    feito_por    bigint REFERENCES usuario(id),
    feito_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_confirmacao ON confirmacao_venda (contrato_id, etapa, feito_em DESC);
DROP TRIGGER IF EXISTS trg_log_confirmacao ON confirmacao_venda;
CREATE TRIGGER trg_log_confirmacao AFTER INSERT OR UPDATE OR DELETE ON confirmacao_venda FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();
REVOKE ALL ON confirmacao_venda FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON confirmacao_venda TO seven_gestor;
GRANT SELECT, INSERT ON confirmacao_venda TO seven_backoffice;
GRANT USAGE ON SEQUENCE confirmacao_venda_id_seq TO seven_gestor, seven_backoffice;

-- ---------------------------------------------------------------------
-- 4. OBSERVAÇÕES DO CLIENTE (histórico: não edita, não apaga)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cliente_observacao (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cliente_id   bigint NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
    contrato_id  bigint REFERENCES contrato(id) ON DELETE SET NULL,   -- venda em que foi escrita (opcional)
    texto        text NOT NULL CHECK (length(texto) BETWEEN 1 AND 2000),
    autor_id     bigint REFERENCES usuario(id),
    em           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_cliente_obs ON cliente_observacao (cliente_id, em DESC);
DROP TRIGGER IF EXISTS trg_log_cliente_obs ON cliente_observacao;
CREATE TRIGGER trg_log_cliente_obs AFTER INSERT OR UPDATE OR DELETE ON cliente_observacao FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();
REVOKE ALL ON cliente_observacao FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON cliente_observacao TO seven_gestor;
GRANT SELECT, INSERT ON cliente_observacao TO seven_backoffice;
GRANT USAGE ON SEQUENCE cliente_observacao_id_seq TO seven_gestor, seven_backoffice;

-- ---------------------------------------------------------------------
-- 5. VISÃO DA EQUIPE (supervisor e acima)
-- Uma linha por venda com os produtos já contados (chips por tipo, DCC, MULTI...).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_vendas_det AS
SELECT b.contrato_id, b.vendedor_id, b.vendedor_nome AS vendedor, b.vendedor_login, b.data_venda, k.data_agendamento, b.status_venda,
       b.tem_bl, b.tem_tv, b.tem_multi, b.pacote_valor, b.equipe_id, b.equipe, b.cidade_id, b.cidade || '/' || b.uf AS cidade,
       b.forma_pagamento, b.tipo_imovel, b.canal, b.origem,
       li.nome_completo AS lider, co.nome_completo AS coordenador,
       coalesce(ch.nova, 0)::int AS chip_nova, coalesce(ch.mig, 0)::int AS chip_mig, coalesce(ch.port, 0)::int AS chip_port,
       EXISTS (SELECT 1 FROM contrato_item i JOIN produto p ON p.id = i.produto_id WHERE i.contrato_id = b.contrato_id AND p.categoria = 'FONE') AS tem_fone
  FROM v_contrato_base b
  JOIN contrato k ON k.id = b.contrato_id
  LEFT JOIN usuario li ON li.id = b.lider_id
  LEFT JOIN usuario co ON co.id = b.coordenador_id
  LEFT JOIN LATERAL (
    SELECT sum(i.quantidade) FILTER (WHERE i.tipo_adesao = 'LINHA_NOVA' OR i.tipo_adesao IS NULL) AS nova,
           sum(i.quantidade) FILTER (WHERE i.tipo_adesao = 'MIGRACAO')      AS mig,
           sum(i.quantidade) FILTER (WHERE i.tipo_adesao = 'PORTABILIDADE') AS port
      FROM contrato_item i JOIN produto p ON p.id = i.produto_id
     WHERE i.contrato_id = b.contrato_id AND p.categoria = 'MOVEL') ch ON true;

-- vendedores ativos com a equipe atual
CREATE OR REPLACE VIEW v_agentes_equipe AS
SELECT u.id, u.nome_completo AS nome, u.login, e.id AS equipe_id, e.nome AS equipe, e.cidade_id, ci.nome || '/' || ci.uf AS cidade,
       li.nome_completo AS lider, co.nome_completo AS coordenador, u.data_entrada
  FROM usuario u
  JOIN equipe_membro m ON m.usuario_id = u.id AND m.fim IS NULL
  JOIN equipe e ON e.id = m.equipe_id AND e.ativa
  LEFT JOIN cidade ci ON ci.id = e.cidade_id
  LEFT JOIN usuario li ON li.id = e.lider_id
  LEFT JOIN usuario co ON co.id = e.coordenador_id
 WHERE u.ativo AND u.perfil_acesso <> 'master'
   AND (u.perfil_acesso = 'vendedor' OR EXISTS (SELECT 1 FROM usuario_funcao f WHERE f.usuario_id = u.id AND f.funcao = 'VENDEDOR'));

-- recorte do supervisor/coordenador (o banco filtra pelas equipes ligadas a ele)
CREATE OR REPLACE VIEW v_eq_vendas_det AS
SELECT * FROM v_vendas_det WHERE equipe_id IN (SELECT app_equipes_visiveis()) OR vendedor_id = app_usuario_id();
CREATE OR REPLACE VIEW v_eq_agentes AS
SELECT * FROM v_agentes_equipe WHERE equipe_id IN (SELECT app_equipes_visiveis());

REVOKE ALL ON v_vendas_det, v_agentes_equipe, v_eq_vendas_det, v_eq_agentes FROM PUBLIC;
GRANT SELECT ON v_vendas_det, v_agentes_equipe TO seven_gestor, seven_backoffice;
GRANT SELECT ON v_eq_vendas_det, v_eq_agentes TO seven_lider, seven_coordenador;

SELECT 'ok' AS melhorias_out2026;
