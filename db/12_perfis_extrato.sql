-- 12_perfis_extrato.sql — perfil Administrador + extrato de comissão da operadora (pode rodar mais de uma vez)
SET search_path = seven, public;

-- 1) Perfis: "gestor" aparece como GERENTE nas telas; "administrador" tem exatamente as mesmas permissões
ALTER TABLE usuario DROP CONSTRAINT IF EXISTS usuario_perfil_acesso_check;
ALTER TABLE usuario ADD CONSTRAINT usuario_perfil_acesso_check
    CHECK (perfil_acesso IN ('master','administrador','gestor','coordenador','lider','backoffice','vendedor'));

-- 2) Extrato detalhado da operadora (o que a operadora pagou/estornou para a Norte Link)
CREATE TABLE IF NOT EXISTS extrato_lote (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    arquivo_nome    text NOT NULL,
    enviado_por     bigint REFERENCES usuario(id),
    enviado_em      timestamptz NOT NULL DEFAULT now(),
    linhas_arquivo  integer NOT NULL,
    linhas_novas    integer NOT NULL,
    linhas_repetidas integer NOT NULL,
    periodos        text,                     -- ex.: "08/2026 P1, 10/2026 P1"
    valor_novo      numeric(14,2)
);

CREATE TABLE IF NOT EXISTS extrato_linha (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lote_id             bigint NOT NULL REFERENCES extrato_lote(id) ON DELETE CASCADE,
    chave               text NOT NULL UNIQUE,  -- impressão digital da linha (evita subir a mesma linha duas vezes)
    data_ativacao       date,
    ntc                 text,
    tipo_operacao       text,
    plano               text,
    cod_mobile          text,
    mes_referencia      char(6),                -- AAAAMM
    quinzena            text,                   -- P1 (dias 1-15) | P2 (16-fim)
    valido              boolean,                -- t = pago/descontado nesta quinzena | f = não pago (ver pendência)
    valor               numeric(12,2),          -- negativo = estorno
    cod_irreg           integer,
    arquivo             text,                   -- categoria da operadora (BANDA LARGA FIXA, INAD_1, ...)
    data_estorno        date,
    pendencia           text,
    valor_franquia      numeric(10,2),
    simcard             text,
    status_ged          text,
    ntc_anterior        text,
    plano_anterior      text,
    num_chamado         text,
    contrato_ebt        text,                   -- 3 dígitos da praça + 9 dígitos do contrato
    contrato_num        text,                   -- só o número do contrato, sem zeros à esquerda (liga com contrato.numero_contrato)
    classificacao_pgto  text,
    franquia_anterior   numeric(10,2),
    valor_delta         numeric(10,2),
    valor_fator         numeric(8,2),
    dat_digitalizacao   text,
    dsc_nome_plano      text,
    num_fi              text
);
CREATE INDEX IF NOT EXISTS ix_extrato_periodo  ON extrato_linha (mes_referencia, quinzena);
CREATE INDEX IF NOT EXISTS ix_extrato_contrato ON extrato_linha (contrato_num);
CREATE INDEX IF NOT EXISTS ix_extrato_lote     ON extrato_linha (lote_id);
CREATE INDEX IF NOT EXISTS ix_contrato_numero_sem0 ON contrato ((ltrim(numero_contrato, '0')));

-- Só gerente/administrador (papel seven_gestor) enxergam o extrato. Ninguém mais.
REVOKE ALL ON extrato_lote, extrato_linha FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['seven_backoffice','seven_vendedor','seven_lider','seven_coordenador','anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON seven.extrato_lote, seven.extrato_linha FROM %I', r);
    END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT, DELETE ON extrato_lote, extrato_linha TO seven_gestor;
GRANT UPDATE (linhas_novas, linhas_repetidas) ON extrato_lote TO seven_gestor;
GRANT USAGE ON SEQUENCE extrato_lote_id_seq, extrato_linha_id_seq TO seven_gestor;

SELECT 'ok' AS extrato_instalado, (SELECT count(*) FROM extrato_linha) AS linhas;
