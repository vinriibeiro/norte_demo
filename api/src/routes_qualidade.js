import { Router } from "express";
import { comPerfil } from "./db.js";
import { exigePerfil } from "./auth.js";

/* Lançamento do FPD (planilha de Qualidade). Só Gerente e Administrador.
   Mesmo modelo da planilha "CONTROLE DE QUALIDADE" (uma aba por safra, ex.: "OUT 26"), colunas:
   CONTRATO · STATUS CONTRATO · DATA BASE · FORMA DE PAGAMENTO · 1ª FATURA · DT DE PG 1° FATURA · 2ª FATURA · DT DE PG 2° FATURA ·
   FPD · DEPOIS DO PRAZO · PRAZO OPERADORA · TRATATIVA CHURN · STATUS OBS · C/ OU S/ OFERTA
   O navegador lê o arquivo (xlsx ou csv) e envia as linhas já separadas; aqui tudo é validado de novo. */
const r = Router();
r.use("/qualidade", exigePerfil("gestor"));

export const COLUNAS = ["CONTRATO", "STATUS CONTRATO", "DATA BASE", "FORMA DE PAGAMENTO", "1ª FATURA", "DT DE PG 1° FATURA", "2ª FATURA", "DT DE PG 2° FATURA", "FPD", "DEPOIS DO PRAZO", "PRAZO OPERADORA", "TRATATIVA CHURN", "STATUS OBS", "C/ OU S/ OFERTA"];
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/Ñ/gi, "N").toUpperCase().replace(/[^A-Z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();
const SIT = (s) => { const t = norm(s); if (!t) return undefined; if (/FORA/.test(t)) return "PAGA_FORA_DO_PRAZO"; if (/^(PAGA|PAGO)/.test(t) || /NO PRAZO/.test(t)) return "PAGA_NO_PRAZO"; if (/^N(AO)? ?PAG/.test(t) || /NAO PAG/.test(t)) return "NAO_PAGA"; if (/ABERT/.test(t)) return "EM_ABERTO"; return null; };
const FPD = (s) => { const t = norm(s).replace(/^FPD ?/, ""); if (!t) return undefined; if (/^(N|NAO) ?OK|^NOK/.test(t)) return "NAO_OK"; if (/^OK/.test(t)) return "OK"; if (/PRAZO/.test(t)) return "PRAZO"; return null; };
const FORMA = (s) => { const t = norm(s); if (!t) return undefined; if (/DCC|DEBITO|RECORRENTE|CARTAO/.test(t)) return "DCC"; if (/BOLETO/.test(t)) return "BOLETO"; return null; };
const OFERTA = (s) => { const t = norm(s); if (!t) return undefined; if (/^(C\/|C |COM)/.test(t)) return true; if (/^(S\/|S |SEM)/.test(t)) return false; return null; };
/** Só aceita data que existe no calendário e com ano entre 2020 e 2035 (planilha com "31/09/2026" ou ano "0226" derrubava a gravação inteira). */
const dataReal = (v) => { if (!v) return v; const d = new Date(v + "T00:00:00Z"); const a = +v.slice(0, 4); return !isNaN(d) && d.toISOString().slice(0, 10) === v && a >= 2020 && a <= 2035 ? v : null; };
const DATA = (s) => { const v = DATA0(s); return v ? dataReal(v) : v; };
const DATA0 = (s) => {
  if (s == null || s === "") return undefined;
  if (typeof s === "number" && s > 20000 && s < 80000) return new Date(Date.UTC(1899, 11, 30) + s * 864e5).toISOString().slice(0, 10);   // número de série do Excel
  const t = String(s).trim(); let m;
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) { const a = m[3].length === 2 ? "20" + m[3] : m[3]; return `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  if (/^\d{5}$/.test(t)) return DATA0(+t);
  return null;
};
const txt = (s, n = 200) => { const t = String(s ?? "").trim(); return t ? t.slice(0, n) : undefined; };
const contratoNum = (s) => { const t = String(s ?? "").trim().replace(/\.0+$/, ""); return t || null; };

/** Linha bruta (objeto com as colunas do modelo) -> campos validados + avisos. */
function interpretar(l, statusValidos) {
  const avisos = [], o = { aba: txt(l.aba, 30), contrato: contratoNum(l["CONTRATO"]) };
  const chk = (rot, v, bruto) => { if (v === null) avisos.push(`${rot}: "${String(bruto).slice(0, 30)}" não reconhecido`); return v === null ? undefined : v; };
  const st = norm(l["STATUS CONTRATO"]);
  if (st) { const s = statusValidos.get(st); if (s) o.status_contrato = s; else avisos.push(`Status do contrato "${l["STATUS CONTRATO"]}" não existe no cadastro`); }
  o.data_base = chk("Data base", DATA(l["DATA BASE"]), l["DATA BASE"]);
  o.forma = chk("Forma de pagamento", FORMA(l["FORMA DE PAGAMENTO"]), l["FORMA DE PAGAMENTO"]);
  o.f1 = chk("1ª fatura", SIT(l["1ª FATURA"]), l["1ª FATURA"]);
  o.f1_pg = chk("Data de pagamento da 1ª", DATA(l["DT DE PG 1° FATURA"]), l["DT DE PG 1° FATURA"]);
  o.f2 = chk("2ª fatura", SIT(l["2ª FATURA"]), l["2ª FATURA"]);
  o.f2_pg = chk("Data de pagamento da 2ª", DATA(l["DT DE PG 2° FATURA"]), l["DT DE PG 2° FATURA"]);
  o.fpd = chk("FPD", FPD(l["FPD"]), l["FPD"]);
  o.depois = chk("Depois do prazo", FPD(l["DEPOIS DO PRAZO"]), l["DEPOIS DO PRAZO"]);
  o.prazo = chk("Prazo operadora", DATA(l["PRAZO OPERADORA"]), l["PRAZO OPERADORA"]);
  o.churn = txt(l["TRATATIVA CHURN"]); o.obs = txt(l["STATUS OBS"]);
  o.oferta = chk("Oferta", OFERTA(l["C/ OU S/ OFERTA"]), l["C/ OU S/ OFERTA"]);
  return { o, avisos };
}

async function processar(c, linhas, aplicar, usuarioId) {
  const statusValidos = new Map((await c.query("SELECT codigo FROM status_contrato")).rows.map((x) => [norm(x.codigo), x.codigo]));
  const nums = [...new Set(linhas.map((l) => contratoNum(l["CONTRATO"])).filter(Boolean))];
  const ks = new Map((await c.query(`SELECT k.id, k.numero_contrato, k.status_contrato, k.forma_pagamento, k.data_base_qualidade, k.data_venda, cl.nome AS cliente
                                        FROM contrato k LEFT JOIN cliente cl ON cl.id = k.cliente_id WHERE k.numero_contrato = ANY($1)`, [nums])).rows.map((x) => [x.numero_contrato, x]));
  const fats = new Map((await c.query("SELECT * FROM fatura WHERE contrato_id = ANY($1) AND numero IN (1,2)", [[...ks.values()].map((x) => x.id)])).rows.map((x) => [`${x.contrato_id}|${x.numero}`, x]));
  const res = { linhas: linhas.length, atualizadas: 0, sem_contrato: [], sem_mudanca: 0, avisos: [], mudancas: { status: 0, forma: 0, fatura1: 0, fatura2: 0, fpd: 0, tratativas: 0 }, amostra: [], abas: [...new Set(linhas.map((l) => txt(l.aba, 30)).filter(Boolean))] };
  const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);
  // última tratativa de cada contrato/tipo numa consulta só (antes era uma consulta por linha)
  const ultTrat = new Map((await c.query(
    `SELECT DISTINCT ON (contrato_id, tipo) contrato_id, tipo, resultado, com_oferta FROM tratativa
      WHERE contrato_id = ANY($1) ORDER BY contrato_id, tipo, ocorrido_em DESC, id DESC`, [[...ks.values()].map((x) => x.id)])).rows.map((x) => [`${x.contrato_id}|${x.tipo}`, x]));
  // gravação em lote no fim (3 comandos em vez de milhares: a planilha inteira cabe nos 30 s do Heroku)
  const gContrato = new Map(), gFatura = new Map(), gTrat = new Map();
  for (const [i, l] of linhas.entries()) {
    const { o, avisos } = interpretar(l, statusValidos);
    if (!o.contrato) continue;
    const k = ks.get(o.contrato);
    if (!k) { res.sem_contrato.push(o.contrato); continue; }
    avisos.forEach((a) => res.avisos.length < 200 && res.avisos.push(`Linha ${i + 2}${o.aba ? ` (${o.aba})` : ""}, contrato ${o.contrato}: ${a}`));
    const muda = [];
    // contrato
    const set = {};
    if (o.status_contrato !== undefined && o.status_contrato !== k.status_contrato) { set.status_contrato = o.status_contrato; res.mudancas.status++; muda.push("status"); }
    if (o.forma !== undefined && o.forma !== k.forma_pagamento) { set.forma_pagamento = o.forma; res.mudancas.forma++; muda.push("forma"); }
    if (o.data_base !== undefined && o.data_base !== iso(k.data_base_qualidade)) set.data_base_qualidade = o.data_base;
    // faturas 1 e 2
    const fat = [];
    for (const n of [1, 2]) {
      const atual = fats.get(`${k.id}|${n}`) || {}, novo = {};
      const sit = n === 1 ? o.f1 : o.f2, pg = n === 1 ? o.f1_pg : o.f2_pg;
      if (sit !== undefined && sit !== atual.situacao) novo.situacao = sit;
      if (pg !== undefined && pg !== iso(atual.data_pagamento)) novo.data_pagamento = pg;
      if (n === 1) {
        if (o.fpd !== undefined && o.fpd !== atual.fpd_planilha) { novo.fpd_planilha = o.fpd; res.mudancas.fpd++; }
        if (o.depois !== undefined && o.depois !== atual.fpd_apos_prazo_planilha) novo.fpd_apos_prazo_planilha = o.depois;
        if (o.prazo !== undefined && o.prazo !== iso(atual.prazo_limite) && (!atual.vencimento || o.prazo >= iso(atual.vencimento))) novo.prazo_limite = o.prazo;
      }
      if (Object.keys(novo).length) { fat.push([n, novo, !!atual.id]); res.mudancas["fatura" + n]++; muda.push("fatura " + n); }
    }
    // tratativas (só quando o texto mudou em relação à última registrada)
    const trat = [];
    if (o.churn) trat.push(["CHURN", o.churn]);
    if (o.obs) trat.push(["COBRANCA", o.obs]);
    const tratNovas = [];
    for (const [tipo, resultado] of trat) {
      const ult = ultTrat.get(`${k.id}|${tipo}`);
      if (!ult || ult.resultado !== resultado || (tipo === "CHURN" && o.oferta !== undefined && ult.com_oferta !== o.oferta)) tratNovas.push([tipo, resultado]);
    }
    if (tratNovas.length) { res.mudancas.tratativas += tratNovas.length; muda.push("tratativa"); }
    if (!muda.length && !Object.keys(set).length) { res.sem_mudanca++; continue; }
    res.atualizadas++;
    if (res.amostra.length < 30) res.amostra.push({ contrato: o.contrato, cliente: k.cliente, aba: o.aba, muda, status: o.status_contrato, f1: o.f1, fpd: o.fpd });
    if (!aplicar) continue;
    if (Object.keys(set).length) gContrato.set(k.id, { ...(gContrato.get(k.id) || {}), ...set });
    for (const [n, novo] of fat) { const ch = `${k.id}|${n}`; gFatura.set(ch, { contrato_id: k.id, numero: n, ...(gFatura.get(ch) || {}), ...novo }); }
    for (const [tipo, resultado] of tratNovas) gTrat.set(`${k.id}|${tipo}|${resultado}`, [k.id, tipo, resultado, tipo === "CHURN" ? o.oferta ?? null : null]);
  }
  if (aplicar) {
    const cs = [...gContrato].map(([id, x]) => ({ id, ...x }));
    if (cs.length) await c.query(
      `UPDATE contrato k SET status_contrato = coalesce(v.sc, k.status_contrato), forma_pagamento = coalesce(v.fp, k.forma_pagamento),
              data_base_qualidade = coalesce(v.db, k.data_base_qualidade)
         FROM unnest($1::bigint[], $2::text[], $3::text[], $4::date[]) AS v(id, sc, fp, db) WHERE k.id = v.id`,
      [cs.map((x) => x.id), cs.map((x) => x.status_contrato ?? null), cs.map((x) => x.forma_pagamento ?? null), cs.map((x) => x.data_base_qualidade ?? null)]);
    const fs = [...gFatura.values()], col = (k) => fs.map((x) => x[k] ?? null);
    if (fs.length) await c.query(
      `INSERT INTO fatura (contrato_id, numero, situacao, data_pagamento, fpd_planilha, fpd_apos_prazo_planilha, prazo_limite)
       SELECT * FROM unnest($1::bigint[], $2::smallint[], $3::text[], $4::date[], $5::text[], $6::text[], $7::date[])
       ON CONFLICT (contrato_id, numero) DO UPDATE SET
         situacao = coalesce(EXCLUDED.situacao, fatura.situacao), data_pagamento = coalesce(EXCLUDED.data_pagamento, fatura.data_pagamento),
         fpd_planilha = coalesce(EXCLUDED.fpd_planilha, fatura.fpd_planilha),
         fpd_apos_prazo_planilha = coalesce(EXCLUDED.fpd_apos_prazo_planilha, fatura.fpd_apos_prazo_planilha),
         prazo_limite = coalesce(EXCLUDED.prazo_limite, fatura.prazo_limite)`,
      [col("contrato_id"), col("numero"), col("situacao"), col("data_pagamento"), col("fpd_planilha"), col("fpd_apos_prazo_planilha"), col("prazo_limite")]);
    const ts = [...gTrat.values()];
    if (ts.length) await c.query(
      `INSERT INTO tratativa (contrato_id, tipo, resultado, com_oferta, usuario_id)
       SELECT v.*, $5::bigint FROM unnest($1::bigint[], $2::text[], $3::text[], $4::boolean[]) AS v(contrato_id, tipo, resultado, com_oferta)`,
      [ts.map((x) => x[0]), ts.map((x) => x[1]), ts.map((x) => x[2]), ts.map((x) => x[3]), usuarioId]);
  }
  res.sem_contrato = [...new Set(res.sem_contrato)];
  return res;
}

const validaCorpo = (b) => {
  const linhas = Array.isArray(b?.linhas) ? b.linhas : null;
  if (!linhas || !linhas.length) throw Object.assign(new Error("Nenhuma linha recebida. Confira se a planilha tem a coluna CONTRATO."), { status: 400 });
  if (linhas.length > 20000) throw Object.assign(new Error("Planilha grande demais (máx. 20.000 linhas por envio)."), { status: 400 });
  return linhas.map((l) => (l && typeof l === "object" ? l : {}));
};

// POST /api/qualidade/analisar { arquivo, linhas } -> prévia (nada é gravado)
r.post("/qualidade/analisar", async (req, res) => {
  const linhas = validaCorpo(req.body);
  const out = await comPerfil(req.user, (c) => processar(c, linhas, false, req.user.id));
  res.json(out);
});

// POST /api/qualidade/importar { arquivo, origem, linhas } -> grava e registra no histórico
r.post("/qualidade/importar", async (req, res) => {
  const linhas = validaCorpo(req.body), origem = req.body.origem === "MANUAL" ? "MANUAL" : "ARQUIVO";
  const nome = String(req.body.arquivo || (origem === "MANUAL" ? "Lançamento manual" : "planilha")).slice(0, 160);
  const out = await comPerfil(req.user, async (c) => {
    const r0 = await processar(c, linhas, true, req.user.id);
    await c.query("INSERT INTO qualidade_lote (arquivo_nome, origem, enviado_por, linhas, atualizadas, sem_contrato, abas) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [nome, origem, req.user.id, r0.linhas, r0.atualizadas, r0.sem_contrato.length, r0.abas.join(", ") || null]);
    return r0;
  });
  res.json(out);
});

// GET /api/qualidade/lotes -> histórico de envios
r.get("/qualidade/lotes", async (req, res) => {
  const rows = await comPerfil(req.user, async (c) => (await c.query(`SELECT q.*, u.nome_completo AS enviado_por_nome FROM qualidade_lote q LEFT JOIN usuario u ON u.id = q.enviado_por ORDER BY q.enviado_em DESC LIMIT 50`)).rows);
  res.json(rows);
});

/** Linhas no modelo da planilha para os contratos da consulta. */
const dlocal = (o) => { for (const k in o) if (o[k] instanceof Date) { const d = o[k]; o[k] = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; } return o; };
const SQL_MODELO = `
  SELECT k.numero_contrato, k.data_venda, k.status_contrato, k.data_base_qualidade, k.forma_pagamento,
         f1.situacao AS f1, f1.data_pagamento AS f1_pg, f1.vencimento AS f1_venc, f1.fpd_planilha, f1.fpd_apos_prazo_planilha, f1.prazo_limite,
         f2.situacao AS f2, f2.data_pagamento AS f2_pg, fp.fpd AS fpd_calc,
         cl.nome AS cliente, u.nome_completo AS vendedor, e.nome AS equipe,
         (SELECT t.resultado FROM tratativa t WHERE t.contrato_id = k.id AND t.tipo = 'CHURN' ORDER BY t.ocorrido_em DESC, t.id DESC LIMIT 1) AS churn,
         (SELECT t.com_oferta FROM tratativa t WHERE t.contrato_id = k.id AND t.tipo = 'CHURN' ORDER BY t.ocorrido_em DESC, t.id DESC LIMIT 1) AS oferta,
         (SELECT t.resultado FROM tratativa t WHERE t.contrato_id = k.id AND t.tipo = 'COBRANCA' ORDER BY t.ocorrido_em DESC, t.id DESC LIMIT 1) AS obs
    FROM contrato k
    LEFT JOIN cliente cl ON cl.id = k.cliente_id
    LEFT JOIN usuario u ON u.id = k.vendedor_id
    LEFT JOIN equipe e ON e.id = k.equipe_id
    LEFT JOIN fatura f1 ON f1.contrato_id = k.id AND f1.numero = 1
    LEFT JOIN fatura f2 ON f2.contrato_id = k.id AND f2.numero = 2
    LEFT JOIN v_fatura_fpd fp ON fp.contrato_id = k.id`;

// GET /api/qualidade/contrato/:numero -> valores atuais (lançamento manual)
r.get("/qualidade/contrato/:numero", async (req, res) => {
  const n = String(req.params.numero || "").trim().slice(0, 40);
  const row = await comPerfil(req.user, async (c) => (await c.query(SQL_MODELO + " WHERE k.numero_contrato = $1", [n])).rows.map(dlocal)[0]);
  if (!row) return res.status(404).json({ erro: "Contrato não encontrado." });
  const status = await comPerfil(req.user, async (c) => (await c.query("SELECT codigo FROM status_contrato ORDER BY codigo")).rows.map((x) => x.codigo));
  res.json({ ...row, opcoes_status: status });
});

// GET /api/qualidade/exportar?de=AAAA-MM&ate=AAAA-MM -> linhas no modelo, agrupadas por safra (mês da venda)
r.get("/qualidade/exportar", async (req, res) => {
  const ok = (s) => (/^\d{4}-\d{2}$/.test(s || "") ? s : null);
  const hoje = new Date().toISOString().slice(0, 7);
  const ate = ok(req.query.ate) || hoje, de = ok(req.query.de) || ate;
  if (de > ate) return res.status(400).json({ erro: "Período inválido." });
  const rows = await comPerfil(req.user, async (c) => (await c.query(SQL_MODELO + ` WHERE k.data_venda >= $1::date AND k.data_venda < ($2::date + interval '1 month') AND k.status_venda <> 'CANCELADO' ORDER BY k.data_venda, k.numero_contrato`, [de + "-01", ate + "-01"])).rows.map(dlocal));
  const status = await comPerfil(req.user, async (c) => (await c.query("SELECT codigo FROM status_contrato ORDER BY codigo")).rows.map((x) => x.codigo));
  res.json({ de, ate, colunas: COLUNAS, linhas: rows, opcoes_status: status });
});

export default r;
