-- Endereço passa a ser opcional: o vendedor escolhe Endereço, Crédito e/ou Linha móvel (ao menos um).
-- Pedidos antigos continuam com checa_endereco = true (comportamento atual).
-- Pode ser rodada mais de uma vez sem erro.
ALTER TABLE seven.viabilidade
  ADD COLUMN IF NOT EXISTS checa_endereco boolean NOT NULL DEFAULT true;

-- Pedido só de checagem não tem CEP nem rua.
ALTER TABLE seven.viabilidade ALTER COLUMN cep DROP NOT NULL, ALTER COLUMN logradouro DROP NOT NULL;

-- Novo status para pedido sem endereço: recria a constraint de status com o valor NAO_PEDIDO.
ALTER TABLE seven.viabilidade DROP CONSTRAINT IF EXISTS viabilidade_status_check;
ALTER TABLE seven.viabilidade ADD CONSTRAINT viabilidade_status_check
  CHECK (status IN ('PENDENTE','EM_ANALISE','ATENDE','NAO_ATENDE','NAO_PEDIDO'));
