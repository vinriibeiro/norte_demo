-- =====================================================================
-- NORTE LINK  |  Banco de dados  |  PostgreSQL 14+
-- Arquivo 1 de 4: estrutura (schema, tabelas, índices, triggers)
-- Ordem de execução: 01_schema.sql -> 02_seed.sql -> 03_views_kpi.sql -> 04_acesso.sql
-- =====================================================================
-- Princípios do modelo
--  1. Nada de texto livre onde há lista fechada: tudo que era digitado nas
--     planilhas (status, origem, plano, motivo, equipe) vira catálogo com chave.
--  2. Histórico: toda mudança de status do contrato vira um evento (trigger).
--  3. A equipe é gravada NA VENDA (foto do momento), para o resultado não
--     mudar de dono quando o vendedor troca de time.
--  4. Dados pessoais ficam na tabela cliente, separada, com acesso mascarado.
--  5. Todo cálculo (FPD, pontos, atingimento) é view, nunca fórmula de célula.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS seven;
SET search_path = seven, public;

-- ---------------------------------------------------------------------
-- 1. CATÁLOGOS (listas fechadas, editáveis pelo gestor)
-- ---------------------------------------------------------------------

CREATE TABLE origem_venda (
    codigo      text PRIMARY KEY,               -- PAP, INDICAÇÃO, REDE SOCIAL
    descricao   text
);

CREATE TABLE canal_finalizacao (
    codigo      text PRIMARY KEY,               -- SISTEMA_C, SISTEMA_B
    descricao   text
);

CREATE TABLE tipo_contrato (
    codigo      text PRIMARY KEY,               -- PROSPECT, BASE
    descricao   text
);

CREATE TABLE forma_pagamento (
    codigo      text PRIMARY KEY,               -- BOLETO, DCC
    descricao   text,
    recorrente  boolean NOT NULL DEFAULT false
);

CREATE TABLE turno_agenda (
    codigo      text PRIMARY KEY,               -- '08:00 AS 12:00'
    hora_inicio time NOT NULL,
    hora_fim    time NOT NULL
);

-- Status comercial da venda (aba VENDAS): ATIVO / PENDENTE / CANCELADO
CREATE TABLE status_venda (
    codigo      text PRIMARY KEY,
    descricao   text,
    conta_como_conectado boolean NOT NULL DEFAULT false
);

-- Status do contrato depois de instalado (abas de Qualidade)
CREATE TABLE status_contrato (
    codigo      text PRIMARY KEY,               -- CONECTADO, DESABILITADO, ...
    descricao   text,
    e_churn     boolean NOT NULL DEFAULT false
);

-- Motivos: códigos da operadora (1xx, 2xx, 3xx, 4xx) e motivos de pendência
CREATE TABLE motivo (
    id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      text UNIQUE,                    -- '402', '106', ...
    descricao   text NOT NULL,
    categoria   text NOT NULL CHECK (categoria IN
                ('CADASTRO','CONFIRMACAO','CLIENTE','INFRAESTRUTURA','OUTRO')),
    evitavel    boolean NOT NULL DEFAULT false, -- a gestão consegue evitar?
    ativo       boolean NOT NULL DEFAULT true
);

-- Produtos e planos. O "fator" alimenta a pontuação (preencher com a Norte Link).
CREATE TABLE produto (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    categoria       text NOT NULL CHECK (categoria IN
                    ('TV','FIBRA','FONE','MOVEL','MESH','PONTO_ADICIONAL','STREAMING')),
    nome            text NOT NULL,
    velocidade_mb   integer,                    -- só FIBRA
    franquia_gb     integer,                    -- só MOVEL
    tipo_movel      text CHECK (tipo_movel IN ('CONTROLE','POS')),
    preco_referencia numeric(10,2),
    fator_pontos    numeric(6,2),
    ativo           boolean NOT NULL DEFAULT true,
    UNIQUE (categoria, nome)
);

-- ---------------------------------------------------------------------
-- 2. GEOGRAFIA
-- ---------------------------------------------------------------------

CREATE TABLE cidade (
    id      integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uf      char(2) NOT NULL,
    nome    text NOT NULL,
    UNIQUE (uf, nome)
);

-- ---------------------------------------------------------------------
-- 3. PESSOAS, PERFIS E EQUIPES
-- ---------------------------------------------------------------------

CREATE TABLE usuario (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    login           text NOT NULL UNIQUE,       -- 'pedro.henrique'
    nome_completo   text NOT NULL,
    email           text UNIQUE,
    auth_id         uuid UNIQUE,                -- id no provedor de login (ex.: Supabase)
    perfil_acesso   text NOT NULL CHECK (perfil_acesso IN ('gestor','backoffice','vendedor')),
    nivel_vendedor  text CHECK (nivel_vendedor IN ('START','PULSE')),  -- hipótese: validar
    ativo           boolean NOT NULL DEFAULT true,
    data_entrada    date,
    data_saida      date,
    criado_em       timestamptz NOT NULL DEFAULT now()
);

-- Uma pessoa pode ter vários papéis (ex.: vendedor e backoffice)
CREATE TABLE usuario_funcao (
    usuario_id  bigint NOT NULL REFERENCES usuario(id),
    funcao      text NOT NULL CHECK (funcao IN
                ('VENDEDOR','LIDER','COORDENADOR','BACKOFFICE','COBRANCA','POS_VENDA','GESTOR')),
    PRIMARY KEY (usuario_id, funcao)
);

CREATE TABLE equipe (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome            text NOT NULL UNIQUE,       -- ex.: 'EQUIPE CENTRO', 'EQUIPE NORTE'
    cidade_id       integer REFERENCES cidade(id),
    lider_id        bigint REFERENCES usuario(id),
    coordenador_id  bigint REFERENCES usuario(id),
    ativa           boolean NOT NULL DEFAULT true
);

-- Quem estava em qual equipe e quando (histórico)
CREATE TABLE equipe_membro (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    equipe_id   integer NOT NULL REFERENCES equipe(id),
    usuario_id  bigint  NOT NULL REFERENCES usuario(id),
    inicio      date NOT NULL,
    fim         date,
    CHECK (fim IS NULL OR fim >= inicio)
);
CREATE INDEX ix_equipe_membro_usuario ON equipe_membro (usuario_id, inicio);

-- ---------------------------------------------------------------------
-- 4. CLIENTE (dados pessoais, acesso restrito e mascarado)
-- ---------------------------------------------------------------------

CREATE TABLE cliente (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_pessoa     text NOT NULL CHECK (tipo_pessoa IN ('CPF','CNPJ')),
    documento       text,                       -- só dígitos
    nome            text NOT NULL,
    data_nascimento date,
    contato         text,
    contato_2       text,
    criado_em       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tipo_pessoa, documento),
    CHECK (documento ~ '^[0-9]+$')
);

-- ---------------------------------------------------------------------
-- 5. CONTRATO (a venda)  -- grão: um contrato Operadora
-- ---------------------------------------------------------------------

CREATE TABLE contrato (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero_contrato     text,                   -- número no sistema operadora
    sistema_origem      text NOT NULL DEFAULT 'NORTE',
    cliente_id          bigint NOT NULL REFERENCES cliente(id),
    vendedor_id         bigint NOT NULL REFERENCES usuario(id),
    equipe_id           integer REFERENCES equipe(id),      -- foto da equipe na data da venda
    backoffice_id       bigint REFERENCES usuario(id),
    data_venda          date NOT NULL,
    origem              text REFERENCES origem_venda(codigo),
    canal               text REFERENCES canal_finalizacao(codigo),
    tipo_contrato       text REFERENCES tipo_contrato(codigo),
    forma_pagamento     text REFERENCES forma_pagamento(codigo),
    dia_vencimento      smallint CHECK (dia_vencimento BETWEEN 1 AND 31),
    status_venda        text NOT NULL REFERENCES status_venda(codigo),
    status_contrato     text REFERENCES status_contrato(codigo),
    motivo_id           smallint REFERENCES motivo(id),     -- motivo de cancelamento/pendência
    -- endereço da instalação
    cidade_id           integer REFERENCES cidade(id),
    bairro              text,
    endereco            text,
    tipo_imovel         text CHECK (tipo_imovel IN ('CASA','APT','LOJA')),
    -- agenda atual (o histórico fica em agenda_instalacao)
    data_agendamento    date,
    turno               text REFERENCES turno_agenda(codigo),
    -- financeiro
    pacote_valor        numeric(10,2) CHECK (pacote_valor >= 0),
    -- qualidade da venda
    auditoria           text CHECK (auditoria IN ('AUDITADA','NAO_AUDITADA')),
    observacao          text,
    data_base_qualidade date,                   -- "DATA BASE" da aba de qualidade
    criado_em           timestamptz NOT NULL DEFAULT now(),
    atualizado_em       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sistema_origem, numero_contrato)
);
CREATE INDEX ix_contrato_data      ON contrato (data_venda);
CREATE INDEX ix_contrato_vendedor  ON contrato (vendedor_id, data_venda);
CREATE INDEX ix_contrato_equipe    ON contrato (equipe_id, data_venda);
CREATE INDEX ix_contrato_cidade    ON contrato (cidade_id);
CREATE INDEX ix_contrato_status    ON contrato (status_venda, status_contrato);
CREATE INDEX ix_contrato_cliente   ON contrato (cliente_id);

-- Itens do contrato: cada produto vendido (BL, TV, fone, móvel, mesh...)
CREATE TABLE contrato_item (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contrato_id     bigint NOT NULL REFERENCES contrato(id) ON DELETE CASCADE,
    produto_id      integer NOT NULL REFERENCES produto(id),
    quantidade      smallint NOT NULL DEFAULT 1 CHECK (quantidade > 0),
    tipo_adesao     text CHECK (tipo_adesao IN ('LINHA_NOVA','PORTABILIDADE','MIGRACAO')),
    codigo_chip     text,
    chip_ativo      boolean,
    UNIQUE (contrato_id, produto_id)
);
CREATE INDEX ix_item_produto ON contrato_item (produto_id);

-- Histórico de status (alimentado por trigger; nunca editado à mão)
CREATE TABLE contrato_status_evento (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contrato_id     bigint NOT NULL REFERENCES contrato(id) ON DELETE CASCADE,
    status_venda    text,
    status_contrato text,
    motivo_id       smallint REFERENCES motivo(id),
    usuario_id      bigint REFERENCES usuario(id),
    ocorrido_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_evento_contrato ON contrato_status_evento (contrato_id, ocorrido_em);

-- ---------------------------------------------------------------------
-- 6. FILA DE TRABALHO DO BACKOFFICE
-- ---------------------------------------------------------------------

-- Cobre "Cadastros em andamento", "Pendências" e "Chip pendente de ativação"
CREATE TABLE pendencia (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo            text NOT NULL CHECK (tipo IN ('CADASTRO_ANDAMENTO','PENDENCIA','CHIP_PENDENTE')),
    contrato_id     bigint REFERENCES contrato(id),
    data_abertura   date NOT NULL DEFAULT current_date,
    vendedor_id     bigint REFERENCES usuario(id),
    backoffice_id   bigint REFERENCES usuario(id),
    origem          text REFERENCES origem_venda(codigo),
    cliente_nome    text,                        -- cliente ainda sem cadastro completo
    proposta        text,
    hp              text,
    hora_biometria  timestamptz,
    motivo_id       smallint REFERENCES motivo(id),
    descricao       text,
    aberta          boolean NOT NULL DEFAULT true,
    resolvida_em    timestamptz,
    CHECK (aberta OR resolvida_em IS NOT NULL)
);
CREATE INDEX ix_pendencia_aberta ON pendencia (aberta, data_abertura);
CREATE INDEX ix_pendencia_vendedor ON pendencia (vendedor_id);

CREATE TABLE auditoria_evento (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contrato_id     bigint REFERENCES contrato(id),
    pendencia_id    bigint REFERENCES pendencia(id),
    resultado       text NOT NULL CHECK (resultado IN ('APROVADA','REPROVADA','PENDENTE')),
    usuario_id      bigint REFERENCES usuario(id),
    ocorrido_em     timestamptz NOT NULL DEFAULT now(),
    observacao      text,
    CHECK (contrato_id IS NOT NULL OR pendencia_id IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- 7. ROTA / AGENDA DE INSTALAÇÃO  -- grão: contrato x dia
-- ---------------------------------------------------------------------

CREATE TABLE agenda_instalacao (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contrato_id         bigint NOT NULL REFERENCES contrato(id) ON DELETE CASCADE,
    data_rota           date NOT NULL,
    turno               text REFERENCES turno_agenda(codigo),
    situacao            text NOT NULL DEFAULT 'PENDENTE_INSTALACAO'
                        CHECK (situacao IN ('PENDENTE_INSTALACAO','INSTALADO','CANCELADO',
                                            'REAGENDADO','CLIENTE_AUSENTE')),
    confirmada          boolean,                 -- confirmou por WhatsApp?
    obs_agenda          text,                    -- 'TUDO OK', 'SEM CONFIRMAÇÃO'
    bko_confirmacao_id  bigint REFERENCES usuario(id),
    bko_tratativa_id    bigint REFERENCES usuario(id),
    motivo_id           smallint REFERENCES motivo(id),
    nota_satisfacao     smallint CHECK (nota_satisfacao BETWEEN 0 AND 10),
    d15_tratado         boolean,
    UNIQUE (contrato_id, data_rota)
);
CREATE INDEX ix_agenda_data ON agenda_instalacao (data_rota, situacao);

-- ---------------------------------------------------------------------
-- 8. QUALIDADE: FATURA, COBRANÇA, CHURN
-- ---------------------------------------------------------------------

-- FPD sai daqui (view v_fatura_fpd). numero 1 = primeira fatura.
CREATE TABLE fatura (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contrato_id     bigint NOT NULL REFERENCES contrato(id) ON DELETE CASCADE,
    numero          smallint NOT NULL CHECK (numero >= 1),
    vencimento      date NOT NULL,
    prazo_limite    date,                        -- "PRAZO OPERADORA": limite antes de virar inadimplente
    valor           numeric(10,2),
    data_pagamento  date,
    UNIQUE (contrato_id, numero),
    CHECK (prazo_limite IS NULL OR prazo_limite >= vencimento)
);
CREATE INDEX ix_fatura_venc ON fatura (vencimento) WHERE data_pagamento IS NULL;

CREATE TABLE tratativa (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contrato_id     bigint NOT NULL REFERENCES contrato(id) ON DELETE CASCADE,
    tipo            text NOT NULL CHECK (tipo IN ('COBRANCA','CHURN')),
    resultado       text,        -- CLIENTE EM DIA, FATURA ENVIADA, CLIENTE VAI PAGAR, CHURN OK, ...
    com_oferta      boolean,
    usuario_id      bigint REFERENCES usuario(id),
    ocorrido_em     timestamptz NOT NULL DEFAULT now(),
    observacao      text
);
CREATE INDEX ix_tratativa_contrato ON tratativa (contrato_id, ocorrido_em);

-- ---------------------------------------------------------------------
-- 9. METAS
-- ---------------------------------------------------------------------

CREATE TABLE meta (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    competencia     date NOT NULL CHECK (competencia = date_trunc('month', competencia)::date),
    indicador       text NOT NULL CHECK (indicador IN ('BL','ND','FPD_MAX','HC','PRODUTOS')),
    usuario_id      bigint REFERENCES usuario(id),
    equipe_id       integer REFERENCES equipe(id),
    valor           numeric(10,2) NOT NULL,
    CHECK ((usuario_id IS NOT NULL)::int + (equipe_id IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX ux_meta_usuario ON meta (competencia, indicador, usuario_id) WHERE usuario_id IS NOT NULL;
CREATE UNIQUE INDEX ux_meta_equipe  ON meta (competencia, indicador, equipe_id)  WHERE equipe_id  IS NOT NULL;

-- Parâmetros de regra (ex.: BL por HC do líder = 13, do coordenador = 12, mínimo do supervisor = 52)
CREATE TABLE parametro (
    chave       text PRIMARY KEY,
    valor       numeric NOT NULL,
    descricao   text
);

-- ---------------------------------------------------------------------
-- 10. VIABILIDADE (HP)
-- ---------------------------------------------------------------------

CREATE TABLE hp_consulta (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    data_consulta   date NOT NULL,
    hp              text NOT NULL,
    endereco        text,
    cidade_id       integer REFERENCES cidade(id),
    status          text NOT NULL CHECK (status IN ('LIBERADO','EM_ANALISE','HP_APAGOU')),
    vendedor_id     bigint REFERENCES usuario(id)
);
CREATE INDEX ix_hp_data ON hp_consulta (data_consulta);

-- ---------------------------------------------------------------------
-- 11. AUDITORIA DE ACESSO (LGPD) E CONTROLE DE IMPORTAÇÃO
-- ---------------------------------------------------------------------

CREATE TABLE log_acesso (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id  bigint REFERENCES usuario(id),
    acao        text NOT NULL,                   -- VISUALIZOU, EDITOU, EXCLUIU, EXPORTOU
    tabela      text NOT NULL,
    registro_id bigint,
    ip          inet,
    ocorrido_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_log_usuario ON log_acesso (usuario_id, ocorrido_em);

CREATE TABLE importacao_lote (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    arquivo         text NOT NULL,
    aba             text,
    linhas_lidas    integer,
    linhas_gravadas integer,
    linhas_rejeitadas integer,
    importado_em    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 12. TRIGGERS
-- ---------------------------------------------------------------------

-- atualizado_em
CREATE OR REPLACE FUNCTION trg_atualizado_em() RETURNS trigger AS $$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER contrato_atualizado_em
    BEFORE UPDATE ON contrato
    FOR EACH ROW EXECUTE FUNCTION trg_atualizado_em();

-- Histórico de status: grava um evento na criação e a cada mudança.
-- O usuário que alterou vem de SET LOCAL app.usuario_id = '<id>' (a API define).
CREATE OR REPLACE FUNCTION trg_contrato_evento() RETURNS trigger AS $$
DECLARE
    v_usuario bigint := NULLIF(current_setting('app.usuario_id', true), '')::bigint;
BEGIN
    IF TG_OP = 'INSERT'
       OR NEW.status_venda    IS DISTINCT FROM OLD.status_venda
       OR NEW.status_contrato IS DISTINCT FROM OLD.status_contrato
       OR NEW.motivo_id       IS DISTINCT FROM OLD.motivo_id THEN
        INSERT INTO contrato_status_evento
               (contrato_id, status_venda, status_contrato, motivo_id, usuario_id)
        VALUES (NEW.id, NEW.status_venda, NEW.status_contrato, NEW.motivo_id, v_usuario);
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER contrato_evento
    AFTER INSERT OR UPDATE ON contrato
    FOR EACH ROW EXECUTE FUNCTION trg_contrato_evento();

-- Impede vincular contrato a vendedor que não tenha função VENDEDOR
CREATE OR REPLACE FUNCTION trg_contrato_valida_vendedor() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM usuario_funcao
                    WHERE usuario_id = NEW.vendedor_id AND funcao = 'VENDEDOR') THEN
        RAISE EXCEPTION 'Usuário % não tem a função VENDEDOR', NEW.vendedor_id;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER contrato_valida_vendedor
    BEFORE INSERT OR UPDATE OF vendedor_id ON contrato
    FOR EACH ROW EXECUTE FUNCTION trg_contrato_valida_vendedor();
