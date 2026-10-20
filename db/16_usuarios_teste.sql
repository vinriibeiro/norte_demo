-- =====================================================================
-- Arquivo 16: contas de TESTE (uma por perfil) para conferir o site e o aplicativo
--   Senha de todas: Teste@App2026   (não pede troca no primeiro acesso)
--   Ficam na "EQUIPE TESTE", separadas das equipes reais.
--   Para APAGAR depois, rode o bloco "REMOVER" no fim deste arquivo.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez (não duplica; só renova a senha).
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET search_path TO seven, public, extensions;

DO $$
DECLARE
  contas text[][] := ARRAY[
    -- login,               nome,                          e-mail,                         perfil,        setor,       função
    ['teste.vendedor',    'TESTE VENDEDOR APP',          'vendedor@demo.local',         'vendedor',    '',          'VENDEDOR'],
    ['teste.supervisor',  'TESTE SUPERVISOR APP',        'supervisor@demo.local',       'lider',       '',          'LIDER'],
    ['teste.coordenador', 'TESTE COORDENADOR APP',       'coordenador@demo.local',      'coordenador', '',          'COORDENADOR'],
    ['teste.cadastro',    'TESTE BACKOFFICE CADASTRO',   'cadastro@demo.local',         'backoffice',  'CADASTRO',  'BACKOFFICE'],
    ['teste.qualidade',   'TESTE BACKOFFICE QUALIDADE',  'qualidade@demo.local',        'backoffice',  'QUALIDADE', 'BACKOFFICE'],
    ['teste.gerente',     'TESTE GERENTE APP',           'gerente@demo.local',          'gestor',      '',          'GESTOR']];
  i int; uid bigint; eq int; hash text := extensions.crypt('Teste@App2026', extensions.gen_salt('bf', 10));
BEGIN
  INSERT INTO equipe (nome, ativa) VALUES ('EQUIPE TESTE', true) ON CONFLICT (nome) DO NOTHING;
  SELECT id INTO eq FROM equipe WHERE nome = 'EQUIPE TESTE';
  FOR i IN 1 .. array_length(contas, 1) LOOP
    SELECT id INTO uid FROM usuario WHERE login = contas[i][1];
    IF uid IS NULL THEN
      INSERT INTO usuario (login, nome_completo, email, perfil_acesso, data_entrada, setor)
      VALUES (contas[i][1], contas[i][2], contas[i][3], contas[i][4], current_date, NULLIF(contas[i][5], ''))
      RETURNING id INTO uid;
      INSERT INTO usuario_funcao (usuario_id, funcao) VALUES (uid, contas[i][6]);
    ELSE
      UPDATE usuario SET ativo = true, perfil_acesso = contas[i][4], setor = NULLIF(contas[i][5], ''), email = contas[i][3] WHERE id = uid;
    END IF;
    INSERT INTO conta_acesso (usuario_id, senha_hash, deve_trocar_senha) VALUES (uid, hash, false)
      ON CONFLICT (usuario_id) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, deve_trocar_senha = false, ativa = true, falhas_login = 0, bloqueada_ate = NULL;
    IF contas[i][4] = 'vendedor' AND NOT EXISTS (SELECT 1 FROM equipe_membro WHERE usuario_id = uid AND fim IS NULL) THEN
      INSERT INTO equipe_membro (equipe_id, usuario_id, inicio) VALUES (eq, uid, current_date);
    END IF;
    IF contas[i][4] = 'lider' THEN UPDATE equipe SET lider_id = uid WHERE id = eq; END IF;
    IF contas[i][4] = 'coordenador' THEN UPDATE equipe SET coordenador_id = uid WHERE id = eq; END IF;
  END LOOP;
END $$;

SELECT u.login, u.email, u.perfil_acesso, u.setor, 'Teste@App2026' AS senha
  FROM usuario u WHERE u.login LIKE 'teste.%' ORDER BY u.id;

-- ===================== REMOVER (quando terminar os testes) =====================
-- Selecione só as linhas abaixo (sem os "--") e rode:
-- UPDATE conta_acesso SET ativa = false WHERE usuario_id IN (SELECT id FROM usuario WHERE login LIKE 'teste.%');
-- UPDATE usuario SET ativo = false WHERE login LIKE 'teste.%';
-- UPDATE equipe SET ativa = false WHERE nome = 'EQUIPE TESTE';
