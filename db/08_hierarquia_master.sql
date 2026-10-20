-- =====================================================================
-- Arquivo 8: hierarquia de visão (líder, coordenador) e usuário master
--   vendedor    : só as próprias vendas e números
--   lider       : as vendas das equipes em que ele é líder (mais as dele)
--   coordenador : as vendas das equipes sob a coordenação dele (mais as dele)
--   backoffice  : vê tudo; cria e edita, não apaga
--   gestor      : vê e administra tudo
--   master      : desenvolvedor; igual ao gestor, mas invisível para os demais
-- Pode ser executado mais de uma vez sem problema.
-- =====================================================================
SET search_path = seven, public;

ALTER TABLE usuario DROP CONSTRAINT IF EXISTS usuario_perfil_acesso_check;
ALTER TABLE usuario ADD CONSTRAINT usuario_perfil_acesso_check
    CHECK (perfil_acesso IN ('master','gestor','coordenador','lider','backoffice','vendedor'));

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seven_lider')       THEN CREATE ROLE seven_lider       NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seven_coordenador') THEN CREATE ROLE seven_coordenador NOLOGIN; END IF;
END $$;

-- equipes que o usuário logado enxerga (líder ou coordenador)
CREATE OR REPLACE FUNCTION app_equipes_visiveis() RETURNS SETOF integer AS $$
    SELECT id FROM equipe WHERE lider_id = app_usuario_id() OR coordenador_id = app_usuario_id()
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = seven, public;

-- vendas da equipe (ou coordenação) + as próprias
CREATE OR REPLACE VIEW v_eq_contratos AS
SELECT b.contrato_id, b.numero_contrato, b.data_venda, b.status_venda, b.status_contrato,
       b.origem, b.forma_pagamento, b.pacote_valor, b.cidade, b.bairro,
       b.vendedor_id, b.vendedor_nome AS vendedor, b.equipe_id, b.equipe,
       cl.nome AS cliente, m.descricao AS motivo
  FROM v_contrato_base b
  JOIN contrato k  ON k.id = b.contrato_id
  JOIN cliente cl  ON cl.id = k.cliente_id
  LEFT JOIN motivo m ON m.id = b.motivo_id
 WHERE b.equipe_id IN (SELECT app_equipes_visiveis()) OR b.vendedor_id = app_usuario_id();

CREATE OR REPLACE VIEW v_eq_desempenho AS
SELECT * FROM v_kpi_vendedor_mensal
 WHERE equipe_id IN (SELECT app_equipes_visiveis()) OR vendedor_id = app_usuario_id();

CREATE OR REPLACE VIEW v_eq_fpd AS
SELECT * FROM v_fpd_recorte
 WHERE dimensao = 'VENDEDOR'
   AND valor IN (SELECT u.login FROM usuario u
                  WHERE u.id = app_usuario_id()
                     OR u.id IN (SELECT DISTINCT vendedor_id FROM v_contrato_base WHERE equipe_id IN (SELECT app_equipes_visiveis())));

REVOKE ALL ON SCHEMA seven FROM seven_lider, seven_coordenador;
GRANT USAGE ON SCHEMA seven TO seven_lider, seven_coordenador;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA seven TO seven_lider, seven_coordenador;
GRANT SELECT ON v_eq_contratos, v_eq_desempenho, v_eq_fpd,
    origem_venda, canal_finalizacao, tipo_contrato, forma_pagamento, turno_agenda,
    status_venda, status_contrato, motivo, produto, cidade
  TO seven_lider, seven_coordenador;
GRANT INSERT ON log_acesso TO seven_lider, seven_coordenador;
GRANT USAGE ON SEQUENCE log_acesso_id_seq TO seven_lider, seven_coordenador;

-- mudanças em equipes (líder/coordenador) entram no histórico
DROP TRIGGER IF EXISTS trg_log_equipe ON equipe;
CREATE TRIGGER trg_log_equipe AFTER INSERT OR UPDATE OR DELETE ON equipe FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();
