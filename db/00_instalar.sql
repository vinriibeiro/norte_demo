-- Instalador: cria o banco "norte" e roda os 4 arquivos na ordem.
-- Rode DENTRO da pasta db, com o psql:
--     psql -U postgres -f 00_instalar.sql
-- (No Windows, abra o "SQL Shell (psql)" ou o cmd na pasta db; se o psql não for reconhecido,
--  use o caminho completo, ex.: "C:\Program Files\PostgreSQL\16\bin\psql.exe")
-- Para recriar do zero: DROP DATABASE seven;  e rode de novo.

\set ON_ERROR_STOP on
CREATE DATABASE seven ENCODING 'UTF8';
\connect seven
\ir 01_schema.sql
\ir 02_seed.sql
\ir 03_views_kpi.sql
\ir 04_acesso.sql
\echo 'Banco seven instalado com sucesso.'
