import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { comPerfil } from "./db.js";
import { exigePerfil } from "./auth.js";
import { evento } from "./routes_auth.js";

const r = Router();
r.use(["/agentes", "/equipes"], exigePerfil("gestor"));

const PERFIS = ["administrador", "gestor", "coordenador", "lider", "backoffice", "vendedor"];   // "master" só é criado por script, nunca pelo site
const MASTER_SQL = "perfil_acesso = 'master'";
// o gestor não enxerga nem mexe em usuário master
const souMaster = (req) => !!req.user.master;
async function alvoProtegido(c, req, id) {
  if (souMaster(req)) return;
  if ((await c.query("SELECT 1 FROM usuario WHERE id=$1 AND perfil_acesso='master'", [id])).rowCount) throw erro("Colaborador não encontrado.", 404);
}
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const senhaTemp = () => {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(10), (b) => a[b % a.length]).join("") + "7";
};


const FUNCOES = ["VENDEDOR", "LIDER", "COORDENADOR", "BACKOFFICE", "COBRANCA", "POS_VENDA", "GESTOR"];
const dataOk = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(new Date(s)) ? s : null);
const semAcento = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const erro = (m, status = 400) => Object.assign(new Error(m), { status });
const SETORES = ["CADASTRO", "QUALIDADE"];
/** Backoffice tem setor (Cadastro ou Qualidade); outros perfis ficam sem. Exige o arquivo 13 no banco. */
async function gravarSetor(c, id, perfil, setor) {
  const tem = (await c.query("SELECT 1 FROM information_schema.columns WHERE table_schema = 'seven' AND table_name = 'usuario' AND column_name = 'setor'")).rowCount;
  if (!tem) { if (perfil === "backoffice" && setor === "QUALIDADE") throw erro("Rode o arquivo db/13_melhorias_out2026.sql no banco para usar o setor de Qualidade."); return; }
  await c.query("UPDATE usuario SET setor = $2 WHERE id = $1", [id, perfil === "backoffice" ? (SETORES.includes(setor) ? setor : "CADASTRO") : null]);
}

// GET /api/equipes -> equipes para os formulários
r.get("/equipes", async (req, res) => {
  res.json(await comPerfil(req.user, async (c) => (await c.query(
    `SELECT e.id, e.nome, e.ativa, e.lider_id, e.coordenador_id, l.nome_completo AS lider, co.nome_completo AS coordenador,
            (SELECT count(*)::int FROM equipe_membro m WHERE m.equipe_id = e.id AND m.fim IS NULL) AS membros
       FROM equipe e LEFT JOIN usuario l ON l.id = e.lider_id LEFT JOIN usuario co ON co.id = e.coordenador_id
      ORDER BY e.ativa DESC, e.nome`)).rows));
});

// GET /api/equipes/pessoas -> pessoas ativas para escolher supervisor / coordenador
r.get("/equipes/pessoas", async (req, res) => {
  res.json(await comPerfil(req.user, async (c) => (await c.query(
    `SELECT u.id, u.nome_completo AS nome, u.perfil_acesso, to_jsonb(u)->>'setor' AS setor, u.email,
            EXISTS (SELECT 1 FROM conta_acesso a WHERE a.usuario_id = u.id AND a.ativa) AS tem_acesso
       FROM usuario u WHERE u.ativo AND u.perfil_acesso <> 'master' ORDER BY u.nome_completo`)).rows));
});

// POST /api/equipes { nome, lider_id?, coordenador_id? }
r.post("/equipes", async (req, res) => {
  const nome = String(req.body.nome || "").trim().replace(/\s+/g, " ").toUpperCase();
  if (nome.length < 2) return res.status(400).json({ erro: "Informe o nome da equipe." });
  const id = await comPerfil(req.user, async (c) => {
    if ((await c.query("SELECT 1 FROM equipe WHERE upper(nome)=$1", [nome])).rowCount) throw erro("Já existe uma equipe com este nome.", 409);
    return (await c.query("INSERT INTO equipe (nome, lider_id, coordenador_id) VALUES ($1,$2,$3) RETURNING id",
      [nome, parseInt(req.body.lider_id, 10) || null, parseInt(req.body.coordenador_id, 10) || null])).rows[0].id;
  });
  res.status(201).json({ ok: true, id });
});

// PATCH /api/equipes/:id { nome?, lider_id?, coordenador_id?, ativa? }  (null = sem supervisor / sem coordenador)
r.patch("/equipes/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10), b = req.body || {};
  await comPerfil(req.user, async (c) => {
    if (!(await c.query("SELECT 1 FROM equipe WHERE id=$1", [id])).rowCount) throw erro("Equipe não encontrada.", 404);
    for (const k of ["lider_id", "coordenador_id"]) {
      if (!(k in b)) continue;
      const v = b[k] ? parseInt(b[k], 10) : null;
      if (v) {
        const u = (await c.query("SELECT perfil_acesso, ativo FROM usuario WHERE id=$1", [v])).rows[0];
        if (!u || u.perfil_acesso === "master") throw erro("Pessoa não encontrada.", 404);
        if (!u.ativo) throw erro("Esta pessoa está inativa.");
      }
      await c.query(`UPDATE equipe SET ${k}=$2 WHERE id=$1`, [id, v]);
    }
    if ("ativa" in b) await c.query("UPDATE equipe SET ativa=$2 WHERE id=$1", [id, !!b.ativa]);
    if (b.nome) {
      const nome = String(b.nome).trim().replace(/\s+/g, " ").toUpperCase();
      if ((await c.query("SELECT 1 FROM equipe WHERE upper(nome)=$1 AND id<>$2", [nome, id])).rowCount) throw erro("Já existe uma equipe com este nome.", 409);
      await c.query("UPDATE equipe SET nome=$2 WHERE id=$1", [id, nome]);
    }
  });
  res.json({ ok: true });
});

// login no padrão nome.sobrenome, sem acento e sem repetir
async function loginLivre(c, nome) {
  const p = semAcento(nome).toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).filter(Boolean);
  const base = p.length > 1 ? `${p[0]}.${p[p.length - 1]}` : p[0] || "usuario";
  for (let i = 0; i < 50; i++) {
    const cand = i ? `${base}${i + 1}` : base;
    if (!(await c.query("SELECT 1 FROM usuario WHERE login = $1", [cand])).rowCount) return cand;
  }
  throw erro("Não foi possível gerar um login. Informe outro nome.");
}

// troca a equipe do colaborador: fecha o vínculo atual e abre o novo
async function vincularEquipe(c, usuarioId, equipeId, desde) {
  const atual = (await c.query("SELECT id, equipe_id, inicio FROM equipe_membro WHERE usuario_id=$1 AND fim IS NULL ORDER BY inicio DESC", [usuarioId])).rows;
  if (equipeId && atual[0]?.equipe_id === equipeId) return false;
  if (equipeId && !(await c.query("SELECT 1 FROM equipe WHERE id=$1 AND ativa", [equipeId])).rowCount) throw erro("Equipe não encontrada ou inativa.", 404);
  const inicio = desde || new Date().toISOString().slice(0, 10);
  for (const m of atual) await c.query("UPDATE equipe_membro SET fim = GREATEST(inicio, $2::date) WHERE id=$1", [m.id, inicio]);
  if (equipeId) await c.query("INSERT INTO equipe_membro (equipe_id, usuario_id, inicio) VALUES ($1,$2,$3)", [equipeId, usuarioId, inicio]);
  return true;
}

// POST /api/agentes  -> colaborador novo (opcionalmente já com acesso ao site)
//   { nome_completo, funcoes[], equipe_id?, data_entrada?, criar_acesso?, email?, perfil? }
r.post("/agentes", async (req, res) => {
  const b = req.body || {};
  const nome = String(b.nome_completo || "").trim().replace(/\s+/g, " ").toUpperCase();
  if (nome.length < 5 || !nome.includes(" ")) return res.status(400).json({ erro: "Informe o nome completo." });
  const funcoes = [...new Set(Array.isArray(b.funcoes) && b.funcoes.length ? b.funcoes : ["VENDEDOR"])];
  if (funcoes.some((f) => !FUNCOES.includes(f))) return res.status(400).json({ erro: "Função inválida." });
  const entrada = b.data_entrada ? dataOk(b.data_entrada) : new Date().toISOString().slice(0, 10);
  if (!entrada) return res.status(400).json({ erro: "Data de entrada inválida." });
  const equipeId = b.equipe_id ? parseInt(b.equipe_id, 10) : null;
  const acesso = !!b.criar_acesso;
  const email = String(b.email || "").trim().toLowerCase();
  const perfil = b.perfil || (funcoes.includes("GESTOR") ? "gestor" : funcoes.includes("BACKOFFICE") ? "backoffice" : funcoes.includes("COORDENADOR") ? "coordenador" : funcoes.includes("LIDER") ? "lider" : "vendedor");
  if (!PERFIS.includes(perfil)) return res.status(400).json({ erro: "Perfil inválido." });
  if (acesso && !emailOk(email)) return res.status(400).json({ erro: "Para criar o acesso, informe um e-mail válido." });
  const senha = acesso ? senhaTemp() : null;
  const hash = acesso ? await bcrypt.hash(senha, 11) : null;
  let novo;
  try {
    novo = await comPerfil(req.user, async (c) => {
      const dup = (await c.query("SELECT id, nome_completo FROM usuario WHERE upper(nome_completo) = $1", [nome])).rows[0];
      if (dup) throw erro(`Já existe um colaborador chamado ${dup.nome_completo}. Use o cadastro existente.`, 409);
      const login = await loginLivre(c, nome);
      const u = (await c.query(
        "INSERT INTO usuario (login, nome_completo, email, perfil_acesso, data_entrada) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        [login, nome, acesso ? email : null, perfil, entrada])).rows[0];
      for (const f of funcoes) await c.query("INSERT INTO usuario_funcao (usuario_id, funcao) VALUES ($1,$2)", [u.id, f]);
      if (equipeId) await vincularEquipe(c, u.id, equipeId, entrada);
      if (acesso) {
        await c.query("INSERT INTO conta_acesso (usuario_id, senha_hash, criada_por) VALUES ($1,$2,$3)", [u.id, hash, req.user.id]);
        await evento(c, u.id, "CRIADA", req.user.id, `perfil=${perfil}${perfil === "backoffice" ? " setor=" + (b.setor || "CADASTRO") : ""}`);
      }
      await gravarSetor(c, u.id, perfil, b.setor);
      return { id: u.id, login };
    });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ erro: "Este e-mail já está em uso por outro agente." });
    throw e;
  }
  res.status(201).json({ ok: true, ...novo, senha_temporaria: senha });
});

// PATCH /api/agentes/:id  { nome_completo?, funcoes?, ativo?, equipe_id? (null = sem equipe), equipe_desde? }
r.patch("/agentes/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  if (id === req.user.id && b.ativo === false) return res.status(400).json({ erro: "Você não pode desativar o seu próprio cadastro." });
  if ("funcoes" in b && (!Array.isArray(b.funcoes) || !b.funcoes.length || b.funcoes.some((f) => !FUNCOES.includes(f))))
    return res.status(400).json({ erro: "Funções inválidas." });
  const nome = "nome_completo" in b ? String(b.nome_completo || "").trim().replace(/\s+/g, " ").toUpperCase() : null;
  if (nome !== null && (nome.length < 5 || !nome.includes(" "))) return res.status(400).json({ erro: "Informe o nome completo." });
  const desde = b.equipe_desde ? dataOk(b.equipe_desde) : null;
  if (b.equipe_desde && !desde) return res.status(400).json({ erro: "Data de início na equipe inválida." });
  await comPerfil(req.user, async (c) => {
    await alvoProtegido(c, req, id);
    if (!(await c.query("SELECT 1 FROM usuario WHERE id=$1", [id])).rowCount) throw erro("Colaborador não encontrado.", 404);
    if (nome !== null) {
      if ((await c.query("SELECT 1 FROM usuario WHERE upper(nome_completo)=$1 AND id<>$2", [nome, id])).rowCount) throw erro("Já existe outro colaborador com este nome.", 409);
      await c.query("UPDATE usuario SET nome_completo=$2 WHERE id=$1", [id, nome]);
    }
    if ("ativo" in b) await c.query("UPDATE usuario SET ativo=$2, data_saida = CASE WHEN $2 THEN NULL ELSE coalesce(data_saida, current_date) END WHERE id=$1", [id, !!b.ativo]);
    if ("funcoes" in b) {
      await c.query("DELETE FROM usuario_funcao WHERE usuario_id=$1", [id]);
      for (const f of new Set(b.funcoes)) await c.query("INSERT INTO usuario_funcao (usuario_id, funcao) VALUES ($1,$2)", [id, f]);
    }
    if ("equipe_id" in b) await vincularEquipe(c, id, b.equipe_id ? parseInt(b.equipe_id, 10) : null, desde);
  });
  res.json({ ok: true });
});

// GET /api/agentes?busca=&acesso=com|sem&pagina=1
r.get("/agentes", async (req, res) => {
  const busca = `%${String(req.query.busca || "").trim()}%`;
  const acesso = req.query.acesso;
  const pagina = Math.max(1, parseInt(req.query.pagina || "1", 10));
  const dados = await comPerfil(req.user, async (c) => {
    const w = ["(nome_completo ILIKE $1 OR login ILIKE $1 OR coalesce(email,'') ILIKE $1)"];
    if (!souMaster(req)) w.push("perfil_acesso <> 'master'");
    if (acesso === "com") w.push("tem_acesso");
    if (acesso === "sem") w.push("NOT tem_acesso");
    const total = (await c.query(`SELECT count(*)::int n FROM v_agentes_acesso WHERE ${w.join(" AND ")}`, [busca])).rows[0].n;
    const { rows } = await c.query(
      `SELECT * FROM v_agentes_acesso WHERE ${w.join(" AND ")} ORDER BY total_vendas DESC, nome_completo LIMIT 50 OFFSET $2`,
      [busca, (pagina - 1) * 50]);
    return { total, pagina, itens: rows };
  });
  res.json(dados);
});

// POST /api/agentes/:id/acesso  { email, perfil }  -> cria conta com senha temporária
r.post("/agentes/:id/acesso", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const email = String(req.body.email || "").trim().toLowerCase();
  const perfil = req.body.perfil;
  if (!emailOk(email)) return res.status(400).json({ erro: "E-mail inválido." });
  if (!PERFIS.includes(perfil)) return res.status(400).json({ erro: "Perfil inválido." });
  const senha = senhaTemp();
  const hash = await bcrypt.hash(senha, 11);
  const transferir = req.body.transferir === true;
  let transferido = false;
  try {
    await comPerfil(req.user, async (c) => {
      await alvoProtegido(c, req, id);
      const ag = (await c.query("SELECT id FROM usuario WHERE id=$1 AND ativo", [id])).rows[0];
      if (!ag) throw Object.assign(new Error("Agente não encontrado ou inativo."), { status: 404 });
      if ((await c.query("SELECT 1 FROM conta_acesso WHERE usuario_id=$1", [id])).rowCount)
        throw Object.assign(new Error("Este agente já tem acesso."), { status: 409 });
      // o e-mail já é de outro cadastro (ex.: a pessoa foi cadastrada duas vezes): oferece transferir o acesso para este
      const outro = (await c.query(`SELECT u.id, u.nome_completo, EXISTS (SELECT 1 FROM conta_acesso a WHERE a.usuario_id = u.id) AS tem
                                       FROM usuario u WHERE lower(u.email) = $1 AND u.id <> $2`, [email, id])).rows[0];
      if (outro && !transferir)
        throw Object.assign(new Error(`Este e-mail já é usado por ${outro.nome_completo}.`), { status: 409, extra: { conflito: { id: outro.id, nome: outro.nome_completo, tem_acesso: outro.tem } } });
      if (outro) {
        await alvoProtegido(c, req, outro.id);
        await c.query("UPDATE usuario SET email = NULL WHERE id = $1", [outro.id]);
        if (outro.tem) {   // a conta (com a mesma senha) passa a ser deste colaborador; o outro cadastro fica sem acesso
          await c.query("UPDATE usuario SET email=$2, perfil_acesso=$3 WHERE id=$1", [id, email, perfil]);
          await gravarSetor(c, id, perfil, req.body.setor);
          await c.query("UPDATE conta_acesso SET usuario_id = $1, atualizada_em = now() WHERE usuario_id = $2", [id, outro.id]);
          await evento(c, id, "PERFIL_ALTERADO", req.user.id, `acesso transferido de ${outro.nome_completo} (id ${outro.id})`);
          transferido = true;
          return;
        }
      }
      await c.query("UPDATE usuario SET email=$2, perfil_acesso=$3 WHERE id=$1", [id, email, perfil]);
      await gravarSetor(c, id, perfil, req.body.setor);
      await c.query("INSERT INTO conta_acesso (usuario_id, senha_hash, criada_por) VALUES ($1,$2,$3)", [id, hash, req.user.id]);
      await evento(c, id, "CRIADA", req.user.id, `perfil=${perfil}${perfil === "backoffice" ? " setor=" + (req.body.setor || "CADASTRO") : ""}`);
    });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ erro: "Este e-mail já está em uso por outro agente." });
    throw e;
  }
  if (transferido) return res.json({ ok: true, transferido: true });
  res.status(201).json({ ok: true, senha_temporaria: senha, aviso: "Mostrada só agora. O usuário deverá trocá-la no primeiro acesso." });
});

// PATCH /api/agentes/:id/acesso  { perfil?, ativa? }
r.patch("/agentes/:id/acesso", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { perfil, ativa } = req.body;
  if (perfil !== undefined && !PERFIS.includes(perfil)) return res.status(400).json({ erro: "Perfil inválido." });
  const email = req.body.email === undefined ? undefined : String(req.body.email || "").trim().toLowerCase();
  if (email !== undefined && !emailOk(email)) return res.status(400).json({ erro: "E-mail inválido." });
  if (id === req.user.id && (ativa === false || (perfil && !["gestor", "administrador"].includes(perfil))))
    return res.status(400).json({ erro: "Você não pode desativar nem rebaixar o seu próprio acesso." });
  await comPerfil(req.user, async (c) => {
    await alvoProtegido(c, req, id);
    if (!(await c.query("SELECT 1 FROM conta_acesso WHERE usuario_id=$1", [id])).rowCount)
      throw Object.assign(new Error("Este agente ainda não tem acesso."), { status: 404 });
    if (perfil) {
      await c.query("UPDATE usuario SET perfil_acesso=$2 WHERE id=$1", [id, perfil]);
      await gravarSetor(c, id, perfil, req.body.setor);
      await evento(c, id, "PERFIL_ALTERADO", req.user.id, `perfil=${perfil}${perfil === "backoffice" ? " setor=" + (req.body.setor || "CADASTRO") : ""}`);
    }
    if (email !== undefined) {
      if ((await c.query("SELECT 1 FROM usuario WHERE lower(email) = $1 AND id <> $2", [email, id])).rowCount)
        throw Object.assign(new Error("Este e-mail já é usado por outro colaborador."), { status: 409 });
      const n = (await c.query("UPDATE usuario SET email=$2 WHERE id=$1 AND lower(coalesce(email,'')) <> $2", [id, email])).rowCount;
      if (n) await evento(c, id, "PERFIL_ALTERADO", req.user.id, `e-mail de login alterado para ${email}`);
    }
    if (ativa !== undefined) {
      await c.query("UPDATE conta_acesso SET ativa=$2, falhas_login=0, bloqueada_ate=NULL, atualizada_em=now() WHERE usuario_id=$1", [id, !!ativa]);
      await evento(c, id, ativa ? "REATIVADA" : "DESATIVADA", req.user.id);
    }
  });
  res.json({ ok: true });
});

// GET /api/agentes/pedidos-senha -> quem pediu nova senha na tela de login e ainda não recebeu
r.get("/agentes/pedidos-senha", async (req, res) => {
  await comPerfil(req.user, async (c) => {
    const { rows } = await c.query(
      `SELECT u.id AS usuario_id, u.nome_completo, u.email, max(e.em) AS pedido_em
         FROM conta_acesso_evento e JOIN usuario u ON u.id = e.usuario_id
        WHERE e.acao = 'SENHA_SOLICITADA' AND u.perfil_acesso <> 'master'
          AND e.em > coalesce((SELECT max(x.em) FROM conta_acesso_evento x
                                       WHERE x.usuario_id = e.usuario_id AND x.acao IN ('SENHA_REDEFINIDA','SENHA_TROCADA')), '-infinity')
        GROUP BY u.id, u.nome_completo, u.email ORDER BY pedido_em DESC`);
    res.json(rows);
  });
});

// POST /api/agentes/:id/acesso/redefinir-senha
r.post("/agentes/:id/acesso/redefinir-senha", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const senha = senhaTemp();
  const hash = await bcrypt.hash(senha, 11);
  await comPerfil(req.user, async (c) => {
    await alvoProtegido(c, req, id);
    const n = (await c.query(
      "UPDATE conta_acesso SET senha_hash=$2, deve_trocar_senha=true, falhas_login=0, bloqueada_ate=NULL, atualizada_em=now() WHERE usuario_id=$1",
      [id, hash])).rowCount;
    if (!n) throw Object.assign(new Error("Este agente ainda não tem acesso."), { status: 404 });
    await evento(c, id, "SENHA_REDEFINIDA", req.user.id);
  });
  res.json({ ok: true, senha_temporaria: senha });
});

export default r;
