import { Router } from "express";
import { comPerfil } from "./db.js";
import { exigePerfil, exigeSetor, semRestritos, veFpd } from "./auth.js";

// Indicadores de FPD, cobrança e premiação: só quem pode ver FPD (o backoffice não vê)
const SO_FPD = new Set(["fpd-safra", "fpd-recorte", "perda-fpd", "situacao-faturas", "fila-cobranca", "sobrevivencia", "churn", "quadrante", "elegibilidade", "pontuacao", "atingimento-lider", "efeito-oferta"]);

const r = Router();

// Views de KPI liberadas para gestor/backoffice (allowlist: nada de SQL vindo do cliente)
const KPIS = {
  "vendas-mensal": "v_kpi_vendas_mensal", "vendedor-mensal": "v_kpi_vendedor_mensal", "origem-canal": "v_kpi_origem_canal",
  "dia-semana": "v_kpi_dia_semana", "vendedor-parado": "v_vendedor_parado", "mix-produto": "v_kpi_mix_produto",
  "chip": "v_kpi_chip", "vencimento": "v_kpi_vencimento", "pareto-motivos": "v_pareto_motivos",
  "pendencias-abertas": "v_pendencias_abertas", "carga-backoffice": "v_carga_backoffice",
  "fpd-safra": "v_fpd_safra", "fpd-recorte": "v_fpd_recorte", "situacao-faturas": "v_situacao_faturas",
  "churn": "v_churn_base", "sobrevivencia": "v_sobrevivencia_safra", "efeito-oferta": "v_efeito_oferta",
  "fila-cobranca": "v_fila_cobranca", "perda-fpd": "v_perda_fpd", "pontuacao": "v_pontuacao",
  "atingimento-lider": "v_atingimento_lider", "elegibilidade": "v_elegibilidade_premiacao",
  "fechamento-diario": "v_fechamento_diario", "quadrante": "v_quadrante_vendedor", "geografia": "v_kpi_geografia",
};
const EQUIPE = { "desempenho": "v_eq_desempenho", "fpd": "v_eq_fpd" };
const EQ = ["lider", "coordenador"];
const MEUS = { "desempenho": "v_meu_desempenho", "pontuacao": "v_minha_pontuacao", "fpd": "v_meu_fpd" };

r.get("/kpi", exigePerfil("gestor", "backoffice"), exigeSetor("QUALIDADE"), (_req, res) => res.json(Object.keys(KPIS)));

r.get("/kpi/:nome", exigePerfil("gestor", "backoffice"), exigeSetor("QUALIDADE"), async (req, res) => {
  const v = KPIS[req.params.nome];
  if (!v) return res.status(404).json({ erro: "KPI não encontrado." });
  if (SO_FPD.has(req.params.nome) && !veFpd(req.user)) return res.status(403).json({ erro: "Indicador de FPD: somente Gerente e Administrador." });
  const rows = await comPerfil(req.user, async (c) => (await c.query(`SELECT * FROM ${v} LIMIT 5000`)).rows);
  res.json(semRestritos(rows, req.user));
});

// Área do vendedor: só os próprios dados (o banco filtra por app.usuario_id)
r.get("/meu/:nome", exigePerfil("vendedor"), async (req, res) => {
  const v = MEUS[req.params.nome];
  if (!v) return res.status(404).json({ erro: "Indicador não encontrado." });
  res.json(await comPerfil(req.user, async (c) => (await c.query(`SELECT * FROM ${v} LIMIT 2000`)).rows));
});

// Supervisor e coordenador: só a equipe / coordenação deles (o banco filtra pelas views v_eq_*)
r.get("/equipe/:nome", exigePerfil(...EQ), async (req, res) => {
  const v = EQUIPE[req.params.nome];
  if (!v) return res.status(404).json({ erro: "Indicador não encontrado." });
  res.json(semRestritos(await comPerfil(req.user, async (c) => (await c.query(`SELECT * FROM ${v} LIMIT 5000`)).rows), req.user));
});

/** Filtros da lista de vendas (mesmos para a tela e para a exportação). Vendedor só enxerga a própria view. */
function filtroContratos(req) {
  const busca = String(req.query.busca || "").trim();
  const status = ["ATIVO", "PENDENTE", "CANCELADO"].includes(req.query.status) ? req.query.status : null;
  const de = /^\d{4}-\d{2}-\d{2}$/.test(req.query.de || "") ? req.query.de : null;
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.ate || "") ? req.query.ate : null;
  const vend = parseInt(req.query.vendedor || "", 10) || null;
  const w = [], p = [];
  const add = (cond, v) => { p.push(v); w.push(cond.replace("?", "$" + p.length)); };
  if (EQ.includes(req.user.perfil)) {
    if (status) add("status_venda = ?", status);
    if (de) add("data_venda >= ?", de);
    if (ate) add("data_venda <= ?", ate);
    if (vend) add("vendedor_id = ?", vend);
    if (busca) { p.push(`%${busca}%`); w.push(`(cliente ILIKE $${p.length} OR numero_contrato::text ILIKE $${p.length})`); }
    return { vendedor: false, equipe: true, p, where: w.length ? "WHERE " + w.join(" AND ") : "" };
  }
  if (req.user.perfil === "vendedor") {
    if (status) add("status_venda = ?", status);
    if (busca) add("numero_contrato::text ILIKE ?", `%${busca}%`);
    if (de) add("data_venda >= ?", de);
    if (ate) add("data_venda <= ?", ate);
    return { vendedor: true, p, where: w.length ? "WHERE " + w.join(" AND ") : "" };
  }
  if (status) add("k.status_venda = ?", status);
  if (de) add("k.data_venda >= ?", de);
  if (ate) add("k.data_venda <= ?", ate);
  if (vend) add("k.vendedor_id = ?", vend);
  if (busca) {
    const dig = busca.replace(/\D/g, "");
    p.push(`%${busca}%`); const i = p.length;
    let cond = `(cl.nome ILIKE $${i} OR k.numero_contrato ILIKE $${i}`;
    if (dig.length >= 4) { p.push(dig + "%"); cond += ` OR cl.documento LIKE $${p.length}`; }
    w.push(cond + ")");
  }
  return { vendedor: false, p, where: w.length ? "WHERE " + w.join(" AND ") : "" };
}
const FROM_STAFF = `FROM contrato k JOIN cliente cl ON cl.id = k.cliente_id JOIN usuario u ON u.id = k.vendedor_id LEFT JOIN cidade ci ON ci.id = k.cidade_id`;

// Lista de contratos: gestor/backoffice veem tudo; vendedor só os seus
r.get("/contratos", async (req, res) => {
  const pagina = Math.max(1, parseInt(req.query.pagina || "1", 10));
  const f = filtroContratos(req);
  const dados = await comPerfil(req.user, async (c) => {
    if (f.equipe) {
      const total = (await c.query(`SELECT count(*)::int n FROM v_eq_contratos ${f.where}`, f.p)).rows[0].n;
      const itens = (await c.query(`SELECT * FROM v_eq_contratos ${f.where} ORDER BY data_venda DESC, contrato_id DESC LIMIT 50 OFFSET ${(pagina - 1) * 50}`, f.p)).rows;
      return { total, pagina, itens };
    }
    if (f.vendedor) {
      const total = (await c.query(`SELECT count(*)::int n FROM v_meus_contratos ${f.where}`, f.p)).rows[0].n;
      const itens = (await c.query(`SELECT * FROM v_meus_contratos ${f.where} ORDER BY data_venda DESC, contrato_id DESC LIMIT 50 OFFSET ${(pagina - 1) * 50}`, f.p)).rows;
      return { total, pagina, itens };
    }
    const total = (await c.query(`SELECT count(*)::int n ${FROM_STAFF} ${f.where}`, f.p)).rows[0].n;
    const itens = (await c.query(
      `SELECT k.id AS contrato_id, k.numero_contrato, k.data_venda, k.status_venda, k.status_contrato, k.origem, k.pacote_valor,
              cl.nome AS cliente, u.nome_completo AS vendedor, ci.nome AS cidade, ci.uf AS uf, k.bairro
         ${FROM_STAFF} ${f.where} ORDER BY k.data_venda DESC, k.id DESC LIMIT 50 OFFSET ${(pagina - 1) * 50}`, f.p)).rows;
    return { total, pagina, itens };
  });
  res.json(dados);
});

const cel = (v) => { const t = v == null ? "" : String(v); return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const dataBR = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const dinheiro = (v) => (v == null ? "" : Number(v).toFixed(2).replace(".", ","));
const docFmt = (d) => (!d ? "" : d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : d);

// "ATIVO" no banco aparece como "INSTALADA" (linguagem da operadora)
const SIT_VENDA = { ATIVO: "INSTALADA", PENDENTE: "PENDENTE", CANCELADO: "CANCELADA" };
// GET /api/exportar/contratos?<mesmos filtros da lista>  -> CSV (Excel) com TODAS as linhas filtradas (até 50 mil)
r.get("/exportar/contratos", async (req, res) => {
  const f = filtroContratos(req);
  const linhas = await comPerfil(req.user, async (c) => {
    if (f.equipe)
      return (await c.query(`SELECT * FROM v_eq_contratos ${f.where} ORDER BY data_venda DESC, contrato_id DESC LIMIT 50000`, f.p)).rows;
    if (f.vendedor)
      return (await c.query(`SELECT * FROM v_meus_contratos ${f.where} ORDER BY data_venda DESC, contrato_id DESC LIMIT 50000`, f.p)).rows;
    return (await c.query(
      `SELECT k.data_venda, k.numero_contrato, k.status_venda, k.status_contrato, cl.nome AS cliente, cl.documento, cl.contato AS telefone,
              u.nome_completo AS vendedor, e.nome AS equipe, k.origem, k.canal, ci.nome AS cidade, k.bairro, k.endereco, k.forma_pagamento,
              k.dia_vencimento, k.pacote_valor,
              (SELECT string_agg(CASE WHEN i.quantidade > 1 THEN i.quantidade || 'x ' ELSE '' END || p.nome, '; ' ORDER BY p.categoria, p.nome)
                 FROM contrato_item i JOIN produto p ON p.id = i.produto_id WHERE i.contrato_id = k.id) AS produtos,
              k.data_agendamento, k.turno, m.descricao AS motivo, k.observacao
         ${FROM_STAFF} LEFT JOIN equipe e ON e.id = k.equipe_id LEFT JOIN motivo m ON m.id = k.motivo_id
         ${f.where} ORDER BY k.data_venda DESC, k.id DESC LIMIT 50000`, f.p)).rows;
  });
  const cab = f.equipe
    ? ["Data da venda", "Contrato", "Situação", "Status do contrato", "Cliente", "Vendedor", "Equipe", "Origem", "Forma de pagamento", "Pacote (R$)", "Cidade", "Bairro", "Motivo"]
    : f.vendedor
    ? ["Data da venda", "Contrato", "Situação", "Status do contrato", "Origem", "Forma de pagamento", "Pacote (R$)", "Cidade", "Bairro", "Motivo"]
    : ["Data da venda", "Contrato", "Situação", "Status do contrato", "Cliente", "CPF/CNPJ", "Telefone", "Vendedor", "Equipe", "Origem", "Canal", "Cidade", "Bairro", "Endereço",
       "Forma de pagamento", "Vencimento", "Pacote (R$)", "Produtos", "Agendamento", "Turno", "Motivo", "Observação"];
  const corpo = linhas.map((x) => (f.equipe
    ? [dataBR(x.data_venda), x.numero_contrato, SIT_VENDA[x.status_venda] || x.status_venda, x.status_contrato, x.cliente, x.vendedor, x.equipe, x.origem, x.forma_pagamento, dinheiro(x.pacote_valor), x.cidade, x.bairro, x.motivo]
    : f.vendedor
    ? [dataBR(x.data_venda), x.numero_contrato, SIT_VENDA[x.status_venda] || x.status_venda, x.status_contrato, x.origem, x.forma_pagamento, dinheiro(x.pacote_valor), x.cidade, x.bairro, x.motivo]
    : [dataBR(x.data_venda), x.numero_contrato, SIT_VENDA[x.status_venda] || x.status_venda, x.status_contrato, x.cliente, docFmt(x.documento), x.telefone, x.vendedor, x.equipe, x.origem, x.canal, x.cidade, x.bairro, x.endereco,
       x.forma_pagamento, x.dia_vencimento, dinheiro(x.pacote_valor), x.produtos, dataBR(x.data_agendamento), x.turno, x.motivo, x.observacao]).map(cel).join(";"));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="vendas-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("\uFEFF" + [cab.join(";"), ...corpo].join("\r\n"));
});

export default r;
