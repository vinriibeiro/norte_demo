-- =====================================================================
-- Arquivo 17: conserta a segurança por linha (RLS) ligada em 10/10/2026
--
-- O QUE ACONTECEU: a RLS (Row Level Security) foi ligada em cliente_observacao,
-- confirmacao_venda, feriado e qualidade_lote, mas nenhuma regra (policy) foi criada
-- para essas tabelas. No PostgreSQL, tabela com RLS ligada e SEM policy fica
-- INVISÍVEL para todos os perfis: o SELECT devolve zero linhas (sem erro) e o
-- INSERT é recusado. Na prática, com a RLS como está hoje:
--   · Feriados e dias úteis: a tela abre vazia e não deixa cadastrar;
--   · Observações do cliente: o histórico desaparece e não grava;
--   · Confirmação D-1 / D-15: a lista fica vazia e não registra a ligação;
--   · Lançar FPD: o histórico de envios fica vazio.
--
-- Este arquivo MANTÉM a RLS ligada (que é o certo) e cria as regras que faltaram,
-- espelhando exatamente as permissões que cada perfil já tinha.
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================
SET search_path TO seven, public;

-- ---------------------------------------------------------------------
-- 1) Feriados: todos os perfis leem (a previsão 6x1 usa o calendário);
--    só o gerente cadastra, altera e exclui.
-- ---------------------------------------------------------------------
ALTER TABLE feriado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feriado_leitura ON feriado;
CREATE POLICY feriado_leitura ON feriado FOR SELECT
  TO seven_gestor, seven_backoffice, seven_lider, seven_coordenador, seven_vendedor
  USING (true);
DROP POLICY IF EXISTS feriado_gestor ON feriado;
CREATE POLICY feriado_gestor ON feriado FOR ALL TO seven_gestor USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 2) Observações do cliente: gerente e backoffice leem e escrevem;
--    o vendedor lê e escreve só as observações de clientes das vendas dele.
-- ---------------------------------------------------------------------
ALTER TABLE cliente_observacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS obs_staff ON cliente_observacao;
CREATE POLICY obs_staff ON cliente_observacao FOR ALL
  TO seven_gestor, seven_backoffice USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS obs_vendedor ON cliente_observacao;
CREATE POLICY obs_vendedor ON cliente_observacao FOR SELECT TO seven_vendedor
  USING (EXISTS (SELECT 1 FROM contrato k WHERE k.cliente_id = cliente_observacao.cliente_id
                   AND k.vendedor_id = seven.app_usuario_id()));
DROP POLICY IF EXISTS obs_equipe ON cliente_observacao;
CREATE POLICY obs_equipe ON cliente_observacao FOR SELECT TO seven_lider, seven_coordenador
  USING (EXISTS (SELECT 1 FROM contrato k WHERE k.cliente_id = cliente_observacao.cliente_id
                   AND k.equipe_id IN (SELECT seven.app_equipes_visiveis())));

-- ---------------------------------------------------------------------
-- 3) Confirmação D-1 / D-15: gerente e backoffice leem e registram.
--    Vendedor, supervisor e coordenador apenas leem o que é do escopo deles.
-- ---------------------------------------------------------------------
ALTER TABLE confirmacao_venda ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conf_staff ON confirmacao_venda;
CREATE POLICY conf_staff ON confirmacao_venda FOR ALL
  TO seven_gestor, seven_backoffice USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS conf_vendedor ON confirmacao_venda;
CREATE POLICY conf_vendedor ON confirmacao_venda FOR SELECT TO seven_vendedor
  USING (EXISTS (SELECT 1 FROM contrato k WHERE k.id = confirmacao_venda.contrato_id
                   AND k.vendedor_id = seven.app_usuario_id()));
DROP POLICY IF EXISTS conf_equipe ON confirmacao_venda;
CREATE POLICY conf_equipe ON confirmacao_venda FOR SELECT TO seven_lider, seven_coordenador
  USING (EXISTS (SELECT 1 FROM contrato k WHERE k.id = confirmacao_venda.contrato_id
                   AND k.equipe_id IN (SELECT seven.app_equipes_visiveis())));

-- ---------------------------------------------------------------------
-- 4) Lotes de qualidade (FPD): só o gerente lança; o backoffice de
--    Qualidade apenas consulta o histórico de envios.
-- ---------------------------------------------------------------------
ALTER TABLE qualidade_lote ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qual_gestor ON qualidade_lote;
CREATE POLICY qual_gestor ON qualidade_lote FOR ALL TO seven_gestor USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS qual_backoffice ON qualidade_lote;
CREATE POLICY qual_backoffice ON qualidade_lote FOR SELECT TO seven_backoffice USING (true);

-- ---------------------------------------------------------------------
-- 5) Ocultar o usuário master: a regra criada usava o login fixo
--    "vinriibeiro". Trocamos por "quem tem perfil master", que continua
--    valendo se o login mudar ou se existir outro master.
--    O próprio master continua enxergando a si mesmo.
-- ---------------------------------------------------------------------
ALTER TABLE usuario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ocultar_master ON usuario;
CREATE POLICY ocultar_master ON usuario
  USING (perfil_acesso <> 'master' OR id = seven.app_usuario_id())
  WITH CHECK (perfil_acesso <> 'master' OR id = seven.app_usuario_id());

-- ---------------------------------------------------------------------
-- 6) Defesa em profundidade: o Backoffice não deve enxergar premiação,
--    extrato, contas de acesso nem FPD somado (a regra combinada é que
--    isso fica com Gerente e Administrador). O site já bloqueia; aqui o
--    banco passa a bloquear também.
--    Se algum dia o Backoffice precisar de uma dessas telas, basta
--    devolver o GRANT correspondente.
-- ---------------------------------------------------------------------
REVOKE SELECT ON comissao_pessoa, comissao_plano, comissao_tabela FROM seven_backoffice;
REVOKE SELECT ON extrato_linha, extrato_lote FROM seven_backoffice;
REVOKE SELECT ON conta_acesso, conta_acesso_evento, v_agentes_acesso FROM seven_backoffice;
REVOKE SELECT ON v_eq_fpd FROM seven_backoffice;
REVOKE USAGE ON SEQUENCE comissao_pessoa_id_seq, comissao_plano_id_seq, comissao_tabela_id_seq,
  conta_acesso_evento_id_seq, extrato_linha_id_seq, extrato_lote_id_seq FROM seven_backoffice;

-- ---------------------------------------------------------------------
-- 7) Conferência: depois de rodar, estas contagens têm de vir com número
--    (e não zero). Se vier zero, avise que a RLS ainda está sem regra.
-- ---------------------------------------------------------------------
DO $$
DECLARE f int; u int;
BEGIN
  SET LOCAL ROLE seven_gestor;
  SELECT count(*) INTO f FROM feriado;
  SELECT count(*) INTO u FROM usuario;
  RAISE NOTICE 'Conferência com o perfil do gerente -> feriados visíveis: %, usuários visíveis: %', f, u;
  RESET ROLE;
END $$;

SELECT tablename AS tabela, rowsecurity AS rls_ligada,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'seven' AND p.tablename = t.tablename) AS regras
  FROM pg_tables t WHERE schemaname = 'seven' AND rowsecurity ORDER BY 1;
