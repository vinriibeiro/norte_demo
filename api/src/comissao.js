// Cálculo de premiação (Faixa 1 / Faixa 2). Funções puras: recebem números e devolvem valores.
export const ITENS = [
  ["BL", "Banda larga", "bl"], ["STREAMING", "Bônus STREAMING marcado", "mplay"], ["MDU", "Bônus MDU (apartamento)", "mdu"],
  ["TV", "TV (single ou c/ linha nova)", "tv"], ["TV_PLUS", "TV+ (base ou c/ banda larga)", "tv_plus"],
  ["CHIP_NOVA", "Chip linha nova", "chip_nova"], ["CHIP_MIGRACAO", "Chip migração", "chip_mig"], ["CHIP_PORT", "Chip portabilidade", "chip_port"],
  ["DCC", "Bônus DCC (débito em conta)", "dcc"],
];
export const BONUS_ROTULO = {
  BONUS_FPD_A: "Bônus FPD (faixa melhor)", BONUS_FPD_B: "Bônus FPD (faixa intermediária)", BONUS_DCC: "Bônus DCC da equipe", BONUS_VENDEDOR: "Bônus por vendedor com meta de BL",
};

const num = (x) => Number(x) || 0;
export const mesesDeCasa = (entrada, mes) => {
  if (!entrada) return null;
  const e = new Date(entrada), m = new Date(mes);
  return (m.getUTCFullYear() - e.getUTCFullYear()) * 12 + (m.getUTCMonth() - e.getUTCMonth());
};

export function somar(a, b) {
  const o = { ...a };
  for (const k of Object.keys(b)) o[k] = num(o[k]) + num(b[k]);
  return o;
}

/**
 * agg: contagens (bl, mplay, mdu, tv, tv_plus, chip_nova, chip_mig, chip_port, dcc, fpd_ok, fpd_nao_ok)
 * tab: { ITEM: {faixa1, faixa2} } da tabela do papel
 * cfg: { plano, papel, meses_casa, meta_bl, meta_chip, pap_ok, ajuste, vendedores_bl20 }
 */
export function calcular(agg, tab, cfg) {
  const pl = cfg.plano, av = [];
  const resolvidas = num(agg.fpd_ok) + num(agg.fpd_nao_ok);
  const fpd = resolvidas > 0 ? num(agg.fpd_nao_ok) / resolvidas : null;
  const inelegivel = fpd != null && fpd >= num(pl.fpd_inelegivel);
  let faixa = fpd != null && fpd <= num(pl.fpd_faixa) ? 2 : 1;
  let faixaMotivo = fpd == null ? "FPD ainda sem faturas apuradas: Faixa 1" : faixa === 2 ? `FPD ${(fpd * 100).toFixed(1)}% ≤ ${(pl.fpd_faixa * 100).toFixed(0)}%` : `FPD ${(fpd * 100).toFixed(1)}% > ${(pl.fpd_faixa * 100).toFixed(0)}%`;
  if (cfg.meses_casa != null && cfg.meses_casa < num(pl.meses_so_faixa1)) { faixa = 1; faixaMotivo = `${cfg.meses_casa + 1}º mês de casa: só Faixa 1`; }

  const itens = [];
  let base = 0;
  for (const [cod, nome, campo] of ITENS) {
    const t = tab[cod]; if (!t) continue;
    const qtd = num(agg[campo]), unit = num(faixa === 2 ? t.faixa2 : t.faixa1), valor = inelegivel ? 0 : qtd * unit;
    if (qtd || cfg.mostrarZeros) itens.push({ item: cod, nome, qtd, unit, valor });
    base += valor;
  }

  const bl = num(agg.bl), chipsMp = num(agg.chip_mig) + num(agg.chip_port);
  const metaBl = cfg.meta_bl, metaChip = cfg.meta_chip;
  const metaOk = bl >= metaBl && (cfg.papel === "LIDER" || chipsMp >= metaChip);
  const bloqueio = [];
  if (inelegivel) bloqueio.push(`FPD ${(fpd * 100).toFixed(1)}% ≥ ${(pl.fpd_inelegivel * 100).toFixed(0)}%: não elegível`);
  if (!metaOk) bloqueio.push(cfg.papel === "LIDER" ? `meta de BL não batida (${bl}/${metaBl})` : `meta mínima não batida (${bl}/${metaBl} BL, ${chipsMp}/${metaChip} chips)`);
  if (!cfg.pap_ok) bloqueio.push("PAP Tools abaixo do mínimo");
  const podeBonus = !inelegivel && metaOk && cfg.pap_ok;

  const bonus = [];
  const add = (cod, ok, valor, obs) => { if (tab[cod]) bonus.push({ item: cod, nome: BONUS_ROTULO[cod], ok: !!(ok && podeBonus), valor: ok && podeBonus ? valor : 0, valor_tabela: valor, obs }); };
  if (cfg.papel === "VENDEDOR") {
    const v = num(tab.BONUS_FPD_A?.faixa2);
    const ok = fpd != null && fpd <= num(pl.fpd_bonus_a) && resolvidas >= num(pl.min_contratos_fpd);
    add("BONUS_FPD_A", ok, v, fpd == null ? "sem FPD apurado" : `FPD ${(fpd * 100).toFixed(1)}% (precisa ≤ ${(pl.fpd_bonus_a * 100).toFixed(0)}% e ${resolvidas}/${pl.min_contratos_fpd} contratos apurados)`);
  } else {
    const a = fpd != null && fpd <= num(pl.fpd_bonus_a), b = !a && fpd != null && fpd <= num(pl.fpd_bonus_b);
    add("BONUS_FPD_A", a, num(tab.BONUS_FPD_A?.faixa2), fpd == null ? "sem FPD apurado" : `FPD ${(fpd * 100).toFixed(1)}% (precisa ≤ ${(pl.fpd_bonus_a * 100).toFixed(0)}%)`);
    add("BONUS_FPD_B", b, num(tab.BONUS_FPD_B?.faixa2), fpd == null ? "sem FPD apurado" : `FPD ${(fpd * 100).toFixed(1)}% (precisa ≤ ${(pl.fpd_bonus_b * 100).toFixed(0)}%; não soma com o outro)`);
    const pd = bl ? num(agg.dcc) / bl : 0;
    add("BONUS_DCC", pd >= num(pl.dcc_pct_lider) && bl > 0, num(tab.BONUS_DCC?.faixa2), `DCC ${(pd * 100).toFixed(0)}% (precisa ≥ ${(pl.dcc_pct_lider * 100).toFixed(0)}%)`);
    const nv = num(cfg.vendedores_bl20);
    add("BONUS_VENDEDOR", nv > 0, nv * num(tab.BONUS_VENDEDOR?.faixa2), `${nv} vendedor(es) com ≥ ${pl.bl_bonus_vendedor} BL × R$ ${num(tab.BONUS_VENDEDOR?.faixa2)}`);
  }
  const bonusTotal = bonus.reduce((s, x) => s + x.valor, 0);
  const ajuste = num(cfg.ajuste);
  return {
    fpd, fpd_resolvidas: resolvidas, faixa, faixa_motivo: faixaMotivo, inelegivel, meta_bl: metaBl, meta_chip: metaChip, bl, chips_mp: chipsMp, meta_ok: metaOk,
    bloqueio, itens, bonus, base, bonus_total: bonusTotal, ajuste, total: Math.round((base + bonusTotal + ajuste) * 100) / 100,
  };
}

/* ---------- tabela padrão (vendedores com premiacao_tabela = PADRAO) ----------
   Faixas por quantidade no mês: a faixa atingida vale para todas as vendas do mês.
   Venda Carrossel não entra (a exclusão já está na agregação). */
export const TABELA_PADRAO = {
  BL: [[40, 10], [50, 12.5], [60, 15], [70, 17.5], [80, 20], [90, 22.5], [100, 25]],
  MULTI: [[1, 10], [10, 14], [20, 18], [30, 22], [40, 26]],
  TV: [[1, 15], [5, 25], [10, 35], [15, 45]],
  DCC_BONUS: 5, FPD_BONUS: 150, FPD_BONUS_MIN_BL: 40, FPD_BONUS_MIN_TV_OU_CHIP: 10, FPD_BONUS_MIN_MESES: 3,
  FPD_BONUS_LIMITE: 0.15, FPD_REDUCAO_LIMITE: 0.25, FPD_REDUCAO: 0.5,
};
const faixaDe = (faixas, n) => { let v = null; for (const [min, val] of faixas) if (n >= min) v = val; return v; };

export function calcularPadrao(agg, cfg) {
  const T = TABELA_PADRAO;
  const bl = num(agg.bl), multi = num(agg.multi), tvTotal = num(agg.tv) + num(agg.tv_plus), dcc = num(agg.dcc);
  const chips = num(agg.chip_nova) + num(agg.chip_mig) + num(agg.chip_port);
  const resolvidas = num(agg.fpd_ok) + num(agg.fpd_nao_ok);
  const fpd = resolvidas > 0 ? num(agg.fpd_nao_ok) / resolvidas : null;
  const meses = cfg.meses_casa;

  const itens = [];
  const linha = (item, nome, qtd, unit) => { const valor = Math.round(qtd * unit * 100) / 100; itens.push({ item, nome, qtd, unit, valor }); return valor; };
  const rBl = faixaDe(T.BL, bl), rMulti = faixaDe(T.MULTI, multi), rTv = faixaDe(T.TV, tvTotal);
  if (rBl) linha("BL", "Banda larga (faixa do mês)", bl, rBl);
  if (rMulti) linha("MULTI", "Multi (faixa do mês)", multi, rMulti);
  if (rTv) linha("TV", "TV (faixa do mês)", tvTotal, rTv);
  if (dcc) linha("DCC", "Débito em conta", dcc, T.DCC_BONUS);
  const base = itens.reduce((s, x) => s + x.valor, 0);

  const bonus = [];
  const fpdOk = fpd != null && fpd < T.FPD_BONUS_LIMITE && meses != null && meses >= T.FPD_BONUS_MIN_MESES
    && bl >= T.FPD_BONUS_MIN_BL && (tvTotal >= T.FPD_BONUS_MIN_TV_OU_CHIP || chips >= T.FPD_BONUS_MIN_TV_OU_CHIP);
  const obsBonus = fpd == null ? "sem FPD apurado" : `FPD ${(fpd * 100).toFixed(1)}% (precisa < 15%, 90 dias de empresa, ${bl}/40 BL e ${tvTotal} TV ou ${chips} chips/10)`;
  bonus.push({ item: "BONUS_FPD_A", nome: "Bônus FPD abaixo de 15%", ok: fpdOk, valor: fpdOk ? T.FPD_BONUS : 0, valor_tabela: T.FPD_BONUS, obs: obsBonus });
  const bonusTotal = bonus.reduce((s, x) => s + x.valor, 0);

  const reduz = fpd != null && fpd >= T.FPD_REDUCAO_LIMITE;
  if (reduz) {
    const corte = -Math.round((base + bonusTotal) * T.FPD_REDUCAO * 100) / 100;
    bonus.push({ item: "REDUCAO_FPD", nome: "FPD 25% ou mais: 50% da premiação", ok: true, valor: corte, valor_tabela: corte, obs: `FPD ${(fpd * 100).toFixed(1)}%` });
  }
  const reducaoTotal = reduz ? bonus[bonus.length - 1].valor : 0;
  const ajuste = num(cfg.ajuste);
  return {
    fpd, fpd_resolvidas: resolvidas, faixa: 1, faixa_motivo: "Tabela padrão (faixas por quantidade)", inelegivel: false,
    meta_bl: T.FPD_BONUS_MIN_BL, meta_chip: 0, bl, chips_mp: chips, meta_ok: bl >= T.FPD_BONUS_MIN_BL, bloqueio: [],
    itens, bonus, base, bonus_total: bonusTotal + reducaoTotal, ajuste,
    total: Math.round((base + bonusTotal + reducaoTotal + ajuste) * 100) / 100,
  };
}
