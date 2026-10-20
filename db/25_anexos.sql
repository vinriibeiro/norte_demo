-- Anexos das vendas Sistema A / Sistema B e das viabilidades.
-- O arquivo fica guardado no próprio banco (coluna conteudo). Limite de 10 MB por arquivo.
-- Limpeza e compressão dos arquivos antigos ficam para depois.
SET search_path = seven, public;

CREATE TABLE IF NOT EXISTS anexo (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entidade     text NOT NULL CHECK (entidade IN ('VENDA_EXTERNA','VIABILIDADE')),
    entidade_id  bigint NOT NULL,
    conteudo     bytea NOT NULL,                         -- o arquivo em si (listagens nunca trazem esta coluna)
    nome         text NOT NULL CHECK (length(nome) BETWEEN 1 AND 200),
    tipo         text NOT NULL CHECK (length(tipo) <= 100),
    tamanho      integer NOT NULL CHECK (tamanho > 0 AND tamanho <= 10485760),
    enviado_por  bigint NOT NULL REFERENCES usuario(id),
    criado_em    timestamptz NOT NULL DEFAULT now(),
    removido_em  timestamptz                             -- remoção lógica (o conteúdo sai numa limpeza futura)
);
CREATE INDEX IF NOT EXISTS ix_anexo_entidade ON anexo (entidade, entidade_id);

ALTER TABLE anexo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anexo_vendedor ON anexo;
-- o vendedor só vê e envia anexo da própria venda ou da própria viabilidade (as tabelas de origem já filtram por vendedor)
CREATE POLICY anexo_vendedor ON anexo FOR ALL TO seven_vendedor
    USING (enviado_por IS NOT NULL AND (
            (entidade = 'VENDA_EXTERNA' AND EXISTS (SELECT 1 FROM venda_externa v WHERE v.id = entidade_id))
         OR (entidade = 'VIABILIDADE'   AND EXISTS (SELECT 1 FROM viabilidade x WHERE x.id = entidade_id))))
    WITH CHECK (enviado_por = app_usuario_id() AND (
            (entidade = 'VENDA_EXTERNA' AND EXISTS (SELECT 1 FROM venda_externa v WHERE v.id = entidade_id))
         OR (entidade = 'VIABILIDADE'   AND EXISTS (SELECT 1 FROM viabilidade x WHERE x.id = entidade_id))));
DROP POLICY IF EXISTS anexo_staff ON anexo;
CREATE POLICY anexo_staff ON anexo FOR ALL TO seven_gestor, seven_backoffice USING (true) WITH CHECK (true);

REVOKE ALL ON anexo FROM PUBLIC;
GRANT SELECT, INSERT ON anexo TO seven_vendedor;
GRANT SELECT, INSERT ON anexo TO seven_backoffice;
GRANT SELECT, INSERT, UPDATE ON anexo TO seven_gestor;
GRANT UPDATE (removido_em) ON anexo TO seven_gestor;
GRANT USAGE ON SEQUENCE anexo_id_seq TO seven_vendedor, seven_backoffice, seven_gestor;
