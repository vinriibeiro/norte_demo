-- =====================================================================
-- Arquivo 9: comissão (plano do mês, tabela de valores, ajustes por pessoa)
-- Modelo lido das tabelas da operadora/Norte Link: Faixa 1 (FPD > 25%) e Faixa 2 (FPD <= 25%).
-- Rode no pgAdmin (banco seven). Pode rodar de novo sem problema.
-- =====================================================================
SET search_path = seven, public;

CREATE TABLE IF NOT EXISTS comissao_plano (
    id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mes                date NOT NULL UNIQUE CHECK (mes = date_trunc('month', mes)::date),
    meta_bl            integer NOT NULL DEFAULT 13,      -- banda larga mínima por vendedor (líder: x HC)
    meta_chip          integer NOT NULL DEFAULT 3,       -- chips (migração ou portabilidade) mínimos por vendedor
    fpd_faixa          numeric(5,4) NOT NULL DEFAULT 0.25,  -- FPD <= isto => Faixa 2
    fpd_inelegivel     numeric(5,4) NOT NULL DEFAULT 0.40,  -- FPD >= isto => sem comissão
    fpd_bonus_a        numeric(5,4) NOT NULL DEFAULT 0.15,  -- bônus FPD (vendedor e líder)
    fpd_bonus_b        numeric(5,4) NOT NULL DEFAULT 0.18,  -- bônus FPD menor (só líder)
    dcc_pct_lider      numeric(5,4) NOT NULL DEFAULT 0.30,  -- % de DCC na equipe para o bônus do líder
    bl_bonus_vendedor  integer NOT NULL DEFAULT 20,      -- BL do vendedor para render bônus ao líder
    min_contratos_fpd  integer NOT NULL DEFAULT 12,      -- mínimo de BL com FPD apurado p/ bônus FPD do vendedor
    meses_so_faixa1    integer NOT NULL DEFAULT 3,       -- meses de casa que só recebem Faixa 1
    fechado            boolean NOT NULL DEFAULT false,   -- plano travado (não edita mais)
    observacao         text,
    criado_em          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comissao_tabela (
    id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plano_id  integer NOT NULL REFERENCES comissao_plano(id) ON DELETE CASCADE,
    papel     text NOT NULL CHECK (papel IN ('VENDEDOR','LIDER')),
    item      text NOT NULL,      -- BL, STREAMING, MDU, TV, TV_PLUS, CHIP_NOVA, CHIP_MIGRACAO, CHIP_PORT, DCC, BONUS_*
    faixa1    numeric(10,2) NOT NULL DEFAULT 0,
    faixa2    numeric(10,2) NOT NULL DEFAULT 0,   -- nos BONUS_* este é o valor do bônus
    UNIQUE (plano_id, papel, item)
);

-- Ajustes de quem está acima (líder ajusta vendedor, coordenador ajusta líder)
CREATE TABLE IF NOT EXISTS comissao_pessoa (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mes         date NOT NULL CHECK (mes = date_trunc('month', mes)::date),
    usuario_id  bigint NOT NULL REFERENCES usuario(id),
    papel       text NOT NULL CHECK (papel IN ('VENDEDOR','LIDER')),
    meta_bl     integer,                          -- vazio = usa a meta do plano
    meta_chip   integer,
    pap_ok      boolean NOT NULL DEFAULT true,    -- PAP Tools: 10 visitas/dia com registro completo
    ajuste      numeric(10,2) NOT NULL DEFAULT 0, -- + ou - em R$
    motivo      text,
    atualizado_por bigint REFERENCES usuario(id),
    UNIQUE (mes, usuario_id, papel)
);

DROP TRIGGER IF EXISTS trg_log_comissao_plano ON comissao_plano;
CREATE TRIGGER trg_log_comissao_plano AFTER INSERT OR UPDATE OR DELETE ON comissao_plano FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();
DROP TRIGGER IF EXISTS trg_log_comissao_tabela ON comissao_tabela;
CREATE TRIGGER trg_log_comissao_tabela AFTER INSERT OR UPDATE OR DELETE ON comissao_tabela FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();
DROP TRIGGER IF EXISTS trg_log_comissao_pessoa ON comissao_pessoa;
CREATE TRIGGER trg_log_comissao_pessoa AFTER INSERT OR UPDATE OR DELETE ON comissao_pessoa FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();

-- Só a API (usuário técnico) mexe nessas tabelas; as regras de quem vê/edita ficam na API.
REVOKE ALL ON comissao_plano, comissao_tabela, comissao_pessoa FROM PUBLIC;

-- Planos de setembro e outubro/2026 já com os valores das tabelas recebidas
INSERT INTO comissao_plano (mes) VALUES ('2026-09-01'), ('2026-10-01') ON CONFLICT (mes) DO NOTHING;

INSERT INTO comissao_tabela (plano_id, papel, item, faixa1, faixa2)
SELECT p.id, v.papel, v.item, v.f1, v.f2
FROM comissao_plano p
CROSS JOIN (VALUES
 ('VENDEDOR','BL',25,50), ('VENDEDOR','STREAMING',15,30), ('VENDEDOR','MDU',15,30),
 ('VENDEDOR','TV',10,20), ('VENDEDOR','TV_PLUS',25,50),
 ('VENDEDOR','CHIP_NOVA',5,15), ('VENDEDOR','CHIP_MIGRACAO',25,50), ('VENDEDOR','CHIP_PORT',25,50),
 ('VENDEDOR','DCC',10,15), ('VENDEDOR','BONUS_FPD_A',0,300),
 ('LIDER','BL',7.5,15), ('LIDER','STREAMING',5,10), ('LIDER','MDU',7.5,15),
 ('LIDER','TV',5,10), ('LIDER','TV_PLUS',10,20),
 ('LIDER','CHIP_NOVA',2.5,5), ('LIDER','CHIP_MIGRACAO',10,20), ('LIDER','CHIP_PORT',10,20),
 ('LIDER','BONUS_FPD_B',0,300), ('LIDER','BONUS_FPD_A',0,600), ('LIDER','BONUS_DCC',0,200), ('LIDER','BONUS_VENDEDOR',0,100)
) AS v(papel,item,f1,f2)
WHERE p.mes IN ('2026-09-01','2026-10-01')
ON CONFLICT (plano_id, papel, item) DO NOTHING;
