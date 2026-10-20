-- =====================================================================
-- Arquivo 3 de 4: views de KPI (o catálogo de 124 indicadores)
-- Cada view indica os IDs do catálogo que ela alimenta (C01, Q02, ...).
-- Percentuais são frações (0 a 1) com 4 casas; a tela formata.
-- =====================================================================
SET search_path = seven, public;

-- ---------------------------------------------------------------------
-- Base: contrato com dimensões e flags de produto  (alimenta quase tudo)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_contrato_base AS
SELECT
    c.id                                        AS contrato_id,
    c.numero_contrato,
    date_trunc('month', c.data_venda)::date     AS mes_venda,
    c.data_venda,
    c.status_venda,
    c.status_contrato,
    c.origem,
    c.canal,
    c.tipo_contrato,
    c.forma_pagamento,
    c.dia_vencimento,
    c.pacote_valor,
    c.auditoria,
    c.vendedor_id,
    u.login                                     AS vendedor_login,
    u.nome_completo                             AS vendedor_nome,
    c.equipe_id,
    e.nome                                      AS equipe,
    e.lider_id,
    e.coordenador_id,
    c.cidade_id,
    ci.uf,
    ci.nome                                     AS cidade,
    c.bairro,
    c.tipo_imovel,
    c.motivo_id,
    (sv.conta_como_conectado)                   AS conectado,
    EXISTS (SELECT 1 FROM contrato_item i JOIN produto p ON p.id = i.produto_id
             WHERE i.contrato_id = c.id AND p.categoria = 'FIBRA')           AS tem_bl,
    EXISTS (SELECT 1 FROM contrato_item i JOIN produto p ON p.id = i.produto_id
             WHERE i.contrato_id = c.id AND p.categoria = 'MOVEL')            AS tem_movel,
    EXISTS (SELECT 1 FROM contrato_item i JOIN produto p ON p.id = i.produto_id
             WHERE i.contrato_id = c.id AND p.categoria = 'TV')               AS tem_tv,
    EXISTS (SELECT 1 FROM contrato_item i JOIN produto p ON p.id = i.produto_id
             WHERE i.contrato_id = c.id AND p.nome = 'ACESSO VÍRTUA MULT')    AS tem_multi,
    (SELECT max(p.velocidade_mb) FROM contrato_item i JOIN produto p ON p.id = i.produto_id
      WHERE i.contrato_id = c.id AND p.categoria = 'FIBRA')                  AS velocidade_mb
FROM contrato c
JOIN status_venda sv ON sv.codigo = c.status_venda
JOIN usuario u       ON u.id = c.vendedor_id
LEFT JOIN equipe e   ON e.id = c.equipe_id
LEFT JOIN cidade ci  ON ci.id = c.cidade_id;

-- ---------------------------------------------------------------------
-- COMERCIAL: C01-C05, C10-C12, P01-P03, P05, P08, P14, F04
-- Grão: mês x equipe x cidade
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_kpi_vendas_mensal AS
SELECT
    mes_venda, equipe_id, equipe, cidade_id, cidade,
    count(*)                                                        AS vendas_brutas,              -- C01
    count(*) FILTER (WHERE status_venda = 'ATIVO')                  AS vendas_ativas,              -- C02
    count(*) FILTER (WHERE status_venda = 'PENDENTE')               AS vendas_pendentes,
    count(*) FILTER (WHERE status_venda = 'CANCELADO')              AS vendas_canceladas,
    round(count(*) FILTER (WHERE status_venda = 'ATIVO')::numeric     / NULLIF(count(*),0), 4) AS taxa_conectividade,   -- C03
    round(count(*) FILTER (WHERE status_venda = 'CANCELADO')::numeric / NULLIF(count(*),0), 4) AS taxa_cancelamento,    -- C04
    round(count(*) FILTER (WHERE status_venda = 'PENDENTE')::numeric  / NULLIF(count(*),0), 4) AS taxa_pendencia,       -- C05
    round(avg(pacote_valor), 2)                                     AS ticket_medio,               -- P01
    sum(pacote_valor)                                               AS receita_contratada,         -- P02
    sum(pacote_valor) FILTER (WHERE status_venda = 'ATIVO')         AS receita_ativa,
    sum(pacote_valor) FILTER (WHERE status_venda = 'PENDENTE')      AS receita_em_risco,           -- P03
    sum(pacote_valor) FILTER (WHERE status_venda = 'CANCELADO')     AS receita_perdida,            -- P03
    round(count(*) FILTER (WHERE tem_movel)::numeric / NULLIF(count(*),0), 4) AS penetracao_movel,           -- P05
    round(count(*) FILTER (WHERE tem_multi)::numeric / NULLIF(count(*),0), 4) AS penetracao_multi,           -- P08
    round(count(*) FILTER (WHERE forma_pagamento = 'DCC')::numeric / NULLIF(count(*),0), 4) AS adesao_dcc,   -- P14
    round(count(*) FILTER (WHERE tipo_contrato = 'BASE')::numeric  / NULLIF(count(*),0), 4) AS venda_base,   -- C12
    round(count(*) FILTER (WHERE auditoria = 'AUDITADA')::numeric  / NULLIF(count(*),0), 4) AS taxa_auditoria -- F04
FROM v_contrato_base
GROUP BY mes_venda, equipe_id, equipe, cidade_id, cidade;

-- Por vendedor: C06-C09, E04, E14, E17
CREATE OR REPLACE VIEW v_kpi_vendedor_mensal AS
SELECT
    mes_venda, vendedor_id, vendedor_login, vendedor_nome, equipe_id, equipe,
    count(*)                                                        AS vendas_brutas,
    count(*) FILTER (WHERE status_venda = 'ATIVO')                  AS vendas_ativas,
    count(*) FILTER (WHERE status_venda = 'ATIVO' AND tem_bl)       AS bl_conectado,               -- unidade da meta
    count(*) FILTER (WHERE status_venda = 'CANCELADO')              AS vendas_canceladas,
    round(count(*) FILTER (WHERE status_venda = 'CANCELADO')::numeric / NULLIF(count(*),0), 4) AS taxa_cancelamento,
    round(count(*) FILTER (WHERE auditoria = 'AUDITADA')::numeric / NULLIF(count(*),0), 4)     AS taxa_auditoria,
    sum(pacote_valor) FILTER (WHERE status_venda = 'ATIVO')         AS receita_ativa,
    round(100.0 * count(*) FILTER (WHERE status_venda = 'ATIVO')
          / NULLIF(sum(count(*) FILTER (WHERE status_venda = 'ATIVO')) OVER (PARTITION BY mes_venda), 0), 2)
                                                                    AS participacao_pct            -- C08 concentração
FROM v_contrato_base
GROUP BY mes_venda, vendedor_id, vendedor_login, vendedor_nome, equipe_id, equipe;

-- Qualidade por origem e canal: C10, C11
CREATE OR REPLACE VIEW v_kpi_origem_canal AS
SELECT
    mes_venda, origem, canal,
    count(*)                                                        AS vendas,
    round(count(*) FILTER (WHERE status_venda = 'CANCELADO')::numeric / NULLIF(count(*),0), 4) AS taxa_cancelamento,
    round(count(*) FILTER (WHERE status_venda = 'PENDENTE')::numeric  / NULLIF(count(*),0), 4) AS taxa_pendencia,
    round(avg(pacote_valor), 2)                                     AS ticket_medio
FROM v_contrato_base
GROUP BY mes_venda, origem, canal;

-- Sazonalidade semanal: C14
CREATE OR REPLACE VIEW v_kpi_dia_semana AS
SELECT
    extract(isodow FROM data_venda)::int AS dia_semana,   -- 1=segunda ... 7=domingo
    count(*)                             AS vendas
FROM v_contrato_base
GROUP BY 1;

-- Dias sem vender: E16
CREATE OR REPLACE VIEW v_vendedor_parado AS
SELECT
    u.id AS vendedor_id, u.login, u.nome_completo,
    max(c.data_venda)                          AS ultima_venda,
    current_date - max(c.data_venda)           AS dias_sem_vender
FROM usuario u
JOIN usuario_funcao f ON f.usuario_id = u.id AND f.funcao = 'VENDEDOR'
LEFT JOIN contrato c  ON c.vendedor_id = u.id
WHERE u.ativo
GROUP BY u.id, u.login, u.nome_completo;

-- ---------------------------------------------------------------------
-- PRODUTO E MIX: P04, P06, P07, P09, P10, P11
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_kpi_mix_produto AS
SELECT
    date_trunc('month', c.data_venda)::date AS mes_venda,
    p.categoria, p.nome AS produto, i.tipo_adesao,
    count(DISTINCT c.id)                    AS contratos,
    sum(i.quantidade)                       AS unidades
FROM contrato c
JOIN contrato_item i ON i.contrato_id = c.id
JOIN produto p       ON p.id = i.produto_id
GROUP BY 1, 2, 3, 4;

CREATE OR REPLACE VIEW v_produtos_por_venda AS      -- P11
SELECT date_trunc('month', c.data_venda)::date AS mes_venda,
       round(avg(n.itens), 2)                  AS itens_por_contrato
FROM contrato c
JOIN (SELECT contrato_id, sum(quantidade) AS itens FROM contrato_item GROUP BY contrato_id) n
  ON n.contrato_id = c.id
GROUP BY 1;

CREATE OR REPLACE VIEW v_kpi_chip AS               -- P12, P13
SELECT
    count(*) FILTER (WHERE i.chip_ativo)            AS chips_ativos,
    count(*) FILTER (WHERE i.chip_ativo = false)    AS chips_nao_ativos,
    round(count(*) FILTER (WHERE i.chip_ativo)::numeric
          / NULLIF(count(*) FILTER (WHERE i.chip_ativo IS NOT NULL), 0), 4) AS taxa_ativacao
FROM contrato_item i
JOIN produto p ON p.id = i.produto_id AND p.categoria = 'MOVEL';

CREATE OR REPLACE VIEW v_kpi_vencimento AS         -- P15, G09
SELECT dia_vencimento, count(*) AS contratos, sum(pacote_valor) AS receita
FROM v_contrato_base
WHERE status_venda = 'ATIVO'
GROUP BY dia_vencimento;

-- ---------------------------------------------------------------------
-- FUNIL / BACKOFFICE: F01-F16
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pareto_motivos AS         -- F06, F07, F08, F13, R04, R13
SELECT g.*,
       round(100.0 * g.contratos / sum(g.contratos) OVER (PARTITION BY g.mes_venda), 2) AS pct_do_mes
FROM (
    SELECT date_trunc('month', c.data_venda)::date AS mes_venda,
           m.codigo, m.descricao, m.categoria, m.evitavel,
           count(*) AS contratos
    FROM contrato c
    JOIN motivo m ON m.id = c.motivo_id
    WHERE c.status_venda IN ('CANCELADO','PENDENTE')
    GROUP BY 1, 2, 3, 4, 5
) g;

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
WHERE p.aberta;

CREATE OR REPLACE VIEW v_carga_backoffice AS       -- F09
SELECT
    date_trunc('month', c.data_venda)::date AS mes_venda,
    b.login                                 AS backoffice,
    count(*)                                AS contratos_tratados,
    round(count(*) FILTER (WHERE c.status_venda = 'CANCELADO')::numeric / NULLIF(count(*),0), 4) AS taxa_cancelamento
FROM contrato c
JOIN usuario b ON b.id = c.backoffice_id
GROUP BY 1, 2;

CREATE OR REPLACE VIEW v_tempo_tratativa AS        -- F10
SELECT
    c.id AS contrato_id,
    c.data_venda,
    min(e.ocorrido_em) FILTER (WHERE e.status_venda IN ('ATIVO','CANCELADO')) AS resolvido_em,
    extract(day FROM min(e.ocorrido_em) FILTER (WHERE e.status_venda IN ('ATIVO','CANCELADO'))
                   - c.data_venda::timestamptz)                              AS dias_ate_resolver
FROM contrato c
JOIN contrato_status_evento e ON e.contrato_id = c.id
GROUP BY c.id, c.data_venda;

CREATE OR REPLACE VIEW v_hp_viabilidade AS         -- F14, F15
SELECT
    date_trunc('month', data_consulta)::date AS mes,
    count(*)                                                        AS consultas,
    round(count(*) FILTER (WHERE status = 'LIBERADO')::numeric  / NULLIF(count(*),0), 4) AS pct_liberado,
    round(count(*) FILTER (WHERE status = 'HP_APAGOU')::numeric / NULLIF(count(*),0), 4) AS pct_hp_apagou
FROM hp_consulta
GROUP BY 1;

-- ---------------------------------------------------------------------
-- ROTA: R01-R14
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_rota_dia AS
SELECT
    a.data_rota, a.turno,
    count(*)                                                          AS agendadas,             -- R01
    round(count(*) FILTER (WHERE a.confirmada)::numeric / NULLIF(count(*),0), 4) AS taxa_confirmacao,   -- R02
    round(count(*) FILTER (WHERE a.situacao = 'INSTALADO')::numeric / NULLIF(count(*),0), 4) AS cumprimento_agenda, -- R03
    count(*) FILTER (WHERE a.situacao = 'CLIENTE_AUSENTE')           AS ausentes,               -- R04
    count(*) FILTER (WHERE a.situacao = 'REAGENDADO')                AS reagendadas,
    round(avg(a.nota_satisfacao), 2)                                  AS nota_media,            -- R09
    round(count(a.nota_satisfacao)::numeric / NULLIF(count(*) FILTER (WHERE a.situacao = 'INSTALADO'),0), 4) AS cobertura_nota  -- R10
FROM agenda_instalacao a
GROUP BY a.data_rota, a.turno;

CREATE OR REPLACE VIEW v_reagendamentos AS         -- R05
SELECT contrato_id, count(*) - 1 AS reagendamentos
FROM agenda_instalacao
GROUP BY contrato_id
HAVING count(*) > 1;

CREATE OR REPLACE VIEW v_prazo_venda_instalacao AS -- R06
SELECT c.id AS contrato_id, c.data_venda, min(a.data_rota) AS primeira_agenda,
       min(a.data_rota) - c.data_venda AS dias_ate_agenda
FROM contrato c JOIN agenda_instalacao a ON a.contrato_id = c.id
GROUP BY c.id, c.data_venda;

-- ---------------------------------------------------------------------
-- QUALIDADE: FPD, COBRANÇA, CHURN  (Q01-Q26)
-- Regra do FPD [VALIDAR com a Norte Link]:
--   OK      = paga até o prazo limite
--   NAO_OK  = paga depois do prazo, ou não paga e o prazo já passou
--   PRAZO   = não paga e o prazo ainda não venceu
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_fatura_fpd AS
SELECT
    f.id AS fatura_id, f.contrato_id, f.numero, f.vencimento, f.valor, f.data_pagamento,
    coalesce(f.prazo_limite, f.vencimento) AS limite,
    CASE
        WHEN f.data_pagamento IS NOT NULL AND f.data_pagamento <= coalesce(f.prazo_limite, f.vencimento) THEN 'OK'
        WHEN f.data_pagamento IS NOT NULL                                                               THEN 'NAO_OK'
        WHEN current_date > coalesce(f.prazo_limite, f.vencimento)                                      THEN 'NAO_OK'
        ELSE 'PRAZO'
    END AS fpd,
    (f.data_pagamento IS NOT NULL AND f.data_pagamento > coalesce(f.prazo_limite, f.vencimento)) AS recuperada,
    CASE WHEN f.data_pagamento IS NOT NULL THEN f.data_pagamento - f.vencimento END AS dias_para_pagar   -- Q14
FROM fatura f
WHERE f.numero = 1;

-- Q01-Q03: FPD por safra (mês da venda). Percentual só sobre faturas resolvidas.
CREATE OR REPLACE VIEW v_fpd_safra AS
SELECT
    date_trunc('month', c.data_venda)::date AS safra,
    count(*) FILTER (WHERE x.fpd = 'OK')       AS fpd_ok,
    count(*) FILTER (WHERE x.fpd = 'NAO_OK')   AS fpd_nao_ok,
    count(*) FILTER (WHERE x.fpd = 'PRAZO')    AS fpd_prazo,
    round(count(*) FILTER (WHERE x.fpd = 'NAO_OK')::numeric
          / NULLIF(count(*) FILTER (WHERE x.fpd IN ('OK','NAO_OK')), 0), 4) AS fpd_nao_ok_pct,   -- Q01
    round(count(*) FILTER (WHERE x.fpd = 'PRAZO')::numeric / NULLIF(count(*), 0), 4) AS pct_em_prazo,  -- Q03 maturidade
    count(*) FILTER (WHERE x.recuperada)       AS recuperadas,                                      -- Q13
    round(count(*) FILTER (WHERE x.recuperada)::numeric
          / NULLIF(count(*) FILTER (WHERE x.fpd = 'NAO_OK'), 0), 4) AS taxa_recuperacao
FROM v_fatura_fpd x
JOIN contrato c ON c.id = x.contrato_id
GROUP BY 1;

-- Q04-Q10: FPD recortado por qualquer dimensão. Filtre `dimensao` na consulta.
CREATE OR REPLACE VIEW v_fpd_recorte AS
SELECT dim.dimensao, dim.valor, dim.safra,
       count(*) FILTER (WHERE dim.fpd IN ('OK','NAO_OK'))  AS resolvidas,
       count(*) FILTER (WHERE dim.fpd = 'NAO_OK')          AS nao_ok,
       round(count(*) FILTER (WHERE dim.fpd = 'NAO_OK')::numeric
             / NULLIF(count(*) FILTER (WHERE dim.fpd IN ('OK','NAO_OK')), 0), 4) AS fpd_nao_ok_pct,
       (count(*) FILTER (WHERE dim.fpd IN ('OK','NAO_OK'))
            >= (SELECT valor FROM parametro WHERE chave = 'fpd_volume_minimo')) AS volume_suficiente
FROM (
    SELECT 'EQUIPE' AS dimensao, b.equipe AS valor, date_trunc('month', b.data_venda)::date AS safra, x.fpd
      FROM v_fatura_fpd x JOIN v_contrato_base b ON b.contrato_id = x.contrato_id
    UNION ALL
    SELECT 'VENDEDOR', b.vendedor_login, date_trunc('month', b.data_venda)::date, x.fpd
      FROM v_fatura_fpd x JOIN v_contrato_base b ON b.contrato_id = x.contrato_id
    UNION ALL
    SELECT 'CIDADE', b.cidade, date_trunc('month', b.data_venda)::date, x.fpd
      FROM v_fatura_fpd x JOIN v_contrato_base b ON b.contrato_id = x.contrato_id
    UNION ALL
    SELECT 'PLANO_MB', b.velocidade_mb::text, date_trunc('month', b.data_venda)::date, x.fpd
      FROM v_fatura_fpd x JOIN v_contrato_base b ON b.contrato_id = x.contrato_id
    UNION ALL
    SELECT 'PAGAMENTO', b.forma_pagamento, date_trunc('month', b.data_venda)::date, x.fpd
      FROM v_fatura_fpd x JOIN v_contrato_base b ON b.contrato_id = x.contrato_id
    UNION ALL
    SELECT 'VENCIMENTO', b.dia_vencimento::text, date_trunc('month', b.data_venda)::date, x.fpd
      FROM v_fatura_fpd x JOIN v_contrato_base b ON b.contrato_id = x.contrato_id
    UNION ALL
    SELECT 'ORIGEM', b.origem, date_trunc('month', b.data_venda)::date, x.fpd
      FROM v_fatura_fpd x JOIN v_contrato_base b ON b.contrato_id = x.contrato_id
    UNION ALL
    SELECT 'CANAL', b.canal, date_trunc('month', b.data_venda)::date, x.fpd
      FROM v_fatura_fpd x JOIN v_contrato_base b ON b.contrato_id = x.contrato_id
    UNION ALL
    SELECT 'TIPO_CONTRATO', b.tipo_contrato, date_trunc('month', b.data_venda)::date, x.fpd
      FROM v_fatura_fpd x JOIN v_contrato_base b ON b.contrato_id = x.contrato_id
) dim
GROUP BY dim.dimensao, dim.valor, dim.safra;

-- Q11, Q12: situação das faturas
CREATE OR REPLACE VIEW v_situacao_faturas AS
SELECT
    count(*) FILTER (WHERE f.data_pagamento IS NOT NULL)                             AS quitadas,
    count(*) FILTER (WHERE f.data_pagamento IS NULL AND f.numero = 1)                AS primeira_em_aberto,
    count(*) FILTER (WHERE f.data_pagamento IS NULL AND f.numero = 2)                AS segunda_em_aberto,
    round(count(*) FILTER (WHERE f.data_pagamento IS NOT NULL)::numeric
          / NULLIF(count(*) FILTER (WHERE f.vencimento <= current_date), 0), 4)     AS taxa_quitacao
FROM fatura f;

-- Q15-Q17, Q19, Q21: base e churn
CREATE OR REPLACE VIEW v_churn_base AS
SELECT
    count(*) FILTER (WHERE sc.codigo = 'CONECTADO')                         AS conectados,     -- Q21
    count(*) FILTER (WHERE sc.e_churn)                                      AS churn,
    round(count(*) FILTER (WHERE sc.e_churn)::numeric / NULLIF(count(*),0), 4) AS churn_pct,   -- Q15
    count(*) FILTER (WHERE sc.codigo = 'DESC INADIMPLENCIA')                AS por_inadimplencia,  -- Q16
    count(*) FILTER (WHERE sc.codigo = 'DESC OPÇÃO')                        AS por_opcao,
    count(*) FILTER (WHERE sc.codigo = 'DESABILITADO')                      AS desabilitado
FROM contrato c
JOIN status_contrato sc ON sc.codigo = c.status_contrato;

-- Q20: sobrevivência por safra (% ainda conectado)
CREATE OR REPLACE VIEW v_sobrevivencia_safra AS
SELECT
    date_trunc('month', c.data_venda)::date AS safra,
    count(*)                                AS contratos,
    round(count(*) FILTER (WHERE c.status_contrato = 'CONECTADO')::numeric / NULLIF(count(*),0), 4) AS pct_conectado,
    round(avg(current_date - c.data_venda), 0) AS idade_media_dias      -- Q19
FROM contrato c
WHERE c.status_contrato IS NOT NULL
GROUP BY 1;

-- Q18: efeito da oferta
CREATE OR REPLACE VIEW v_efeito_oferta AS
SELECT
    t.com_oferta,
    count(DISTINCT t.contrato_id)                                                     AS contratos,
    round(count(DISTINCT t.contrato_id) FILTER (WHERE t.resultado LIKE 'CHURN%')::numeric
          / NULLIF(count(DISTINCT t.contrato_id), 0), 4)                              AS taxa_churn
FROM tratativa t
WHERE t.com_oferta IS NOT NULL
GROUP BY t.com_oferta;

-- Q24: fila de cobrança dos próximos 7 dias
CREATE OR REPLACE VIEW v_fila_cobranca AS
SELECT f.contrato_id, c.numero_contrato, f.numero AS fatura, f.vencimento,
       coalesce(f.prazo_limite, f.vencimento) AS prazo,
       f.vencimento - current_date            AS dias_para_vencer
FROM fatura f JOIN contrato c ON c.id = f.contrato_id
WHERE f.data_pagamento IS NULL
  AND f.vencimento BETWEEN current_date AND current_date + 7;

-- Q26: perda financeira do FPD
CREATE OR REPLACE VIEW v_perda_fpd AS
SELECT date_trunc('month', c.data_venda)::date AS safra,
       sum(c.pacote_valor) FILTER (WHERE x.fpd = 'NAO_OK')                       AS pacote_em_fpd_nao_ok,
       sum(c.pacote_valor) FILTER (WHERE x.fpd = 'NAO_OK' AND NOT x.recuperada)  AS pacote_nao_recuperado
FROM v_fatura_fpd x JOIN contrato c ON c.id = x.contrato_id
GROUP BY 1;

-- ---------------------------------------------------------------------
-- EQUIPE, METAS E PONTUAÇÃO: E01-E20
-- ---------------------------------------------------------------------
-- E06-E09: pontos por vendedor e mês (fator do produto x quantidade)
CREATE OR REPLACE VIEW v_pontuacao AS
SELECT
    date_trunc('month', c.data_venda)::date AS mes_venda,
    c.vendedor_id, u.login AS vendedor,
    coalesce(sum(i.quantidade * p.fator_pontos) FILTER (WHERE c.status_venda = 'ATIVO'),     0) AS pontos_conectados,   -- E06
    coalesce(sum(i.quantidade * p.fator_pontos) FILTER (WHERE c.status_venda = 'PENDENTE'),  0) AS pontos_pendentes,    -- E07
    coalesce(sum(i.quantidade * p.fator_pontos) FILTER (WHERE c.status_venda = 'CANCELADO'), 0) AS pontos_perdidos,     -- E08
    round(coalesce(sum(i.quantidade * p.fator_pontos) FILTER (WHERE c.status_venda = 'ATIVO'), 0)
          / NULLIF(count(DISTINCT c.id) FILTER (WHERE c.status_venda = 'ATIVO'), 0), 2)               AS pontos_por_venda  -- E09
FROM contrato c
JOIN usuario u        ON u.id = c.vendedor_id
JOIN contrato_item i  ON i.contrato_id = c.id
JOIN produto p        ON p.id = i.produto_id
GROUP BY 1, 2, 3;

-- E01-E03: atingimento do líder = BL conectado / (13 x HC); mínimo do supervisor = 52
CREATE OR REPLACE VIEW v_atingimento_lider AS
SELECT
    m.competencia, e.id AS equipe_id, e.nome AS equipe,
    hc.valor                                                        AS hc,
    greatest(hc.valor * (SELECT valor FROM parametro WHERE chave = 'meta_bl_por_hc_lider'),
             (SELECT valor FROM parametro WHERE chave = 'meta_minima_bl_supervisor')) AS meta_bl,
    coalesce(r.bl_conectado, 0)                                     AS bl_conectado,
    round(coalesce(r.bl_conectado, 0)
          / NULLIF(greatest(hc.valor * (SELECT valor FROM parametro WHERE chave = 'meta_bl_por_hc_lider'),
                            (SELECT valor FROM parametro WHERE chave = 'meta_minima_bl_supervisor')), 0), 4) AS atingimento   -- E01, E03
FROM (SELECT DISTINCT competencia FROM meta WHERE indicador = 'HC') m
JOIN meta hc ON hc.competencia = m.competencia AND hc.indicador = 'HC' AND hc.equipe_id IS NOT NULL
JOIN equipe e ON e.id = hc.equipe_id
LEFT JOIN (
    SELECT mes_venda, equipe_id, count(*) FILTER (WHERE status_venda = 'ATIVO' AND tem_bl) AS bl_conectado
    FROM v_contrato_base GROUP BY 1, 2
) r ON r.mes_venda = m.competencia AND r.equipe_id = e.id;

-- E05: elegibilidade à premiação = bateu BL e FPD dentro do teto
CREATE OR REPLACE VIEW v_elegibilidade_premiacao AS
SELECT
    a.competencia, a.equipe, a.meta_bl, a.bl_conectado, a.atingimento,
    f.fpd_nao_ok_pct,
    (a.atingimento >= 1
     AND coalesce(f.fpd_nao_ok_pct, 0) <= (SELECT valor FROM parametro WHERE chave = 'meta_fpd_max_pct') / 100.0) AS elegivel
FROM v_atingimento_lider a
LEFT JOIN v_fpd_recorte f
       ON f.dimensao = 'EQUIPE' AND f.valor = a.equipe AND f.safra = a.competencia;

-- E11, E12: fechamento diário (ND, BL, TV, MULTI, DCC, faturamento) por vendedor
CREATE OR REPLACE VIEW v_fechamento_diario AS
SELECT
    data_venda AS dia, equipe, vendedor_login AS vendedor,
    count(*) FILTER (WHERE status_venda <> 'CANCELADO')                        AS nd,
    count(*) FILTER (WHERE status_venda <> 'CANCELADO' AND tem_bl)             AS bl,
    count(*) FILTER (WHERE status_venda <> 'CANCELADO' AND tem_tv)             AS tv,
    count(*) FILTER (WHERE status_venda <> 'CANCELADO' AND tem_multi)          AS multi,
    count(*) FILTER (WHERE status_venda <> 'CANCELADO' AND forma_pagamento = 'DCC') AS dcc,
    coalesce(sum(pacote_valor) FILTER (WHERE status_venda <> 'CANCELADO'), 0)  AS faturamento_diario
FROM v_contrato_base
GROUP BY data_venda, equipe, vendedor_login;

-- E15: quadrante volume x qualidade por vendedor (usa safras resolvidas)
CREATE OR REPLACE VIEW v_quadrante_vendedor AS
SELECT v.vendedor_login AS vendedor, v.mes_venda,
       v.vendas_ativas, f.fpd_nao_ok_pct,
       CASE WHEN v.vendas_ativas >= 10 AND coalesce(f.fpd_nao_ok_pct,0) <= 0.25 THEN 'ALTO VOLUME, BOA QUALIDADE'
            WHEN v.vendas_ativas >= 10                                          THEN 'ALTO VOLUME, QUALIDADE RUIM'
            WHEN coalesce(f.fpd_nao_ok_pct,0) <= 0.25                           THEN 'BAIXO VOLUME, BOA QUALIDADE'
            ELSE 'BAIXO VOLUME, QUALIDADE RUIM' END AS quadrante
FROM v_kpi_vendedor_mensal v
LEFT JOIN v_fpd_recorte f ON f.dimensao = 'VENDEDOR' AND f.valor = v.vendedor_login AND f.safra = v.mes_venda;

-- ---------------------------------------------------------------------
-- GEOGRAFIA: G01, G03, G05, G06
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_kpi_geografia AS
SELECT
    uf, cidade, bairro,
    count(*)                                                          AS vendas,
    round(count(*) FILTER (WHERE status_venda = 'CANCELADO')::numeric / NULLIF(count(*),0), 4) AS taxa_cancelamento,
    round(avg(pacote_valor), 2)                                       AS ticket_medio,
    sum(pacote_valor) FILTER (WHERE status_venda = 'ATIVO')           AS receita_ativa
FROM v_contrato_base
GROUP BY uf, cidade, bairro;

-- ---------------------------------------------------------------------
-- LGPD: leitura de cliente com documento mascarado (usar no lugar da tabela)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_cliente_mascarado AS
SELECT id, tipo_pessoa,
       CASE WHEN tipo_pessoa = 'CPF'
            THEN '***.' || substr(documento,4,3) || '.***-' || right(documento,2)
            ELSE '**.***.***/' || substr(documento,9,4) || '-' || right(documento,2) END AS documento_mascarado,
       nome,
       CASE WHEN contato IS NULL THEN NULL ELSE '(**) *****-' || right(regexp_replace(contato,'\D','','g'),4) END AS contato_mascarado
FROM cliente;
