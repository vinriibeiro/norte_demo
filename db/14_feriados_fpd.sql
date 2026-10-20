-- =====================================================================
-- Arquivo 14: feriados (previsão por dia útil 6x1) e lançamento de FPD pelo site
--   1. feriado: estaduais, municipais e pontos facultativos (os nacionais o sistema já calcula sozinho)
--   2. qualidade_lote: histórico dos envios da planilha de qualidade (FPD)
--   3. v_fatura_fpd: considera a situação lançada (Paga no prazo, Não paga...) antes das datas
-- Rode no banco seven (SQL Editor do Supabase ou pgAdmin), depois do arquivo 13.
-- Pode rodar de novo sem problema.
-- =====================================================================
SET search_path = seven, public;

-- ---------------------------------------------------------------------
-- 1. FERIADOS
-- recorrente = repete todo ano no mesmo dia/mês; senão vale só a data informada.
-- considera = false: ponto facultativo (aparece no calendário, mas conta como dia de trabalho).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feriado (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome         text NOT NULL CHECK (length(nome) BETWEEN 2 AND 120),
    abrangencia  text NOT NULL CHECK (abrangencia IN ('NACIONAL','ESTADUAL','MUNICIPAL')),
    uf           char(2),
    cidade_id    integer REFERENCES cidade(id) ON DELETE CASCADE,
    recorrente   boolean NOT NULL DEFAULT true,
    dia          smallint CHECK (dia BETWEEN 1 AND 31),
    mes          smallint CHECK (mes BETWEEN 1 AND 12),
    data         date,
    considera    boolean NOT NULL DEFAULT true,
    criado_em    timestamptz NOT NULL DEFAULT now(),
    CHECK ((recorrente AND dia IS NOT NULL AND mes IS NOT NULL) OR (NOT recorrente AND data IS NOT NULL)),
    CHECK (abrangencia <> 'ESTADUAL' OR uf IS NOT NULL),
    CHECK (abrangencia <> 'MUNICIPAL' OR cidade_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_feriado ON feriado (abrangencia, coalesce(uf,''), coalesce(cidade_id,0), coalesce(data,'1900-01-01'), coalesce(dia,0), coalesce(mes,0));
DROP TRIGGER IF EXISTS trg_log_feriado ON feriado;
CREATE TRIGGER trg_log_feriado AFTER INSERT OR UPDATE OR DELETE ON feriado FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();
REVOKE ALL ON feriado FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON feriado TO seven_gestor;
GRANT SELECT ON feriado TO seven_backoffice, seven_vendedor, seven_lider, seven_coordenador;
GRANT USAGE ON SEQUENCE feriado_id_seq TO seven_gestor;

-- Estaduais (fonte: calendários oficiais 2026 do TRT-14 e dos governos estaduais; confira e ajuste na tela Feriados)
INSERT INTO feriado (nome, abrangencia, uf, dia, mes) VALUES
  ('Criação do Estado de Rondônia', 'ESTADUAL', 'RO', 4, 1),
  ('Dia do Católico (AC)',          'ESTADUAL', 'AC', 20, 1),
  ('Dia do Evangélico (AC)',        'ESTADUAL', 'AC', 23, 1),
  ('Dia Internacional da Mulher (AC)', 'ESTADUAL', 'AC', 8, 3),
  ('Aniversário do Acre',           'ESTADUAL', 'AC', 15, 6),
  ('Dia da Amazônia (AC)',          'ESTADUAL', 'AC', 5, 9),
  ('Tratado de Petrópolis (AC)',    'ESTADUAL', 'AC', 17, 11),
  ('Criação do Estado de MS',       'ESTADUAL', 'MS', 11, 10),
  ('Dia do Evangélico (DF)',        'ESTADUAL', 'DF', 30, 11)
ON CONFLICT DO NOTHING;

-- Municipais das cidades atendidas (procura a cidade pelo nome; se a cidade não existir no banco, não entra)
INSERT INTO feriado (nome, abrangencia, uf, cidade_id, dia, mes)
SELECT v.nome, 'MUNICIPAL', c.uf, c.id, v.dia, v.mes
  FROM (VALUES ('RO','PORTO VELHO','Instalação de Porto Velho',24,1), ('RO','PORTO VELHO','N. Sra. Auxiliadora (padroeira)',24,5), ('RO','PORTO VELHO','Criação de Porto Velho',2,10),
               ('AC','RIO BRANCO','Aniversário de Rio Branco',28,12),
               ('MS','CAMPO GRANDE','Santo Antônio (padroeiro)',13,6), ('MS','CAMPO GRANDE','Aniversário de Campo Grande',26,8),
               ('RO','ARIQUEMES','São Francisco de Assis (padroeiro)',4,10), ('RO','ARIQUEMES','Criação de Ariquemes',21,11),
               ('RO','JI-PARANÁ','São João Bosco (padroeiro)',16,8), ('RO','JI-PARANÁ','Instalação de Ji-Paraná',22,11)) AS v(uf, cidade, nome, dia, mes)
  JOIN cidade c ON c.uf = v.uf AND upper(c.nome) = v.cidade
ON CONFLICT DO NOTHING;

-- Pontos facultativos nacionais (aparecem no calendário mas contam como dia de trabalho; marque "não trabalha" se for o caso)
INSERT INTO feriado (nome, abrangencia, recorrente, data, considera) VALUES
  ('Carnaval (ponto facultativo)', 'NACIONAL', false, '2026-02-16', false), ('Carnaval (ponto facultativo)', 'NACIONAL', false, '2026-02-17', false),
  ('Corpus Christi (ponto facultativo)', 'NACIONAL', false, '2026-06-04', false),
  ('Carnaval (ponto facultativo)', 'NACIONAL', false, '2027-02-08', false), ('Carnaval (ponto facultativo)', 'NACIONAL', false, '2027-02-09', false),
  ('Corpus Christi (ponto facultativo)', 'NACIONAL', false, '2027-05-27', false)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. HISTÓRICO DOS ENVIOS DE FPD (planilha de qualidade)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qualidade_lote (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    arquivo_nome  text NOT NULL,
    origem        text NOT NULL DEFAULT 'ARQUIVO' CHECK (origem IN ('ARQUIVO','MANUAL')),
    enviado_por   bigint REFERENCES usuario(id),
    enviado_em    timestamptz NOT NULL DEFAULT now(),
    linhas        integer NOT NULL DEFAULT 0,
    atualizadas   integer NOT NULL DEFAULT 0,
    sem_contrato  integer NOT NULL DEFAULT 0,
    abas          text
);
REVOKE ALL ON qualidade_lote FROM PUBLIC;
GRANT SELECT, INSERT ON qualidade_lote TO seven_gestor;
GRANT USAGE ON SEQUENCE qualidade_lote_id_seq TO seven_gestor;

-- colunas de qualidade em fatura (já existem se o arquivo 10 foi rodado)
ALTER TABLE fatura ALTER COLUMN vencimento DROP NOT NULL;
ALTER TABLE fatura ADD COLUMN IF NOT EXISTS situacao text CHECK (situacao IN ('PAGA_NO_PRAZO','PAGA_FORA_DO_PRAZO','NAO_PAGA','EM_ABERTO'));
ALTER TABLE fatura ADD COLUMN IF NOT EXISTS fpd_planilha text CHECK (fpd_planilha IN ('OK','NAO_OK','PRAZO'));
ALTER TABLE fatura ADD COLUMN IF NOT EXISTS fpd_apos_prazo_planilha text CHECK (fpd_apos_prazo_planilha IN ('OK','NAO_OK','PRAZO'));
DROP TRIGGER IF EXISTS trg_log_fatura ON fatura;
CREATE TRIGGER trg_log_fatura AFTER INSERT OR UPDATE OR DELETE ON fatura FOR EACH ROW EXECUTE FUNCTION trg_alteracao_log();

-- ---------------------------------------------------------------------
-- 3. FPD: vale a situação lançada da 1ª fatura; sem ela, o FPD da planilha; sem ele, as datas
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_fatura_fpd AS
SELECT
    f.id AS fatura_id, f.contrato_id, f.numero, f.vencimento, f.valor, f.data_pagamento,
    coalesce(f.prazo_limite, f.vencimento) AS limite,
    CASE
        WHEN f.situacao = 'PAGA_NO_PRAZO'                     THEN 'OK'
        WHEN f.situacao IN ('PAGA_FORA_DO_PRAZO','NAO_PAGA')  THEN 'NAO_OK'
        WHEN f.situacao = 'EM_ABERTO'                         THEN 'PRAZO'
        WHEN f.fpd_planilha IS NOT NULL                       THEN f.fpd_planilha
        WHEN f.data_pagamento IS NOT NULL AND f.data_pagamento <= coalesce(f.prazo_limite, f.vencimento) THEN 'OK'
        WHEN f.data_pagamento IS NOT NULL                     THEN 'NAO_OK'
        WHEN current_date > coalesce(f.prazo_limite, f.vencimento) THEN 'NAO_OK'
        ELSE 'PRAZO'
    END AS fpd,
    (f.situacao = 'PAGA_FORA_DO_PRAZO'
     OR (f.situacao IS NULL AND f.data_pagamento IS NOT NULL AND f.data_pagamento > coalesce(f.prazo_limite, f.vencimento))) AS recuperada,
    CASE WHEN f.data_pagamento IS NOT NULL AND f.vencimento IS NOT NULL THEN f.data_pagamento - f.vencimento END AS dias_para_pagar
FROM fatura f
WHERE f.numero = 1;

SELECT 'ok' AS feriados_fpd, (SELECT count(*) FROM feriado) AS feriados;

-- ---------------------------------------------------------------------
-- 4. UF nas visões da equipe (para saber os feriados da região de cada vendedor)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_vendas_det AS
SELECT b.contrato_id, b.vendedor_id, b.vendedor_nome AS vendedor, b.vendedor_login, b.data_venda, k.data_agendamento, b.status_venda,
       b.tem_bl, b.tem_tv, b.tem_multi, b.pacote_valor, b.equipe_id, b.equipe, b.cidade_id, b.cidade || '/' || b.uf AS cidade,
       b.forma_pagamento, b.tipo_imovel, b.canal, b.origem,
       li.nome_completo AS lider, co.nome_completo AS coordenador,
       coalesce(ch.nova, 0)::int AS chip_nova, coalesce(ch.mig, 0)::int AS chip_mig, coalesce(ch.port, 0)::int AS chip_port,
       EXISTS (SELECT 1 FROM contrato_item i JOIN produto p ON p.id = i.produto_id WHERE i.contrato_id = b.contrato_id AND p.categoria = 'FONE') AS tem_fone,
       b.uf
  FROM v_contrato_base b
  JOIN contrato k ON k.id = b.contrato_id
  LEFT JOIN usuario li ON li.id = b.lider_id
  LEFT JOIN usuario co ON co.id = b.coordenador_id
  LEFT JOIN LATERAL (
    SELECT sum(i.quantidade) FILTER (WHERE i.tipo_adesao = 'LINHA_NOVA' OR i.tipo_adesao IS NULL) AS nova,
           sum(i.quantidade) FILTER (WHERE i.tipo_adesao = 'MIGRACAO')      AS mig,
           sum(i.quantidade) FILTER (WHERE i.tipo_adesao = 'PORTABILIDADE') AS port
      FROM contrato_item i JOIN produto p ON p.id = i.produto_id
     WHERE i.contrato_id = b.contrato_id AND p.categoria = 'MOVEL') ch ON true;

CREATE OR REPLACE VIEW v_agentes_equipe AS
SELECT u.id, u.nome_completo AS nome, u.login, e.id AS equipe_id, e.nome AS equipe, e.cidade_id, ci.nome || '/' || ci.uf AS cidade,
       li.nome_completo AS lider, co.nome_completo AS coordenador, u.data_entrada, ci.uf
  FROM usuario u
  JOIN equipe_membro m ON m.usuario_id = u.id AND m.fim IS NULL
  JOIN equipe e ON e.id = m.equipe_id AND e.ativa
  LEFT JOIN cidade ci ON ci.id = e.cidade_id
  LEFT JOIN usuario li ON li.id = e.lider_id
  LEFT JOIN usuario co ON co.id = e.coordenador_id
 WHERE u.ativo AND u.perfil_acesso <> 'master'
   AND (u.perfil_acesso = 'vendedor' OR EXISTS (SELECT 1 FROM usuario_funcao f WHERE f.usuario_id = u.id AND f.funcao = 'VENDEDOR'));

CREATE OR REPLACE VIEW v_eq_vendas_det AS
SELECT * FROM v_vendas_det WHERE equipe_id IN (SELECT app_equipes_visiveis()) OR vendedor_id = app_usuario_id();
CREATE OR REPLACE VIEW v_eq_agentes AS
SELECT * FROM v_agentes_equipe WHERE equipe_id IN (SELECT app_equipes_visiveis());

SELECT 'ok' AS visoes_com_uf;
