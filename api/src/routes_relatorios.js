import { Router } from "express";
import { comPerfil, pool } from "./db.js";
import { exigePerfil, exigeSetor, semRestritos, veValores, veFpd } from "./auth.js";
import { montar, AGRUPAR as AGRUPAR_FECH, somaDias, anexarFpd, inicioFpd } from "./fechamento.js";
import { calendarioDe } from "./calendario.js";

/** Regras de feriado (tabela feriado). Sem a tabela (banco sem o arquivo 14), só os nacionais. */
export const regrasFeriado = () => pool.query("SELECT * FROM feriado").then((r) => r.rows).catch(() => []);

/* Relatórios do dia a dia: Fechamento do dia (texto para os grupos) e Produtividade dos agentes.
   Departamentos com acesso: Backoffice, Gerente e Administrador. */
const r = Router();
r.use(["/fechamento", "/produtividade"], exigePerfil("gestor", "backoffice"), exigeSetor("CADASTRO"));

const dataOk = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(new Date(s)) ? s : null);
const hojeBR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);   // horário de Brasília
const intOk = (v) => { const n = parseInt(v || "", 10); return n > 0 ? n : null; };

const BASE = (grupo) => `
  SELECT ${grupo} AS grupo, b.contrato_id, b.vendedor_id, b.vendedor_nome AS vendedor, b.data_venda, k.data_agendamento,
         b.status_venda, b.tem_bl, b.tem_tv, b.pacote_valor, b.equipe, b.cidade,
         coalesce((SELECT sum(i.quantidade) FROM contrato_item i JOIN produto p ON p.id = i.produto_id WHERE i.contrato_id = b.contrato_id AND p.categoria = 'MOVEL'), 0)::int AS movel,
         EXISTS (SELECT 1 FROM contrato_item i JOIN produto p ON p.id = i.produto_id WHERE i.contrato_id = b.contrato_id AND p.categoria = 'FONE') AS tem_fone
    FROM v_contrato_base b
    JOIN contrato k ON k.id = b.contrato_id
    LEFT JOIN usuario li ON li.id = b.lider_id
    LEFT JOIN usuario co ON co.id = b.coordenador_id`;

// "12,13" -> [12, 13]: o filtro de cidade pode trazer várias regiões (ex.: todo o DF como Brasília/DF)
const idsDe = (v) => String(v || "").split(",").map((x) => intOk(x)).filter(Boolean);

function filtros(q, w, p) {
  const add = (cond, v) => { p.push(v); w.push(cond.replace("?", "$" + p.length)); };
  const eq = intOk(q.equipe), ci = idsDe(q.cidade), ve = intOk(q.vendedor);
  if (eq) add("b.equipe_id = ?", eq);
  if (ci.length) add("b.cidade_id = ANY(?)", ci);
  if (ve) add("b.vendedor_id = ?", ve);
}

// o pg entrega DATE como Date à meia-noite local: monta AAAA-MM-DD pelos campos locais (não sofre com fuso)
const p2 = (n) => String(n).padStart(2, "0");
const iso = (d) => (d instanceof Date ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : d ? String(d).slice(0, 10) : null);

/* Vendas do fechamento: uma linha por contrato, com tudo o que a planilha da Norte Link mostrava (BL, TV, chips por tipo, DCC, MULTI, APT, canal). */
const SQL_FECH = `
  SELECT b.contrato_id, b.vendedor_id, b.vendedor_nome AS vendedor, b.vendedor_login, b.data_venda, k.data_agendamento, b.status_venda,
         b.tem_bl, b.tem_tv, b.tem_multi, b.pacote_valor, b.equipe, CASE WHEN b.uf = 'DF' THEN 'BRASÍLIA/DF' ELSE b.cidade || '/' || b.uf END AS cidade, b.cidade_id, b.uf, b.forma_pagamento, b.tipo_imovel, b.canal, b.origem,
         li.nome_completo AS lider, co.nome_completo AS coordenador,
         coalesce(ch.nova, 0)::int AS chip_nova, coalesce(ch.mig, 0)::int AS chip_mig, coalesce(ch.port, 0)::int AS chip_port,
         EXISTS (SELECT 1 FROM contrato_item i JOIN produto p ON p.id = i.produto_id WHERE i.contrato_id = b.contrato_id AND p.categoria = 'FONE') AS tem_fone
    FROM v_contrato_base b
    JOIN contrato k ON k.id = b.contrato_id
    LEFT JOIN usuario li ON li.id = b.lider_id
    LEFT JOIN usuario co ON co.id = b.coordenador_id
    LEFT JOIN LATERAL (
      SELECT sum(i.quantidade) FILTER (WHERE i.tipo_adesao = 'LINHA_NOVA' OR i.tipo_adesao IS NULL) AS nova,
             sum(i.quantidade) FILTER (WHERE i.tipo_adesao = 'MIGRACAO')      AS mig,
             sum(i.quantidade) FILTER (WHERE i.tipo_adesao = 'PORTABILIDADE') AS port
        FROM contrato_item i JOIN produto p ON p.id = i.produto_id
       WHERE i.contrato_id = b.contrato_id AND p.categoria = 'MOVEL') ch ON true`;

// Vendedores ativos com equipe: aparecem no fechamento mesmo sem venda (zerados), como na planilha
const SQL_AGENTES = (w) => `
  SELECT u.id, u.nome_completo AS nome, u.login, e.nome AS equipe, e.cidade_id, ci.uf, CASE WHEN ci.uf = 'DF' THEN 'BRASÍLIA/DF' ELSE ci.nome || '/' || ci.uf END AS cidade, li.nome_completo AS lider, co.nome_completo AS coordenador
    FROM usuario u
    JOIN equipe_membro m ON m.usuario_id = u.id AND m.fim IS NULL
    JOIN equipe e ON e.id = m.equipe_id AND e.ativa
    LEFT JOIN cidade ci ON ci.id = e.cidade_id
    LEFT JOIN usuario li ON li.id = e.lider_id
    LEFT JOIN usuario co ON co.id = e.coordenador_id
   WHERE u.ativo AND u.perfil_acesso <> 'master'
     AND (u.perfil_acesso = 'vendedor' OR EXISTS (SELECT 1 FROM usuario_funcao f WHERE f.usuario_id = u.id AND f.funcao = 'VENDEDOR'))
     ${w.length ? "AND " + w.join(" AND ") : ""}`;

/** Metas do mês (Plano do mês + metas personalizadas). Tabelas da premiação só a API lê (sem perfil do banco). */
async function metasDoMes(mes) {
  try {
    const [pl, ps] = await Promise.all([pool.query("SELECT meta_bl, meta_chip FROM comissao_plano WHERE mes = $1", [mes]),
      pool.query("SELECT usuario_id, meta_bl, meta_chip FROM comissao_pessoa WHERE mes = $1 AND papel = 'VENDEDOR'", [mes])]);
    const plano = pl.rows[0] || null, pessoa = {};
    for (const x of ps.rows)
      pessoa[x.usuario_id] = { meta_bl: x.meta_bl, meta_chip: x.meta_chip };
    return { plano, pessoa };
  } catch { return { plano: null, pessoa: {} }; }   // banco sem o arquivo 09 (premiação): fechamento sai sem meta
}

// regiões com o mesmo nome de exibição (todo o DF) viram uma opção só; o id vira a lista "12,13"
function mesclarCidades(rows) {
  const m = new Map();
  for (const x of rows) { if (!m.has(x.nome)) m.set(x.nome, []); m.get(x.nome).push(x.id); }
  return [...m].map(([nome, ids]) => ({ id: ids.join(","), nome }));
}

// GET /api/fechamento?dia=AAAA-MM-DD&agrupar=equipe&equipe=&cidade=&vendedor=
r.get("/fechamento", async (req, res) => {
  const dia = dataOk(req.query.dia) || hojeBR();
  const agrupar = AGRUPAR_FECH[req.query.agrupar] ? req.query.agrupar : "equipe";
  const mesIni = dia.slice(0, 8) + "01";
  const ini14 = somaDias(dia, -13), desde = ini14 < mesIni ? ini14 : mesIni;
  const w = [], p = [dia, desde];
  filtros(req.query, w, p);
  // mesmos filtros para a lista de vendedores ativos (equipe atual / cidade da equipe / pessoa)
  const wa = [], pa = [];
  const eq = intOk(req.query.equipe), ci = idsDe(req.query.cidade), ve = intOk(req.query.vendedor);
  if (eq) { pa.push(eq); wa.push(`e.id = $${pa.length}`); }
  if (ci.length) { pa.push(ci); wa.push(`e.cidade_id = ANY($${pa.length})`); }
  if (ve) { pa.push(ve); wa.push(`u.id = $${pa.length}`); }
  // consultas independentes vão ao banco ao mesmo tempo (cada ida custa a distância Render → Supabase)
  const [o1, o2, metas, regras] = await Promise.all([
    comPerfil(req.user, async (c) => ({
      rows: (await c.query(`${SQL_FECH}
       WHERE (b.data_venda BETWEEN $2 AND $1 OR k.data_agendamento = $1) ${w.length ? "AND " + w.join(" AND ") : ""}`, p)).rows,
      agentes: (await c.query(SQL_AGENTES(wa), pa)).rows,
      // FPD (1ª fatura não paga no prazo) das 3 safras anteriores ao mês, por vendedor
      fpd: (await c.query(`SELECT valor AS login, sum(resolvidas)::int AS resolvidas, sum(nao_ok)::int AS nao_ok FROM v_fpd_recorte
                                 WHERE dimensao = 'VENDEDOR' AND safra >= $1 AND safra < $2 GROUP BY 1`, [inicioFpd(mesIni), mesIni])).rows })),
    comPerfil(req.user, async (c) => ({
      equipes: (await c.query("SELECT id, nome FROM equipe WHERE ativa ORDER BY nome")).rows,
      cidades: mesclarCidades((await c.query(`SELECT ci.id, CASE WHEN ci.uf = 'DF' THEN 'BRASÍLIA/DF' ELSE ci.nome || '/' || ci.uf END AS nome FROM cidade ci
                                     WHERE ci.id IN (SELECT cidade_id FROM contrato UNION SELECT cidade_id FROM equipe) ORDER BY 2`)).rows),
      vendedores: (await c.query(`SELECT DISTINCT u.id, u.nome_completo AS nome FROM usuario u JOIN contrato k ON k.vendedor_id = u.id
                                        WHERE k.data_venda >= $1::date - 90 ORDER BY 2`, [dia])).rows })),
    metasDoMes(mesIni), regrasFeriado()]);
  const out = { ...o1, ...o2 };
  const j = montar({ rows: out.rows, agentes: out.agentes, metas, dia, agrupar, uteisDe: calendarioDe(dia, regras) });
  const login = new Map([...out.agentes.map((x) => [x.id, x.login]), ...out.rows.map((x) => [x.vendedor_id, x.vendedor_login])]);
  anexarFpd(j, out.fpd, (id) => login.get(id));
  j.fpd_safras = { de: inicioFpd(mesIni), ate: somaDias(mesIni, -1) };
  res.json(semRestritos({ ...j, permissoes: { valores: veValores(req.user), fpd: veFpd(req.user) }, equipes: out.equipes, cidades: out.cidades, vendedores: out.vendedores }, req.user));
});

// GET /api/produtividade?de=&ate=&vendedor=&equipe=&cidade=
r.get("/produtividade", async (req, res) => {
  const hoje = hojeBR();
  let de = dataOk(req.query.de) || hoje, ate = dataOk(req.query.ate) || de;
  if (ate < de) [de, ate] = [ate, de];
  if ((new Date(ate) - new Date(de)) / 864e5 > 400) return res.status(400).json({ erro: "Escolha um período de até 13 meses." });
  const vend = intOk(req.query.vendedor), eq = intOk(req.query.equipe);
  const out = await comPerfil(req.user, async (c) => {
    const w = ["b.data_venda BETWEEN $1 AND $2"], p = [de, ate];
    filtros(req.query, w, p);
    const vendas = (await c.query(`${BASE("b.vendedor_id")} WHERE ${w.join(" AND ")}`, p)).rows;
    // agentes ativos (inclusive quem não vendeu nada no período: produtividade zero também é informação)
    const pp = []; const ww = ["u.ativo", "u.perfil_acesso <> 'master'", "(u.perfil_acesso = 'vendedor' OR EXISTS (SELECT 1 FROM usuario_funcao f WHERE f.usuario_id = u.id AND f.funcao = 'VENDEDOR'))"];
    if (vend) { pp.push(vend); ww.push(`u.id = $${pp.length}`); }
    if (eq) { pp.push(eq); ww.push(`m.equipe_id = $${pp.length}`); }
    const agentes = (await c.query(`SELECT u.id, u.nome_completo AS nome, e.nome AS equipe, u.data_entrada
        FROM usuario u LEFT JOIN equipe_membro m ON m.usuario_id = u.id AND m.fim IS NULL LEFT JOIN equipe e ON e.id = m.equipe_id
       WHERE ${ww.join(" AND ")} ORDER BY u.nome_completo`, pp)).rows;
    const lista = (await c.query(`SELECT u.id, u.nome_completo AS nome FROM usuario u WHERE u.perfil_acesso <> 'master'
        AND ((u.ativo AND (u.perfil_acesso = 'vendedor' OR EXISTS (SELECT 1 FROM usuario_funcao f WHERE f.usuario_id = u.id AND f.funcao = 'VENDEDOR')))
             OR u.id IN (SELECT vendedor_id FROM contrato WHERE data_venda BETWEEN $1 AND $2)) ORDER BY 2`, [de, ate])).rows;
    const equipes = (await c.query("SELECT id, nome FROM equipe WHERE ativa ORDER BY nome")).rows;
    let detalhe = null;
    if (vend) detalhe = (await c.query(`SELECT k.id, k.numero_contrato, k.data_venda, k.status_venda, k.status_contrato, k.pacote_valor, k.data_agendamento,
          cl.nome AS cliente, ci.nome AS cidade,
          (SELECT string_agg(CASE WHEN i.quantidade > 1 THEN i.quantidade || 'x ' ELSE '' END || p.nome, ', ' ORDER BY p.categoria, p.nome)
             FROM contrato_item i JOIN produto p ON p.id = i.produto_id WHERE i.contrato_id = k.id) AS produtos
        FROM contrato k JOIN cliente cl ON cl.id = k.cliente_id LEFT JOIN cidade ci ON ci.id = k.cidade_id
       WHERE k.vendedor_id = $1 AND k.data_venda BETWEEN $2 AND $3 ORDER BY k.data_venda DESC, k.id DESC LIMIT 1000`, [vend, de, ate])).rows;
    return { vendas, agentes, lista, equipes, detalhe };
  });
  const dias = Math.round((new Date(ate) - new Date(de)) / 864e5) + 1;
  const porAgente = new Map(out.agentes.map((a) => [a.id, { id: a.id, nome: a.nome, equipe: a.equipe, vendas: 0, validas: 0, ativas: 0, pendentes: 0, canceladas: 0, bl: 0, tv: 0, movel: 0, fone: 0, valor: 0, dias: new Set() }]));
  const porDia = new Map();
  for (const x of out.vendas) {
    const d = iso(x.data_venda);
    if (!porAgente.has(x.vendedor_id)) porAgente.set(x.vendedor_id, { id: x.vendedor_id, nome: x.vendedor, equipe: x.equipe, vendas: 0, validas: 0, ativas: 0, pendentes: 0, canceladas: 0, bl: 0, tv: 0, movel: 0, fone: 0, valor: 0, dias: new Set(), inativo: true });
    const a = porAgente.get(x.vendedor_id);
    a.vendas++; a.dias.add(d);
    if (!porDia.has(d)) porDia.set(d, { dia: d, ativas: 0, pendentes: 0, canceladas: 0 });
    const pd = porDia.get(d);
    if (x.status_venda === "CANCELADO") { a.canceladas++; pd.canceladas++; continue; }
    a.validas++; x.status_venda === "ATIVO" ? (a.ativas++, pd.ativas++) : (a.pendentes++, pd.pendentes++);
    if (x.tem_bl) a.bl++; if (x.tem_tv) a.tv++; if (x.tem_fone) a.fone++; a.movel += x.movel; a.valor += Number(x.pacote_valor || 0);
  }
  const agentes = [...porAgente.values()].map((a) => ({ ...a, dias: a.dias.size, valor: +a.valor.toFixed(2),
    aproveitamento: a.vendas ? +(a.ativas / a.vendas).toFixed(4) : null, media_dia: +(a.validas / dias).toFixed(2), ticket: a.validas ? +(a.valor / a.validas).toFixed(2) : null }))
    .sort((a, b) => b.validas - a.validas || b.ativas - a.ativas || a.nome.localeCompare(b.nome));
  const soma = (k) => agentes.reduce((s, a) => s + (a[k] || 0), 0);
  const total = { agentes: agentes.length, com_venda: agentes.filter((a) => a.vendas).length, sem_venda: agentes.filter((a) => !a.vendas).length,
    vendas: soma("vendas"), validas: soma("validas"), ativas: soma("ativas"), pendentes: soma("pendentes"), canceladas: soma("canceladas"),
    bl: soma("bl"), tv: soma("tv"), movel: soma("movel"), fone: soma("fone"), valor: +soma("valor").toFixed(2) };
  // série diária completa (dias sem venda aparecem zerados)
  const serie = [];
  for (let t = new Date(de + "T12:00:00Z"); t <= new Date(ate + "T12:00:00Z") && serie.length < 400; t = new Date(t.getTime() + 864e5)) {
    const d = t.toISOString().slice(0, 10); serie.push(porDia.get(d) || { dia: d, ativas: 0, pendentes: 0, canceladas: 0 });
  }
  res.json(semRestritos({ permissoes: { valores: veValores(req.user), fpd: veFpd(req.user) }, de, ate, dias, total, agentes, por_dia: serie, vendedores: out.lista, equipes: out.equipes,
    detalhe: out.detalhe?.map((k) => ({ ...k, data_venda: iso(k.data_venda), data_agendamento: iso(k.data_agendamento) })) || null }, req.user));
});

export default r;
