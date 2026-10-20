-- =====================================================================
-- Arquivo 7: rota (acompanhamento de instalações), foto de perfil e vínculo de equipe
-- Pode ser rodado mais de uma vez sem duplicar nada.
-- =====================================================================
SET search_path = seven, public;

-- Foto do perfil (imagem pequena guardada como texto "data:image/jpeg;base64,...")
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS foto text;

-- Rota: quem mexeu por último e quando
ALTER TABLE agenda_instalacao ADD COLUMN IF NOT EXISTS atualizada_em  timestamptz NOT NULL DEFAULT now();
ALTER TABLE agenda_instalacao ADD COLUMN IF NOT EXISTS atualizada_por bigint REFERENCES usuario(id);

CREATE OR REPLACE FUNCTION trg_agenda_carimbo() RETURNS trigger AS $$
BEGIN
    NEW.atualizada_em  := now();
    NEW.atualizada_por := NULLIF(current_setting('app.usuario_id', true), '')::bigint;
    RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_agenda_carimbo ON agenda_instalacao;
CREATE TRIGGER trg_agenda_carimbo BEFORE INSERT OR UPDATE ON agenda_instalacao FOR EACH ROW EXECUTE FUNCTION trg_agenda_carimbo();

-- Histórico de alterações: passa a ignorar a foto (imagem grande) e cobrir mais tabelas
CREATE OR REPLACE FUNCTION trg_alteracao_log() RETURNS trigger AS $$
DECLARE
    v_uid bigint := NULLIF(current_setting('app.usuario_id', true), '')::bigint;
    v_old jsonb; v_new jsonb; v_id bigint;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_id := (to_jsonb(OLD)->>'id')::bigint;
        INSERT INTO alteracao_log (tabela, registro_id, acao, usuario_id, antes) VALUES (TG_TABLE_NAME, v_id, 'DELETE', v_uid, to_jsonb(OLD) - 'foto');
        RETURN OLD;
    ELSIF TG_OP = 'INSERT' THEN
        v_id := (to_jsonb(NEW)->>'id')::bigint;
        INSERT INTO alteracao_log (tabela, registro_id, acao, usuario_id, depois) VALUES (TG_TABLE_NAME, v_id, 'INSERT', v_uid, to_jsonb(NEW) - 'foto');
        RETURN NEW;
    ELSE
        v_id := (to_jsonb(NEW)->>'id')::bigint;
        SELECT jsonb_object_agg(n.key, o.value), jsonb_object_agg(n.key, n.value)
          INTO v_old, v_new
          FROM jsonb_each(to_jsonb(NEW)) n
          JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
         WHERE n.value IS DISTINCT FROM o.value AND n.key NOT IN ('atualizado_em','atualizada_em','foto');
        IF v_new IS NOT NULL THEN
            INSERT INTO alteracao_log (tabela, registro_id, acao, usuario_id, antes, depois) VALUES (TG_TABLE_NAME, v_id, 'UPDATE', v_uid, v_old, v_new);
        END IF;
        RETURN NEW;
    END IF;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = seven, public;

-- ---------------------------------------------------------------------
-- Vínculo de equipe: quem já vendeu recebe a equipe da venda mais recente
-- (só para quem ainda não tem nenhum vínculo)
-- ---------------------------------------------------------------------
INSERT INTO equipe_membro (equipe_id, usuario_id, inicio)
SELECT u_eq.equipe_id, u_eq.vendedor_id, u_eq.inicio
FROM (
    SELECT DISTINCT ON (k.vendedor_id) k.vendedor_id, k.equipe_id,
           (SELECT min(k2.data_venda) FROM contrato k2 WHERE k2.vendedor_id = k.vendedor_id AND k2.equipe_id = k.equipe_id) AS inicio
    FROM contrato k WHERE k.equipe_id IS NOT NULL
    ORDER BY k.vendedor_id, k.data_venda DESC, k.id DESC
) u_eq
WHERE NOT EXISTS (SELECT 1 FROM equipe_membro m WHERE m.usuario_id = u_eq.vendedor_id);

-- ---------------------------------------------------------------------
-- Rota: contratos que já tinham data de agendamento entram na agenda.
--   ATIVO -> INSTALADO | CANCELADO -> CANCELADO | demais -> PENDENTE_INSTALACAO
--   A confirmação fica em branco (a planilha antiga não tem esse dado por contrato).
-- ---------------------------------------------------------------------
INSERT INTO agenda_instalacao (contrato_id, data_rota, turno, situacao)
SELECT k.id, k.data_agendamento, k.turno,
       CASE k.status_venda WHEN 'ATIVO' THEN 'INSTALADO' WHEN 'CANCELADO' THEN 'CANCELADO' ELSE 'PENDENTE_INSTALACAO' END
FROM contrato k
WHERE k.data_agendamento IS NOT NULL
ON CONFLICT (contrato_id, data_rota) DO NOTHING;

-- ---------------------------------------------------------------------
-- Histórico de alterações também para rota, equipes e usuários
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_log_agenda ON agenda_instalacao;
CREATE TRIGGER trg_log_agenda AFTER INSERT OR UPDATE OR DELETE ON agenda_instalacao FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();
DROP TRIGGER IF EXISTS trg_log_equipe_membro ON equipe_membro;
CREATE TRIGGER trg_log_equipe_membro AFTER INSERT OR UPDATE OR DELETE ON equipe_membro FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();
DROP TRIGGER IF EXISTS trg_log_usuario ON usuario;
CREATE TRIGGER trg_log_usuario AFTER INSERT OR UPDATE OR DELETE ON usuario FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();

-- ---------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_rota AS
SELECT a.id AS agenda_id, a.data_rota, a.turno, a.situacao, a.confirmada, a.obs_agenda,
       a.atualizada_em, ub.nome_completo AS atualizada_por_nome,
       k.id AS contrato_id, k.numero_contrato, k.status_venda, k.pacote_valor, k.bairro, k.endereco,
       ci.nome AS cidade, cl.nome AS cliente, cl.contato AS telefone,
       u.nome_completo AS vendedor, e.nome AS equipe
FROM agenda_instalacao a
JOIN contrato k  ON k.id  = a.contrato_id
JOIN cliente cl  ON cl.id = k.cliente_id
JOIN usuario u   ON u.id  = k.vendedor_id
LEFT JOIN cidade ci ON ci.id = k.cidade_id
LEFT JOIN equipe e  ON e.id  = k.equipe_id
LEFT JOIN usuario ub ON ub.id = a.atualizada_por;

-- Lista de agentes: equipe atual = vínculo aberto; se não houver, a da última venda
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
       u.data_entrada
FROM usuario u
LEFT JOIN conta_acesso c ON c.usuario_id = u.id;

REVOKE ALL ON v_rota FROM PUBLIC;
GRANT SELECT ON v_rota TO seven_gestor, seven_backoffice;
GRANT SELECT ON v_agentes_acesso TO seven_gestor;
GRANT ALL ON equipe_membro, usuario_funcao, usuario, equipe TO seven_gestor;
-- O backoffice pode ver equipes e vínculos (para os filtros), nunca alterá-los
GRANT SELECT ON equipe, equipe_membro TO seven_backoffice;
