-- =====================================================================
-- Arquivo 4 de 4: perfis de acesso (RBAC no próprio banco)
--
--   gestor      : tudo, inclusive excluir e ver log de acesso
--   backoffice  : ler, criar e editar operação; NÃO exclui nada
--   vendedor    : só lê as views "v_meus_*" (apenas as próprias vendas)
--
-- A API conecta com um usuário técnico e, a cada requisição, faz:
--     BEGIN;
--     SET LOCAL ROLE seven_backoffice;          -- perfil do usuário logado
--     SET LOCAL app.usuario_id = '42';          -- id do usuário (histórico e filtro do vendedor)
--     ... consultas ...
--     COMMIT;
-- Assim, mesmo que a API tenha um erro, o banco recusa o que o perfil não pode.
-- =====================================================================
SET search_path = seven, public;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seven_gestor')     THEN CREATE ROLE seven_gestor     NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seven_backoffice') THEN CREATE ROLE seven_backoffice NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seven_vendedor')   THEN CREATE ROLE seven_vendedor   NOLOGIN; END IF;
END $$;

REVOKE ALL ON SCHEMA seven FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA seven FROM PUBLIC;
GRANT USAGE ON SCHEMA seven TO seven_gestor, seven_backoffice, seven_vendedor;

-- ---------------------------------------------------------------------
-- Views exclusivas do vendedor: filtram pelo id definido na sessão
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_usuario_id() RETURNS bigint AS $$
    SELECT NULLIF(current_setting('app.usuario_id', true), '')::bigint
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE VIEW v_meus_contratos AS
SELECT b.contrato_id, b.numero_contrato, b.data_venda, b.status_venda, b.status_contrato,
       b.origem, b.forma_pagamento, b.pacote_valor, b.cidade, b.bairro,
       b.tem_bl, b.tem_movel, b.tem_tv, b.tem_multi, m.descricao AS motivo
FROM v_contrato_base b
LEFT JOIN motivo m ON m.id = b.motivo_id
WHERE b.vendedor_id = app_usuario_id();

CREATE OR REPLACE VIEW v_minha_pontuacao AS
SELECT * FROM v_pontuacao WHERE vendedor_id = app_usuario_id();

CREATE OR REPLACE VIEW v_meu_desempenho AS
SELECT * FROM v_kpi_vendedor_mensal WHERE vendedor_id = app_usuario_id();

CREATE OR REPLACE VIEW v_meu_fpd AS
SELECT * FROM v_fpd_recorte
WHERE dimensao = 'VENDEDOR'
  AND valor = (SELECT login FROM usuario WHERE id = app_usuario_id());

-- ---------------------------------------------------------------------
-- GESTOR: tudo
-- ---------------------------------------------------------------------
GRANT ALL ON ALL TABLES    IN SCHEMA seven TO seven_gestor;
GRANT ALL ON ALL SEQUENCES IN SCHEMA seven TO seven_gestor;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA seven TO seven_gestor, seven_backoffice, seven_vendedor;

-- ---------------------------------------------------------------------
-- BACKOFFICE: lê tudo da operação, cria e edita, nunca exclui
-- ---------------------------------------------------------------------
GRANT SELECT ON ALL TABLES IN SCHEMA seven TO seven_backoffice;

GRANT INSERT, UPDATE ON
    cliente, contrato, contrato_item, pendencia, auditoria_evento,
    agenda_instalacao, fatura, tratativa, hp_consulta
TO seven_backoffice;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA seven TO seven_backoffice;
-- O histórico de status é gravado por trigger (que roda com o dono da função)
REVOKE SELECT ON log_acesso, importacao_lote FROM seven_backoffice;
GRANT INSERT ON log_acesso TO seven_backoffice, seven_vendedor;
GRANT USAGE ON SEQUENCE log_acesso_id_seq TO seven_backoffice, seven_vendedor;

-- ---------------------------------------------------------------------
-- VENDEDOR: só as views próprias e os catálogos
-- ---------------------------------------------------------------------
GRANT SELECT ON
    v_meus_contratos, v_minha_pontuacao, v_meu_desempenho, v_meu_fpd,
    origem_venda, canal_finalizacao, tipo_contrato, forma_pagamento, turno_agenda,
    status_venda, status_contrato, motivo, produto, cidade
TO seven_vendedor;

-- Funções de trigger precisam gravar o histórico mesmo para perfis sem INSERT direto
ALTER FUNCTION trg_contrato_evento() SECURITY DEFINER SET search_path = seven, public;
