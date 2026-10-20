-- Checagens além do endereço: crédito e linha móvel. Pedidos antigos continuam só com endereço (as checagens ficam desligadas).
ALTER TABLE seven.viabilidade
  ADD COLUMN IF NOT EXISTS checa_credito       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checa_linha         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cred_nome           text CHECK (length(cred_nome) <= 150),
  ADD COLUMN IF NOT EXISTS cred_cpf            char(11) CHECK (cred_cpf ~ '^[0-9]{11}$'),
  ADD COLUMN IF NOT EXISTS cred_nascimento     date,
  ADD COLUMN IF NOT EXISTS cred_cidade         text CHECK (length(cred_cidade) <= 100),
  ADD COLUMN IF NOT EXISTS credito_status      text NOT NULL DEFAULT 'PENDENTE' CHECK (credito_status IN ('PENDENTE','ATENDE','NAO_ATENDE')),
  ADD COLUMN IF NOT EXISTS credito_limite      numeric(12,2) CHECK (credito_limite IS NULL OR credito_limite >= 0),
  ADD COLUMN IF NOT EXISTS credito_respondido_em timestamptz,
  ADD COLUMN IF NOT EXISTS linha_cpf           char(11) CHECK (linha_cpf ~ '^[0-9]{11}$'),
  ADD COLUMN IF NOT EXISTS linha_status        text NOT NULL DEFAULT 'PENDENTE' CHECK (linha_status IN ('PENDENTE','ATENDE','NAO_ATENDE')),
  ADD COLUMN IF NOT EXISTS linha_respondido_em timestamptz;
