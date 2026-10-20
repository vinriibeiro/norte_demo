-- Pendências: editar e excluir.
-- Exclusão é lógica: a linha continua no banco (auditoria) e some das telas e da view de abertas.
-- O backoffice continua sem DELETE de verdade (regra da migração 06).
SET search_path = seven, public;

ALTER TABLE pendencia
  ADD COLUMN IF NOT EXISTS excluida_em  timestamptz,
  ADD COLUMN IF NOT EXISTS excluida_por bigint REFERENCES usuario(id);

GRANT UPDATE (tipo, cliente_nome, proposta, hp, descricao, aberta, resolvida_em, excluida_em, excluida_por)
  ON pendencia TO seven_backoffice;

CREATE OR REPLACE VIEW v_pendencias_abertas AS     -- F02, F03, F05, P13
SELECT
    p.id, p.tipo, p.data_abertura,
    current_date - p.data_abertura            AS dias_aberta,
    u.login                                   AS vendedor,
    m.descricao                               AS motivo,
    p.descricao,
    EXISTS (SELECT 1 FROM auditoria_evento a WHERE a.pendencia_id = p.id) AS tem_auditoria
FROM pendencia p
LEFT JOIN usuario u ON u.id = p.vendedor_id
LEFT JOIN motivo  m ON m.id = p.motivo_id
WHERE p.aberta AND p.excluida_em IS NULL;
