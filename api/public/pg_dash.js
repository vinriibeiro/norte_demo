"use strict";
/* Painel e indicadores. Cada indicador usa o gráfico adequado ao tipo de dado:
   evolução no tempo -> linhas/colunas | composição de um total -> colunas empilhadas | taxa por grupo -> colunas com referência
   ranking -> barras horizontais | causas -> Pareto | volume x qualidade -> dispersão */
(() => {
  const { esc, nf, pct, brl, mes, tabela, painel, api } = S, C = CH.COR;
  const DIAS = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb", 7: "Dom", 0: "Dom" };
  const k = (s) => String(s).slice(0, 7);
  /** "2026-09" -> {de:"2026-09-01", ate:"2026-09-30"}: usado ao clicar num gráfico para abrir as vendas do mês */
  const mesIntervalo = (m) => { const [a, mm] = m.split("-").map(Number); return { de: `${m}-01`, ate: `${m}-${String(new Date(a, mm, 0).getDate()).padStart(2, "0")}` }; };

  function porMes(rows) {
    const o = {};
    rows.forEach((r) => {
      const m = (o[k(r.mes_venda)] ||= { m: k(r.mes_venda), brutas: 0, ativas: 0, pend: 0, canc: 0, receita: 0, contratada: 0 });
      m.brutas += r.vendas_brutas; m.ativas += r.vendas_ativas; m.pend += r.vendas_pendentes; m.canc += r.vendas_canceladas;
      m.receita += r.receita_ativa || 0; m.contratada += r.receita_contratada || 0;
    });
    return Object.values(o).sort((a, b) => a.m.localeCompare(b.m));
  }
  const rot = (ms, i) => mes(ms[i].m) + (i === 0 || i === ms.length - 1 ? "*" : "");
  const NOTA_PARCIAL = "* mês incompleto (primeira ou última data da base): não compare diretamente com meses fechados.";
  const carregar = (n) => api("/kpi/" + n);
  const maturo = (f) => f.filter((x) => x.fpd_ok + x.fpd_nao_ok >= 30).sort((a, b) => String(a.safra).localeCompare(String(b.safra)));

  const gVendas = (ms) => painel("Vendas por mês e situação", CH.empilhadas({ cats: ms.map((_, i) => rot(ms, i)), rotuloY: "Contratos",
    series: [{ nome: "Instaladas", cor: C.ok, valores: ms.map((m) => m.ativas) }, { nome: "Pendentes", cor: C.pend, valores: ms.map((m) => m.pend) }, { nome: "Canceladas", cor: C.ruim, valores: ms.map((m) => m.canc) }],
    titulo: "Vendas por mês e situação", irCat: (i) => ({ f: mesIntervalo(ms[i].m) }) }), NOTA_PARCIAL + " Clique em uma coluna para abrir as vendas do mês; clique na legenda para ocultar uma situação.", "contratos por mês da venda");
  const gTaxas = (ms0) => { const ms = ms0.filter((m) => m.brutas >= 100); return painel("Conectividade e cancelamento", CH.linhas({ cats: ms.map((m) => mes(m.m) + (m === ms0[ms0.length - 1] ? "*" : "")), min: 0, max: 1, fmt: (v) => pct(v, 0), rotuloY: "% das vendas do mês",
    series: [{ nome: "Conectividade", cor: C.ok, valores: ms.map((m) => (m.brutas ? m.ativas / m.brutas : null)) }, { nome: "Cancelamento", cor: C.ruim, valores: ms.map((m) => (m.brutas ? m.canc / m.brutas : null)) }],
    titulo: "Conectividade e cancelamento" }), "Meses recentes têm vendas ainda pendentes: a conectividade tende a subir. Meses com menos de 100 vendas não entram (percentual instável).", "% sobre vendas brutas"); };
  const gFPD = (f) => {
    const d = maturo(f);
    return painel("FPD não pago por safra", d.length ? CH.colunas({ rotuloY: "% das faturas resolvidas", fmt: (v) => pct(v, 0), ref: { v: 0.25, rotulo: "referência 25% (a validar)" },
      dados: d.map((x) => ({ x: mes(x.safra), y: x.fpd_nao_ok_pct, cor: x.pct_em_prazo > 0.1 ? C.claro : C.base, dica: `${mes(x.safra)}: ${pct(x.fpd_nao_ok_pct)} não pago · ${nf.format(x.fpd_ok + x.fpd_nao_ok)} faturas resolvidas · ${pct(x.pct_em_prazo, 0)} ainda no prazo` })), titulo: "FPD não pago por safra" }) : `<p class="legenda-vazia">Sem safras com volume suficiente.</p>`,
      "Tom claro = safra ainda em maturação (mais de 10% das faturas dentro do prazo): o percentual tende a subir. Base: apenas faturas já resolvidas.", "safra = mês da venda");
  };
  const gDia = (rows) => painel("Vendas por dia da semana", CH.colunas({ rotuloY: "Contratos (histórico)", dados: [...rows].sort((a, b) => a.dia_semana - b.dia_semana).map((r) => ({ x: DIAS[r.dia_semana], y: r.vendas })), titulo: "Vendas por dia da semana" }), "Soma de todo o período importado.", "todas as vendas");
  const gPareto = (rows, meses) => {
    const alvo = new Set([...new Set(rows.map((r) => k(r.mes_venda)))].sort().slice(-meses));
    const a = {}; rows.filter((r) => alvo.has(k(r.mes_venda))).forEach((r) => (a[r.descricao] = (a[r.descricao] || 0) + r.contratos));
    let l = Object.entries(a).map(([rot, y]) => ({ rot, y })).sort((x, y) => y.y - x.y);
    if (l.length > 9) { const out = l.slice(9).reduce((s, x) => s + x.y, 0); l = [...l.slice(0, 9), { rot: "Outros", y: out, cor: C.cinza }]; }
    return painel(`Motivos de cancelamento e pendência`, l.length ? CH.pareto({ dados: l, titulo: "Pareto dos motivos" }) : `<p class="legenda-vazia">Sem motivos registrados.</p>`, "Ordenado do motivo mais frequente para o menos. Barras em azul-escuro: os motivos que, somados, respondem por até 80% dos casos; \"acum.\" é o percentual acumulado.", `últimos ${meses} meses`);
  };
  const ranking = (rows, m, campo = "vendas_ativas", n = 12) => {
    const l = rows.filter((r) => k(r.mes_venda) === m && r[campo] > 0).sort((a, b) => b[campo] - a[campo]).slice(0, n);
    return l.length ? CH.barrasH({ dados: l.map((r) => ({ rot: r.vendedor_nome || r.vendedor_login, y: r[campo], ir: r.vendedor_id ? { f: { vendedor: r.vendedor_id, ...mesIntervalo(m) } } : null })), rotuloX: "Vendas instaladas (com BL)", titulo: "Ranking de vendedores" }) : `<p class="legenda-vazia">Sem dados no mês.</p>`;
  };
  const kpi = S.kpi;

  /* ---------- Visão geral: cada departamento vê só o que é dele ---------- */
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const mesExt = (m) => { const [a, mm] = String(m).slice(0, 7).split("-").map(Number); return `${MESES[mm - 1]} de ${a}`; };
  const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const ehGestor = () => S.sessao.usuario.perfil === "gestor";
  /** Calendário do mês a partir de um vetor de vendas por dia (fechamento). */
  const diasCal = (mesIni, vet = [], feriados = []) => { const fer = new Set(feriados); return vet.map((v, i) => { const d = mesIni.slice(0, 8) + String(i + 1).padStart(2, "0"); return { d, v, folga: fer.has(d), nome: fer.has(d) ? "feriado" : "", ir: v ? { f: { de: d, ate: d } } : null }; }); };
  const subMes = (fx) => (fx?.mes?.uteis ? `${mesExt(fx.mes.inicio)} · dia útil ${S.du(fx.mes.uteis.decorridos)} de ${S.du(fx.mes.uteis.total)} (escala 6x1, sábado vale meio dia)` : "");
  const cabec = (mig, tit, sub) => `<div class="cab"><div><div class="migalha">${esc(mig)}</div><h1>${esc(tit)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</div></div>`;
  const metasEquipes = (fx) => {
    const g = (fx?.grupos || []).filter((x) => x.mes_bl || x.meta_bl).sort((a, b) => (b.previsao?.bl || 0) - (a.previsao?.bl || 0));
    return g.length ? CH.metas({ titulo: "Previsão de BL por equipe", itens: g.map((x) => ({ rot: x.grupo.replace(/^EQUIPE\s+/i, ""), sub: `${x.hc} vendedores`, real: x.mes_bl, prev: x.previsao?.bl || x.mes_bl, meta: x.meta_bl, cor: x.ritmo?.status === "ruim" ? C.ruim : x.ritmo?.status === "alerta" ? C.alerta : C.base, extra: [{ rot: "Vendas no mês", val: nf.format(x.mes_vendas) }] })) }) : `<p class="legenda-vazia">Sem vendas no mês.</p>`;
  };

  S.PAGES.dashboard = async (el) => {
    const u = S.sessao.usuario;
    if (u.perfil === "backoffice") return u.setor === "QUALIDADE" ? painelQualidade(el) : painelCadastro(el);
    const [vm, fpd, dia, mot, vend, geo0, fx] = await Promise.all([...["vendas-mensal", "fpd-safra", "dia-semana", "pareto-motivos", "vendedor-mensal", "geografia"].map(carregar), api("/fechamento").catch(() => null)]);
    if (!vm.length) { el.innerHTML = cabec("Painel", "Visão geral") + `<div class="vazio"><p>Ainda não há vendas no sistema. Importe os dados ou lance a primeira venda para ver os indicadores.</p></div>`; return; }
    const ms = porMes(vm), at = ms[ms.length - 1], fechados = ms.filter((m) => m.m !== at.m), ant = fechados[fechados.length - 1];
    const fm = maturo(fpd).filter((x) => x.pct_em_prazo <= 0.1).pop();
    const meses = [...new Set(vend.map((r) => k(r.mes_venda)))].sort();
    const t = fx?.total, var1 = ant && at ? null : null;
    el.innerHTML = cabec("Painel", "Visão geral", subMes(fx)) +
      `${t ? S.ui.previsao(t, { titulo: "Previsão de BL da empresa" }) : ""}
      <div class="grade g2">${t ? painel(`Vendas por dia · ${mesExt(fx.mes.inicio)}`, CH.calor({ titulo: "Vendas por dia do mês", rotulo: "Vendas válidas", mes: fx.mes.inicio.slice(0, 7), dias: diasCal(fx.mes.inicio, t.dias, fx.mes.uteis.feriados) }), "Cada quadrado é um dia; quanto mais escuro, mais vendas. Domingos e feriados ficam em cinza (fora da escala 6x1). Clique num dia para abrir as vendas.", "calendário") : ""}
      ${painel(`Situação das vendas em ${mes(at.m)}`, CH.rosca({ centro: "vendas no mês", altura: 240, titulo: "Situação das vendas do mês", partes: [{ rot: "Instaladas", y: at.ativas, cor: C.ok }, { rot: "Pendentes", y: at.pend, cor: C.pend }, { rot: "Canceladas", y: at.canc, cor: C.ruim }].map((x, i) => ({ ...x, ir: { f: { ...mesIntervalo(at.m), status: ["ATIVO", "PENDENTE", "CANCELADO"][i] } } })) }), "Clique numa fatia para abrir essas vendas.")}
      ${t ? painel("Equipes: realizado, previsão e meta de BL", metasEquipes(fx), "Barra cheia = BL vendida; tom claro = previsão até o fim do mês pelo ritmo por dia útil; traço = meta.", "previsão 6x1") : ""}
      ${gVendas(ms)}${gTaxas(ms)}${gFPD(fpd)}${gDia(dia)}
      ${painel("Ranking de vendedores", `<div class="filtros" style="border:0;box-shadow:none;padding:0 0 8px"><div class="campo" style="width:140px"><label>Mês</label><select id="rm">${meses.slice().reverse().map((m) => `<option value="${m}" ${m === meses.at(-1) ? "selected" : ""}>${mes(m)}</option>`).join("")}</select></div></div><div id="rk"></div>`, "Ranking por vendas instaladas no mês selecionado.", "top 12")}
      ${gPareto(mot, 3)}</div>`;
    const rk = () => (el.querySelector("#rk").innerHTML = ranking(vend, el.querySelector("#rm").value));
    el.querySelector("#rm").addEventListener("change", rk); rk();
  };

  /** Qualidade: volume, situação, cancelamento e motivos. Sem FPD e sem valores em R$. */
  async function painelQualidade(el) {
    const [vm, dia, mot, vend] = await Promise.all(["vendas-mensal", "dia-semana", "pareto-motivos", "vendedor-mensal"].map(carregar));
    if (!vm.length) { el.innerHTML = cabec("Painel", "Visão geral") + `<div class="vazio"><p>Ainda não há vendas no sistema.</p></div>`; return; }
    const ms = porMes(vm), at = ms[ms.length - 1], meses = [...new Set(vend.map((r) => k(r.mes_venda)))].sort();
    el.innerHTML = cabec("Painel · Qualidade", "Visão geral", `${mesExt(at.m)} · situação, conectividade e cancelamento das vendas`) +
      `<div class="grade g2">${gVendas(ms)}${gTaxas(ms)}${gPareto(mot, 3)}${gDia(dia)}
      ${painel("Ranking de vendedores", `<div class="filtros" style="border:0;box-shadow:none;padding:0 0 8px"><div class="campo" style="width:140px"><label>Mês</label><select id="rm">${meses.slice().reverse().map((m) => `<option value="${m}">${mes(m)}</option>`).join("")}</select></div></div><div id="rk"></div>`, "Ranking por vendas instaladas no mês selecionado.", "top 12")}</div>`;
    const rk = () => (el.querySelector("#rk").innerHTML = ranking(vend, el.querySelector("#rm").value));
    el.querySelector("#rm").addEventListener("change", rk); rk();
  }

  /** Cadastro: a fila de trabalho do dia (viabilidade, confirmações, instalações) e o volume de vendas. Sem R$ e sem FPD. */
  async function painelCadastro(el) {
    const [fx, conf, vb] = await Promise.all([api("/fechamento"), api("/confirmacao").catch(() => null), api("/viabilidade?status=PENDENTE").catch(() => null)]);
    const t = fx.total, IC = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
    const pend = vb?.contagem?.PENDENTE || 0, an = vb?.contagem?.EM_ANALISE || 0;
    const f1 = conf?.d1?.cont?.falta ?? 0, f15 = conf?.d15?.cont?.falta ?? 0, atr = (conf?.d1?.cont?.atrasadas || 0) + (conf?.d15?.cont?.atrasadas || 0);
    const at = (n, rot, sub, href, tom, ic) => `<a class="atalho ${n ? tom : "ok"}" href="${href}"><span class="ai">${IC(ic)}</span><div><b>${nf.format(n)}</b><span>${esc(rot)}${sub ? ` · ${esc(sub)}` : ""}</span></div></a>`;
    el.innerHTML = cabec("Painel · Cadastro", "Visão geral", `Hoje, ${S.dt(fx.dia)} · ${subMes(fx)}`) +
      `<div class="atalhos">${at(pend + an, "viabilidades aguardando", an ? `${an} em análise` : "responder ao vendedor", "#/viabilidade", "ruim", '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>')}
        ${at(f1, "confirmações D+1 a fazer", `vendas de ${S.dt(conf?.d1?.dia_venda)}`, "#/confirmacao", "alerta", '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/>')}
        ${at(f15, "confirmações D+15 a fazer", `vendas de ${S.dt(conf?.d15?.dia_venda)}`, "#/confirmacao", "alerta", '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/>')}
        ${at(atr, "ligações atrasadas", "dos últimos 7 dias", "#/confirmacao", "ruim", '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}
        ${at(Math.max(0, t.agendadas - t.instaladas), "instalações em aberto hoje", `${t.instaladas} de ${t.agendadas} feitas`, "#/rota", "alerta", '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H16a3.5 3.5 0 000-7H8a3.5 3.5 0 010-7h7.5"/>')}</div>
      <div class="kpis">${kpi("Vendas hoje", nf.format(t.vendas), `${nf.format(t.ontem)} ontem`, fx.serie.map((d) => d.conectadas + d.pendentes))}${kpi("Vendas no mês", nf.format(t.mes_vendas), `${nf.format(t.mes_bl)} com banda larga`)}
        ${kpi("Instaladas no mês", nf.format(t.mes_conectadas), pct(t.mes_vendas + t.mes_canceladas ? t.mes_conectadas / (t.mes_vendas + t.mes_canceladas) : null) + " de conectividade")}${kpi("Canceladas no mês", nf.format(t.mes_canceladas), pct(t.mes_vendas + t.mes_canceladas ? t.mes_canceladas / (t.mes_vendas + t.mes_canceladas) : null))}</div>
      ${S.ui.previsao(t, { titulo: "Previsão de BL da empresa" })}
      <div class="grade g2">${painel(`Vendas por dia · ${mesExt(fx.mes.inicio)}`, CH.calor({ titulo: "Vendas por dia do mês", rotulo: "Vendas válidas", mes: fx.mes.inicio.slice(0, 7), dias: diasCal(fx.mes.inicio, t.dias, fx.mes.uteis.feriados) }), "Domingos e feriados em cinza (fora da escala 6x1). Clique num dia para abrir as vendas.", "calendário")}
      ${painel("Últimos 14 dias", CH.empilhadas({ titulo: "Últimos 14 dias", rotuloY: "Vendas", cats: fx.serie.map((d) => d.dia.slice(8) + "/" + d.dia.slice(5, 7)), series: [{ nome: "Instaladas", cor: C.ok, valores: fx.serie.map((d) => d.conectadas) }, { nome: "Pendentes", cor: C.pend, valores: fx.serie.map((d) => d.pendentes) }, { nome: "Canceladas", cor: C.ruim, valores: fx.serie.map((d) => d.canceladas) }] }), "Pela data da venda, na situação de hoje.")}</div>
      ${painel("Vendas no mês por equipe", tabela([{ t: "Equipe", f: (g) => `<b>${esc(g.grupo)}</b>` }, { t: "Hoje", n: 1, f: (g) => nf.format(g.vendas) }, { t: "Mês", n: 1, f: (g) => nf.format(g.mes_vendas) }, { t: "BL no mês", n: 1, f: (g) => nf.format(g.mes_bl) + CH.mini(g.mes_bl, Math.max(...fx.grupos.map((x) => x.mes_bl), 1), { w: 60 }) }, { t: "Pendentes de BL", n: 1, f: (g) => nf.format(g.mes_bl_pend) }, { t: "Canceladas", n: 1, f: (g) => nf.format(g.mes_canceladas) }, { t: "Instalações hoje", n: 1, f: (g) => `${g.instaladas}/${g.agendadas}` }], fx.grupos), "", `${fx.grupos.length} equipes`)}`;
  }

  /* ---------- Indicadores por tema ---------- */
  S.PAGES["ind-vendas"] = async (el) => {
    const [vm, oc, mix, dia] = await Promise.all(["vendas-mensal", "origem-canal", "mix-produto", "dia-semana"].map(carregar));
    const ms = porMes(vm);
    const orig = {}; oc.forEach((r) => { const o = (orig[`${r.origem || "sem origem informada"} / ${r.canal || "sem canal"}`] ||= { v: 0, c: 0, p: 0 }); o.v += r.vendas; o.c += r.taxa_cancelamento * r.vendas; o.p += r.taxa_pendencia * r.vendas; });
    const lo = Object.entries(orig).map(([n, o]) => ({ n, v: o.v, c: o.c / o.v, p: o.p / o.v })).sort((a, b) => b.v - a.v);
    const cats = {}; const ult = [...new Set(mix.map((r) => k(r.mes_venda)))].sort().slice(-3);
    mix.filter((r) => ult.includes(k(r.mes_venda))).forEach((r) => (cats[r.categoria] = (cats[r.categoria] || 0) + r.contratos));
    const NM = { FIBRA: "Internet (Fibra)", TV: "TV", MOVEL: "Móvel (chip)", MESH: "Wi-Fi Mesh", FONE: "Fone", STREAMING: "MPlay", PONTO_ADICIONAL: "Ponto adicional" };
    el.innerHTML = `<div class="cab"><div><div class="migalha">Indicadores</div><h1>Vendas</h1></div></div>
      <div class="grade g2">${gVendas(ms)}${gTaxas(ms)}
      ${ehGestor() ? painel("Receita de pacotes por mês", CH.colunas({ dados: ms.map((m, i) => ({ x: rot(ms, i), y: m.receita })), fmt: (v) => (v >= 1000 ? nf.format(Math.round(v / 1000)) + " mil" : nf.format(v)), rotuloY: "R$ (vendas instaladas)", titulo: "Receita instalada por mês" }), NOTA_PARCIAL, "soma do pacote das vendas instaladas") : ""}
      ${ehGestor() ? painel("Ticket médio por mês", CH.colunas({ dados: ms.map((m, i) => ({ x: rot(ms, i), y: m.brutas ? m.contratada / m.brutas : 0 })), fmt: (v) => "R$ " + nf.format(Math.round(v)), rotuloY: "R$ por venda", titulo: "Ticket médio" }), "Média do pacote contratado por venda.") : ""}
      ${painel("Contratos por produto (últimos 3 meses)", CH.barrasH({ dados: Object.entries(cats).map(([n, y]) => ({ rot: NM[n] || n, y })).sort((a, b) => b.y - a.y), rotuloX: "Contratos que incluem o produto", titulo: "Mix de produtos" }), "Um contrato pode ter mais de um produto; as barras não somam 100%.")}
      ${gDia(dia)}</div>
      ${painel("Origem e canal", tabela([{ t: "Origem / canal", k: "n" }, { t: "Vendas", n: 1, f: (r) => nf.format(r.v) }, { t: "% cancelamento", n: 1, f: (r) => pct(r.c) }, { t: "% pendência", n: 1, f: (r) => pct(r.p) }], lo), "", "todo o período")}`;
  };

  S.PAGES["ind-qualidade"] = async (el) => {
    const [fpd, rec, sob, sit, perda] = await Promise.all(["fpd-safra", "fpd-recorte", "sobrevivencia", "situacao-faturas", "perda-fpd"].map(carregar));
    const s = sit[0] || {}, safras = [...new Set(rec.map((r) => k(r.safra)))].sort();
    const d = maturo(fpd), sq = new Set(d.map((x) => k(x.safra))), so = [...sob].filter((x) => sq.has(k(x.safra))).sort((a, b) => String(a.safra).localeCompare(String(b.safra)));
    el.innerHTML = `<div class="cab"><div><div class="migalha">Indicadores</div><h1>Qualidade (FPD)</h1><p>Faturas e FPD por safra (mês da venda).</p></div><div class="acoes"><a class="btn" href="#/fpd">Lançar nova lista de FPD</a></div></div>
      <div class="kpis">${kpi("Faturas quitadas", nf.format(s.quitadas || 0))}${kpi("1ª fatura em aberto", nf.format(s.primeira_em_aberto || 0))}${kpi("2ª fatura em aberto", nf.format(s.segunda_em_aberto || 0))}</div>
      <div class="grade g2">${gFPD(fpd)}
      ${painel("Recuperação após o prazo", CH.colunas({ rotuloY: "% das faturas não pagas no prazo", fmt: (v) => pct(v, 0), dados: d.map((x) => ({ x: mes(x.safra), y: x.taxa_recuperacao || 0, dica: `${mes(x.safra)}: ${nf.format(x.recuperadas)} recuperadas` })), titulo: "Recuperação" }), "Faturas pagas depois do prazo, sobre as que passaram do prazo.", "por safra")}
      ${painel("Clientes ainda conectados por safra", CH.colunas({ rotuloY: "% conectados", fmt: (v) => pct(v, 0), dados: so.map((x) => ({ x: mes(x.safra), y: x.pct_conectado, dica: `${mes(x.safra)}: ${pct(x.pct_conectado)} de ${nf.format(x.contratos)} contratos` })), titulo: "Sobrevivência das safras" }), "Safras mais antigas tendem a perder clientes ao longo do tempo (churn). Só safras cobertas pelas abas de qualidade (abr–ago).", "sobrevivência")}
      ${painel("Receita em risco no FPD", tabela([{ t: "Safra", f: (r) => mes(r.safra) }, { t: "Pacote em FPD não pago", n: 1, f: (r) => brl(r.pacote_em_fpd_nao_ok) }, { t: "Não recuperado", n: 1, f: (r) => brl(r.pacote_nao_recuperado) }], [...perda].sort((a, b) => String(b.safra).localeCompare(String(a.safra)))))}</div>
      ${painel("FPD não pago por vendedor", `<div class="filtros" style="border:0;padding:0 0 8px"><div class="campo" style="width:140px"><label>Safra</label><select id="sf">${safras.slice().reverse().map((m) => `<option value="${m}">${mes(m)}</option>`).join("")}</select></div></div><div id="fv"></div>`, "Só vendedores com volume mínimo de faturas resolvidas (para não comparar percentuais de amostras muito pequenas).", "pior para melhor")}
      ${painel("FPD não pago por equipe", `<div id="fe"></div>`, "Mesma safra escolhida acima. Barras vermelhas: acima da referência de 25%.", "por equipe")}`;
    const dr = () => {
      const m = el.querySelector("#sf").value;
      const l = rec.filter((r) => r.dimensao === "VENDEDOR" && k(r.safra) === m && r.volume_suficiente).sort((a, b) => b.fpd_nao_ok_pct - a.fpd_nao_ok_pct).slice(0, 15);
      const le = rec.filter((r) => r.dimensao === "EQUIPE" && k(r.safra) === m && r.resolvidas > 0).sort((a, b) => b.fpd_nao_ok_pct - a.fpd_nao_ok_pct);
      el.querySelector("#fe").innerHTML = le.length ? CH.barrasH({ dados: le.map((r) => ({ rot: r.valor || "sem equipe", y: r.fpd_nao_ok_pct, n: r.resolvidas, cor: r.fpd_nao_ok_pct > 0.25 ? C.ruim : C.base })), fmt: (v) => pct(v, 0), rotuloX: "% de faturas não pagas no prazo", titulo: "FPD por equipe", larguraRot: 170 }) : `<p class="legenda-vazia">Sem faturas resolvidas nesta safra.</p>`;
      el.querySelector("#fv").innerHTML = l.length ? CH.barrasH({ dados: l.map((r) => ({ rot: r.valor, y: r.fpd_nao_ok_pct, n: r.resolvidas, cor: r.fpd_nao_ok_pct > 0.25 ? C.ruim : C.base })), fmt: (v) => pct(v, 0), rotuloX: "% de faturas não pagas no prazo", titulo: "FPD por vendedor" }) : `<p class="legenda-vazia">Nenhum vendedor com volume suficiente nesta safra.</p>`;
    };
    el.querySelector("#sf").addEventListener("change", dr); dr();
  };

  S.PAGES["ind-operacao"] = async (el) => {
    const [mot, ven, carga, parado] = await Promise.all(["pareto-motivos", "vencimento", "carga-backoffice", "vendedor-parado"].map(carregar));
    const ul = [...new Set(carga.map((r) => k(r.mes_venda)))].sort().at(-2) || null;
    el.innerHTML = `<div class="cab"><div><div class="migalha">Indicadores</div><h1>Operação</h1></div></div>
      <div class="grade g2">${gPareto(mot, 3)}
      ${painel("Contratos por dia de vencimento", CH.colunas({ rotuloY: "Contratos", dados: [...ven].filter((r) => r.dia_vencimento != null).sort((a, b) => a.dia_vencimento - b.dia_vencimento).map((r) => ({ x: "dia " + r.dia_vencimento, y: r.contratos })), titulo: "Vencimentos" }), "Concentração de faturas por dia do mês.", "todas as vendas")}
      ${painel("Contratos tratados por backoffice", ul ? CH.barrasH({ dados: carga.filter((r) => k(r.mes_venda) === ul).sort((a, b) => b.contratos_tratados - a.contratos_tratados).slice(0, 12).map((r) => ({ rot: r.backoffice, y: r.contratos_tratados })), rotuloX: "Contratos tratados", titulo: "Carga por backoffice" }) : `<p class="legenda-vazia">Sem dados.</p>`, "", ul ? mes(ul) : "")}
      ${painel("Vendedores parados", tabela([{ t: "Vendedor", k: "nome_completo" }, { t: "Última venda", f: (r) => S.dt(r.ultima_venda) }, { t: "Dias sem vender", n: 1, k: "dias_sem_vender" }], parado.filter((r) => r.dias_sem_vender >= 7 && r.dias_sem_vender <= 90).sort((a, b) => b.dias_sem_vender - a.dias_sem_vender).slice(0, 15)), "Quem já vendeu e ficou de 7 a 90 dias sem vender. Acima de 90 dias, o agente é tratado como desligado.", "7 a 90 dias")}</div>`;
  };

  S.PAGES["ind-pessoas"] = async (el) => {
    const semFpd = S.sessao.usuario.perfil === "backoffice";
    const [vend, quad, fp] = await Promise.all(semFpd ? [carregar("vendedor-mensal"), [], []] : ["vendedor-mensal", "quadrante", "fpd-safra"].map(carregar));
    const fmt0 = maturo(fp).filter((x) => x.pct_em_prazo <= 0.1).pop(), padrao = fmt0 ? k(fmt0.safra) : null;
    const meses = [...new Set(vend.map((r) => k(r.mes_venda)))].sort();
    el.innerHTML = `<div class="cab"><div><div class="migalha">Indicadores</div><h1>Vendedores</h1></div></div>
      <div class="filtros"><div class="campo" style="width:140px"><label>Mês</label><select id="rm">${meses.slice().reverse().map((m) => `<option value="${m}" ${m === padrao ? "selected" : ""}>${mes(m)}</option>`).join("")}</select></div></div>
      <div class="grade g2"><div id="p1"></div><div id="p2"></div></div><div id="p3"></div>`;
    const f = () => {
      const m = el.querySelector("#rm").value;
      el.querySelector("#p1").innerHTML = painel("Ranking por vendas instaladas", ranking(vend, m, "vendas_ativas", 15), "", "top 15");
      const pts = quad.filter((r) => k(r.mes_venda) === m && r.fpd_nao_ok_pct != null && r.vendas_ativas > 0);
      el.querySelector("#p2").innerHTML = semFpd ? painel("Cancelamento por vendedor", CH.barrasH({ titulo: "Cancelamento por vendedor", fmt: (v) => pct(v, 0), rotuloX: "% de vendas canceladas", dados: vend.filter((r) => k(r.mes_venda) === m && r.vendas_brutas >= 5).sort((a, b) => b.taxa_cancelamento - a.taxa_cancelamento).slice(0, 15).map((r) => ({ rot: r.vendedor_nome, y: r.taxa_cancelamento || 0, n: r.vendas_brutas, cor: (r.taxa_cancelamento || 0) > 0.15 ? C.ruim : C.base })) }), "Vendedores com 5+ vendas no mês.", "pior para melhor") : painel("Volume x qualidade", pts.length ? CH.dispersao({ pontos: pts.map((r) => ({ x: r.vendas_ativas, y: r.fpd_nao_ok_pct, rot: r.vendedor })), rotuloX: "Vendas ativas no mês", rotuloY: "% FPD não pago", fmtY: (v) => pct(v, 0), refY: 0.25, titulo: "Volume x qualidade por vendedor" }) : `<p class="legenda-vazia">Sem vendedores com faturas resolvidas nesta safra.</p>`, "Cada ponto é um vendedor. Ideal: muito volume e FPD baixo (canto inferior direito). Linha tracejada: referência 25% (a validar). Passe o mouse sobre o ponto.", "");
      const t = vend.filter((r) => k(r.mes_venda) === m).sort((a, b) => b.vendas_brutas - a.vendas_brutas).slice(0, 40);
      el.querySelector("#p3").innerHTML = painel("Detalhe do mês", tabela([{ t: "Vendedor", k: "vendedor_nome" }, { t: "Equipe", k: "equipe" }, { t: "Vendas", n: 1, k: "vendas_brutas" }, { t: "Instaladas", n: 1, k: "vendas_ativas" }, { t: "% cancel.", n: 1, f: (r) => pct(r.taxa_cancelamento) }, ...(ehGestor() ? [{ t: "Receita instalada", n: 1, f: (r) => brl(r.receita_ativa) }] : [])], t), "", "40 maiores");
    };
    el.querySelector("#rm").addEventListener("change", f); f();
  };

  S.PAGES["ind-geo"] = async (el) => {
    const geo = await carregar("geografia"), G = ehGestor();
    const UFN = { AC: "Acre", DF: "Distrito Federal", GO: "Goiás", MS: "Mato Grosso do Sul", MT: "Mato Grosso", RO: "Rondônia", AM: "Amazonas", TO: "Tocantins", SP: "São Paulo", MG: "Minas Gerais", PA: "Pará", BA: "Bahia", PR: "Paraná" };
    const cid = {}, uf = {};
    geo.forEach((r) => {
      const c = (cid[`${r.uf}|${r.cidade}`] ||= { rot: r.cidade, uf: r.uf, v: 0, c: 0, ra: 0, bairros: 0 }); c.v += r.vendas; c.c += (r.taxa_cancelamento || 0) * r.vendas; c.ra += r.receita_ativa || 0; if (r.bairro) c.bairros++;
      const u = (uf[r.uf || "–"] ||= { uf: r.uf || "–", v: 0, c: 0, cid: new Set() }); u.v += r.vendas; u.c += (r.taxa_cancelamento || 0) * r.vendas; u.cid.add(r.cidade);
    });
    const l = Object.values(cid).sort((a, b) => b.v - a.v), tot = l.reduce((s, x) => s + x.v, 0) || 1;
    const ufs = Object.values(uf).sort((a, b) => b.v - a.v);
    const taxa = l.filter((x) => x.v >= 30).map((x) => ({ rot: `${x.rot} (${x.uf})`, y: x.c / x.v, n: x.v })).sort((a, b) => b.y - a.y).slice(0, 12);
    const media = l.reduce((s, x) => s + x.c, 0) / tot;
    const bairros = geo.filter((r) => r.bairro).sort((a, b) => b.vendas - a.vendas).slice(0, 25), maxB = Math.max(1, ...bairros.map((b) => b.vendas));
    const cartaoUf = (u) => `<div class="kpi"><div class="kpi-topo"><div class="r">${esc(UFN[u.uf] || u.uf)}</div><span class="chip azul">${esc(u.uf)}</span></div><div class="v">${nf.format(u.v)}</div><div class="kpi-pe"><div class="d">${(u.v / tot * 100).toFixed(0)}% das vendas · ${u.cid.size} ${u.cid.size > 1 ? "cidades" : "cidade"} · cancel. ${pct(u.v ? u.c / u.v : null, 0)}</div></div></div>`;
    el.innerHTML = cabec("Indicadores", "Geografia", `${nf.format(tot)} vendas em ${l.length} cidades de ${ufs.length} estados · todo o período importado`) +
      `<div class="kpis">${ufs.slice(0, 6).map(cartaoUf).join("")}</div>
      ${painel("Onde vendemos", CH.treemap({ titulo: "Vendas por cidade", rotulo: "Vendas", altura: 360, itens: l.slice(0, 24).map((x) => ({ rot: `${x.rot} · ${x.uf}`, y: x.v, sub: `Cancelamento ${pct(x.v ? x.c / x.v : null)}`, extra: [{ rot: "Cancelamento", val: pct(x.v ? x.c / x.v : null) }] })) }), "Cada retângulo é uma cidade, com área proporcional às vendas. Tons mais escuros = cidades com mais vendas. Passe o mouse para ver o detalhe.", "área = vendas")}
      <div class="grade g2">${painel("Ranking de cidades", CH.barrasH({ dados: l.slice(0, 12).map((x) => ({ rot: `${x.rot} (${x.uf})`, y: x.v, extra: [{ rot: "Participação", val: (x.v / tot * 100).toFixed(1).replace(".", ",") + "%" }] })), rotuloX: "Vendas", titulo: "Ranking de cidades", larguraRot: 210 }), "", "12 maiores")}
      ${painel("Cancelamento por cidade", taxa.length ? CH.barrasH({ dados: taxa.map((x) => ({ ...x, cor: x.y > media * 1.25 ? C.ruim : C.base })), fmt: (v) => pct(v, 0), rotuloX: "% de contratos cancelados", titulo: "Cancelamento por cidade", larguraRot: 210, ref: { v: media, rotulo: "média " + pct(media, 0) } }) : `<p class="legenda-vazia">Sem cidades com volume suficiente.</p>`, "Somente cidades com 30+ vendas. Em vermelho: 25% ou mais acima da média da empresa.", "maior para menor")}</div>
      ${painel("Cidades", tabela([{ t: "Cidade", f: (x) => `<b>${esc(x.rot)}</b>` }, { t: "UF", k: "uf" }, { t: "Vendas", n: 1, f: (x) => nf.format(x.v) + CH.mini(x.v, l[0]?.v || 1) }, { t: "Participação", n: 1, f: (x) => pct(x.v / tot) }, { t: "% cancel.", n: 1, f: (x) => pct(x.v ? x.c / x.v : null) }, { t: "Bairros", n: 1, f: (x) => nf.format(x.bairros) }, ...(G ? [{ t: "Receita instalada", n: 1, f: (x) => brl(x.ra) }] : [])], l), "", `${l.length} cidades`)}
      ${painel("Bairros com mais vendas", tabela([{ t: "Bairro", f: (r) => `<b>${esc(r.bairro)}</b>` }, { t: "Cidade", f: (r) => esc(`${r.cidade} (${r.uf})`) }, { t: "Vendas", n: 1, f: (r) => nf.format(r.vendas) + CH.mini(r.vendas, maxB) }, { t: "% cancel.", n: 1, f: (r) => pct(r.taxa_cancelamento) }, ...(G ? [{ t: "Ticket médio", n: 1, f: (r) => brl(r.ticket_medio) }] : [])], bairros), "Bairros informados no cadastro da venda.", "25 maiores")}`;
  };

  /* ---------- Meu desempenho (vendedor) ---------- */
  S.PAGES.meu = async (el) => {
    const [rows, mm] = await Promise.all([api("/meu/desempenho"), api("/meu-mes").catch(() => null)]);
    const ms = rows.map((r) => ({ m: k(r.mes_venda), a: r.vendas_ativas, b: r.vendas_brutas, c: r.vendas_canceladas })).sort((a, b) => a.m.localeCompare(b.m));
    const eu = mm?.eu, nome = String(S.sessao.usuario.nome || "").split(" ")[0];
    const conMes = eu && eu.mes_vendas + eu.mes_canceladas ? eu.mes_conectadas / (eu.mes_vendas + eu.mes_canceladas) : null;
    const st = eu?.ritmo?.status, msg = !eu ? "" : !eu.meta_bl ? "Sua meta do mês ainda não foi cadastrada." : st === "ok" ? "Você está no ritmo para bater a meta. Continue assim!" : st === "alerta" ? "Está perto: um pouco mais por dia e a meta vem." : "Abaixo do ritmo da meta: veja quantas BL por dia útil faltam.";
    const rank = (p, rot) => p?.posicao ? `<div class="posicao"><div class="med">${p.posicao}º<small> de ${p.de}</small></div><div><b>${esc(rot)}</b><div class="mut">média ${String(p.media_bl).replace(".", ",")} BL por pessoa · 1º lugar com ${p.lider_bl} BL</div></div></div>` : `<p class="mut">Sem vendas no mês ainda.</p>`;
    const APP = document.body.classList.contains("app-vendedor");
    const appTopo = () => {
      const p = eu.previsao || {}, meta = eu.meta_bl || 0, real = eu.mes_bl || 0, faltam = Math.max(0, meta - real), por = p.dias_restantes ? faltam / p.dias_restantes : null;
      const pc = meta ? Math.min(100, (real / meta) * 100) : 0, pp = meta ? Math.min(100, ((p.bl || 0) / meta) * 100) : 0;
      const tile = (r, v, d, tom, st) => `<button type="button" class="ap-tile ${tom || ""}" data-ir="${st || ""}"><div class="r">${r}</div><div class="v">${v}</div><div class="d">${d}</div><span class="ap-seta" aria-hidden="true">›</span></button>`;
      return `<section class="ap-hero ${st || ""}"><div class="ap-oi">Olá, ${esc(nome)}</div><div class="ap-mes">${mesExt(mm.mes.inicio)} · dia útil ${S.du(p.dias_decorridos)} de ${S.du(p.dias_uteis)}</div>
        <div class="ap-rot">Minhas BL no mês</div><div class="ap-big"><b>${nf.format(real)}</b><span>${meta ? `de ${nf.format(meta)}` : "sem meta"}</span>${meta ? `<em>${S.ui.pct0(real / meta)}</em>` : ""}</div>
        ${meta ? `<div class="ap-barra"><i class="p" style="width:${pp}%"></i><i class="r" style="width:${pc}%"></i></div>` : ""}
        <div class="ap-msg">${esc(msg)}</div>
        <div class="ap-trio"><div><b>${faltam ? nf.format(faltam) : "✓"}</b><span>${faltam ? "BL faltam" : "meta batida"}</span></div><div><b>${por == null || !faltam ? "–" : por < 10 ? por.toFixed(1).replace(".", ",") : nf.format(Math.ceil(por))}</b><span>por dia útil</span></div><div><b>${nf.format(p.bl || 0)}</b><span>previsão do mês</span></div></div></section>
        <div class="ap-tiles">${tile("Vendas hoje", nf.format(eu.vendas), `${nf.format(eu.ontem)} ontem`)}${tile("No mês", nf.format(eu.mes_vendas), "vendas")}${tile("Conectividade", pct(conMes, 0), `${eu.mes_conectadas} instaladas`, "ok", "ATIVO")}${tile("Chips", nf.format(eu.mes_chip_mp), eu.meta_chip ? `meta ${nf.format(eu.meta_chip)}` : "migração/port.")}</div>
        ${appPos()}
        <a class="btn ap-cta" href="#/viabilidade">Pedir viabilidade</a>`;
    };
    const appPos = () => {
      const c = (q, rot) => q?.posicao ? `<div><b>${q.posicao}º</b><span>${rot}</span><small>de ${q.de} vendedores</small></div>` : `<div><b>–</b><span>${rot}</span><small>sem vendas no mês</small></div>`;
      return `<section class="ap-pos"><h3>Minha posição em BL</h3><div class="ap-pos-g">${c(mm.equipe, "na equipe")}${c(mm.empresa, "na empresa")}</div></section>`;
    };
    if (APP && eu) {   // app do celular: só o essencial, tudo grande e clicável
      el.innerHTML = appTopo();
      el.querySelectorAll(".ap-tile[data-ir]").forEach((b) => b.addEventListener("click", () => S.filtrarVendas({ status: b.dataset.ir })));
      return;
    }
    el.innerHTML = (APP && eu ? "" : cabec("Minha área", `Olá, ${nome}`, mm ? `${mesExt(mm.mes.inicio)} · dia útil ${S.du(eu?.previsao?.dias_decorridos ?? mm.mes.uteis.decorridos)} de ${S.du(eu?.previsao?.dias_uteis ?? mm.mes.uteis.total)}. ${msg}` : "")) +
      (eu ? `${APP ? appTopo() : ""}${APP ? "" : `<div class="kpis">${kpi("Vendas no mês", nf.format(eu.mes_vendas), `${nf.format(eu.vendas)} hoje · ${nf.format(eu.ontem)} ontem`, eu.dias.slice(0, mm.mes.dia_mes))}
        ${kpi("BL no mês", nf.format(eu.mes_bl), eu.meta_bl ? `meta ${nf.format(eu.meta_bl)} · ${eu.mes_bl_con} instaladas` : `${eu.mes_bl_con} instaladas`, null, eu.meta_bl ? { txt: S.ui.pct0(eu.mes_bl / eu.meta_bl), tom: st } : null)}
        ${kpi("Conectividade", pct(conMes, 0), `${eu.mes_conectadas} instaladas · ${eu.mes_canceladas} canceladas`)}
        ${kpi("Chips (migração/port.)", nf.format(eu.mes_chip_mp), eu.meta_chip ? `meta ${nf.format(eu.meta_chip)}` : "no mês")}</div>
      ${S.ui.previsao(eu, { titulo: "Sua previsão para o mês" })}`}
      <div class="grade g2">${painel("Meu mês, dia a dia", CH.calor({ titulo: "Minhas vendas por dia", rotulo: "Vendas", mes: mm.mes.inicio.slice(0, 7), dias: diasCal(mm.mes.inicio, eu.dias, eu.feriados_mes || mm.mes.uteis.feriados) }), "Domingos e feriados da sua cidade ficam em cinza: não contam como dia útil.", "calendário")}
      ${painel("Minha posição em BL", rank(mm.equipe, "na minha equipe") + `<div style="height:18px"></div>` + rank(mm.empresa, "na empresa toda"), "Ranking pela quantidade de BL vendida no mês (canceladas não contam).", "mês atual")}
      ${painel("O que vendi no mês", CH.barrasH({ titulo: "Mix do mês", dados: [{ rot: "Banda larga (BL)", y: mm.mix.bl }, { rot: "TV", y: mm.mix.tv }, { rot: "Fone", y: mm.mix.fone }, { rot: "Chip novo", y: mm.mix.chip_nova }, { rot: "Chip migração/port.", y: mm.mix.chip_mp }, { rot: "Pagamento em DCC", y: mm.mix.dcc }], rotuloX: "Quantidade", larguraRot: 170 }), "Vendas válidas do mês (sem as canceladas).")}</div>` : "") +
      `<div class="grade g2">${painel("Minhas vendas por mês", CH.empilhadas({ cats: ms.map((m) => mes(m.m)), rotuloY: "Contratos", series: [{ nome: "Instaladas", cor: C.ok, valores: ms.map((m) => m.a) }, { nome: "Pendentes", cor: C.pend, valores: ms.map((m) => m.b - m.a - m.c) }, { nome: "Canceladas", cor: C.ruim, valores: ms.map((m) => m.c) }], titulo: "Minhas vendas" }))}
      ${painel("Conectividade por mês", CH.linhas({ cats: ms.map((m) => mes(m.m)), min: 0, max: 1, fmt: (v) => pct(v, 0), series: [{ nome: "Conectividade", cor: C.ok, valores: ms.map((m) => (m.b ? m.a / m.b : null)) }], titulo: "Conectividade" }), "Vendas instaladas sobre o total de vendas do mês.")}</div>`;
  };

  /* Visão da equipe (supervisor, coordenador e gerente): ver pg_equipe.js */
})();
