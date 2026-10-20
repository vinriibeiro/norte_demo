-- ============================================================
-- 28 · Premiação padrão (tabela da foto) e venda Carrossel
-- - origem CARROSSEL: venda que não conta na premiação
-- - usuario.premiacao_tabela: PADRAO (faixas da tabela padrão) ou PROPRIA (regras antigas / tabela própria)
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================
SET search_path = seven, public;

INSERT INTO origem_venda (codigo, descricao) VALUES ('CARROSSEL', 'Venda Carrossel (não conta na premiação)')
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE usuario ADD COLUMN IF NOT EXISTS premiacao_tabela text NOT NULL DEFAULT 'PADRAO';
ALTER TABLE usuario DROP CONSTRAINT IF EXISTS usuario_premiacao_tabela_check;
ALTER TABLE usuario ADD CONSTRAINT usuario_premiacao_tabela_check CHECK (premiacao_tabela IN ('PADRAO', 'PROPRIA'));

-- A Naila tem tabela de premiação própria (ainda não recebida): fica fora da tabela padrão
UPDATE usuario SET premiacao_tabela = 'PROPRIA' WHERE nome_completo ILIKE '%NAILA%';
