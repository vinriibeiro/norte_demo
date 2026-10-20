import { Router } from "express";
import { comPerfil } from "./db.js";
import { exigePerfil, exigeSetor } from "./auth.js";
import { sincronizarAgenda } from "./vendas.js";

const r = Router();
r.use("/rota", exigePerfil("gestor", "backoffice"), exigeSetor("CADASTRO"));

const SITUACOES = ["PENDENTE_INSTALACAO", "INSTALADO", "CANCELADO", "REAGENDADO", "CLIENTE_AUSENTE"];
const data = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(new Date(s)) ? s : null);
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

// GET /api/rota?de=&ate=&situacao=&busca=&atrasadas=1
r.get("/rota", async (req, res) => {
  const de = data(req.query.de), ate = data(req.query.ate) || de;
  const sit = SITUACOES.includes(req.query.situacao) ? req.query.situacao : null;
  const busca = String(req.query.busca || "").trim();
  const atrasadas = req.query.atrasadas === "1";
  if (!atrasadas && !de) return res.status(400).json({ erro: "Informe a data." });
  const linhas = await comPerfil(req.user, async (c) => {
    const w = [], p = [];
    const add = (cond, v) => { p.push(v); w.push(cond.replace("?", "$" + p.length)); };
    if (atrasadas) w.push("data_rota < current_date AND situacao = 'PENDENTE_INSTALACAO' AND status_venda <> 'CANCELADO'");
    else { add("data_rota >= ?", de); add("data_rota <= ?", ate); }
    if (sit) add("situacao = ?", sit);
    if (busca) { p.push(`%${busca}%`); const n = "$" + p.length; w.push(`(cliente ILIKE ${n} OR numero_contrato ILIKE ${n} OR bairro ILIKE ${n} OR vendedor ILIKE ${n})`); }
    return (await c.query(
      `SELECT * FROM v_rota WHERE ${w.join(" AND ")} ORDER BY data_rota, turno NULLS LAST, cidade, bairro, cliente LIMIT 1000`, p)).rows;
  });
  res.json(linhas);
});

// GET /api/rota/resumo?de=&ate=  -> contagem por dia e situação (gráfico)
r.get("/rota/resumo", async (req, res) => {
  const de = data(req.query.de), ate = data(req.query.ate);
  if (!de || !ate) return res.status(400).json({ erro: "Informe o período." });
  const rows = await comPerfil(req.user, async (c) => (await c.query(
    `SELECT data_rota, situacao, count(*)::int AS n, count(*) FILTER (WHERE confirmada IS TRUE)::int AS confirmadas
       FROM agenda_instalacao WHERE data_rota BETWEEN $1 AND $2 GROUP BY 1,2 ORDER BY 1`, [de, ate])).rows);
  const atrasadas = await comPerfil(req.user, async (c) => (await c.query(
    `SELECT count(*)::int AS n FROM v_rota WHERE data_rota < current_date AND situacao='PENDENTE_INSTALACAO' AND status_venda <> 'CANCELADO'`)).rows[0].n);
  res.json({ dias: rows, atrasadas });
});

// POST /api/rota  { numero_contrato, data_rota, turno }  -> coloca um contrato na rota de um dia
r.post("/rota", async (req, res) => {
  const numero = String(req.body.numero_contrato || "").replace(/\D/g, "");
  const dia = data(req.body.data_rota), turno = req.body.turno || null;
  if (!numero) return res.status(400).json({ erro: "Informe o número do contrato." });
  if (!dia) return res.status(400).json({ erro: "Informe a data da rota." });
  const id = await comPerfil(req.user, async (c) => {
    const k = (await c.query("SELECT id, status_venda FROM contrato WHERE sistema_origem='NORTE' AND numero_contrato=$1", [numero])).rows[0];
    if (!k) throw erro(`Contrato ${numero} não encontrado.`, 404);
    if (k.status_venda === "CANCELADO") throw erro("Este contrato está cancelado.", 409);
    if (turno && !(await c.query("SELECT 1 FROM turno_agenda WHERE codigo=$1", [turno])).rowCount) throw erro("Turno inválido.");
    await c.query("UPDATE contrato SET data_agendamento=$2, turno=$3 WHERE id=$1", [k.id, dia, turno]);
    await sincronizarAgenda(c, k.id);
    return (await c.query("SELECT id FROM agenda_instalacao WHERE contrato_id=$1 AND data_rota=$2", [k.id, dia])).rows[0].id;
  });
  res.status(201).json({ ok: true, agenda_id: id });
});

// PATCH /api/rota/:id  { confirmada?, situacao?, obs_agenda?, turno?, reagendar_para? }
r.patch("/rota/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  if ("situacao" in b && !SITUACOES.includes(b.situacao)) return res.status(400).json({ erro: "Situação inválida." });
  if ("confirmada" in b && ![true, false, null].includes(b.confirmada)) return res.status(400).json({ erro: "Confirmação inválida." });
  const novaData = "reagendar_para" in b ? data(b.reagendar_para) : undefined;
  if ("reagendar_para" in b && !novaData) return res.status(400).json({ erro: "Data de reagendamento inválida." });
  const obs = "obs_agenda" in b ? String(b.obs_agenda ?? "").trim().slice(0, 300) || null : undefined;
  await comPerfil(req.user, async (c) => {
    const a = (await c.query("SELECT id, contrato_id, data_rota, turno FROM agenda_instalacao WHERE id=$1", [id])).rows[0];
    if (!a) throw erro("Linha da rota não encontrada.", 404);
    if ("turno" in b && b.turno && !(await c.query("SELECT 1 FROM turno_agenda WHERE codigo=$1", [b.turno])).rowCount) throw erro("Turno inválido.");
    if (novaData) {   // reagendar: a linha antiga fica REAGENDADO e nasce uma nova no dia escolhido
      const turno = "turno" in b ? (b.turno || null) : a.turno;
      await c.query("UPDATE agenda_instalacao SET situacao='REAGENDADO' WHERE id=$1", [id]);
      await c.query("UPDATE contrato SET data_agendamento=$2, turno=$3 WHERE id=$1", [a.contrato_id, novaData, turno]);
      await sincronizarAgenda(c, a.contrato_id);
      return;
    }
    const sets = [], v = [];
    const put = (col, val) => { v.push(val); sets.push(`${col} = $${v.length}`); };
    if ("confirmada" in b) { put("confirmada", b.confirmada); put("bko_confirmacao_id", b.confirmada === null ? null : req.user.id); }
    if ("situacao" in b) { put("situacao", b.situacao); put("bko_tratativa_id", req.user.id); }
    if (obs !== undefined) put("obs_agenda", obs);
    if ("turno" in b) put("turno", b.turno || null);
    if (!sets.length) throw erro("Nada para alterar.");
    v.push(id);
    await c.query(`UPDATE agenda_instalacao SET ${sets.join(", ")} WHERE id = $${v.length}`, v);
    if ("turno" in b) await c.query("UPDATE contrato SET turno=$2 WHERE id=$1 AND data_agendamento=$3", [a.contrato_id, b.turno || null, a.data_rota]);
  });
  res.json({ ok: true });
});

export default r;
