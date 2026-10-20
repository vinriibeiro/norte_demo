-- Sistema A / Sistema B: o vendedor preenche o formulário no app, a venda cai no backoffice de Cadastro,
-- que responde com um retorno (correção, criação de HP com prazo, pendência ou finalizado).
-- Chat com arquivos e avisos por notificação entram na fase seguinte.
SET search_path = seven, public;

CREATE TABLE IF NOT EXISTS venda_externa (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sistema           text NOT NULL CHECK (sistema IN ('SISTEMA_A','SISTEMA_B')),
    vendedor_id       bigint NOT NULL REFERENCES usuario(id),
    viabilidade_id    bigint REFERENCES viabilidade(id),
    -- Sistema A
    cliente_nome      text CHECK (length(cliente_nome) <= 150),
    codigo_conexao    text CHECK (length(codigo_conexao) <= 60),
    biometria         boolean,
    -- Sistema B
    cpf               char(11) CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
    cidade            text CHECK (length(cidade) <= 100),
    contrato          text CHECK (length(contrato) <= 60),
    produto           text CHECK (length(produto) <= 100),
    valor             numeric(12,2) CHECK (valor IS NULL OR valor >= 0),
    -- comum
    observacao        text CHECK (length(observacao) <= 1000),
    status            text NOT NULL DEFAULT 'PENDENTE_TRATAMENTO'
                      CHECK (status IN ('PENDENTE_TRATAMENTO','ATIVO_SEM_SUCESSO','CRIACAO_HP','PENDENCIA','FINALIZADO')),
    retorno_msg       text CHECK (length(retorno_msg) <= 1000),   -- o que o backoffice escreveu para o vendedor
    prazo_em          timestamptz,                                 -- temporizador (só em Criação de HP)
    respondido_por    bigint REFERENCES usuario(id),
    respondido_em     timestamptz,
    visto_vendedor_em timestamptz,
    criado_em         timestamptz NOT NULL DEFAULT now(),
    atualizado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_venda_externa_status   ON venda_externa (status, criado_em);
CREATE INDEX IF NOT EXISTS ix_venda_externa_vendedor ON venda_externa (vendedor_id, criado_em DESC);

DROP TRIGGER IF EXISTS venda_externa_atualizado_em ON venda_externa;
CREATE TRIGGER venda_externa_atualizado_em BEFORE UPDATE ON venda_externa FOR EACH ROW EXECUTE FUNCTION trg_atualizado_em();
DROP TRIGGER IF EXISTS trg_log_venda_externa ON venda_externa;
CREATE TRIGGER trg_log_venda_externa AFTER INSERT OR UPDATE OR DELETE ON venda_externa FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();

ALTER TABLE venda_externa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vext_vendedor ON venda_externa;
-- o vendedor vê e cria só as próprias; edita enquanto não estiver finalizada
CREATE POLICY vext_vendedor ON venda_externa FOR ALL TO seven_vendedor
    USING (vendedor_id = app_usuario_id()) WITH CHECK (vendedor_id = app_usuario_id());
DROP POLICY IF EXISTS vext_staff ON venda_externa;
CREATE POLICY vext_staff ON venda_externa FOR ALL TO seven_gestor, seven_backoffice USING (true) WITH CHECK (true);

REVOKE ALL ON venda_externa FROM PUBLIC;
-- vendedor: cria e edita só os campos que ele preenche (não mexe em status, prazo ou retorno)
GRANT SELECT, INSERT ON venda_externa TO seven_vendedor;
GRANT UPDATE (cliente_nome, codigo_conexao, biometria, cpf, cidade, contrato, produto, valor, observacao, visto_vendedor_em)
  ON venda_externa TO seven_vendedor;
GRANT SELECT, INSERT, UPDATE ON venda_externa TO seven_gestor, seven_backoffice;
GRANT USAGE ON SEQUENCE venda_externa_id_seq TO seven_vendedor, seven_gestor, seven_backoffice;
-- backoffice não apaga (regra da migração 06)
REVOKE DELETE ON venda_externa FROM seven_backoffice;
