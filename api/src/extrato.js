import crypto from "node:crypto";

/* Leitura do "Extrato Detalhado" da operadora (CSV com ; e aspas). Sem dependências externas. */

// colunas do arquivo -> campo no banco
export const COLUNAS = {
  DATA_ATIVACAO: "data_ativacao", NUN_NTC: "ntc", TIPO_OPERACAO: "tipo_operacao", PLANO: "plano", COD_MOBILE: "cod_mobile",
  MES_REFERENCIA: "mes_referencia", VALIDO_COMISSAO: "valido", VALOR_COMISSAO: "valor", COD_IRREG: "cod_irreg", ARQUIVO: "arquivo",
  DATA_ESTORNO: "data_estorno", PENDENCIA: "pendencia", VALOR_FRANQUIA: "valor_franquia", SIMCARD: "simcard", COD_QUINZENA: "quinzena",
  STATUS_GED: "status_ged", NTC_ANTERIOR: "ntc_anterior", PLANO_ANTERIOR: "plano_anterior", NUM_CHAMADO: "num_chamado",
  CONTRATO_EBT_NET: "contrato_ebt", CLASSIFICACAO_PGTO: "classificacao_pgto", FRANQUIA_ANTERIOR: "franquia_anterior",
  VALOR_DELTA: "valor_delta", VALOR_FATOR: "valor_fator", DAT_DIGITALIZACAO: "dat_digitalizacao", DSC_NOME_PLANO: "dsc_nome_plano", NUM_FI: "num_fi",
};
// sem estas o arquivo não é um extrato detalhado
const OBRIGATORIAS = ["DATA_ATIVACAO", "TIPO_OPERACAO", "PLANO", "MES_REFERENCIA", "VALIDO_COMISSAO", "VALOR_COMISSAO", "PENDENCIA", "COD_QUINZENA", "CONTRATO_EBT_NET", "ARQUIVO"];

/** CSV com separador ; (ou ,), aspas duplas e "" para aspas dentro do campo. */
export function lerCsv(texto) {
  const t = String(texto).replace(/^﻿/, "");
  const fimL = t.search(/\r?\n/), primeira = fimL < 0 ? t : t.slice(0, fimL);
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ";" : ",";
  const linhas = []; let campo = "", linha = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
      linha = [];
    } else campo += ch;
  }
  if (campo !== "" || linha.length) { linha.push(campo); if (linha.length > 1 || linha[0] !== "") linhas.push(linha); }
  return linhas;
}

const limpo = (v) => String(v ?? "").trim();
const data = (v) => {
  const s = limpo(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
};
/** "359,7" | "99.9" | ",5" | "-1.234,56" -> número */
export const num = (v) => {
  let s = limpo(v).replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (/^-?\./.test(s)) s = s.replace(".", "0.");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const bool = (v) => { const s = limpo(v).toLowerCase(); return ["t", "true", "s", "sim", "1", "y"].includes(s) ? true : ["f", "false", "n", "nao", "não", "0"].includes(s) ? false : null; };
const semAspasSimples = (v) => limpo(v).replace(/^'+|'+$/g, "");
const inteiro = (v) => { const n = parseInt(limpo(v), 10); return Number.isFinite(n) ? n : null; };
const ebt12 = (v) => { const d = limpo(v).replace(/\D/g, ""); return !d ? null : d.length === 11 ? "0" + d : d; };
/** "040056691970" (praça + contrato) -> "56691970" ; liga com contrato.numero_contrato sem zeros à esquerda */
export const contratoNum = (ebt) => {
  const d = limpo(ebt).replace(/\D/g, "");
  if (!d) return null;
  // se o arquivo passou pelo Excel, o zero da frente some (11 dígitos): devolve o zero
  const d12 = d.length === 11 ? "0" + d : d;
  const n = (d12.length === 12 ? d12.slice(3) : d).replace(/^0+/, "");
  return n || null;
};

/**
 * Converte o texto do CSV em linhas prontas para o banco.
 * Cada linha recebe uma "chave" (impressão digital dos valores + número da repetição dentro do arquivo):
 * a mesma linha enviada de novo gera a mesma chave e não entra duas vezes; linhas iguais legítimas no mesmo arquivo continuam todas.
 */
export function interpretar(texto) {
  const tab = lerCsv(texto);
  if (tab.length < 2) throw Object.assign(new Error("O arquivo está vazio ou não tem linhas de dados."), { status: 400 });
  const cab = tab[0].map((c) => limpo(c).toUpperCase());
  const falta = OBRIGATORIAS.filter((c) => !cab.includes(c));
  if (falta.length) throw Object.assign(new Error(`Este arquivo não parece ser o Extrato Detalhado da operadora. Colunas que faltam: ${falta.join(", ")}.`), { status: 400 });
  const idx = Object.fromEntries(cab.map((c, i) => [c, i]));
  const vezes = new Map(), linhas = [], problemas = [];
  for (let n = 1; n < tab.length; n++) {
    const bruto = tab[n];
    const g = (col) => (idx[col] === undefined ? "" : bruto[idx[col]]);
    const l = {
      data_ativacao: data(g("DATA_ATIVACAO")), ntc: limpo(g("NUN_NTC")) || null, tipo_operacao: limpo(g("TIPO_OPERACAO")).toUpperCase(),
      plano: limpo(g("PLANO")), cod_mobile: limpo(g("COD_MOBILE")) || null, mes_referencia: limpo(g("MES_REFERENCIA")).replace(/\D/g, "").slice(0, 6),
      valido: bool(g("VALIDO_COMISSAO")), valor: num(g("VALOR_COMISSAO")), cod_irreg: inteiro(g("COD_IRREG")), arquivo: limpo(g("ARQUIVO")).toUpperCase(),
      data_estorno: data(g("DATA_ESTORNO")), pendencia: limpo(g("PENDENCIA")).toUpperCase() || null, valor_franquia: num(g("VALOR_FRANQUIA")),
      simcard: semAspasSimples(g("SIMCARD")) || null, quinzena: limpo(g("COD_QUINZENA")).toUpperCase(), status_ged: limpo(g("STATUS_GED")) || null,
      ntc_anterior: limpo(g("NTC_ANTERIOR")) || null, plano_anterior: limpo(g("PLANO_ANTERIOR")) || null, num_chamado: limpo(g("NUM_CHAMADO")) || null,
      contrato_ebt: ebt12(g("CONTRATO_EBT_NET")), contrato_num: contratoNum(g("CONTRATO_EBT_NET")), classificacao_pgto: limpo(g("CLASSIFICACAO_PGTO")) || null,
      franquia_anterior: num(g("FRANQUIA_ANTERIOR")), valor_delta: num(g("VALOR_DELTA")), valor_fator: num(g("VALOR_FATOR")),
      dat_digitalizacao: limpo(g("DAT_DIGITALIZACAO")) || null, dsc_nome_plano: limpo(g("DSC_NOME_PLANO")) || null, num_fi: limpo(g("NUM_FI")) || null,
    };
    if (!/^\d{6}$/.test(l.mes_referencia) || !/^P[12]$/.test(l.quinzena) || l.valor === null || l.valido === null) {
      if (problemas.length < 20) problemas.push(`Linha ${n + 1}: mês/quinzena/valor/válido não reconhecidos`);
      continue;
    }
    const impressao = Object.keys(COLUNAS).map((c) => l[COLUNAS[c]] ?? "").join("\u001f");
    const k = crypto.createHash("sha256").update(impressao).digest("hex").slice(0, 40);
    const vez = (vezes.get(k) || 0) + 1; vezes.set(k, vez);
    l.chave = `${k}#${vez}`;
    linhas.push(l);
  }
  return { linhas, problemas, total_arquivo: tab.length - 1 };
}

export const rotuloPeriodo = (mes, q) => `${mes.slice(4, 6)}/${mes.slice(0, 4)} ${q}`;
/** Datas de ativação pagas em cada quinzena: P1 = dias 1 a 15, P2 = 16 ao fim do mês */
export const janela = (mes, q) => {
  const a = +mes.slice(0, 4), m = +mes.slice(4, 6), fim = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return q === "P1" ? [`${a}-${mm}-01`, `${a}-${mm}-15`] : [`${a}-${mm}-16`, `${a}-${mm}-${fim}`];
};

/** Resumo de um conjunto de linhas (prévia do envio e telas). */
export function resumir(linhas) {
  const r2 = (v) => Math.round(v * 100) / 100;
  const per = new Map(), tipos = new Map(), pend = new Map();
  let recebido = 0, estornos = 0, aDebitar = 0, naoPagas = 0;
  for (const l of linhas) {
    const k = l.mes_referencia + l.quinzena;
    if (!per.has(k)) per.set(k, { mes: l.mes_referencia, quinzena: l.quinzena, periodo: rotuloPeriodo(l.mes_referencia, l.quinzena), linhas: 0, validas: 0, recebido: 0, estornos: 0, liquido: 0, nao_pagas: 0, a_debitar: 0 });
    const p = per.get(k); p.linhas++;
    if (l.valido) {
      p.validas++; p.liquido += l.valor;
      if (l.valor >= 0) { p.recebido += l.valor; recebido += l.valor; } else { p.estornos += l.valor; estornos += l.valor; }
      const t = tipos.get(l.tipo_operacao) || { tipo: l.tipo_operacao, linhas: 0, valor: 0 }; t.linhas++; t.valor += l.valor; tipos.set(l.tipo_operacao, t);
    } else {
      if (l.valor < 0) { p.a_debitar += l.valor; aDebitar += l.valor; } else { p.nao_pagas++; naoPagas++; }
      const pe = pend.get(l.pendencia) || { pendencia: l.pendencia || "SEM MOTIVO", linhas: 0, valor: 0 }; pe.linhas++; pe.valor += l.valor; pend.set(l.pendencia, pe);
    }
  }
  const fix = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" && !Number.isInteger(v) ? r2(v) : v]));
  const periodos = [...per.values()].map(fix).sort((a, b) => (a.mes + a.quinzena).localeCompare(b.mes + b.quinzena));
  const principal = [...periodos].sort((a, b) => b.validas - a.validas)[0] || null;
  return {
    linhas: linhas.length, recebido: r2(recebido), estornos: r2(estornos), liquido: r2(recebido + estornos), a_debitar: r2(aDebitar), nao_pagas: naoPagas,
    periodos, principal: principal?.periodo || null,
    tipos: [...tipos.values()].map(fix).sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)),
    pendencias: [...pend.values()].map(fix).sort((a, b) => b.linhas - a.linhas),
  };
}
