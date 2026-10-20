-- =====================================================================
-- Contestar viabilidade (vendedor): depois de "Não atende", o vendedor pode contestar
-- com uma justificativa, quantas vezes quiser, em até 7 dias da resposta.
-- A venda volta para a fila do backoffice (Aguardando) e fica registrada nas observações.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- =====================================================================
SET search_path = seven, public;

CREATE OR REPLACE FUNCTION viabilidade_contestar(p_id bigint, p_texto text) RETURNS void AS $$
DECLARE v record;
BEGIN
  SELECT id, vendedor_id, status, respondido_em INTO v FROM viabilidade WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viabilidade não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF v.vendedor_id IS DISTINCT FROM app_usuario_id() THEN RAISE EXCEPTION 'Sem permissão para este pedido.' USING ERRCODE = '42501'; END IF;
  IF v.status <> 'NAO_ATENDE' THEN RAISE EXCEPTION 'Só dá para contestar um pedido com "Não atende".' USING ERRCODE = 'P0001'; END IF;
  IF v.respondido_em IS NULL OR v.respondido_em < now() - interval '7 days' THEN
    RAISE EXCEPTION 'O prazo de 7 dias para contestar esta resposta terminou.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO viabilidade_obs (viabilidade_id, autor_id, texto) VALUES (p_id, app_usuario_id(), 'CONTESTAÇÃO: ' || p_texto);
  UPDATE viabilidade SET status = 'PENDENTE', em_analise_por = NULL, respondido_por = NULL, respondido_em = NULL, visto_vendedor_em = NULL
    WHERE id = p_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = seven, public;

REVOKE ALL ON FUNCTION viabilidade_contestar(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION viabilidade_contestar(bigint, text) TO seven_vendedor;
