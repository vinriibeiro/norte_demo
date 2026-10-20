-- HP: número que a operadora gera para o endereço na verificação de viabilidade.
-- Só o backoffice de Cadastro preenche, depois do "Atende", antes de finalizar a venda. Apenas dígitos.
ALTER TABLE seven.viabilidade ADD COLUMN IF NOT EXISTS hp text CHECK (hp IS NULL OR hp ~ '^[0-9]{1,20}$');
