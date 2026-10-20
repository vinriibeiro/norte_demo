import { Router } from "express";
import { comPerfil, pool } from "./db.js";
import { exigePerfil } from "./auth.js";

/* CRM do vendedor: clientes em acompanhamento e retornos no calendário.
   Vendedor: lê e escreve só os dele (RLS no banco). Gerente e administrador: só consultam. */
const r = Router();
const TIPOS = ["TRATANDO", "RETORNAR", "PROPOSTA"];
const STATUS = ["ATIVO", "ARQUIVADO", "PERDIDO", "CONVERTIDO"];
const REPETIR = [null, 7, 15, 30];
const erro = (m, status = 400) => Object.assign(new Error(m), { status });
const txt = (v, max) => { const s = String(v ?? "").trim().replace(/\s+/g, " "); return s ? s.slice(0, max) : null; };
const intOk = (v) => { const n = parseInt(v || "", 10); return n > 0 ? n : null; };
const soVendedor = exigePerfil("vendedor");
r.use("/crm", exigePerfil("vendedor", "gestor"));

// dados de um retorno (valida o formulário)
function retornoDoForm(b) {
  const tipo = String(b.tipo || "");
  if (!TIPOS.includes(tipo)) throw erro("Escolha o tipo do retorno.");
  const data = new Date(b.data_hora);
  if (isNaN(data)) throw erro("Informe a data e a hora.");
  if (data.getTime() <= Date.now()) throw erro("A data e a hora precisam ser no futuro.");
  const aviso = parseInt(b.aviso_minutos ?? 5, 10);
  if (!(aviso >= 1 && aviso <= 10)) throw erro("O aviso pode ser de 1 a 10 minutos antes.");
  const repetir = b.repetir_dias === "" || b.repetir_dias == null ? null : parseInt(b.repetir_dias, 10);
  if (!REPETIR.includes(repetir)) throw erro("Escolha a repetição.");
  return { tipo, data, aviso, repetir, observacao: txt(b.observacao, 1000) };
}

// GET /api/crm/mes?ano=2026&mes=10&vendedor=ID  -> retornos do mês (gerente pode filtrar por vendedor)
r.get("/crm/mes", async (req, res) => {
  const ano = intOk(req.query.ano), mes = intOk(req.query.mes);
  if (!ano || !mes || mes > 12) return res.status(400).json({ erro: "Informe o mês." });
  const vend = req.user.perfil === "gestor" ? intOk(req.query.vendedor) : null;
  const itens = await comPerfil(req.user, async (c) => (await c.query(
    `SELECT r.id, r.tipo, r.data_hora, r.aviso_minutos, r.repetir_dias, r.observacao, r.avisado_em,
            c.id AS cliente_id, c.nome, c.telefone, c.status, c.vendedor_id, u.nome_completo AS vendedor_nome
       FROM crm_retorno r JOIN crm_cliente c ON c.id = r.cliente_id JOIN usuario u ON u.id = c.vendedor_id
      WHERE ((r.data_hora >= make_timestamptz($1, $2, 1, 0, 0, 0, 'America/Sao_Paulo')
          AND r.data_hora <  make_timestamptz($1, $2, 1, 0, 0, 0, 'America/Sao_Paulo') + interval '1 month')
          OR (r.repetir_dias IS NOT NULL AND r.data_hora < make_timestamptz($1, $2, 1, 0, 0, 0, 'America/Sao_Paulo') + interval '1 month'))
        AND ($3::bigint IS NULL OR c.vendedor_id = $3)
      ORDER BY r.data_hora`, [ano, mes, vend])).rows);
  res.json({ itens });
});

// GET /api/crm/clientes?status=ATIVO
r.get("/crm/clientes", async (req, res) => {
  const st = STATUS.includes(req.query.status) ? req.query.status : "ATIVO";
  const vend = req.user.perfil === "gestor" ? intOk(req.query.vendedor) : null;
  const itens = await comPerfil(req.user, async (c) => (await c.query(
    `SELECT c.id, c.nome, c.telefone, c.observacao, c.status, c.encerrado_em, c.vendedor_id, u.nome_completo AS vendedor_nome,
            (SELECT min(r.data_hora) FROM crm_retorno r WHERE r.cliente_id = c.id AND r.data_hora >= now()) AS proximo_retorno
       FROM crm_cliente c JOIN usuario u ON u.id = c.vendedor_id
      WHERE c.status = $1 AND ($2::bigint IS NULL OR c.vendedor_id = $2)
      ORDER BY c.atualizado_em DESC, c.id DESC LIMIT 300`, [st, vend])).rows);
  res.json({ itens });
});

// POST /api/crm/clientes  { nome, telefone?, observacao? }
r.post("/crm/clientes", soVendedor, async (req, res) => {
  const b = req.body || {};
  const nome = txt(b.nome, 150);
  if (!nome || nome.length < 2) return res.status(400).json({ erro: "Informe o nome do cliente." });
  const id = await comPerfil(req.user, async (c) => (await c.query(
    "INSERT INTO crm_cliente (vendedor_id, nome, telefone, observacao) VALUES ($1,$2,$3,$4) RETURNING id",
    [req.user.id, nome, txt(b.telefone, 40), txt(b.observacao, 1000)])).rows[0].id);
  res.status(201).json({ ok: true, id });
});

// PATCH /api/crm/clientes/:id  { status?, nome?, telefone?, observacao? }
r.patch("/crm/clientes/:id", soVendedor, async (req, res) => {
  const id = intOk(req.params.id), b = req.body || {};
  if (!id) return res.status(400).json({ erro: "Cliente inválido." });
  const st = b.status === undefined ? undefined : String(b.status);
  if (st !== undefined && !STATUS.includes(st)) return res.status(400).json({ erro: "Situação inválida." });
  const n = await comPerfil(req.user, async (c) => (await c.query(
    `UPDATE crm_cliente SET
        nome = COALESCE($2, nome), telefone = CASE WHEN $3::boolean THEN $4 ELSE telefone END,
        observacao = CASE WHEN $5::boolean THEN $6 ELSE observacao END,
        status = COALESCE($7, status),
        encerrado_em = CASE WHEN $7::text IS NULL THEN encerrado_em WHEN $7::text = 'ATIVO' THEN NULL ELSE now() END,
        atualizado_em = now()
      WHERE id = $1`,
    [id, b.nome === undefined ? null : txt(b.nome, 150), b.telefone !== undefined, txt(b.telefone, 40),
     b.observacao !== undefined, txt(b.observacao, 1000), st ?? null])).rowCount);
  if (!n) return res.status(404).json({ erro: "Cliente não encontrado." });
  res.json({ ok: true });
});

// POST /api/crm/retornos  { cliente_id, tipo, data_hora, aviso_minutos, repetir_dias, observacao }
r.post("/crm/retornos", soVendedor, async (req, res) => {
  const cliente = intOk(req.body?.cliente_id);
  if (!cliente) return res.status(400).json({ erro: "Escolha o cliente." });
  const d = retornoDoForm(req.body || {});
  const id = await comPerfil(req.user, async (c) => {
    const ok = (await c.query("SELECT status FROM crm_cliente WHERE id = $1", [cliente])).rows[0];
    if (!ok) throw erro("Cliente não encontrado.", 404);
    if (ok.status !== "ATIVO") throw erro("Este cliente não está mais em acompanhamento. Reative-o para agendar.", 409);
    return (await c.query(
      `INSERT INTO crm_retorno (cliente_id, tipo, data_hora, aviso_minutos, repetir_dias, observacao) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [cliente, d.tipo, d.data.toISOString(), d.aviso, d.repetir, d.observacao])).rows[0].id;
  });
  res.status(201).json({ ok: true, id });
});

// PUT /api/crm/retornos/:id  (mesmos campos do cadastro)
r.put("/crm/retornos/:id", soVendedor, async (req, res) => {
  const id = intOk(req.params.id);
  if (!id) return res.status(400).json({ erro: "Retorno inválido." });
  const d = retornoDoForm(req.body || {});
  const n = await comPerfil(req.user, async (c) => (await c.query(
    `UPDATE crm_retorno SET tipo=$2, data_hora=$3, aviso_minutos=$4, repetir_dias=$5, observacao=$6, avisado_em=NULL WHERE id=$1`,
    [id, d.tipo, d.data.toISOString(), d.aviso, d.repetir, d.observacao])).rowCount);
  if (!n) return res.status(404).json({ erro: "Retorno não encontrado." });
  res.json({ ok: true });
});

// DELETE /api/crm/retornos/:id
r.delete("/crm/retornos/:id", soVendedor, async (req, res) => {
  const id = intOk(req.params.id);
  const n = await comPerfil(req.user, (c) => c.query("DELETE FROM crm_retorno WHERE id = $1", [id])).then((x) => x.rowCount);
  if (!n) return res.status(404).json({ erro: "Retorno não encontrado." });
  res.json({ ok: true });
});

export default r;
