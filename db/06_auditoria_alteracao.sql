-- =====================================================================
-- Arquivo 6: histórico de alterações (quem mudou o quê) em clientes, contratos e itens
--   backoffice: cria e edita, NÃO apaga  |  gestor (administrador): pode apagar
--   Toda criação, edição e exclusão fica registrada com o valor ANTES e DEPOIS.
-- =====================================================================
SET search_path = seven, public;

CREATE TABLE IF NOT EXISTS alteracao_log (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tabela       text NOT NULL,
    registro_id  bigint NOT NULL,
    acao         text NOT NULL CHECK (acao IN ('INSERT','UPDATE','DELETE')),
    usuario_id   bigint REFERENCES usuario(id),          -- de app.usuario_id (NULL = carga/sistema)
    antes        jsonb,                                  -- só os campos alterados (UPDATE) ou a linha toda (DELETE)
    depois       jsonb,
    em           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_alteracao_reg ON alteracao_log (tabela, registro_id, em DESC);
CREATE INDEX IF NOT EXISTS ix_alteracao_usuario ON alteracao_log (usuario_id, em DESC);

CREATE OR REPLACE FUNCTION trg_alteracao_log() RETURNS trigger AS $$
DECLARE
    v_uid bigint := NULLIF(current_setting('app.usuario_id', true), '')::bigint;
    v_old jsonb; v_new jsonb; v_id bigint;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_id := (to_jsonb(OLD)->>'id')::bigint;
        INSERT INTO alteracao_log (tabela, registro_id, acao, usuario_id, antes) VALUES (TG_TABLE_NAME, v_id, 'DELETE', v_uid, to_jsonb(OLD));
        RETURN OLD;
    ELSIF TG_OP = 'INSERT' THEN
        v_id := (to_jsonb(NEW)->>'id')::bigint;
        INSERT INTO alteracao_log (tabela, registro_id, acao, usuario_id, depois) VALUES (TG_TABLE_NAME, v_id, 'INSERT', v_uid, to_jsonb(NEW));
        RETURN NEW;
    ELSE
        v_id := (to_jsonb(NEW)->>'id')::bigint;
        SELECT jsonb_object_agg(n.key, o.value), jsonb_object_agg(n.key, n.value)
          INTO v_old, v_new
          FROM jsonb_each(to_jsonb(NEW)) n
          JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
         WHERE n.value IS DISTINCT FROM o.value AND n.key NOT IN ('atualizado_em');
        IF v_new IS NOT NULL THEN
            INSERT INTO alteracao_log (tabela, registro_id, acao, usuario_id, antes, depois) VALUES (TG_TABLE_NAME, v_id, 'UPDATE', v_uid, v_old, v_new);
        END IF;
        RETURN NEW;
    END IF;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = seven, public;

DROP TRIGGER IF EXISTS trg_log_cliente ON cliente;
CREATE TRIGGER trg_log_cliente AFTER INSERT OR UPDATE OR DELETE ON cliente FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();
DROP TRIGGER IF EXISTS trg_log_contrato ON contrato;
CREATE TRIGGER trg_log_contrato AFTER INSERT OR UPDATE OR DELETE ON contrato FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();
DROP TRIGGER IF EXISTS trg_log_contrato_item ON contrato_item;
CREATE TRIGGER trg_log_contrato_item AFTER INSERT OR UPDATE OR DELETE ON contrato_item FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();

-- Só o gestor lê o histórico; ninguém edita nem apaga registros dele
REVOKE ALL ON alteracao_log FROM PUBLIC;
GRANT SELECT ON alteracao_log TO seven_gestor;
-- Explícito: o backoffice não apaga nada de negócio
REVOKE DELETE ON cliente, contrato, contrato_item, pendencia, auditoria_evento, agenda_instalacao, fatura, tratativa FROM seven_backoffice;
GRANT DELETE ON cliente, contrato, contrato_item, pendencia, auditoria_evento, agenda_instalacao, fatura, tratativa TO seven_gestor;
