import { Router } from "express";
import { comPerfil, pool } from "./db.js";
import { exigePerfil, exigeSetor, semRestritos, veValores, veFpd } from "./auth.js";
import { montar, somaDias } from "./fechamento.js";
import { calendarioDe, feriadosDoAno, diasUteis } from "./calendario.js";
import { regrasFeriado } from "./routes_relatorios.js";

/* Operação do dia a dia:
   - Confirmação da venda D-1 e D-15 (dias contados da data da venda), feita pelo backoffice de Cadastro
   - Observações do cliente (histórico com data e autor)
   - Visão da equipe: tabela por vendedor para supervisor, coordenador e gerente */
const r = Router();
const erro = (m, status = 400) => Object.assign(new Error(m), { status });
const intOk = (v) => { const n = parseInt(v || "", 10); return n > 0 ? n : null; };
const dataOk = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(new Date(s)) ? s : null);
const hojeBR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);   // horário de Brasília
const txt = (v, max) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };
const p2 = (n) => String(n).padStart(2, "0");
const iso = (d) => (d instanceof Date ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : d ? String(d).slice(0, 10) : null);

/* =================== CONFIRMAÇÃO D-1 / D-15 =================== */
const ETAPAS = { D1: 1, D15: 15 };
const RESULTADOS = ["CONFIRMADO", "NAO_ATENDEU", "PROBLEMA"];
const ATRASO = 7;   // dias para trás que continuam aparecendo enquanto a ligação não for concluída
r.use("/confirmacao", exigePerfil("gestor", "backoffice"), exigeSetor("CADASTRO"));

const SQL_CONF = `
  SELECT k.id, k.numero_contrato, k.data_venda, k.status_venda, k.status_contrato, k.data_agendamento, k.turno, k.pacote_valor, k.forma_pagamento,
         cl.id AS cliente_id, cl.nome AS cliente, cl.contato, cl.contato_2, u.nome_completo AS vendedor, e.nome AS equipe, CASE WHEN ci.uf = 'DF' THEN 'BRASÍLIA/DF' ELSE ci.nome || '/' || ci.uf END AS cidade, k.bairro,
         (SELECT string_agg(CASE WHEN i.quantidade > 1 THEN i.quantidade || 'x ' ELSE '' END || p.nome, ', ' ORDER BY p.categoria, p.nome)
            FROM contrato_item i JOIN produto p ON p.id = i.produto_id WHERE i.contrato_id = k.id) AS produtos,
         ult.resultado, ult.observacao, ult.feito_em, uq.nome_completo AS feito_por,
         (SELECT count(*)::int FROM confirmacao_venda x WHERE x.contrato_id = k.id AND x.etapa = $3) AS tentativas
    FROM contrato k
    JOIN cliente cl ON cl.id = k.cliente_id
    JOIN usuario u ON u.id = k.vendedor_id
    LEFT JOIN equipe e ON e.id = k.equipe_id
    LEFT JOIN cidade ci ON ci.id = k.cidade_id
    LEFT JOIN LATERAL (SELECT x.resultado, x.observacao, x.feito_em, x.feito_por FROM confirmacao_venda x
                        WHERE x.contrato_id = k.id AND x.etapa = $3 ORDER BY x.feito_em DESC, x.id DESC LIMIT 1) ult ON true
    LEFT JOIN usuario uq ON uq.id = ult.feito_por
   WHERE k.data_venda BETWEEN $1 AND $2 AND k.status_venda <> 'CANCELADO'
   ORDER BY k.data_venda DESC, cl.nome`;

// GET /api/confirmacao?dia=AAAA-MM-DD  -> D-1 (vendas de ontem) e D-15 (vendas de 15 dias atrás) + as que ficaram para trás
r.get("/confirmacao", async (req, res) => {
  const dia = dataOk(req.query.dia) || hojeBR();
  const out = await comPerfil(req.user, async (c) => {
    const etapa = async (k) => {
      const alvo = somaDias(dia, -ETAPAS[k]), ini = somaDias(alvo, -ATRASO);
      const rows = (await c.query(SQL_CONF, [ini, alvo, k])).rows.map((x) => ({ ...x, data_venda: iso(x.data_venda), data_agendamento: iso(x.data_agendamento) }));
      const concluida = (x) => x.resultado === "CONFIRMADO" || x.resultado === "PROBLEMA";
      const doDia = rows.filter((x) => x.data_venda === alvo);
      const atrasadas = rows.filter((x) => x.data_venda < alvo && !concluida(x));
      const cont = { total: doDia.length, confirmadas: doDia.filter((x) => x.resultado === "CONFIRMADO").length, problema: doDia.filter((x) => x.resultado === "PROBLEMA").length,
        nao_atendeu: doDia.filter((x) => x.resultado === "NAO_ATENDEU").length, falta: doDia.filter((x) => !concluida(x)).length, atrasadas: atrasadas.length };
      return { etapa: k, dia_venda: alvo, itens: doDia, atrasadas, cont };
    };
    return { d1: await etapa("D1"), d15: await etapa("D15") };
  });
  res.json({ dia, ...out });
});

// POST /api/confirmacao { contrato_id, etapa: D1|D15, resultado, observacao }
r.post("/confirmacao", async (req, res) => {
  const b = req.body || {}, id = intOk(b.contrato_id), etapa = String(b.etapa || ""), resultado = String(b.resultado || ""), obs = txt(b.observacao, 1000);
  if (!id || !ETAPAS[etapa] || !RESULTADOS.includes(resultado)) return res.status(400).json({ erro: "Dados inválidos." });
  if (resultado === "PROBLEMA" && !obs) return res.status(400).json({ erro: "Descreva o problema na observação." });
  await comPerfil(req.user, async (c) => {
    if (!(await c.query("SELECT 1 FROM contrato WHERE id = $1", [id])).rowCount) throw erro("Venda não encontrada.", 404);
    await c.query("INSERT INTO confirmacao_venda (contrato_id, etapa, resultado, observacao, feito_por) VALUES ($1,$2,$3,$4,$5)", [id, etapa, resultado, obs, req.user.id]);
  });
  res.status(201).json({ ok: true });
});

/* =================== OBSERVAÇÕES DO CLIENTE =================== */
r.use("/clientes/:id/obs", exigePerfil("gestor", "backoffice"));

r.get("/clientes/:id/obs", async (req, res) => {
  const id = intOk(req.params.id);
  res.json(await comPerfil(req.user, async (c) => (await c.query(
    `SELECT o.id, o.texto, o.em, o.contrato_id, k.numero_contrato, u.nome_completo AS autor
       FROM cliente_observacao o LEFT JOIN usuario u ON u.id = o.autor_id LEFT JOIN contrato k ON k.id = o.contrato_id
      WHERE o.cliente_id = $1 ORDER BY o.em DESC, o.id DESC LIMIT 200`, [id])).rows));
});

r.post("/clientes/:id/obs", async (req, res) => {
  const id = intOk(req.params.id), texto = txt(req.body?.texto, 2000), contrato = intOk(req.body?.contrato_id);
  if (!texto) return res.status(400).json({ erro: "Escreva a observação." });
  await comPerfil(req.user, async (c) => {
    if (!(await c.query("SELECT 1 FROM cliente WHERE id = $1", [id])).rowCount) throw erro("Cliente não encontrado.", 404);
    await c.query("INSERT INTO cliente_observacao (cliente_id, contrato_id, texto, autor_id) VALUES ($1,$2,$3,$4)", [id, contrato, texto, req.user.id]);
  });
  res.status(201).json({ ok: true });
});

/* =================== VISÃO DA EQUIPE (supervisor e acima) =================== */
const EQ = ["lider", "coordenador"];
r.use("/painel-equipe", exigePerfil("lider", "coordenador", "gestor"));

/** Metas do mês (Plano do mês + metas personalizadas). As tabelas da premiação só a API lê. */
async function metasDoMes(mes) {
  try {
    const [pl, ps] = await Promise.all([pool.query("SELECT meta_bl, meta_chip FROM comissao_plano WHERE mes = $1", [mes]),
      pool.query("SELECT usuario_id, meta_bl, meta_chip FROM comissao_pessoa WHERE mes = $1 AND papel = 'VENDEDOR'", [mes])]);
    const plano = pl.rows[0] || null, pessoa = {};
    for (const x of ps.rows)
      pessoa[x.usuario_id] = { meta_bl: x.meta_bl, meta_chip: x.meta_chip };
    return { plano, pessoa };
  } catch { return { plano: null, pessoa: {} }; }
}

// GET /api/painel-equipe?mes=AAAA-MM&equipe=
r.get("/painel-equipe", async (req, res) => {
  const hoje = hojeBR();
  const mes = /^\d{4}-\d{2}$/.test(req.query.mes || "") ? req.query.mes : hoje.slice(0, 7);
  const mesIni = mes + "-01";
  const [a, m] = mes.split("-").map(Number);
  const fimMes = `${mes}-${p2(new Date(Date.UTC(a, m, 0)).getUTCDate())}`;
  if (mesIni > hoje) return res.status(400).json({ erro: "Esse mês ainda não começou." });
  const dia = fimMes < hoje ? fimMes : hoje;
  // mesmo período do mês anterior (dia 1 até o mesmo dia), para comparar de forma justa
  const antIni = `${m === 1 ? a - 1 : a}-${p2(m === 1 ? 12 : m - 1)}-01`;
  const [aa, ma] = antIni.split("-").map(Number);
  const antFimMes = new Date(Date.UTC(aa, ma, 0)).getUTCDate();
  const antDia = `${antIni.slice(0, 8)}${p2(Math.min(+dia.slice(8), antFimMes))}`;
  const fpdIni = (() => { const d = new Date(Date.UTC(a, m - 1 - 3, 1)); return d.toISOString().slice(0, 10); })();   // 3 safras fechadas antes do mês
  const eq = EQ.includes(req.user.perfil);
  const V = eq ? "v_eq_vendas_det" : "v_vendas_det", A = eq ? "v_eq_agentes" : "v_agentes_equipe", F = eq ? "v_eq_fpd" : "v_fpd_recorte";
  const fEq = !eq && intOk(req.query.equipe) ? intOk(req.query.equipe) : null;
  const ini14 = somaDias(dia, -13), desde = ini14 < mesIni ? ini14 : mesIni;
  const pv = [dia, desde], pa = [];
  let wv = "", wa = "";
  if (fEq) { pv.push(fEq); wv = ` AND equipe_id = $${pv.length}`; pa.push(fEq); wa = ` WHERE equipe_id = $1`; }
  // consultas independentes vão ao banco ao mesmo tempo (cada ida custa a distância Render → Supabase)
  const [o1, o2, fpdRows, metas, regras] = await Promise.all([
    comPerfil(req.user, async (c) => ({
      rows: (await c.query(`SELECT * FROM ${V} WHERE (data_venda BETWEEN $2 AND $1 OR data_agendamento = $1)${wv}`, pv)).rows,
      agentes: (await c.query(`SELECT * FROM ${A}${wa}`, pa)).rows })),
    comPerfil(req.user, async (c) => ({
      ant: (await c.query(`SELECT vendedor_id, count(*) FILTER (WHERE status_venda <> 'CANCELADO')::int AS vendas,
                                       count(*) FILTER (WHERE status_venda <> 'CANCELADO' AND tem_bl)::int AS bl
                                  FROM ${V} WHERE data_venda BETWEEN $1 AND $2${fEq ? " AND equipe_id = $3" : ""} GROUP BY 1`, fEq ? [antIni, antDia, fEq] : [antIni, antDia])).rows,
      ult: (await c.query(`SELECT vendedor_id, max(data_venda) AS ultima FROM ${V} WHERE data_venda <= $1 GROUP BY 1`, [dia])).rows,
      turnos: (await c.query(`SELECT vendedor_id,
                                       count(*) FILTER (WHERE status_venda <> 'CANCELADO' AND turno = '08:00 AS 12:00')::int AS matinal,
                                       count(*) FILTER (WHERE status_venda <> 'CANCELADO' AND turno IS NOT NULL AND turno <> '08:00 AS 12:00')::int AS vespertina
                                  FROM ${V} WHERE data_venda BETWEEN $1 AND $2${fEq ? " AND equipe_id = $3" : ""} GROUP BY 1`, fEq ? [mesIni, dia, fEq] : [mesIni, dia])).rows,
      equipes: eq ? [] : (await c.query("SELECT id, nome FROM equipe WHERE ativa ORDER BY nome")).rows })),
    comPerfil(req.user, async (c) => (await c.query(`SELECT valor AS login, sum(resolvidas)::int AS resolvidas, sum(nao_ok)::int AS nao_ok FROM ${F}
                                 WHERE dimensao = 'VENDEDOR' AND safra >= $1 AND safra < $2 GROUP BY 1`, [fpdIni, mesIni])).rows).catch(() => []),
    metasDoMes(mesIni), regrasFeriado()]);
  const out = { ...o1, ...o2, fpd: fpdRows };
  const j = montar({ rows: out.rows, agentes: out.agentes, metas, dia, agrupar: "equipe", uteisDe: calendarioDe(dia, regras) });
  // indicadores extras por vendedor: mês anterior (mesmo período), dias sem vender e FPD das 3 últimas safras
  const login = new Map([...out.agentes.map((x) => [x.id, x.login]), ...out.rows.map((x) => [x.vendedor_id, x.vendedor_login])]);
  const tur = new Map(out.turnos.map((x) => [x.vendedor_id, x]));
  const ant = new Map(out.ant.map((x) => [x.vendedor_id, x])), ult = new Map(out.ult.map((x) => [x.vendedor_id, iso(x.ultima)]));
  const fpd = new Map(out.fpd.map((x) => [x.login, x]));
  const dif = (d1, d2) => Math.round((new Date(d1) - new Date(d2)) / 864e5);
  const soma = (l, k) => l.reduce((s, x) => s + (x[k] || 0), 0);
  const extra = (p) => {
    const f = fpd.get(login.get(p.id)) || { resolvidas: 0, nao_ok: 0 }, u = ult.get(p.id) || null;
    Object.assign(p, { ant_vendas: ant.get(p.id)?.vendas || 0, ant_bl: ant.get(p.id)?.bl || 0, ultima_venda: u, dias_sem_venda: u ? dif(dia, u) : null,
      mes_matinal: tur.get(p.id)?.matinal || 0, mes_vespertina: tur.get(p.id)?.vespertina || 0,
      fpd_resolvidas: f.resolvidas, fpd_nao_ok: f.nao_ok, fpd: f.resolvidas ? +(f.nao_ok / f.resolvidas).toFixed(4) : null,
      conectividade: p.mes_vendas + p.mes_canceladas ? +(p.mes_conectadas / (p.mes_vendas + p.mes_canceladas)).toFixed(4) : null,
      cancelamento: p.mes_vendas + p.mes_canceladas ? +(p.mes_canceladas / (p.mes_vendas + p.mes_canceladas)).toFixed(4) : null,
      ticket: p.mes_vendas ? +(p.mes_valor / p.mes_vendas).toFixed(2) : null });
  };
  const agregado = (o, pessoas) => {
    const fr = soma(pessoas, "fpd_resolvidas"), fn = soma(pessoas, "fpd_nao_ok");
    Object.assign(o, { ant_vendas: soma(pessoas, "ant_vendas"), ant_bl: soma(pessoas, "ant_bl"), mes_matinal: soma(pessoas, "mes_matinal"), mes_vespertina: soma(pessoas, "mes_vespertina"), fpd_resolvidas: fr, fpd_nao_ok: fn, fpd: fr ? +(fn / fr).toFixed(4) : null,
      sem_venda_2d: pessoas.filter((p) => p.dias_sem_venda == null || p.dias_sem_venda >= 2).length,
      conectividade: o.mes_vendas + o.mes_canceladas ? +(o.mes_conectadas / (o.mes_vendas + o.mes_canceladas)).toFixed(4) : null,
      cancelamento: o.mes_vendas + o.mes_canceladas ? +(o.mes_canceladas / (o.mes_vendas + o.mes_canceladas)).toFixed(4) : null,
      ticket: o.mes_vendas ? +(o.mes_valor / o.mes_vendas).toFixed(2) : null });
  };
  for (const g of j.grupos) { g.pessoas.forEach(extra); agregado(g, g.pessoas); }
  const unicos = [...new Map(j.grupos.flatMap((g) => g.pessoas).map((p) => [p.id, p])).values()];
  agregado(j.total, unicos);
  res.json(semRestritos({ permissoes: { valores: veValores(req.user), fpd: veFpd(req.user) }, competencia: mes, dia, mes_anterior: { de: antIni, ate: antDia }, fpd_safras: { de: fpdIni, ate: somaDias(mesIni, -1) }, perfil: req.user.perfil, equipes: out.equipes, ...j }, req.user));
});

/* =================== MEU MÊS (vendedor): previsão por dia útil, calendário, ranking e FPD =================== */
// GET /api/meu-mes  -> mesmo cálculo do fechamento, só com as vendas da própria pessoa
r.get("/meu-mes", exigePerfil("vendedor"), async (req, res) => {
  const dia = hojeBR(), mesIni = dia.slice(0, 8) + "01", uid = req.user.id;
  const [a, m] = dia.split("-").map(Number), fpdIni = new Date(Date.UTC(a, m - 4, 1)).toISOString().slice(0, 10);
  const de = somaDias(dia, -13) < mesIni ? somaDias(dia, -13) : mesIni;
  // tudo ao mesmo tempo: cada ida ao banco custa a distância Render → Supabase
  const [ag, rows, metas, regras, rk] = await Promise.all([
    pool.query("SELECT * FROM v_agentes_equipe WHERE id = $1", [uid]).then((r) => r.rows),
    pool.query("SELECT * FROM v_vendas_det WHERE vendedor_id = $1 AND (data_venda BETWEEN $2 AND $3 OR data_agendamento = $3)", [uid, de, dia]).then((r) => r.rows),
    metasDoMes(mesIni), regrasFeriado(),
    pool.query(`SELECT vendedor_id, equipe_id, count(*) FILTER (WHERE status_venda <> 'CANCELADO')::int AS v, count(*) FILTER (WHERE status_venda <> 'CANCELADO' AND tem_bl)::int AS bl
                                  FROM v_vendas_det WHERE data_venda BETWEEN $1 AND $2 GROUP BY 1, 2`, [mesIni, dia]).then((r) => r.rows)]);
  const j = montar({ rows, agentes: ag, metas, dia, agrupar: "geral", uteisDe: calendarioDe(dia, regras) });
  const eu = j.grupos[0]?.pessoas.find((p) => p.id === uid) || null;
  // posição na equipe e na empresa (vendas válidas do mês), sem expor números de outras pessoas
  const eqId = ag[0]?.equipe_id || rows[0]?.equipe_id || null;
  const pos = (l) => { const o = [...l].sort((x, y) => y.bl - x.bl || y.v - x.v); const i = o.findIndex((x) => x.vendedor_id === uid); return { posicao: i >= 0 ? i + 1 : null, de: Math.max(o.length, i >= 0 ? o.length : o.length + 1), media_bl: o.length ? +(o.reduce((s, x) => s + x.bl, 0) / o.length).toFixed(1) : 0, lider_bl: o[0]?.bl || 0 }; };
  const mix = { bl: 0, tv: 0, fone: 0, chip_nova: 0, chip_mp: 0, dcc: 0 };
  for (const x of rows) { const d = iso(x.data_venda); if (d < mesIni || d > dia || x.status_venda === "CANCELADO") continue; mix.bl += x.tem_bl ? 1 : 0; mix.tv += x.tem_tv ? 1 : 0; mix.fone += x.tem_fone ? 1 : 0; mix.chip_nova += x.chip_nova || 0; mix.chip_mp += (x.chip_mig || 0) + (x.chip_port || 0); mix.dcc += x.forma_pagamento === "DCC" ? 1 : 0; }
  res.json(semRestritos({ dia, mes: j.mes, eu, mix, equipe: pos(rk.filter((x) => eqId && x.equipe_id === eqId)), empresa: pos(rk),
  }, req.user));
});

/* =================== FERIADOS (calendário 6x1 da previsão) =================== */
r.use("/feriados", exigePerfil("gestor"));
const ABR = ["NACIONAL", "ESTADUAL", "MUNICIPAL"];

// GET /api/feriados?ano=2026&cidade_id=  -> regras cadastradas + o calendário calculado da cidade escolhida
r.get("/feriados", async (req, res) => {
  const ano = /^\d{4}$/.test(req.query.ano || "") ? +req.query.ano : +hojeBR().slice(0, 4);
  const out = await comPerfil(req.user, async (c) => {
    const regras = (await c.query(`SELECT f.*, ci.nome AS cidade FROM feriado f LEFT JOIN cidade ci ON ci.id = f.cidade_id
                                    ORDER BY coalesce(f.mes, extract(month FROM f.data)::int), coalesce(f.dia, extract(day FROM f.data)::int)`)).rows
      .map((x) => ({ ...x, data: iso(x.data) }));
    const cidades = (await c.query(`SELECT DISTINCT ci.id, ci.nome, ci.uf FROM cidade ci
                                     WHERE ci.id IN (SELECT cidade_id FROM equipe WHERE cidade_id IS NOT NULL UNION SELECT cidade_id FROM contrato WHERE cidade_id IS NOT NULL) ORDER BY ci.uf, ci.nome`)).rows;
    return { regras, cidades };
  });
  const cid = out.cidades.find((x) => String(x.id) === String(req.query.cidade_id)) || null;
  const regiao = cid ? { uf: cid.uf, cidade_id: cid.id } : null;
  const calendario = feriadosDoAno(ano, out.regras, regiao);
  const meses = Array.from({ length: 12 }, (_, i) => { const d = `${ano}-${String(i + 1).padStart(2, "0")}-01`; const u = diasUteis(`${d.slice(0, 8)}28`, out.regras, regiao); return { mes: d.slice(0, 7), dias_uteis: u.total }; });
  res.json({ ano, regiao: cid, regras: out.regras, cidades: out.cidades, calendario, meses });
});

// POST /api/feriados { nome, abrangencia, uf?, cidade_id?, recorrente, dia?, mes?, data?, considera }
r.post("/feriados", async (req, res) => {
  const b = req.body || {}, nome = txt(b.nome, 120), abr = String(b.abrangencia || "");
  if (!nome || nome.length < 2) return res.status(400).json({ erro: "Informe o nome do feriado." });
  if (!ABR.includes(abr)) return res.status(400).json({ erro: "Escolha se é nacional, estadual ou municipal." });
  const rec = b.recorrente !== false;
  let dia = null, mes = null, data = null;
  if (rec) { dia = intOk(b.dia); mes = intOk(b.mes); if (!dia || !mes || dia > 31 || mes > 12) return res.status(400).json({ erro: "Informe dia e mês." }); }
  else { data = dataOk(b.data); if (!data) return res.status(400).json({ erro: "Informe a data." }); }
  const uf = abr === "ESTADUAL" ? String(b.uf || "").toUpperCase() : null, cidade = abr === "MUNICIPAL" ? intOk(b.cidade_id) : null;
  if (abr === "ESTADUAL" && !/^[A-Z]{2}$/.test(uf)) return res.status(400).json({ erro: "Informe a UF." });
  if (abr === "MUNICIPAL" && !cidade) return res.status(400).json({ erro: "Escolha a cidade." });
  try {
    await comPerfil(req.user, async (c) => {
      const ufCid = cidade ? (await c.query("SELECT uf FROM cidade WHERE id = $1", [cidade])).rows[0]?.uf : null;
      await c.query(`INSERT INTO feriado (nome, abrangencia, uf, cidade_id, recorrente, dia, mes, data, considera) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [nome, abr, uf || ufCid, cidade, rec, dia, mes, data, b.considera !== false]);
    });
  } catch (e) { if (e.code === "23505") return res.status(409).json({ erro: "Esse feriado já está cadastrado." }); throw e; }
  res.status(201).json({ ok: true });
});

// PATCH /api/feriados/:id { considera }   DELETE /api/feriados/:id
r.patch("/feriados/:id", async (req, res) => {
  await comPerfil(req.user, (c) => c.query("UPDATE feriado SET considera = $2 WHERE id = $1", [intOk(req.params.id), req.body?.considera !== false]));
  res.json({ ok: true });
});
r.delete("/feriados/:id", async (req, res) => {
  const n = await comPerfil(req.user, async (c) => (await c.query("DELETE FROM feriado WHERE id = $1", [intOk(req.params.id)])).rowCount);
  if (!n) return res.status(404).json({ erro: "Feriado não encontrado." });
  res.json({ ok: true });
});

export default r;
