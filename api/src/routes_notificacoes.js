import { Router } from "express";
import { comPerfil } from "./db.js";
import { exigePerfil, exigeSetor } from "./auth.js";
import { recebeAvisos, chavePublica, inscrever, cancelar, estado, preferencias, testar, semVendaHoje, agoraBR } from "./notificacoes.js";

const r = Router();

/* ---------------- Notificações no celular (Gerente e Administrador) ---------------- */
const soAdmin = (req, res, next) => (recebeAvisos(req.user) ? next() : res.status(403).json({ erro: "As notificações no celular são do Gerente e do Administrador." }));

r.get("/notificacoes/chave", soAdmin, async (_req, res) => res.json({ chave: await chavePublica() }));
/* Avisos de tratativa (mensagens nas vendas Sistema A/Sistema B e viabilidades contestadas): toda a equipe, no próprio aparelho */
const soEquipe = (req, res, next) => (["vendedor", "lider", "coordenador", "backoffice", "gestor"].includes(req.user.perfil) && !req.user.verComo ? next() : res.status(403).json({ erro: "Sem permissão." }));
r.get("/notificacoes/equipe/chave", soEquipe, async (_req, res) => res.json({ chave: await chavePublica() }));
r.get("/notificacoes/equipe/estado", soEquipe, async (req, res) => res.json(await estado(req.user.id, String(req.query.endpoint || "").slice(0, 2100) || null)));
r.post("/notificacoes/equipe/inscrever", soEquipe, async (req, res) => { await inscrever(req.user.id, req.body?.inscricao, req.body?.aparelho); res.status(201).json({ ok: true }); });
r.post("/notificacoes/equipe/cancelar", soEquipe, async (req, res) => { await cancelar(req.user.id, req.body?.endpoint); res.json({ ok: true }); });
r.get("/notificacoes/estado", soAdmin, async (req, res) => res.json(await estado(req.user.id, String(req.query.endpoint || "").slice(0, 2100) || null)));
r.post("/notificacoes/inscrever", soAdmin, async (req, res) => { await inscrever(req.user.id, req.body?.inscricao, req.body?.aparelho); res.status(201).json({ ok: true }); });
r.post("/notificacoes/cancelar", soAdmin, async (req, res) => { await cancelar(req.user.id, req.body?.endpoint); res.json({ ok: true }); });
r.put("/notificacoes/preferencias", soAdmin, async (req, res) => { await preferencias(req.user.id, req.body || {}); res.json({ ok: true }); });
r.post("/notificacoes/teste", soAdmin, async (req, res) => {
  const out = await testar(req.user.id);
  if (!out.aparelhos) return res.status(409).json({ erro: "Nenhum aparelho seu está com as notificações ativadas." });
  res.json(out);
});

// GET /api/sem-venda?dia=AAAA-MM-DD -> vendedores sem venda no dia, por equipe (tela que abre ao tocar no resumo)
r.get("/sem-venda", exigePerfil("gestor"), async (req, res) => {
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dia || "") ? req.query.dia : agoraBR().dia;
  res.json(await semVendaHoje(dia));
});

/* ---------------- Pendências (abas PENDÊNCIAS, CHIP PENDENTES DE ATIVAÇÃO e CADASTROS EM ANDAMENTO) ---------------- */
const TIPOS = ["PENDENCIA", "CHIP_PENDENTE", "CADASTRO_ANDAMENTO"];
const cadastro = [exigePerfil("gestor", "backoffice"), exigeSetor("CADASTRO")];

r.get("/pendencias", ...cadastro, async (req, res) => {
  const w = [], v = [];
  const tipo = TIPOS.includes(req.query.tipo) ? req.query.tipo : null;
  if (tipo) { v.push(tipo); w.push(`p.tipo = $${v.length}`); }
  w.push("p.excluida_em IS NULL");  // excluídas saem das telas (ficam no banco para auditoria)
  if (req.query.situacao !== "todas") w.push(req.query.situacao === "resolvidas" ? "NOT p.aberta" : "p.aberta");
  const b = String(req.query.busca || "").trim().slice(0, 60);
  if (b) { v.push(`%${b}%`); w.push(`(p.cliente_nome ILIKE $${v.length} OR p.descricao ILIKE $${v.length} OR u.nome_completo ILIKE $${v.length} OR u.login ILIKE $${v.length} OR p.proposta ILIKE $${v.length} OR p.hp ILIKE $${v.length})`); }
  const out = await comPerfil(req.user, async (c) => {
    const itens = (await c.query(
      `SELECT p.id, p.tipo, p.data_abertura, p.cliente_nome, p.proposta, p.hp, p.hora_biometria, p.descricao, p.origem, p.aberta, p.resolvida_em,
              p.contrato_id, k.numero_contrato, u.nome_completo AS vendedor, e.nome AS equipe, (current_date - p.data_abertura) AS dias
         FROM pendencia p LEFT JOIN usuario u ON u.id = p.vendedor_id LEFT JOIN contrato k ON k.id = p.contrato_id
         LEFT JOIN LATERAL (SELECT eq.nome FROM equipe_membro m JOIN equipe eq ON eq.id = m.equipe_id WHERE m.usuario_id = p.vendedor_id AND m.fim IS NULL ORDER BY m.inicio DESC LIMIT 1) e ON true
        ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY p.aberta DESC, p.data_abertura DESC, p.id DESC LIMIT 500`, v)).rows;
    const cont = (await c.query("SELECT tipo, count(*) FILTER (WHERE aberta)::int AS abertas FROM pendencia WHERE excluida_em IS NULL GROUP BY tipo")).rows;
    return { itens, contagem: Object.fromEntries(cont.map((x) => [x.tipo, x.abertas])) };
  });
  res.json(out);
});

// PATCH /api/pendencias/:id { aberta: false|true }  -> resolver ou reabrir
r.patch("/pendencias/:id", ...cadastro, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (typeof req.body?.aberta !== "boolean") return res.status(400).json({ erro: "Informe se a pendência está aberta." });
  const n = await comPerfil(req.user, async (c) => (await c.query(
    "UPDATE pendencia SET aberta = $2, resolvida_em = CASE WHEN $2 THEN NULL ELSE now() END WHERE id = $1 AND excluida_em IS NULL", [id, req.body.aberta])).rowCount);
  if (!n) return res.status(404).json({ erro: "Pendência não encontrada." });
  res.json({ ok: true });
});

// PUT /api/pendencias/:id { tipo, cliente_nome, proposta, hp, descricao }  -> editar
r.put("/pendencias/:id", ...cadastro, async (req, res) => {
  const id = parseInt(req.params.id, 10), b = req.body || {};
  const t = (x, max) => { const s = String(x ?? "").trim(); return s ? s.slice(0, max) : null; };
  if (!TIPOS.includes(b.tipo)) return res.status(400).json({ erro: "Escolha o tipo da pendência." });
  const n = await comPerfil(req.user, async (c) => (await c.query(
    "UPDATE pendencia SET tipo = $2, cliente_nome = $3, proposta = $4, hp = $5, descricao = $6 WHERE id = $1 AND excluida_em IS NULL",
    [id, b.tipo, t(b.cliente_nome, 150), t(b.proposta, 60), t(b.hp, 20), t(b.descricao, 1000)])).rowCount);
  if (!n) return res.status(404).json({ erro: "Pendência não encontrada." });
  res.json({ ok: true });
});

// DELETE /api/pendencias/:id  -> excluir (lógico: a linha fica no banco para auditoria)
r.delete("/pendencias/:id", ...cadastro, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const n = await comPerfil(req.user, async (c) => (await c.query(
    "UPDATE pendencia SET excluida_em = now(), excluida_por = $2 WHERE id = $1 AND excluida_em IS NULL", [id, req.user.id])).rowCount);
  if (!n) return res.status(404).json({ erro: "Pendência não encontrada." });
  res.json({ ok: true });
});

export default r;
