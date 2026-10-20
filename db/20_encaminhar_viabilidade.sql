-- Encaminhamento da venda pelo vendedor, depois do "Atende".
-- Destino: SISTEMA_A ou SISTEMA_B. O vendedor só escreve nessas duas colunas (e só nas próprias viabilidades).
ALTER TABLE seven.viabilidade ADD COLUMN IF NOT EXISTS encaminhado_para text CHECK (encaminhado_para IN ('SISTEMA_A','SISTEMA_B'));
ALTER TABLE seven.viabilidade ADD COLUMN IF NOT EXISTS encaminhado_em timestamptz;
GRANT UPDATE (encaminhado_para, encaminhado_em) ON seven.viabilidade TO seven_vendedor;
