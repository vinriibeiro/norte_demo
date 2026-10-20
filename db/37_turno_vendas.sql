-- Turno de instalação (matinal / vespertina) nas vendas: usado no painel da equipe.
-- Acrescenta k.turno no fim da view (CREATE OR REPLACE mantém as permissões).
-- Rode no SQL Editor do Supabase, uma vez.
SET search_path = seven, public;

CREATE OR REPLACE VIEW v_vendas_det AS
SELECT b.contrato_id, b.vendedor_id, b.vendedor_nome AS vendedor, b.vendedor_login, b.data_venda, k.data_agendamento, b.status_venda,
       b.tem_bl, b.tem_tv, b.tem_multi, b.pacote_valor, b.equipe_id, b.equipe, b.cidade_id, b.cidade || '/' || b.uf AS cidade,
       b.forma_pagamento, b.tipo_imovel, b.canal, b.origem,
       li.nome_completo AS lider, co.nome_completo AS coordenador,
       coalesce(ch.nova, 0)::int AS chip_nova, coalesce(ch.mig, 0)::int AS chip_mig, coalesce(ch.port, 0)::int AS chip_port,
       EXISTS (SELECT 1 FROM contrato_item i JOIN produto p ON p.id = i.produto_id WHERE i.contrato_id = b.contrato_id AND p.categoria = 'FONE') AS tem_fone,
       b.uf, k.turno
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

CREATE OR REPLACE VIEW v_eq_vendas_det AS
SELECT * FROM v_vendas_det WHERE equipe_id IN (SELECT app_equipes_visiveis()) OR vendedor_id = app_usuario_id();
