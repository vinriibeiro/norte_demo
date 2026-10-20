-- Chat da venda Sistema A / Sistema B: conversa entre o vendedor e o backoffice de Cadastro (e o gerente).
-- Não apaga mensagens (ninguém tem DELETE).
SET search_path = seven, public;

CREATE TABLE IF NOT EXISTS venda_externa_obs (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venda_id   bigint NOT NULL REFERENCES venda_externa(id),
    autor_id   bigint NOT NULL REFERENCES usuario(id),
    texto      text NOT NULL CHECK (length(texto) BETWEEN 1 AND 1000),
    em         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_vext_obs ON venda_externa_obs (venda_id, em);

ALTER TABLE venda_externa_obs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vext_obs_vendedor ON venda_externa_obs;
-- o vendedor lê e escreve só nas conversas das próprias vendas (a RLS de venda_externa já limita)
CREATE POLICY vext_obs_vendedor ON venda_externa_obs FOR ALL TO seven_vendedor
    USING (EXISTS (SELECT 1 FROM venda_externa v WHERE v.id = venda_id))
    WITH CHECK (autor_id = app_usuario_id() AND EXISTS (SELECT 1 FROM venda_externa v WHERE v.id = venda_id));
DROP POLICY IF EXISTS vext_obs_staff ON venda_externa_obs;
CREATE POLICY vext_obs_staff ON venda_externa_obs FOR ALL TO seven_gestor, seven_backoffice USING (true) WITH CHECK (true);

REVOKE ALL ON venda_externa_obs FROM PUBLIC;
GRANT SELECT, INSERT ON venda_externa_obs TO seven_vendedor, seven_backoffice, seven_gestor;
GRANT USAGE ON SEQUENCE venda_externa_obs_id_seq TO seven_vendedor, seven_backoffice, seven_gestor;
