import jwt from "jsonwebtoken";
import "dotenv/config";
import { pool } from "./db.js";

// Token assinado só com HS256, emissor e público fixos, validade de 8h.
const OPC = { algorithm: "HS256", issuer: "norte-api", audience: "norte-web", expiresIn: "8h" };

/** u = { id, perfil, nome, trocar, v (token_versao da conta) } */
export const assinar = (u) =>
  jwt.sign({ id: u.id, perfil: u.perfil, nome: u.nome, trocar: !!u.trocar, v: u.v }, process.env.JWT_SECRET, OPC);

/** "administrador" tem exatamente as permissões do gerente (perfil interno "gestor"); só o nome muda. */
export const efetivo = (p) => (p === "administrador" ? "gestor" : p);
export const cargoDe = (p) => (p === "administrador" ? "administrador" : p === "gestor" ? "gerente" : p);

const negar = (res, msg = "Sessão inválida ou expirada.") => res.status(401).json({ erro: msg });

const contas = new Map();
export const esquecerContas = () => contas.clear();
async function contaDe(id) {
  const m = contas.get(id);
  if (m && m.ate > Date.now()) return m.c;
  const c = (await pool.query(
    `SELECT u.nome_completo, u.perfil_acesso, u.ativo, a.ativa, a.token_versao, a.deve_trocar_senha, to_jsonb(u)->>'setor' AS setor
       FROM usuario u JOIN conta_acesso a ON a.usuario_id = u.id WHERE u.id = $1`, [id])).rows[0];
  if (contas.size > 2000) contas.clear();
  if (c) contas.set(id, { c, ate: Date.now() + 15000 });
  return c;
}

export async function exigeLogin(req, res, next) {
  const h = req.headers.authorization || "";
  let tok;
  try {
    tok = jwt.verify(h.replace(/^Bearer /, ""), process.env.JWT_SECRET, { algorithms: ["HS256"], issuer: OPC.issuer, audience: OPC.audience });
  } catch {
    return negar(res);
  }
  try {
    // Confere a conta no banco: desativada, senha trocada, perfil mudado ou "sair de todos" => sessão derrubada.
    // A conferência fica guardada por 15 s (e é apagada a cada alteração feita pelo sistema) para não ir ao banco em todo clique.
    const c = await contaDe(tok.id);
    if (!c || !c.ativo || !c.ativa) return negar(res, "Acesso desativado. Fale com o administrador.");
    if (tok.v !== c.token_versao) return negar(res, "Sua sessão foi encerrada. Entre novamente.");

    req.user = { id: tok.id, perfil: efetivo(c.perfil_acesso), cargo: cargoDe(c.perfil_acesso), nome: c.nome_completo, trocar: c.deve_trocar_senha, v: c.token_versao, setor: setorDe(c.perfil_acesso, c.setor) };
    // master = desenvolvedor: age como gestor em tudo, mas é invisível para os demais usuários
    if (req.user.perfil === "master") req.user = { ...req.user, perfil: "gestor", master: true };
    if (req.user.trocar && !req.path.startsWith("/auth/")) {
      return res.status(403).json({ erro: "Troque a senha temporária antes de continuar.", trocar_senha: true });
    }
    // "Ver como": só o master, só leitura. As permissões passam a ser exatamente as do perfil escolhido.
    // x-ver-como = id da pessoa, ou 0 para ver as telas do perfil sem escolher ninguém (usa o próprio master).
    const bruto = String(req.headers["x-ver-como"] || "");
    if (bruto && !/^\d{1,9}$/.test(bruto)) return res.status(400).json({ erro: "Requisição inválida." });
    const alvo = bruto === "" ? null : parseInt(bruto, 10);
    const sim = String(req.headers["x-ver-perfil"] || "");
    const pSim = ["vendedor", "lider", "coordenador", "backoffice", "gestor", "administrador"].includes(sim) ? sim : null;
    if (alvo !== null && req.user.master && (alvo > 0 || pSim)) {
      if (!["GET", "HEAD"].includes(req.method))
        return res.status(403).json({ erro: "No modo “ver como” só é possível consultar. Volte ao master para alterar dados." });
      let u;
      if (alvo > 0) {
        u = (await pool.query("SELECT id, nome_completo, perfil_acesso, to_jsonb(usuario)->>'setor' AS setor FROM usuario WHERE id=$1 AND perfil_acesso <> 'master'", [alvo])).rows[0];
        if (!u) return res.status(404).json({ erro: "Usuário não encontrado." });
      } else {
        u = { id: req.user.id, nome_completo: req.user.nome, perfil_acesso: pSim, setor: null };   // sem pessoa: só as telas do perfil
      }
      const p = pSim || u.perfil_acesso;
      const setorSim = ["CADASTRO", "QUALIDADE"].includes(String(req.headers["x-ver-setor"] || "")) ? String(req.headers["x-ver-setor"]) : u.setor;
      req.user = { id: u.id, perfil: efetivo(p), cargo: cargoDe(p), nome: u.nome_completo, master: false, verComo: true, masterId: req.user.id, setor: setorDe(p, setorSim) };
    }
    // nunca guardar respostas da API em cache (cada usuário vê dados diferentes) e informar ao site o perfil realmente aplicado
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization, X-Ver-Como, X-Ver-Perfil");
    res.setHeader("X-Perfil-Aplicado", req.user.perfil);
    next();
  } catch (e) {
    next(e);
  }
}

/** Setor do backoffice: CADASTRO (cria e alimenta vendas, viabilidade, confirmações) ou QUALIDADE (indicadores e FPD). Outros perfis: null. */
export const setorDe = (perfil, setor) => (perfil === "backoffice" ? (setor === "QUALIDADE" ? "QUALIDADE" : "CADASTRO") : null);

/** Valores em R$ somados (faturamento, ticket, receita): só Gerente e Administrador. */
export const veValores = (u) => u.perfil === "gestor";
/** FPD: Gerente/Adm, supervisor, coordenador e o próprio vendedor. Backoffice não vê. */
export const veFpd = (u) => u.perfil !== "backoffice";
const DINHEIRO = /^(v_|valor|ticket|receita|pacote|faturamento|recebido|perda|liquido|estorno|mes_valor|a_debitar)/i;
const FPD = /fpd|recuper|inadimpl/i;
/** Tira do que vai para a tela o que o perfil não pode ver (vale para objetos e listas, em qualquer profundidade). */
export function semRestritos(dado, u) {
  const tiraValor = !veValores(u), tiraFpd = !veFpd(u);
  if (!tiraValor && !tiraFpd) return dado;
  const limpa = (x) => {
    if (Array.isArray(x)) return x.map(limpa);
    if (!x || typeof x !== "object" || x instanceof Date) return x;
    const o = {};
    for (const [k, v] of Object.entries(x)) { if (k === "permissoes") { o[k] = v; continue; } if ((tiraValor && DINHEIRO.test(k)) || (tiraFpd && FPD.test(k))) continue; o[k] = limpa(v); }
    return o;
  };
  return limpa(dado);
}

/** Gerente/administrador passam sempre; backoffice só se for do setor pedido. */
export const exigeSetor = (setor) => (req, res, next) =>
  req.user.perfil === "gestor" || (req.user.perfil === "backoffice" && req.user.setor === setor) ? next()
    : res.status(403).json({ erro: setor === "QUALIDADE" ? "Esta área é do backoffice de Qualidade." : "Esta área é do backoffice de Cadastro." });

export const exigePerfil = (...perfis) => (req, res, next) =>
  perfis.includes(req.user.perfil) ? next() : res.status(403).json({ erro: "Sem permissão para esta ação." });
