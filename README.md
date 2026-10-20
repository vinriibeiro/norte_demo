# Norte Link · Demonstração de gestão de vendas

Sistema web de gestão de vendas para provedores de internet e telefonia, com dados **fictícios**.
Nenhuma pessoa, cliente ou empresa real aparece aqui.

## O que tem

- **Vendas:** lançamento, lista com filtros, edição e exportação.
- **Viabilidade:** o vendedor pede a análise do endereço; o backoffice responde Atende / Não atende.
- **Confirmação D-1 / D-15** e **rota de instalação** com agenda por turno.
- **Visão da equipe:** vendedores, vendas por turno (matinal e vespertina) e alertas de quem está parado.
- **CRM do vendedor:** calendário de retornos com aviso e repetição.
- **Premiação e FPD:** apuração mensal por faixa, com regra de exemplo.
- **Perfis:** gestor, backoffice, vendedor, supervisor e coordenador, com as permissões aplicadas no próprio banco.
- **App para o celular** (instalável na tela inicial).

## Acessos de demonstração

Senha de todos: `Teste@App2026`

| Login | Perfil |
|---|---|
| teste.gerente | gestor (vê tudo) |
| teste.vendedor | vendedor |
| teste.supervisor | supervisor |
| teste.coordenador | coordenador |
| teste.cadastro | backoffice de cadastro |
| teste.qualidade | backoffice de qualidade |

## Como rodar

1. Crie um banco e rode os arquivos de `db/` em ordem, de `01_schema.sql` a `37_turno_vendas.sql`, depois `16_usuarios_teste.sql` e `38_dados_ficticios.sql`.
   O `16` cria as contas de teste e o `38` cria equipes, vendedores, vendas e demais dados fictícios.
2. Em `api/`, copie `.env.example` para `.env` e preencha `DATABASE_URL` e `JWT_SECRET`.
3. `cd api && npm install && npm start`
4. Abra `http://localhost:3001`.

## Como publicar (gratuito)

- **Banco:** um projeto novo no Supabase (plano gratuito), usado só para a demonstração. Rode os arquivos de `db/` no SQL Editor, na ordem.
- **Servidor:** um serviço Web no Render apontando para este repositório, com `DATABASE_URL` e `JWT_SECRET` nas variáveis de ambiente.
- No plano gratuito, o Render dorme após um tempo sem acesso e a primeira abertura demora cerca de 30 a 60 segundos.

## Tecnologia

- Servidor: Node.js + Express (`api/src`)
- Telas: HTML, CSS e JavaScript puros, sem build (`api/public`)
- Banco: PostgreSQL, schema `seven` (nome técnico, mantido por compatibilidade)
