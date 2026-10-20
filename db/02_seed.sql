-- =====================================================================
-- Arquivo 2 de 4: dados iniciais (catálogos extraídos das planilhas)
-- Tudo aqui é editável depois. Itens marcados com [VALIDAR] dependem
-- de confirmação da Norte Link (ver lista de perguntas no documento de KPIs).
-- =====================================================================
SET search_path = seven, public;

INSERT INTO origem_venda (codigo, descricao) VALUES
  ('PAP', 'Porta a porta'),
  ('INDICAÇÃO', 'Indicação de cliente'),
  ('REDE SOCIAL', 'Lead vindo de rede social');

INSERT INTO canal_finalizacao (codigo, descricao) VALUES
  ('SISTEMA_C', 'Finalizada no SISTEMA_C'),
  ('SISTEMA_B', 'Finalizada no SISTEMA_B');

INSERT INTO tipo_contrato (codigo, descricao) VALUES
  ('PROSPECT', 'Cliente novo'),
  ('BASE', 'Venda para cliente da base');

INSERT INTO forma_pagamento (codigo, descricao, recorrente) VALUES
  ('BOLETO', 'Boleto', false),
  ('DCC',    'Pagamento recorrente automático [VALIDAR sigla]', true);

INSERT INTO turno_agenda (codigo, hora_inicio, hora_fim) VALUES
  ('08:00 AS 12:00', '08:00', '12:00'),
  ('12:00 AS 15:00', '12:00', '15:00'),
  ('15:00 AS 18:00', '15:00', '18:00'),
  ('12:00 AS 18:00', '12:00', '18:00');

INSERT INTO status_venda (codigo, descricao, conta_como_conectado) VALUES
  ('ATIVO',     'Instalado e conectado', true),
  ('PENDENTE',  'Aguardando instalação ou tratativa', false),
  ('CANCELADO', 'Cancelado antes ou na instalação', false);

INSERT INTO status_contrato (codigo, descricao, e_churn) VALUES
  ('CONECTADO',          'Cliente conectado', false),
  ('DESABILITADO',       'Desabilitado', true),
  ('DESC INADIMPLENCIA', 'Desconectado por inadimplência', true),
  ('DESC OPÇÃO',         'Desconectado por opção do cliente', true),
  ('CANCELADO',          'Cancelado', true);

-- Motivos (códigos Operadora vistos nas planilhas). evitavel = a gestão consegue reduzir.
INSERT INTO motivo (codigo, descricao, categoria, evitavel) VALUES
  ('100', 'AGENDA NÃO CUMPRIDA',                 'CONFIRMACAO',    true),
  ('101', 'ENDEREÇO NÃO LOCALIZADO',             'INFRAESTRUTURA', false),
  ('106', 'CLIENTE AUSENTE',                     'CONFIRMACAO',    true),
  ('110', 'PROBLEMA NA TUBULAÇÃO',               'INFRAESTRUTURA', false),
  ('203', 'REDE EXTERNA COM PROBLEMA',           'INFRAESTRUTURA', false),
  ('205', 'FALTA DE NAP / NAP LOTADA',           'INFRAESTRUTURA', false),
  ('211', 'FALTA NAP / NAP LOTADA',              'INFRAESTRUTURA', false),
  ('302', 'DESISTÊNCIA DE ASSINATURA',           'CLIENTE',        false),
  ('316', 'RUA NÃO CABEADA GPON',                'INFRAESTRUTURA', false),
  ('402', 'DIVERGÊNCIA DE DADOS CADASTRAIS',     'CADASTRO',       true);

INSERT INTO motivo (codigo, descricao, categoria, evitavel) VALUES
  (NULL, 'LIMPEZA DE AGENDAMENTO',              'OUTRO',          false),
  (NULL, 'CHUVA',                               'OUTRO',          false),
  (NULL, 'NO CX (cadastro no caixa, aguardando)', 'CADASTRO',     true),
  (NULL, 'ENDEREÇO NÃO ENCONTRADO NO CADASTRO', 'CADASTRO',       true),
  (NULL, 'REDE NEUTRA / BLOQUEIO COMERCIAL',    'INFRAESTRUTURA', false),
  (NULL, 'HP SEM BACKBONE',                     'INFRAESTRUTURA', false);

-- Produtos vistos nas planilhas. fator_pontos fica vazio até a Norte Link informar.
INSERT INTO produto (categoria, nome) VALUES
  ('TV', 'ACESSO VÍRTUA'),
  ('TV', 'ACESSO VÍRTUA MULT'),
  ('TV', 'ACESSO VÍRTUA PME'),
  ('TV', 'TV BOX'),
  ('FONE', 'ILIMITADO BRASIL TOTAL'),
  ('MESH', 'WI-FI MESH'),
  ('PONTO_ADICIONAL', 'PONTO ADICIONAL'),
  ('STREAMING', 'STREAMING');

INSERT INTO produto (categoria, nome, velocidade_mb) VALUES
  ('FIBRA', '250 MB', 250),
  ('FIBRA', '350 MB', 350),
  ('FIBRA', '400 MB', 400),
  ('FIBRA', '500 MB', 500),
  ('FIBRA', '600 MB', 600),
  ('FIBRA', '800 MB PME', 800),
  ('FIBRA', '1 GIGA', 1000),
  ('FIBRA', '1 GIGA (PONTO ULTRA)', 1000);

INSERT INTO produto (categoria, nome, tipo_movel, franquia_gb) VALUES
  ('MOVEL', 'CONTROLE 13 GB',  'CONTROLE', 13),
  ('MOVEL', 'CONTROLE 15 GB',  'CONTROLE', 15),
  ('MOVEL', 'CONTROLE 20 GB',  'CONTROLE', 20),
  ('MOVEL', 'CONTROLE 25 GB',  'CONTROLE', 25),
  ('MOVEL', 'PÓS 25 GB',       'POS', 25),
  ('MOVEL', 'PÓS 30 GB',       'POS', 30),
  ('MOVEL', 'PÓS 50 GB',       'POS', 50),
  ('MOVEL', 'PÓS 60 GB',       'POS', 60),
  ('MOVEL', 'PÓS 100 GB',      'POS', 100),
  ('MOVEL', 'PÓS 150 GB',      'POS', 150);

-- Cidades atendidas (as demais entram na importação)
INSERT INTO cidade (uf, nome) VALUES
  ('AC', 'RIO BRANCO'),
  ('RO', 'PORTO VELHO'),
  ('RO', 'ARIQUEMES'),
  ('RO', 'JI-PARANÁ'),
  ('GO', 'FORMOSA'),
  ('GO', 'PLANALTINA DE GOIÁS'),
  ('GO', 'ÁGUAS LINDAS DE GOIÁS'),
  ('GO', 'VALPARAÍSO DE GOIÁS'),
  ('GO', 'CIDADE OCIDENTAL'),
  ('DF', 'PLANALTINA'),
  ('DF', 'BRASÍLIA'),
  ('MS', 'CAMPO GRANDE');

-- Regras escritas nas abas META (editáveis)
INSERT INTO parametro (chave, valor, descricao) VALUES
  ('meta_bl_por_hc_lider',        13, 'BL por vendedor da equipe (líder)'),
  ('meta_bl_por_hc_coordenador',  12, 'BL por vendedor da equipe (coordenador)'),
  ('meta_minima_bl_supervisor',   52, 'Piso de BL por supervisor, independente do HC'),
  ('meta_fpd_max_pct',            25, 'Teto de FPD não pago (%) para elegibilidade [VALIDAR definição]'),
  ('fpd_volume_minimo',           30, 'Faturas resolvidas mínimas para comparar equipes/vendedores');
