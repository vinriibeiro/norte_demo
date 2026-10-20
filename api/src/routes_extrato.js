import { Router } from "express";
import { comPerfil } from "./db.js";
import { exigePerfil } from "./auth.js";
import { interpretar, resumir, rotuloPeriodo, janela, COLUNAS } from "./extrato.js";

/* Extrato da operadora (o que a operadora pagou e o que não pagou). Somente Gerente e Administrador. */
const r = Router();
r.use("/extrato", exigePerfil("gestor"));

const erro = (m, status = 400) => Object.assign(new Error(m), { status });
const p2 = (n) => String(n).padStart(2, "0");
const iso = (d) => (d instanceof Date ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : d ? String(d).slice(0, 10) : null);
const CAMPOS = [...Object.values(COLUNAS), "contrato_num", "chave"];
const TIPOS_SQL = { data_ativacao: "date", data_estorno: "date", valido: "boolean", valor: "numeric", valor_franquia: "numeric", franquia_anterior: "numeric",
  valor_delta: "numeric", valor_fator: "numeric", cod_irreg: "integer" };

function lerEnvio(req) {
  const nome = String(req.body?.nome || "extrato.csv").slice(0, 200);
  const texto = req.body?.conteudo;
  if (typeof texto !== "string" || texto.length < 50) throw erro("Escolha o arquivo CSV do extrato.");
  if (!/\.csv$/i.test(nome)) throw erro("Envie o arquivo .csv baixado do portal da operadora.");
  return { nome, ...interpretar(texto) };
}

async function jaExistentes(c, linhas) {
  const ex = new Set();
  for (let i = 0; i < linhas.length; i += 5000) {
    const ch = linhas.slice(i, i + 5000).map((l) => l.chave);
    for (const x of (await c.query("SELECT chave FROM extrato_linha WHERE chave = ANY($1::text[])", [ch])).rows) ex.add(x.chave);
  }
  return ex;
}

// POST /api/extrato/analisar { nome, conteudo }  -> prévia: o que é novo, o que já existe, valores. NÃO grava nada.
r.post("/extrato/analisar", async (req, res) => {
  const env = lerEnvio(req);
  const ex = await comPerfil(req.user, (c) => jaExistentes(c, env.linhas));
  const novas = env.linhas.filter((l) => !ex.has(l.chave));
  res.json({ arquivo: env.nome, total_arquivo: env.total_arquivo, lidas: env.linhas.length, problemas: env.problemas,
    novas: novas.length, repetidas: env.linhas.length - novas.length, resumo_arquivo: resumir(env.linhas), resumo_novas: resumir(novas) });
});

// POST /api/extrato/importar { nome, conteudo }  -> grava SÓ as linhas que ainda não existem
r.post("/extrato/importar", async (req, res) => {
  if (req.user.verComo) throw erro("Não disponível no modo “ver como”.", 403);
  const env = lerEnvio(req);
  const out = await comPerfil(req.user, async (c) => {
    const ex = await jaExistentes(c, env.linhas);
    const novas = env.linhas.filter((l) => !ex.has(l.chave));
    if (!novas.length) return { lote: null, novas: 0, repetidas: env.linhas.length };
    const rs = resumir(novas);
    const lote = (await c.query(
      `INSERT INTO extrato_lote (arquivo_nome, enviado_por, linhas_arquivo, linhas_novas, linhas_repetidas, periodos, valor_novo)
       VALUES ($1,$2,$3,0,$4,$5,$6) RETURNING id`,
      [env.nome, req.user.id, env.total_arquivo, env.linhas.length - novas.length, rs.periodos.map((p) => p.periodo).join(", "), rs.liquido + rs.a_debitar])).rows[0].id;
    let gravadas = 0;
    const cols = CAMPOS.map((k) => `${k} ${TIPOS_SQL[k] || "text"}`).join(", ");
    for (let i = 0; i < novas.length; i += 1000) {
      const pacote = JSON.stringify(novas.slice(i, i + 1000).map((l) => Object.fromEntries(CAMPOS.map((k) => [k, l[k] ?? null]))));
      gravadas += (await c.query(
        `INSERT INTO extrato_linha (lote_id, ${CAMPOS.join(", ")})
         SELECT $1, ${CAMPOS.join(", ")} FROM jsonb_to_recordset($2::jsonb) AS x(${cols})
         ON CONFLICT (chave) DO NOTHING`, [lote, pacote])).rowCount;
    }
    await c.query("UPDATE extrato_lote SET linhas_novas=$2, linhas_repetidas=$3 WHERE id=$1", [lote, gravadas, env.linhas.length - gravadas]);
    return { lote, novas: gravadas, repetidas: env.linhas.length - gravadas, resumo: rs };
  });
  res.status(out.lote ? 201 : 200).json(out);
});

// GET /api/extrato/resumo  -> visão geral por quinzena, tipos e pendências (tudo que já foi enviado)
r.get("/extrato/resumo", async (req, res) => {
  const out = await comPerfil(req.user, async (c) => {
    const per = (await c.query(`
      SELECT mes_referencia AS mes, quinzena, count(*)::int AS linhas, count(*) FILTER (WHERE valido)::int AS validas,
             coalesce(sum(valor) FILTER (WHERE valido AND valor >= 0), 0) AS recebido,
             coalesce(sum(valor) FILTER (WHERE valido AND valor < 0), 0) AS estornos,
             coalesce(sum(valor) FILTER (WHERE valido), 0) AS liquido,
             count(*) FILTER (WHERE NOT valido AND valor >= 0)::int AS nao_pagas,
             coalesce(sum(valor) FILTER (WHERE NOT valido AND valor < 0), 0) AS a_debitar,
             count(DISTINCT contrato_num) FILTER (WHERE valido AND tipo_operacao = 'BANDA LARGA FIXA')::int AS contratos_bl
        FROM extrato_linha GROUP BY 1, 2 ORDER BY 1, 2`)).rows;
    const tipos = (await c.query(`SELECT mes_referencia AS mes, quinzena, tipo_operacao AS tipo, count(*)::int AS linhas, sum(valor) AS valor
        FROM extrato_linha WHERE valido GROUP BY 1,2,3`)).rows;
    const pend = (await c.query(`SELECT mes_referencia AS mes, quinzena, coalesce(pendencia,'SEM MOTIVO') AS pendencia, count(*)::int AS linhas, sum(valor) AS valor
        FROM extrato_linha WHERE NOT valido GROUP BY 1,2,3`)).rows;
    const lotes = (await c.query(`SELECT l.id, l.arquivo_nome, l.enviado_em, u.nome_completo AS enviado_por, l.linhas_arquivo, l.linhas_novas, l.linhas_repetidas, l.periodos, l.valor_novo
        FROM extrato_lote l LEFT JOIN usuario u ON u.id = l.enviado_por ORDER BY l.enviado_em DESC LIMIT 200`)).rows;
    return { per, tipos, pend, lotes };
  });
  res.json({ ...out, per: out.per.map((p) => ({ ...p, periodo: rotuloPeriodo(p.mes, p.quinzena) })) });
});

// GET /api/extrato/detalhe?mes=AAAAMM&quinzena=P1&tipo=&pendencia=&valido=t|f&busca=&pagina=
r.get("/extrato/detalhe", async (req, res) => {
  const w = [], p = [];
  const add = (cond, v) => { p.push(v); w.push(cond.replace("?", "$" + p.length)); };
  if (/^\d{6}$/.test(req.query.mes || "")) add("l.mes_referencia = ?", req.query.mes);
  if (/^P[12]$/.test(req.query.quinzena || "")) add("l.quinzena = ?", req.query.quinzena);
  if (req.query.tipo) add("l.tipo_operacao = ?", String(req.query.tipo));
  if (req.query.pendencia) add("coalesce(l.pendencia,'SEM MOTIVO') = ?", String(req.query.pendencia));
  if (req.query.valido === "t" || req.query.valido === "f") add("l.valido = ?", req.query.valido === "t");
  const busca = String(req.query.busca || "").replace(/\D/g, "");
  if (busca) { p.push(busca.replace(/^0+/, "")); w.push(`(l.contrato_num = $${p.length} OR l.ntc = $${p.length} OR l.contrato_ebt LIKE '%' || $${p.length})`); }
  const pagina = Math.max(1, parseInt(req.query.pagina || "1", 10));
  const where = w.length ? "WHERE " + w.join(" AND ") : "";
  const out = await comPerfil(req.user, async (c) => {
    const tot = (await c.query(`SELECT count(*)::int n, coalesce(sum(valor) FILTER (WHERE valido),0) AS valor FROM extrato_linha l ${where}`, p)).rows[0];
    const itens = (await c.query(`
      SELECT l.id, l.data_ativacao, l.tipo_operacao, l.plano, l.mes_referencia, l.quinzena, l.valido, l.valor, l.pendencia, l.arquivo, l.contrato_ebt, l.contrato_num, l.ntc,
             k.id AS contrato_id, k.status_venda, cl.nome AS cliente, u.nome_completo AS vendedor
        FROM extrato_linha l
        LEFT JOIN contrato k ON l.contrato_num IS NOT NULL AND ltrim(k.numero_contrato, '0') = l.contrato_num
        LEFT JOIN cliente cl ON cl.id = k.cliente_id LEFT JOIN usuario u ON u.id = k.vendedor_id
        ${where} ORDER BY (l.valido OR l.valor >= 0) DESC, l.mes_referencia DESC, l.quinzena DESC, l.data_ativacao DESC, l.id LIMIT 100 OFFSET ${(pagina - 1) * 100}`, p)).rows;
    return { total: tot.n, valor: tot.valor, itens };
  });
  res.json({ ...out, pagina, itens: out.itens.map((x) => ({ ...x, data_ativacao: iso(x.data_ativacao) })) });
});

/* Conferência com as vendas do sistema:
   - instaladas (ATIVO, com banda larga) cuja instalação caiu numa quinzena já enviada e que NÃO tiveram pagamento de banda larga
   - pagas pela operadora mas canceladas no sistema (risco de estorno)
   - pagas pela operadora mas que não existem no sistema (venda não lançada) */
r.get("/extrato/conferencia", async (req, res) => {
  const out = await comPerfil(req.user, async (c) => {
    const cobertas = (await c.query(`SELECT DISTINCT mes_referencia AS mes, quinzena FROM extrato_linha
        WHERE valido AND tipo_operacao = 'BANDA LARGA FIXA' ORDER BY 1, 2`)).rows;
    if (!cobertas.length) return { cobertas: [], sem_pagamento: [], pagas_canceladas: [], fora_do_sistema: [], base: 0, pagas: 0 };
    const jan = cobertas.map((x) => janela(x.mes, x.quinzena));
    const ini = jan[0][0], fim = jan[jan.length - 1][1];
    const dentro = jan.map((_, i) => `(ref BETWEEN $${2 * i + 1}::date AND $${2 * i + 2}::date)`).join(" OR ");
    const pj = jan.flat();
    const base = (await c.query(`
      WITH v AS (
        SELECT b.contrato_id, b.numero_contrato, ltrim(b.numero_contrato, '0') AS num, b.data_venda, k.data_agendamento,
               coalesce(k.data_agendamento, b.data_venda) AS ref, b.vendedor_nome AS vendedor, b.equipe, b.status_contrato, cl.nome AS cliente
          FROM v_contrato_base b JOIN contrato k ON k.id = b.contrato_id JOIN cliente cl ON cl.id = k.cliente_id
         WHERE b.status_venda = 'ATIVO' AND b.tem_bl AND b.numero_contrato IS NOT NULL)
      SELECT v.*, EXISTS (SELECT 1 FROM extrato_linha l WHERE l.contrato_num = v.num AND l.tipo_operacao = 'BANDA LARGA FIXA' AND l.valido) AS pago,
             (SELECT coalesce(sum(l.valor),0) FROM extrato_linha l WHERE l.contrato_num = v.num AND l.valido) AS total_recebido
        FROM v WHERE ${dentro}`, pj)).rows;
    const pagasCanc = (await c.query(`
      SELECT k.id AS contrato_id, k.numero_contrato, k.data_venda, k.status_contrato, cl.nome AS cliente, u.nome_completo AS vendedor,
             sum(l.valor) AS total_recebido, string_agg(DISTINCT l.mes_referencia || ' ' || l.quinzena, ', ') AS periodos
        FROM extrato_linha l JOIN contrato k ON ltrim(k.numero_contrato, '0') = l.contrato_num
        JOIN cliente cl ON cl.id = k.cliente_id JOIN usuario u ON u.id = k.vendedor_id
       WHERE l.valido AND l.tipo_operacao = 'BANDA LARGA FIXA' AND k.status_venda = 'CANCELADO'
       GROUP BY 1,2,3,4,5,6 ORDER BY k.data_venda DESC LIMIT 500`)).rows;
    const fora = (await c.query(`
      SELECT l.contrato_ebt, l.contrato_num, min(l.data_ativacao) AS data_ativacao, string_agg(DISTINCT l.plano, ', ') AS plano, sum(l.valor) AS total_recebido,
             string_agg(DISTINCT l.mes_referencia || ' ' || l.quinzena, ', ') AS periodos
        FROM extrato_linha l
       WHERE l.valido AND l.tipo_operacao = 'BANDA LARGA FIXA' AND l.contrato_num IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM contrato k WHERE ltrim(k.numero_contrato, '0') = l.contrato_num)
       GROUP BY 1,2 ORDER BY 3 DESC LIMIT 500`)).rows;
    return { cobertas, ini, fim, base, pagasCanc, fora };
  });
  if (!out.base) return res.json(out);
  // instalações nos últimos 3 dias da última quinzena podem ter sido ativadas pela operadora já na quinzena seguinte
  const limiteAtencao = new Date(new Date(out.fim + "T12:00:00Z").getTime() - 3 * 864e5).toISOString().slice(0, 10);
  const sem = out.base.filter((x) => !x.pago).map((x) => ({ ...x, data_venda: iso(x.data_venda), data_agendamento: iso(x.data_agendamento), ref: iso(x.ref) }))
    .map((x) => ({ ...x, aguardar: x.ref > limiteAtencao })).sort((a, b) => (a.ref < b.ref ? 1 : -1));
  res.json({
    cobertas: out.cobertas.map((x) => ({ ...x, periodo: rotuloPeriodo(x.mes, x.quinzena), de: janela(x.mes, x.quinzena)[0], ate: janela(x.mes, x.quinzena)[1] })),
    base: out.base.length, pagas: out.base.filter((x) => x.pago).length, sem_pagamento: sem,
    pagas_canceladas: out.pagasCanc.map((x) => ({ ...x, data_venda: iso(x.data_venda) })),
    fora_do_sistema: out.fora.map((x) => ({ ...x, data_ativacao: iso(x.data_ativacao) })),
  });
});

// GET /api/extrato/exportar?mes=AAAAMM&quinzena=P1  -> todas as linhas do extrato (com a venda do sistema ligada), para extrair em Excel
r.get("/extrato/exportar", async (req, res) => {
  const w = [], p = [];
  if (/^\d{6}$/.test(req.query.mes || "")) { p.push(req.query.mes); w.push(`l.mes_referencia = $${p.length}`); }
  if (/^P[12]$/.test(req.query.quinzena || "")) { p.push(req.query.quinzena); w.push(`l.quinzena = $${p.length}`); }
  const linhas = await comPerfil(req.user, async (c) => (await c.query(`
    SELECT l.mes_referencia, l.quinzena, l.data_ativacao, l.tipo_operacao, l.arquivo, l.plano, l.valido, l.valor, l.pendencia, l.cod_irreg, l.data_estorno,
           l.contrato_ebt, l.contrato_num, l.ntc, l.cod_mobile, l.simcard, l.status_ged, l.plano_anterior, l.ntc_anterior, l.classificacao_pgto,
           k.numero_contrato, k.data_venda, k.status_venda, cl.nome AS cliente, u.nome_completo AS vendedor, e.nome AS equipe, lo.arquivo_nome
      FROM extrato_linha l
      JOIN extrato_lote lo ON lo.id = l.lote_id
      LEFT JOIN contrato k ON l.contrato_num IS NOT NULL AND ltrim(k.numero_contrato, '0') = l.contrato_num
      LEFT JOIN cliente cl ON cl.id = k.cliente_id LEFT JOIN usuario u ON u.id = k.vendedor_id LEFT JOIN equipe e ON e.id = k.equipe_id
      ${w.length ? "WHERE " + w.join(" AND ") : ""}
     ORDER BY l.mes_referencia, l.quinzena, l.tipo_operacao, l.data_ativacao, l.id LIMIT 200000`, p)).rows);
  res.json(linhas.map((x) => ({ ...x, data_ativacao: iso(x.data_ativacao), data_estorno: iso(x.data_estorno), data_venda: iso(x.data_venda) })));
});

// DELETE /api/extrato/lotes/:id  -> desfaz um envio errado (apaga só as linhas que entraram por ele)
r.delete("/extrato/lotes/:id", async (req, res) => {
  if (req.user.verComo) throw erro("Não disponível no modo “ver como”.", 403);
  const id = parseInt(req.params.id, 10);
  const n = await comPerfil(req.user, async (c) => {
    const x = (await c.query("SELECT count(*)::int n FROM extrato_linha WHERE lote_id=$1", [id])).rows[0].n;
    const d = await c.query("DELETE FROM extrato_lote WHERE id=$1", [id]);
    if (!d.rowCount) throw erro("Envio não encontrado.", 404);
    return x;
  });
  res.json({ ok: true, linhas_removidas: n });
});

export default r;
