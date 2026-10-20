-- =====================================================================
-- CRM do vendedor: clientes em acompanhamento e retornos agendados (calendário).
-- O vendedor vê e edita só os dele; o gerente e o administrador só consultam.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- =====================================================================
SET search_path = seven, public;

CREATE TABLE IF NOT EXISTS crm_cliente (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vendedor_id   bigint NOT NULL REFERENCES usuario(id),
  nome          text NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 150),
  telefone      text,
  observacao    text CHECK (char_length(observacao) <= 1000),
  status        text NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','ARQUIVADO','PERDIDO','CONVERTIDO')),
  encerrado_em  timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_crm_cliente_vendedor ON crm_cliente (vendedor_id, status);

CREATE TABLE IF NOT EXISTS crm_retorno (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id    bigint NOT NULL REFERENCES crm_cliente(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('TRATANDO','RETORNAR','PROPOSTA')),
  data_hora     timestamptz NOT NULL,
  aviso_minutos integer NOT NULL DEFAULT 5 CHECK (aviso_minutos BETWEEN 1 AND 10),
  repetir_dias  integer CHECK (repetir_dias IS NULL OR repetir_dias BETWEEN 1 AND 90),
  observacao    text CHECK (char_length(observacao) <= 1000),
  avisado_em    timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_crm_retorno_data ON crm_retorno (data_hora) WHERE avisado_em IS NULL;

ALTER TABLE crm_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_retorno ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_cliente_dono ON crm_cliente;
CREATE POLICY crm_cliente_dono ON crm_cliente FOR ALL TO seven_vendedor
  USING (vendedor_id = app_usuario_id()) WITH CHECK (vendedor_id = app_usuario_id());
DROP POLICY IF EXISTS crm_cliente_gestor ON crm_cliente;
CREATE POLICY crm_cliente_gestor ON crm_cliente FOR SELECT TO seven_gestor USING (true);

DROP POLICY IF EXISTS crm_retorno_dono ON crm_retorno;
CREATE POLICY crm_retorno_dono ON crm_retorno FOR ALL TO seven_vendedor
  USING (EXISTS (SELECT 1 FROM crm_cliente c WHERE c.id = cliente_id AND c.vendedor_id = app_usuario_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM crm_cliente c WHERE c.id = cliente_id AND c.vendedor_id = app_usuario_id()));
DROP POLICY IF EXISTS crm_retorno_gestor ON crm_retorno;
CREATE POLICY crm_retorno_gestor ON crm_retorno FOR SELECT TO seven_gestor USING (true);

REVOKE ALL ON crm_cliente, crm_retorno FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_cliente, crm_retorno TO seven_vendedor;
GRANT SELECT ON crm_cliente, crm_retorno TO seven_gestor;
GRANT USAGE ON SEQUENCE crm_cliente_id_seq, crm_retorno_id_seq TO seven_vendedor;
