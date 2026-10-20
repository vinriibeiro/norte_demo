/* Fechamento do dia: monta os números a partir das vendas (sem acesso ao banco, fácil de testar).
   Visão do dia (o que entrou hoje), acumulado do mês até o dia, meta do mês (Plano do mês) e ritmo. */

export const AGRUPAR = {
  equipe: { rot: "Equipe", de: (x) => x.equipe || "SEM EQUIPE" },
  cidade: { rot: "Cidade", de: (x) => x.cidade || "SEM CIDADE" },
  vendedor: { rot: "Vendedor", de: (x) => x.vendedor || x.nome },
  lider: { rot: "Supervisor", de: (x) => x.lider || "SEM SUPERVISOR" },
  coordenador: { rot: "Coordenador", de: (x) => x.coordenador || "SEM COORDENADOR" },
  origem: { rot: "Origem da venda", de: (x) => x.origem || "SEM ORIGEM" },
  geral: { rot: "Geral", de: () => "TOTAL DA EMPRESA" },
};

const p2 = (n) => String(n).padStart(2, "0");
// o pg entrega DATE como Date à meia-noite local: monta AAAA-MM-DD pelos campos locais (não sofre com fuso)
export const iso = (d) => (d instanceof Date ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : d ? String(d).slice(0, 10) : null);
export const somaDias = (d, n) => new Date(new Date(d + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);

export const zero = () => ({
  // dia
  vendas: 0, conectadas: 0, pendentes: 0, canceladas: 0, v_total: 0, v_conectado: 0, v_pendente: 0, v_perdido: 0,
  bl: 0, tv: 0, movel: 0, chip_nova: 0, chip_mig: 0, chip_port: 0, fone: 0, multi: 0, dcc: 0, apt: 0, netsales: 0, solar: 0,
  agendadas: 0, instaladas: 0,
  // véspera (para comparar)
  ontem: 0,
  // mês até o dia
  mes_vendas: 0, mes_bl: 0, mes_bl_con: 0, mes_bl_pend: 0, mes_chip_mp: 0, mes_chip_mp_con: 0, mes_conectadas: 0, mes_canceladas: 0, mes_valor: 0,
});

function somar(a, x, dia, ontem, mesIni) {
  const valida = x.status_venda !== "CANCELADO", con = x.status_venda === "ATIVO", valor = Number(x.pacote_valor || 0);
  const mp = (x.chip_mig || 0) + (x.chip_port || 0);
  if (x.data_venda === dia) {
    if (valida) {
      a.vendas++; a.v_total += valor;
      if (con) { a.conectadas++; a.v_conectado += valor; } else { a.pendentes++; a.v_pendente += valor; }
      if (x.tem_bl) a.bl++; if (x.tem_tv) a.tv++; if (x.tem_fone) a.fone++; if (x.tem_multi) a.multi++;
      a.chip_nova += x.chip_nova || 0; a.chip_mig += x.chip_mig || 0; a.chip_port += x.chip_port || 0;
      a.movel += (x.chip_nova || 0) + mp;
      if (x.forma_pagamento === "DCC") a.dcc++;
      if (x.tipo_imovel === "APT") a.apt++;
      if (x.canal === "SISTEMA_C") a.netsales++; else if (x.canal === "SISTEMA_B") a.solar++;
    } else { a.canceladas++; a.v_perdido += valor; }
  }
  if (x.data_venda === ontem && valida) a.ontem++;
  if (x.data_agendamento === dia) { a.agendadas++; if (con) a.instaladas++; }
  if (x.data_venda >= mesIni && x.data_venda <= dia) {
    if (valida && a.dias) a.dias[+x.data_venda.slice(8) - 1]++;
    if (valida) {
      a.mes_vendas++; a.mes_valor += valor; a.mes_chip_mp += mp;
      if (con) { a.mes_conectadas++; a.mes_chip_mp_con += mp; }
      if (x.tem_bl) { a.mes_bl++; if (con) a.mes_bl_con++; else a.mes_bl_pend++; }
    } else a.mes_canceladas++;
  }
}

const arred = (o) => { for (const k of ["v_total", "v_conectado", "v_pendente", "v_perdido", "mes_valor"]) o[k] = +o[k].toFixed(2); return o; };

/** Previsão do mês por dia útil (escala 6x1, sem feriados da região): realizado ÷ dias úteis já trabalhados × dias úteis do mês. */
function prever(o, u) {
  if (!u || !u.decorridos) return null;
  const f = u.total / u.decorridos;
  return { vendas: Math.round(o.mes_vendas * f), bl: Math.round((o.mes_bl_con + o.mes_bl_pend) * f), chips: Math.round(o.mes_chip_mp * f),
    dias_uteis: u.total, dias_decorridos: u.decorridos, dias_restantes: Math.round((u.total - u.decorridos) * 2) / 2 };
}
/** Ritmo: previsão de BL até o fim do mês contra a meta. */
function ritmo(o, projBl) {
  if (!o.meta_bl || projBl == null) return null;
  const r = projBl / o.meta_bl;
  return { projecao: Math.round(projBl), pct: +r.toFixed(3), status: r >= 1 ? "ok" : r >= 0.75 ? "alerta" : "ruim" };
}
/** Fração do mês já trabalhada (média ponderada pela meta; sem meta, média simples). */
const fracMedia = (l) => { const v = l.filter((p) => p.frac != null); if (!v.length) return null; const w = v.reduce((s, p) => s + (p.meta_bl || 1), 0); return +(v.reduce((s, p) => s + p.frac * (p.meta_bl || 1), 0) / w).toFixed(4); };
const somaPrev = (l) => {
  const v = l.filter(Boolean); if (!v.length) return null;
  return { vendas: v.reduce((s, x) => s + x.vendas, 0), bl: v.reduce((s, x) => s + x.bl, 0), chips: v.reduce((s, x) => s + x.chips, 0),
    dias_uteis: Math.max(...v.map((x) => x.dias_uteis)), dias_decorridos: Math.max(...v.map((x) => x.dias_decorridos)), dias_restantes: Math.max(...v.map((x) => x.dias_restantes)) };
};

/**
 * rows: vendas (uma por contrato) do intervalo [início do mês ou 13 dias antes, dia] + as agendadas para o dia.
 * agentes: vendedores ativos com equipe (aparecem mesmo zerados, como na planilha da Norte Link).
 * metas: { plano: {meta_bl, meta_chip} | null, pessoa: { [usuario_id]: {meta_bl, meta_chip} } }
 */
/** FPD das 3 últimas safras por vendedor (rows: {login, resolvidas, nao_ok}); soma nas equipes e no total. */
export function anexarFpd(j, rows, loginDe) {
  const m = new Map(rows.map((x) => [x.login, x]));
  const taxa = (o) => (o.fpd = o.fpd_resolvidas ? +(o.fpd_nao_ok / o.fpd_resolvidas).toFixed(4) : null);
  const vistos = new Set(), tot = { fpd_resolvidas: 0, fpd_nao_ok: 0 };
  for (const g of j.grupos) {
    g.fpd_resolvidas = 0; g.fpd_nao_ok = 0;
    for (const p of g.pessoas) {
      const f = m.get(loginDe(p.id)) || {};
      p.fpd_resolvidas = +f.resolvidas || 0; p.fpd_nao_ok = +f.nao_ok || 0; taxa(p);
      g.fpd_resolvidas += p.fpd_resolvidas; g.fpd_nao_ok += p.fpd_nao_ok;
      if (!vistos.has(p.id)) { vistos.add(p.id); tot.fpd_resolvidas += p.fpd_resolvidas; tot.fpd_nao_ok += p.fpd_nao_ok; }
    }
    taxa(g);
  }
  Object.assign(j.total, tot); taxa(j.total);
  return j;
}

/** Início da janela de FPD: 3 meses antes do mês (as safras do próprio mês ainda não venceram). */
export function inicioFpd(mesIni) { const [a, m] = mesIni.split("-").map(Number); return new Date(Date.UTC(a, m - 4, 1)).toISOString().slice(0, 10); }

export function montar({ rows, agentes = [], metas = {}, dia, agrupar = "equipe", uteisDe = null }) {
  const ag = AGRUPAR[agrupar] ? agrupar : "equipe";
  const grupoDe = AGRUPAR[ag].de;
  const mesIni = dia.slice(0, 8) + "01", ontem = somaDias(dia, -1);
  const [a, m, d] = dia.split("-").map(Number);
  const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  // dias úteis 6x1 da região (sem calendário: dias corridos, como antes)
  const uteis = uteisDe || (() => ({ total: diasMes, decorridos: d, restantes: diasMes - d, feriados: [] }));
  const regAgente = new Map(agentes.map((p) => [p.id, { uf: p.uf || null, cidade_id: p.cidade_id || null }]));
  const metaDe = (uid) => {
    const p = metas.pessoa?.[uid] || {}, pl = metas.plano;
    return { meta_bl: p.meta_bl ?? pl?.meta_bl ?? null, meta_chip: p.meta_chip ?? pl?.meta_chip ?? null };
  };

  const grupos = new Map(), total = { ...zero(), dias: Array(diasMes).fill(0) };
  const pegaGrupo = (g) => { if (!grupos.has(g)) grupos.set(g, { grupo: g, ...zero(), dias: Array(diasMes).fill(0), pessoas: new Map() }); return grupos.get(g); };
  const pegaPessoa = (g, id, base) => {
    if (!g.pessoas.has(id)) g.pessoas.set(id, { id, nome: base.nome, equipe: base.equipe || null, cidade: base.cidade || null, ...zero(), dias: Array(diasMes).fill(0), ...metaDe(id),
      regiao: regAgente.get(id) || { uf: base.uf || null, cidade_id: base.cidade_id || null } });
    return g.pessoas.get(id);
  };
  // série diária (14 dias) para o gráfico
  const serie = new Map();
  for (let i = 13; i >= 0; i--) { const s = somaDias(dia, -i); serie.set(s, { dia: s, conectadas: 0, pendentes: 0, canceladas: 0 }); }

  for (const x0 of rows) {
    const x = { ...x0, data_venda: iso(x0.data_venda), data_agendamento: iso(x0.data_agendamento) };
    const s = serie.get(x.data_venda);
    if (s) s[x.status_venda === "ATIVO" ? "conectadas" : x.status_venda === "CANCELADO" ? "canceladas" : "pendentes"]++;
    const g = pegaGrupo(grupoDe(x));
    somar(g, x, dia, ontem, mesIni); somar(total, x, dia, ontem, mesIni);
    somar(pegaPessoa(g, x.vendedor_id, { nome: x.vendedor, equipe: x.equipe, cidade: x.cidade, uf: x.uf, cidade_id: x.cidade_id }), x, dia, ontem, mesIni);
  }
  // vendedores ativos sem venda também entram (zerados)
  if (ag !== "origem") for (const p of agentes) {
    const g = pegaGrupo(grupoDe({ ...p, vendedor: p.nome }));
    pegaPessoa(g, p.id, p);
  }

  const lista = [...grupos.values()].map((g) => {
    const pessoas = [...g.pessoas.values()].map((p) => {
      arred(p); const u = uteis(p.regiao), prev = prever(p, u), { regiao, ...resto } = p;
      return { ...resto, uf: regiao.uf, feriados_mes: u.feriados || [], previsao: prev, frac: u.total ? +(u.decorridos / u.total).toFixed(4) : null, ritmo: ritmo(p, prev?.bl) };
    })
      .sort((a, b) => b.vendas - a.vendas || b.mes_bl - a.mes_bl || a.nome.localeCompare(b.nome));
    const comMeta = pessoas.filter((p) => p.meta_bl != null);
    const out = { ...arred(g), pessoas, hc: pessoas.length, sem_venda: pessoas.filter((p) => !p.vendas).length,
      meta_bl: comMeta.length ? comMeta.reduce((s, p) => s + p.meta_bl, 0) : null,
      meta_chip: comMeta.length ? comMeta.reduce((s, p) => s + (p.meta_chip || 0), 0) : null };
    out.previsao = somaPrev(pessoas.map((p) => p.previsao));
    out.ritmo = ritmo(out, out.previsao?.bl);
    out.frac = fracMedia(pessoas);
    return out;
  })
    .filter((g) => g.vendas || g.canceladas || g.agendadas || g.mes_vendas || g.pessoas.length)
    .sort((a, b) => b.vendas - a.vendas || b.mes_bl - a.mes_bl || a.grupo.localeCompare(b.grupo));

  const todas = lista.flatMap((g) => g.pessoas);
  const comMeta = todas.filter((p) => p.meta_bl != null);
  arred(total);
  total.hc = new Set(todas.map((p) => p.id)).size;
  total.com_venda = new Set(todas.filter((p) => p.vendas).map((p) => p.id)).size;
  total.meta_bl = comMeta.length ? comMeta.reduce((s, p) => s + p.meta_bl, 0) : null;
  total.meta_chip = comMeta.length ? comMeta.reduce((s, p) => s + (p.meta_chip || 0), 0) : null;
  const unicos0 = [...new Map(todas.map((p) => [p.id, p])).values()];
  total.previsao = somaPrev(unicos0.map((p) => p.previsao));
  total.ritmo = ritmo(total, total.previsao?.bl);
  total.frac = fracMedia(unicos0);

  // destaques do dia
  const unicos = [...new Map(todas.map((p) => [p.id, p])).values()];
  const top = unicos.filter((p) => p.vendas).sort((a, b) => b.vendas - a.vendas || b.bl - a.bl || b.v_total - a.v_total).slice(0, 3)
    .map((p) => ({ nome: p.nome, equipe: p.equipe, vendas: p.vendas, bl: p.bl }));
  const semVenda = unicos.filter((p) => !p.vendas).map((p) => ({ nome: p.nome, equipe: p.equipe })).sort((a, b) => a.nome.localeCompare(b.nome));
  const abaixo = unicos.filter((p) => p.ritmo?.status === "ruim").length;

  return { dia, ontem, agrupar: ag, rotulo: AGRUPAR[ag].rot, opcoes_agrupar: Object.entries(AGRUPAR).map(([k, v]) => ({ k, rot: v.rot })),
    mes: { inicio: mesIni, dia_mes: d, dias_mes: diasMes, frac: total.frac ?? +(d / diasMes).toFixed(4), uteis: uteis(null) }, plano: metas.plano || null,
    total, grupos: lista, serie: [...serie.values()], destaques: { top, sem_venda: semVenda, abaixo_ritmo: abaixo } };
}
