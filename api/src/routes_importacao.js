import { Router } from "express";
import { comPerfil } from "./db.js";
import { exigePerfil, exigeSetor } from "./auth.js";

/* Importação de vendas a partir da exportação da operadora (CSV/XLSX, "vendas-AAAA-MM-DD-....csv").
   Gerente, administrador e backoffice de Cadastro (quem lança vendas). Regras:
   - só cria o que falta: contrato que já existe (mesmo número, sistema OPERADORA) não é alterado;
   - vendedor que não está cadastrado (nome igual, sem acento) não entra e aparece na lista;
   - a mesma planilha pode ser enviada de novo sem duplicar nada;
   - o navegador lê o arquivo e envia as linhas; aqui tudo é validado de novo. */
const r = Router();
r.use("/importacao-vendas", exigePerfil("gestor", "backoffice"), exigeSetor("CADASTRO"));

const CHUNK = 400;
const LIMITE_LINHAS = 20000;

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const val = (x) => { const v = String(x ?? "").trim(); return v === "" || v === "-" ? null : v; };
const digitos = (x) => String(x ?? "").replace(/\D/g, "");
const dinheiro = (x) => {
  let s = String(x ?? "").replace(/R\$\s*/i, "").trim();
  if (!s || s === "-") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
function dataBr(x) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(x ?? "").trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  if (dt.getUTCDate() !== +d || +y < 2000 || +y > 2100) return null;
  return `${y}-${mo}-${d}`;
}
const UF = { "DISTRITO FEDERAL": "DF", GOIAS: "GO", RONDONIA: "RO", ACRE: "AC", "MATO GROSSO DO SUL": "MS", "MATO GROSSO": "MT", TOCANTINS: "TO", "MINAS GERAIS": "MG", BAHIA: "BA", "SAO PAULO": "SP", "RIO DE JANEIRO": "RJ", PARA: "PA", AMAZONAS: "AM", MARANHAO: "MA", PIAUI: "PI", CEARA: "CE", PARANA: "PR", "SANTA CATARINA": "SC", "RIO GRANDE DO SUL": "RS", "ESPIRITO SANTO": "ES", "RIO GRANDE DO NORTE": "RN", PARAIBA: "PB", PERNAMBUCO: "PE", ALAGOAS: "AL", SERGIPE: "SE", "MATO GROSSO DO SUL ": "MS", RORAIMA: "RR", AMAPA: "AP" };
const ufDe = (x) => { const t = norm(x); if (/^[A-Z]{2}$/.test(t)) return t; return UF[t] || null; };

/** Situação da exportação -> status da venda e do contrato. null = não reconhecida. */
function situacao(x) {
  const t = norm(x).replace(/[ _]+/g, " ");
  if (!t) return null;
  if (/^(INSTALAD|COMPLETO|FINALIZAD|ATIV|CONECTAD)/.test(t)) return { st: "ATIVO", stc: "CONECTADO" };
  if (/CANCEL/.test(t)) return { st: "CANCELADO", stc: null };
  if (/(PENDEN|PROPOSTA|AGEND|AGUARD|PROSPEC|CONFIRM)/.test(t)) return { st: "PENDENTE", stc: null };
  return null;
}

/** Plano da exportação -> nome do produto no cadastro (null = não reconhecido). */
function nomeProduto(coluna, valor) {
  const t = norm(valor);
  if (coluna === "INTERNET") {
    let m = /(\d+)\s*MEGA/.exec(t) || /(\d+)\s*MB\b/.exec(t);
    if (m) return `${+m[1]} MB`;
    m = /(\d+)\s*GIGA/.exec(t);
    return m ? (+m[1] === 1 ? "1 GIGA" : `${+m[1]} GIGA`) : null;
  }
  if (coluna === "TV") {
    if (/TV\+/.test(t)) return "TV BOX";
    if (/MULT/.test(t)) return "ACESSO FIBRA MULT";
    if (/PME/.test(t)) return "ACESSO FIBRA PME";
    if (/FIBRA|TV/.test(t)) return "ACESSO FIBRA";
    return null;
  }
  if (coluna === "CELULAR") {
    const m = /(CONTROLE|POS)\D*?(\d+)\s*GB/.exec(t);
    return m ? `${m[1] === "CONTROLE" ? "CONTROLE" : "POS"} ${+m[2]} GB` : null;
  }
  return t;   // fone e demais: nome igual ao do cadastro
}

const COLUNAS_PLANO = [["INTERNET", "PLANO INTERNET", ["PRECO INTERNET PROMOCIONAL", "PRECO INTERNET"]], ["TV", "PLANO TV", ["PRECO TV PROMOCIONAL", "PRECO TV"]],
  ["CELULAR", "PLANO CELULAR", ["PRECO CELULAR PROMOCIONAL", "PRECO CELULAR"]], ["FONE", "PLANO FONE", ["PRECO FONE PROMOCIONAL", "PRECO FONE"]]];

/** Carrega do banco o que a conversão precisa (uma vez por envio). */
async function contexto(c, numeros) {
  const usuarios = new Map();
  for (const u of (await c.query("SELECT id, nome_completo FROM usuario")).rows) {
    const k = norm(u.nome_completo);
    usuarios.set(k, [...(usuarios.get(k) || []), Number(u.id)]);
  }
  const cidades = new Map();
  for (const ci of (await c.query("SELECT id, uf, nome FROM cidade")).rows) cidades.set(`${ci.uf}|${norm(ci.nome)}`, Number(ci.id));
  const produtos = new Map();
  for (const p of (await c.query("SELECT id, nome FROM produto WHERE ativo")).rows) produtos.set(norm(p.nome), Number(p.id));
  const equipes = new Map();
  for (const e of (await c.query("SELECT DISTINCT ON (usuario_id) usuario_id, equipe_id FROM equipe_membro WHERE fim IS NULL ORDER BY usuario_id, inicio DESC")).rows)
    equipes.set(Number(e.usuario_id), Number(e.equipe_id));
  const existentes = new Set(numeros.length
    ? (await c.query("SELECT numero_contrato FROM contrato WHERE sistema_origem = 'NORTE' AND numero_contrato = ANY($1::text[])", [numeros])).rows.map((x) => x.numero_contrato)
    : []);
  return { usuarios, cidades, produtos, equipes, existentes };
}

/** Converte as linhas da exportação. Não grava nada. */
function preparar(linhas, ctx) {
  const rej = new Map(), vendNao = new Map(), itensNao = new Map(), cidNao = new Map(), sitNao = new Map();
  const cont = new Map();   // numero -> registro (a última linha da planilha vence)
  let dup = 0, lidas = 0;
  const motivo = (m) => rej.set(m, (rej.get(m) || 0) + 1);
  for (const linha of linhas) {
    lidas++;
    const R = {};
    for (const k of Object.keys(linha)) R[norm(k)] = linha[k];
    const g = (k) => R[norm(k)];
    const numero = digitos(g("CONTRATO")) || null;
    if (!numero) { motivo("sem número de contrato"); continue; }
    const data = dataBr(g("DATA DO PREENCHIMENTO DO CONTRATO"));
    if (!data) { motivo("sem data de venda válida"); continue; }
    const nomeVend = val(g("VENDEDOR"));
    const ids = nomeVend ? ctx.usuarios.get(norm(nomeVend)) || [] : [];
    if (!ids.length) { motivo("vendedor não cadastrado"); if (nomeVend) vendNao.set(nomeVend, (vendNao.get(nomeVend) || 0) + 1); continue; }
    if (ids.length > 1) { motivo("vendedor com nome repetido no sistema"); continue; }
    const cliNome = val(g("CLIENTE"));
    if (!cliNome) { motivo("sem nome do cliente"); continue; }
    const cpf = digitos(g("CPF")), cnpj = digitos(g("CNPJ"));
    let tipo = null, doc = null;
    if (cpf.length === 11) { tipo = "CPF"; doc = cpf; }
    else if (cnpj.length === 14) { tipo = "CNPJ"; doc = cnpj; }
    else { motivo("sem CPF/CNPJ válido"); continue; }
    const sit = situacao(g("SITUAÇÃO") ?? g("SITUACAO"));
    if (!sit) {
      const s = val(g("SITUAÇÃO") ?? g("SITUACAO")) || "(vazia)";
      sitNao.set(s, (sitNao.get(s) || 0) + 1);
    }
    const forma = /BOLETO/.test(norm(g("FORMA DE PAGAMENTO"))) ? "BOLETO" : /DEBITO/.test(norm(g("FORMA DE PAGAMENTO"))) ? "DCC" : null;
    const tipoC = ["PROSPECT", "BASE"].includes(norm(g("TIPO DA VENDA"))) ? norm(g("TIPO DA VENDA")) : null;
    const dia = Number.parseInt(g("DIA DE VENCIMENTO"), 10);
    const uf = ufDe(g("UF"));
    const cidNome = val(g("CIDADE"));
    let cidade_id = null;
    if (cidNome && uf) cidade_id = ctx.cidades.get(`${uf}|${norm(cidNome)}`) ?? null;
    if (cidNome && !cidade_id) { const k = `${cidNome} / ${uf || "?"}`; cidNao.set(k, (cidNao.get(k) || 0) + 1); }
    const logr = val(g("LOGRADOURO"));
    const numEnd = val(g("NUMERO"));
    const numTxt = !numEnd || numEnd === "0" || numEnd === "99999" ? "S/N" : numEnd;
    const comp = val(g("COMPLEMENTO"));
    const endereco = logr ? `${logr}, ${numTxt}${comp ? " - " + comp : ""}` : null;
    const bairro = val(g("BAIRRO"));
    let pacote = 0, temPreco = false;
    const itens = [];
    for (const [chaveCol, colPlano, colsPreco] of COLUNAS_PLANO) {
      const plano = val(g(colPlano));
      if (!plano) continue;
      const nome = nomeProduto(chaveCol, plano);
      const pid = nome ? ctx.produtos.get(norm(nome)) : null;
      if (pid) itens.push(pid);
      else itensNao.set(plano, (itensNao.get(plano) || 0) + 1);
      for (const cp of colsPreco) {
        const p = dinheiro(g(cp));
        if (p !== null) { pacote += p; temPreco = true; break; }
      }
    }
    if (cont.has(numero)) dup++;
    cont.set(numero, {
      numero, data, cliente: { tipo, doc, nome: cliNome }, vendedor_id: ids[0], equipe_id: ctx.equipes.get(ids[0]) ?? null,
      tipo: tipoC, forma, dia: dia >= 1 && dia <= 31 ? dia : null, st: sit ? sit.st : "PENDENTE", stc: sit ? sit.stc : null,
      cidade_id, bairro, endereco, pacote: temPreco ? Math.round(pacote * 100) / 100 : null, itens: [...new Set(itens)],
      ja_existe: ctx.existentes.has(numero),
    });
  }
  const todas = [...cont.values()];
  const novas = todas.filter((x) => !x.ja_existe);
  return {
    lidas, duplicadas: dup, ja_existem: todas.length - novas.length, novas, rejeitadas: [...rej.values()].reduce((a, b) => a + b, 0),
    motivos: Object.fromEntries(rej), vendedores: [...vendNao].map(([nome, n]) => ({ nome, linhas: n })).sort((a, b) => b.linhas - a.linhas),
    itens_nao_mapeados: [...itensNao].map(([valor, n]) => ({ valor, linhas: n })).sort((a, b) => b.linhas - a.linhas),
    cidades_nao_cadastradas: [...cidNao].map(([cidade, n]) => ({ cidade, linhas: n })).sort((a, b) => b.linhas - a.linhas),
    situacoes_nao_reconhecidas: [...sitNao].map(([situacao, n]) => ({ situacao, linhas: n })),
  };
}

const resumo = (p) => ({
  lidas: p.lidas, novas: p.novas.length, ja_existem: p.ja_existem, rejeitadas: p.rejeitadas, duplicadas_na_planilha: p.duplicadas,
  motivos: p.motivos, vendedores_nao_cadastrados: p.vendedores.slice(0, 100), itens_nao_mapeados: p.itens_nao_mapeados.slice(0, 100),
  cidades_nao_cadastradas: p.cidades_nao_cadastradas.slice(0, 100), situacoes_nao_reconhecidas: p.situacoes_nao_reconhecidas,
  amostra: p.novas.slice(0, 8).map((x) => ({ contrato: x.numero, data: x.data, cliente: x.cliente.nome, vendedor: x.vendedor_id, situacao: x.st, planos: x.itens.length })),
});

const validaCorpo = (b) => {
  const linhas = Array.isArray(b?.linhas) ? b.linhas : null;
  if (!linhas || !linhas.length) throw Object.assign(new Error("Nenhuma linha recebida. Confira se a planilha tem a coluna CONTRATO."), { status: 400 });
  if (linhas.length > LIMITE_LINHAS) throw Object.assign(new Error(`Planilha grande demais (máx. ${LIMITE_LINHAS} linhas por envio).`), { status: 400 });
  return linhas.map((l) => (l && typeof l === "object" ? l : {}));
};
const numerosDe = (linhas) => [...new Set(linhas.map((l) => { const R = {}; for (const k of Object.keys(l)) R[norm(k)] = l[k]; return digitos(R.CONTRATO); }).filter(Boolean))];

// POST /api/importacao-vendas/analisar { arquivo, linhas } -> prévia (nada é gravado)
r.post("/importacao-vendas/analisar", async (req, res) => {
  const linhas = validaCorpo(req.body);
  const out = await comPerfil(req.user, async (c) => resumo(preparar(linhas, await contexto(c, numerosDe(linhas)))));
  res.json(out);
});

// POST /api/importacao-vendas/importar { arquivo, linhas } -> grava só as vendas novas
r.post("/importacao-vendas/importar", async (req, res) => {
  const linhas = validaCorpo(req.body);
  const nome = String(req.body.arquivo || "exportação de vendas").slice(0, 160);
  const out = await comPerfil(req.user, async (c) => {
    const p = preparar(linhas, await contexto(c, numerosDe(linhas)));
    const idsPorNumero = new Map();
    const clientes = new Map();
    for (const x of p.novas) if (x.cliente.doc) clientes.set(`${x.cliente.tipo}|${x.cliente.doc}`, x.cliente);
    const cl = [...clientes.values()];
    for (let i = 0; i < cl.length; i += CHUNK) {
      const parte = cl.slice(i, i + CHUNK);
      await c.query(
        `INSERT INTO cliente (tipo_pessoa, documento, nome)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[]) ON CONFLICT (tipo_pessoa, documento) DO NOTHING`,
        [parte.map((x) => x.tipo), parte.map((x) => x.doc), parte.map((x) => x.nome)]);
    }
    const idCliente = new Map();
    for (let i = 0; i < cl.length; i += CHUNK) {
      const parte = cl.slice(i, i + CHUNK);
      const rows = (await c.query(
        `SELECT cl.id, cl.tipo_pessoa, cl.documento FROM cliente cl
         JOIN unnest($1::text[], $2::text[]) AS k(t, d) ON cl.tipo_pessoa = k.t AND cl.documento = k.d`,
        [parte.map((x) => x.tipo), parte.map((x) => x.doc)])).rows;
      for (const row of rows) idCliente.set(`${row.tipo_pessoa}|${row.documento}`, Number(row.id));
    }
    const gravar = p.novas.filter((x) => idCliente.has(`${x.cliente.tipo}|${x.cliente.doc}`));
    const semCliente = p.novas.length - gravar.length;
    let gravadas = 0;
    for (let i = 0; i < gravar.length; i += CHUNK) {
      const f = gravar.slice(i, i + CHUNK);
      const rows = (await c.query(
        `INSERT INTO contrato (numero_contrato, sistema_origem, cliente_id, vendedor_id, equipe_id, data_venda, tipo_contrato, forma_pagamento,
                               dia_vencimento, status_venda, status_contrato, cidade_id, bairro, endereco, pacote_valor)
         SELECT v.numero, 'NORTE', v.cliente_id, v.vendedor_id, v.equipe_id, v.data_venda, v.tipo, v.forma, v.dia, v.st, v.stc, v.cidade_id, v.bairro, v.endereco, v.pacote
         FROM unnest($1::text[], $2::bigint[], $3::bigint[], $4::integer[], $5::date[], $6::text[], $7::text[], $8::smallint[], $9::text[], $10::text[],
                     $11::integer[], $12::text[], $13::text[], $14::numeric[])
           AS v(numero, cliente_id, vendedor_id, equipe_id, data_venda, tipo, forma, dia, st, stc, cidade_id, bairro, endereco, pacote)
         ON CONFLICT (sistema_origem, numero_contrato) DO NOTHING
         RETURNING id, numero_contrato`,
        [f.map((x) => x.numero), f.map((x) => idCliente.get(`${x.cliente.tipo}|${x.cliente.doc}`)), f.map((x) => x.vendedor_id), f.map((x) => x.equipe_id),
         f.map((x) => x.data), f.map((x) => x.tipo), f.map((x) => x.forma), f.map((x) => x.dia), f.map((x) => x.st), f.map((x) => x.stc),
         f.map((x) => x.cidade_id), f.map((x) => x.bairro), f.map((x) => x.endereco), f.map((x) => x.pacote)])).rows;
      gravadas += rows.length;
      for (const row of rows) idsPorNumero.set(row.numero_contrato, Number(row.id));
    }
    const itemC = [], itemP = [];
    for (const x of gravar) {
      const cid = idsPorNumero.get(x.numero);
      if (!cid) continue;
      for (const pid of x.itens) { itemC.push(cid); itemP.push(pid); }
    }
    for (let i = 0; i < itemC.length; i += CHUNK * 3) {
      await c.query(
        `INSERT INTO contrato_item (contrato_id, produto_id, quantidade)
         SELECT v.c, v.p, 1 FROM unnest($1::bigint[], $2::integer[]) AS v(c, p)
         ON CONFLICT (contrato_id, produto_id) DO NOTHING`,
        [itemC.slice(i, i + CHUNK * 3), itemP.slice(i, i + CHUNK * 3)]);
    }
    const rejeitadas = p.rejeitadas + semCliente;
    // o histórico de lotes é só do gerente (o backoffice não lê importacao_lote)
    if (req.user.perfil === "gestor") await c.query(
      "INSERT INTO importacao_lote (arquivo, aba, linhas_lidas, linhas_gravadas, linhas_rejeitadas) VALUES ($1, 'VENDAS (exportação Operadora)', $2, $3, $4)",
      [nome, p.lidas, gravadas, rejeitadas]);
    return { ...resumo(p), gravadas, rejeitadas, sem_cliente: semCliente };
  });
  res.json(out);
});

export default r;
