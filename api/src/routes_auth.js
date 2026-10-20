import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { pool } from "./db.js";
import { assinar, exigeLogin, cargoDe, setorDe } from "./auth.js";

const r = Router();
// Limites por IP: login (só conta as tentativas erradas) e troca de senha
const limite = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false,
  message: { erro: "Muitas tentativas deste aparelho. Aguarde 15 minutos e tente de novo." } });
const limiteSenha = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { erro: "Muitas tentativas. Aguarde 15 minutos." } });

const origem = (req) => `ip=${req.ip}; navegador=${String(req.headers["user-agent"] || "").slice(0, 160)}`;

async function evento(c, usuario_id, acao, feito_por = null, detalhe = null) {
  await c.query("INSERT INTO conta_acesso_evento (usuario_id, acao, feito_por, detalhe) VALUES ($1,$2,$3,$4)",
    [usuario_id, acao, feito_por, detalhe]);
}

const COMUNS = ["12345678", "123456789", "1234567890", "senha123", "senha1234", "password1", "qwerty123", "abc12345", "abcd1234",
  "mudar123", "trocar123", "seven123", "seven2026", "claro123", "admin123", "teste123", "brasil123", "11111111a", "a1234567", "1q2w3e4r", "1q2w3e4r5t"];
/** 10+ caracteres, letras e números, não pode ser senha óbvia nem conter o próprio e-mail. */
export function senhaForte(s, email = "") {
  if (typeof s !== "string" || s.length < 10 || s.length > 128 || !/[A-Za-z]/.test(s) || !/\d/.test(s)) return false;
  const b = s.toLowerCase();
  if (COMUNS.some((c) => b.includes(c))) return false;
  if (/^(.)\1+$/.test(s)) return false;
  const nome = String(email).split("@")[0].toLowerCase();
  if (nome.length >= 4 && b.includes(nome)) return false;
  return true;
}

// POST /api/auth/login  { email, senha }
r.post("/auth/login", limite, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const senha = String(req.body.senha || "");
  const erroGenerico = () => res.status(401).json({ erro: "E-mail ou senha incorretos." });
  if (!email || !senha || email.length > 200 || senha.length > 200) return erroGenerico();

  const { rows } = await pool.query(
    `SELECT u.id, u.nome_completo, u.perfil_acesso, u.ativo, c.senha_hash, c.deve_trocar_senha, c.ativa,
            c.falhas_login, c.bloqueada_ate, c.token_versao, to_jsonb(u)->>'setor' AS setor
       FROM usuario u JOIN conta_acesso c ON c.usuario_id = u.id WHERE lower(u.email) = $1`, [email]);
  const u = rows[0];
  if (!u) { await bcrypt.compare(senha, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi"); return erroGenerico(); }
  if (u.bloqueada_ate && new Date(u.bloqueada_ate) > new Date())
    return res.status(423).json({ erro: "Conta bloqueada por tentativas erradas. Tente mais tarde." });
  if (!u.ativa || !u.ativo) return res.status(403).json({ erro: "Acesso desativado. Fale com o administrador." });

  if (!(await bcrypt.compare(senha, u.senha_hash))) {
    const falhas = u.falhas_login + 1;
    const bloquear = falhas >= 5;
    await pool.query(
      `UPDATE conta_acesso SET falhas_login = $2, bloqueada_ate = CASE WHEN $3 THEN now() + interval '15 minutes' END,
              atualizada_em = now() WHERE usuario_id = $1`, [u.id, bloquear ? 0 : falhas, bloquear]);
    await evento(pool, u.id, bloquear ? "BLOQUEADA" : "LOGIN_FALHOU", null, origem(req));
    return erroGenerico();
  }
  await pool.query("UPDATE conta_acesso SET falhas_login = 0, bloqueada_ate = NULL, ultimo_login = now() WHERE usuario_id = $1", [u.id]);
  await evento(pool, u.id, "LOGIN_OK", null, origem(req));
  const user = { id: u.id, perfil: u.perfil_acesso, cargo: cargoDe(u.perfil_acesso), nome: u.nome_completo, trocar: u.deve_trocar_senha, setor: setorDe(u.perfil_acesso, u.setor) };
  res.json({ token: assinar({ ...user, v: u.token_versao }), usuario: user });
});

// POST /api/auth/esqueci-senha  { email } — registra o pedido; o gerente gera a senha temporária em "Usuários e acessos".
// A resposta é sempre a mesma, exista ou não o e-mail, para não revelar quem tem acesso.
const limiteEsqueci = rateLimit({ windowMs: 60 * 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false,
  message: { erro: "Muitos pedidos deste aparelho. Tente novamente mais tarde ou fale com seu gerente." } });
r.post("/auth/esqueci-senha", limiteEsqueci, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email || email.length > 200 || !email.includes("@")) return res.status(400).json({ erro: "Informe o e-mail do seu acesso." });
  try {
    const u = (await pool.query(
      `SELECT u.id FROM usuario u JOIN conta_acesso c ON c.usuario_id = u.id
        WHERE lower(u.email) = $1 AND u.ativo AND c.ativa AND u.perfil_acesso <> 'master'`, [email])).rows[0];
    if (u) {
      const recente = (await pool.query(
        "SELECT 1 FROM conta_acesso_evento WHERE usuario_id=$1 AND acao='SENHA_SOLICITADA' AND em > now() - interval '10 minutes'", [u.id])).rowCount;
      if (!recente) await evento(pool, u.id, "SENHA_SOLICITADA", null, origem(req));
    }
  } catch (e) { console.error("esqueci-senha:", e.message); }
  res.json({ ok: true, mensagem: "Pedido enviado. Seu gerente vai gerar uma senha temporária e passar para você. Se o e-mail estiver cadastrado, ele já foi avisado." });
});

// POST /api/auth/trocar-senha  { senha_atual, senha_nova }
r.post("/auth/trocar-senha", limiteSenha, exigeLogin, async (req, res) => {
  if (req.user.verComo) return res.status(403).json({ erro: "Não disponível no modo “ver como”." });
  const { senha_atual, senha_nova } = req.body;
  const email = (await pool.query("SELECT email FROM usuario WHERE id=$1", [req.user.id])).rows[0]?.email || "";
  if (!senhaForte(senha_nova, email))
    return res.status(400).json({ erro: "A senha nova precisa ter 10+ caracteres, com letras e números, e não pode ser óbvia (ex.: 12345678, senha123) nem conter seu e-mail." });
  const { rows } = await pool.query("SELECT senha_hash FROM conta_acesso WHERE usuario_id = $1 AND ativa", [req.user.id]);
  if (!rows[0] || !(await bcrypt.compare(String(senha_atual || ""), rows[0].senha_hash)))
    return res.status(401).json({ erro: "Senha atual incorreta." });
  if (senha_atual === senha_nova) return res.status(400).json({ erro: "A senha nova deve ser diferente da atual." });
  const hash = await bcrypt.hash(senha_nova, 11);
  // o banco muda a versão da conta: as sessões em outros aparelhos caem, esta recebe um token novo
  const v = (await pool.query("UPDATE conta_acesso SET senha_hash=$2, deve_trocar_senha=false, atualizada_em=now() WHERE usuario_id=$1 RETURNING token_versao", [req.user.id, hash])).rows[0].token_versao;
  await evento(pool, req.user.id, "SENHA_TROCADA", req.user.id, origem(req));
  res.json({ token: assinar({ ...req.user, perfil: req.user.master ? "master" : req.user.perfil, trocar: false, v }), ok: true });
});

// POST /api/auth/sair-todos  — encerra a sessão em TODOS os aparelhos (inclusive este)
r.post("/auth/sair-todos", exigeLogin, async (req, res) => {
  if (req.user.verComo) return res.status(403).json({ erro: "Não disponível no modo “ver como”." });
  await pool.query("UPDATE conta_acesso SET token_versao = token_versao + 1 WHERE usuario_id=$1", [req.user.id]);
  await evento(pool, req.user.id, "SESSOES_ENCERRADAS", req.user.id, origem(req));
  res.json({ ok: true });
});

r.get("/auth/eu", exigeLogin, (req, res) => { const { v, ...u } = req.user; res.json({ usuario: u }); });

export { evento };
export default r;
