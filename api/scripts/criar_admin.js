// Cria (ou reaproveita) o PRIMEIRO gestor.  Uso:  npm run admin -- email@dominio.com "NOME COMPLETO"
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { pool } from "../src/db.js";

const email = (process.argv[2] || "").trim().toLowerCase();
const nome = (process.argv[3] || "").trim().toUpperCase();
if (!email || !nome) { console.log('Uso: npm run admin -- email@dominio.com "NOME COMPLETO"'); process.exit(1); }

const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const senha = Array.from(crypto.randomBytes(10), (b) => a[b % a.length]).join("") + "7";
const c = await pool.connect();
try {
  await c.query("BEGIN");
  let u = (await c.query("SELECT id FROM usuario WHERE lower(email)=$1", [email])).rows[0];
  if (!u) {
    const login = email.split("@")[0].toLowerCase().replace(/[^a-z0-9.]/g, "");
    u = (await c.query(
      "INSERT INTO usuario (login, nome_completo, email, perfil_acesso) VALUES ($1,$2,$3,'gestor') RETURNING id",
      [login, nome, email])).rows[0];
  } else {
    await c.query("UPDATE usuario SET perfil_acesso='gestor', ativo=true WHERE id=$1", [u.id]);
  }
  await c.query("INSERT INTO usuario_funcao (usuario_id, funcao) VALUES ($1,'GESTOR') ON CONFLICT DO NOTHING", [u.id]);
  const hash = await bcrypt.hash(senha, 11);
  await c.query(
    `INSERT INTO conta_acesso (usuario_id, senha_hash, deve_trocar_senha) VALUES ($1,$2,true)
     ON CONFLICT (usuario_id) DO UPDATE SET senha_hash=$2, deve_trocar_senha=true, ativa=true, falhas_login=0, bloqueada_ate=NULL`,
    [u.id, hash]);
  await c.query("INSERT INTO conta_acesso_evento (usuario_id, acao, detalhe) VALUES ($1,'CRIADA','primeiro gestor (script)')", [u.id]);
  await c.query("COMMIT");
  console.log(`\nGestor pronto: ${email}\nSenha temporária: ${senha}\n(Você será obrigado a trocá-la no primeiro acesso.)\n`);
} catch (e) { await c.query("ROLLBACK"); console.error("Erro:", e.message); process.exitCode = 1; }
finally { c.release(); await pool.end(); }
