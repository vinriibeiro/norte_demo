"use strict";
/* Visão da equipe (supervisor), da coordenação (coordenador) e das equipes (gerente).
   Indicadores do supervisor no topo e os vendedores em tabela: vendas do mês na 1ª coluna e os demais indicadores ao lado.
   Os números vêm de /api/painel-equipe; o banco limita cada supervisor/coordenador às equipes ligadas a ele. */
(() => {
  const { esc, nf, api, brl, painel } = S;
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const mesRot = (m) => { const [a, n] = m.split("-"); return `${MESES[+n - 1]}/${a}`; };
  const br = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "–");
  const pct0 = (x) => (x == null || !isFinite(x) ? "–" : Math.round(x * 100) + "%");
  const pct1 = (x) => (x == null || !isFinite(x) ? "–" : (x * 100).toFixed(1).replace(".", ",") + "%");
  const REF_FPD = 0.25;
  const est = { mes: null, equipe: "", ordem: "mes_vendas", desc: true, abertos: new Set() };

  const deltaMes = (atual, ant) => {
    if (!ant && !atual) return `<span class="mut">sem vendas no mesmo período do mês passado</span>`;
    const d = atual - ant, cls = d > 0 ? "up" : d < 0 ? "dn" : "eq";
    return `<span class="fx-delta ${cls}">${S.fx.ico(cls, 13)}${d === 0 ? "igual" : (d > 0 ? "+" : "−") + nf.format(Math.abs(d))} vs mês anterior${ant ? ` (${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.round(Math.abs(d) / ant * 100)}%)` : ""}</span>`;
  };
  const fpdCel = (o) => (o.fpd == null ? `<span class="fx-z" title="Sem faturas resolvidas nas 3 últimas safras">–</span>`
    : `<span class="eq-fpd ${o.fpd > REF_FPD ? "ruim" : o.fpd > REF_FPD * 0.8 ? "alerta" : "ok"}" title="${o.fpd_nao_ok} de ${o.fpd_resolvidas} primeiras faturas não pagas no prazo">${pct1(o.fpd)}</span>`);
  const semVender = (p) => (p.dias_sem_venda == null ? `<span class="eq-sv ruim">nunca vendeu</span>` : p.dias_sem_venda === 0 ? `<span class="eq-sv ok">hoje</span>`
    : `<span class="eq-sv ${p.dias_sem_venda >= 5 ? "ruim" : p.dias_sem_venda >= 2 ? "alerta" : ""}" title="Última venda em ${br(p.ultima_venda)}">há ${p.dias_sem_venda} dia${p.dias_sem_venda === 1 ? "" : "s"}</span>`);

  const COLS = [
    ["mes_vendas", "Vendas", "Vendas válidas no mês (sem as canceladas)"], ["ant_vendas", "Mês ant.", "Mesmo período do mês anterior"], ["vendas", "Hoje", "Vendas válidas no dia"],
    ["mes_matinal", "Matinal", "Vendas do mês agendadas para o turno da manhã (08h às 12h)"], ["mes_vespertina", "Vespertina", "Vendas do mês agendadas para o turno da tarde (a partir de 12h)"],
    ["mes_conectadas", "Instal.", "Instaladas no mês"], ["mes_pend", "Pend.", "Pendentes de instalação"], ["mes_canceladas", "Canc.", "Canceladas no mês"],
    ["conectividade", "% conect.", "Instaladas ÷ todas as vendas do mês"], ["mes_bl", "BL × meta", "Banda larga do mês (instalada + pendente) contra a meta"],
    ["mes_chip_mp", "Chips M/P", "Chips de migração e portabilidade no mês"], ["ritmo", "Ritmo", "Projeção da BL até o fim do mês contra a meta"], ["fpd", "FPD 3m", "Primeira fatura não paga no prazo, nas 3 últimas safras fechadas (referência 25%)"],
    ["ticket", "Ticket", "Pacote médio das vendas do mês"], ["dias_sem_venda", "Últ. venda", "Dias desde a última venda"],
  ];
  let VV = true;   // vê valores em R$ (só gerente/administrador)
  const cols = () => COLS.filter(([k]) => k !== "ticket" || VV);
  const valorOrdem = (p, k) => (k === "mes_pend" ? p.mes_vendas - p.mes_conectadas : k === "ritmo" ? p.ritmo?.pct ?? -1 : k === "mes_bl" ? p.mes_bl : k === "dias_sem_venda" ? (p.dias_sem_venda ?? 9999) : p[k] ?? -1);
  function celulas(o, frac, nivel) {
    const pend = o.mes_vendas - o.mes_conectadas, z = S.fx.z;
    return `<td class="num eq-v1">${nf.format(o.mes_vendas)}</td><td class="num mut">${z(o.ant_vendas)}</td><td class="num">${z(o.vendas)}</td><td class="num">${z(o.mes_matinal)}</td><td class="num">${z(o.mes_vespertina)}</td>
      <td class="num">${z(o.mes_conectadas)}</td><td class="num">${z(pend)}</td><td class="num ${o.mes_canceladas ? "fx-neg" : ""}">${z(o.mes_canceladas)}</td>
      <td class="num">${pct0(o.conectividade)}</td><td class="fx-mcel">${S.fx.barraMeta(o, o.frac ?? frac, nivel === "p")}</td>
      <td class="num">${o.meta_chip ? `${nf.format(o.mes_chip_mp)}<small class="mut">/${nf.format(o.meta_chip)}</small>` : z(o.mes_chip_mp)}</td><td>${S.fx.pilula(o.ritmo)}</td>
      <td class="num">${fpdCel(o)}</td>${VV ? `<td class="num">${o.ticket ? brl(o.ticket) : z(0)}</td>` : ""}
      <td>${nivel === "p" ? semVender(o) : o.sem_venda_2d ? `<span class="eq-sv alerta" title="Vendedores sem vender há 2 dias ou mais">${o.sem_venda_2d} parado${o.sem_venda_2d === 1 ? "" : "s"}</span>` : `<span class="eq-sv ok">todos ativos</span>`}</td>`;
  }
  function tabela(j) {
    const frac = j.mes.frac, varias = j.grupos.length > 1;
    const ord = (l) => [...l].sort((a, b) => { const x = valorOrdem(a, est.ordem), y = valorOrdem(b, est.ordem); return (est.desc ? y - x : x - y) || a.nome.localeCompare(b.nome); });
    const th = cols().map(([k, t, d]) => `<th class="${["mes_bl", "ritmo", "dias_sem_venda"].includes(k) ? "" : "num"} eq-ord ${est.ordem === k ? "on " + (est.desc ? "desc" : "asc") : ""} ${k === "mes_vendas" ? "eq-v1" : ""}" data-o="${k}" title="${esc(d)} · clique para ordenar">${esc(t)}</th>`).join("");
    const linhaP = (p) => `<tr class="fx-p ${p.mes_vendas ? "" : "zerado"}"><td class="fx-c1"><span class="fx-av">${esc(S.fx.iniciais(p.nome))}</span><span class="fx-nm">${esc(p.nome)}</span></td>${celulas(p, frac, "p")}</tr>`;
    const corpo = varias ? j.grupos.map((g, gi) => {
      const aberto = est.abertos.has(g.grupo);   // começa fechado: toque no nome para abrir
      return `<tr class="fx-g ${aberto ? "aberto" : ""}" data-g="${gi}"><td class="fx-c1"><span class="fx-chev">${S.fx.ico("chev", 14)}</span><b>${esc(g.grupo)}</b><small>${g.hc} vendedor${g.hc === 1 ? "" : "es"}${g.pessoas[0]?.cidade ? " · " + esc(g.pessoas[0].cidade) : ""}</small></td>${celulas(g, frac, "g")}</tr>${aberto ? ord(g.pessoas).map(linhaP).join("") : ""}`;
    }).join("") : ord(j.grupos[0]?.pessoas || []).map(linhaP).join("");
    const t = j.total;
    return `<div class="tab fx-tabela eq-tabela"><table><thead><tr><th class="fx-c1">Vendedor</th>${th}</tr></thead>
      <tbody>${corpo || `<tr><td colspan="${cols().length + 1}" class="mut">Nenhum vendedor ligado a esta equipe.</td></tr>`}</tbody>
      <tfoot><tr class="fx-t"><td class="fx-c1"><b>Total</b><small>${t.hc} vendedor${t.hc === 1 ? "" : "es"}</small></td>${celulas(t, frac, "t")}</tr></tfoot></table></div>`;
  }
  function cartoes(j) {
    const t = j.total, rt = t.ritmo, ativos = t.hc - t.sem_venda_2d;
    return `<div class="fx-hero eq-hero">
      <section class="fx-card fx-dia"><div class="fx-rot">Vendas no mês <span class="fx-dt">até ${br(j.dia)}</span></div>
        <div class="fx-big">${nf.format(t.mes_vendas)}</div>${deltaMes(t.mes_vendas, t.ant_vendas)}
        ${S.fx.composicao({ conectadas: t.mes_conectadas, pendentes: t.mes_vendas - t.mes_conectadas, canceladas: t.mes_canceladas })}
        <div class="fx-leg"><span><i class="c"></i>Instaladas <b>${nf.format(t.mes_conectadas)}</b></span><span><i class="p"></i>Pendentes <b>${nf.format(t.mes_vendas - t.mes_conectadas)}</b></span><span><i class="x"></i>Canceladas <b>${nf.format(t.mes_canceladas)}</b></span></div>
        <div class="fx-rodape"><span>Hoje <b>${nf.format(t.vendas)}</b></span>${VV ? `<span>Ticket <b>${t.ticket ? brl(t.ticket) : "–"}</b></span>` : `<span>Previsão <b>${nf.format(t.previsao?.vendas ?? 0)} vendas</b></span>`}</div></section>
      <section class="fx-card fx-mes"><div class="fx-rot">Banda larga × meta <span class="fx-dt">dia útil ${S.du(j.mes.uteis?.decorridos ?? j.mes.dia_mes)} de ${S.du(j.mes.uteis?.total ?? j.mes.dias_mes)}</span></div>
        <div class="fx-med">${nf.format(t.mes_bl)}${t.meta_bl ? `<small> / ${nf.format(t.meta_bl)} meta</small>` : ""}</div>${S.fx.barraMeta(t, j.mes.frac)}
        <div class="fx-leg"><span><i class="c"></i>Instalados <b>${nf.format(t.mes_bl_con)}</b></span><span><i class="p"></i>Pendentes <b>${nf.format(t.mes_bl_pend)}</b></span>${t.meta_bl ? `<span><i class="mk"></i>Esperado hoje <b>${nf.format(Math.round(j.mes.frac * t.meta_bl))}</b></span>` : ""}</div>
        <div class="fx-rodape">${rt ? `${S.fx.pilula(rt)}<span>Projeção <b>${nf.format(rt.projecao)}</b> · ${pct0(rt.pct)} da meta</span>` : `<span class="mut">Sem meta no Plano do mês</span>`}</div></section>
      <section class="fx-card"><div class="fx-rot">Qualidade das vendas</div>
        <div class="eq-duo"><div><span>Conectividade</span><b>${pct0(t.conectividade)}</b></div><div><span>Cancelamento</span><b class="${t.cancelamento > 0.15 ? "neg" : ""}">${pct0(t.cancelamento)}</b></div></div>
        <div class="eq-duo"><div><span>FPD 3 safras</span><b class="${t.fpd > REF_FPD ? "neg" : ""}">${pct1(t.fpd)}</b></div><div><span>Chips M/P</span><b>${nf.format(t.mes_chip_mp)}${t.meta_chip ? `<small>/${nf.format(t.meta_chip)}</small>` : ""}</b></div></div>
        <div class="fx-rodape"><span>FPD: safras ${br(j.fpd_safras.de).slice(3)} a ${br(j.fpd_safras.ate).slice(3)} · ref. 25%</span></div></section>
      <section class="fx-card"><div class="fx-rot">Equipe ativa</div>
        <div class="fx-med">${nf.format(ativos)}<small> de ${nf.format(t.hc)} vendendo</small></div>
        <div class="mut">${t.sem_venda_2d ? `<b class="neg">${t.sem_venda_2d}</b> sem vender há 2 dias ou mais` : "Todos venderam nos últimos 2 dias"}</div>
        <div class="fx-rodape"><span>Abaixo do ritmo <b>${j.destaques.abaixo_ritmo}</b></span><span>Sem venda hoje <b>${j.destaques.sem_venda.length}</b></span></div></section></div>`;
  }
  function atencao(j) {
    const ps = [...new Map(j.grupos.flatMap((g) => g.pessoas).map((p) => [p.id, p])).values()];
    const parados = ps.filter((p) => p.dias_sem_venda == null || p.dias_sem_venda >= 2).sort((a, b) => (b.dias_sem_venda ?? 999) - (a.dias_sem_venda ?? 999));
    const abaixo = ps.filter((p) => p.ritmo?.status === "ruim").sort((a, b) => a.ritmo.pct - b.ritmo.pct);
    const fpdAlto = ps.filter((p) => p.fpd != null && p.fpd > REF_FPD && p.fpd_resolvidas >= 5).sort((a, b) => b.fpd - a.fpd);
    const bloco = (tit, l, f) => `<div class="eq-at"><div class="fx-sub-t">${esc(tit)} <b>${l.length}</b></div>${l.length ? `<ul>${l.slice(0, 8).map((p) => `<li><span>${esc(p.nome)}</span>${f(p)}</li>`).join("")}${l.length > 8 ? `<li class="mut">+${l.length - 8}</li>` : ""}</ul>` : `<p class="mut">Ninguém.</p>`}</div>`;
    return painel("Pontos de atenção", `<div class="eq-ats">${bloco("Parados há 2+ dias", parados, semVender)}${bloco("Abaixo do ritmo da meta", abaixo, (p) => `<span class="mut">${p.mes_bl}/${p.meta_bl} BL · proj. ${p.ritmo.projecao}</span>`)}${bloco("FPD acima de 25%", fpdAlto, (p) => fpdCel(p))}</div>`,
      "Quem precisa de acompanhamento esta semana. FPD só para quem tem 5+ faturas resolvidas.");
  }

  async function excel(j) {
    const N = (v, s = "", f = "_int") => ({ v: +v || 0, s: (+v ? s : s === "" ? "z" : s) + f });
    const linha = (o, nome, s) => [{ v: nome, s: s || "" }, N(o.mes_vendas, s || "b"), N(o.ant_vendas, s), N(o.vendas, s), N(o.mes_conectadas, s), N(o.mes_vendas - o.mes_conectadas, s), N(o.mes_canceladas, s),
      o.conectividade == null ? { v: "", s } : { v: o.conectividade, s: (s || "") + "_pct" }, N(o.mes_bl, s), o.meta_bl == null ? { v: "", s } : N(o.meta_bl, s), N(o.mes_chip_mp, s),
      o.ritmo ? { v: S.fx.RITMO[o.ritmo.status], s: s === "t" ? "t" : o.ritmo.status } : { v: "", s }, o.fpd == null ? { v: "", s } : { v: o.fpd, s: (s || "") + "_pct" }, o.ticket ? N(o.ticket, s, "_brl") : { v: "", s },
      { v: o.ultima_venda ? br(o.ultima_venda) : "", s }];
    const L = [[{ v: "", s: "" }, { v: `Visão da equipe · ${mesRot(j.competencia)}`, s: "titulo" }], [{ v: "" }, { v: `Até ${br(j.dia)} · FPD das safras ${br(j.fpd_safras.de).slice(3)} a ${br(j.fpd_safras.ate).slice(3)}`, s: "sub" }], []];
    L.push(["Vendedor", "Vendas no mês", "Mês anterior", "Hoje", "Instaladas", "Pendentes", "Canceladas", "Conectividade", "BL no mês", "Meta BL", "Chips M/P", "Ritmo", "FPD 3 safras", "Ticket médio", "Última venda"].map((v) => ({ v, s: "h" })));
    const rc = L.length;
    for (const g of j.grupos) { if (j.grupos.length > 1) L.push(linha(g, g.grupo, "g")); for (const p of g.pessoas) L.push(linha(p, (j.grupos.length > 1 ? "    " : "") + p.nome, "")); }
    L.push(linha(j.total, "TOTAL", "t"));
    const logo = await XLSX7.png((window.NORTE_CFG || {}).logo || "logo.png", 36);
    if (!VV) L.forEach((l) => l.length > 13 && l.splice(13, 1));
    XLSX7.baixar(`Equipe_${j.competencia}.xlsx`, [{ nome: "Equipe", linhas: L, larguras: [34, 13, 15, 8, 11, 10, 11, 12, 10, 9, 10, 11, 12, 12, 13], mesclar: ["B1:L1", "B2:L2"], congelar: { linha: rc, coluna: 1 }, alturas: { 0: 30 },
      imagem: logo ? { ...logo, coluna: 0, linha: 0, dx: 4 * 9525, dy: 4 * 9525 } : null }], { titulo: "Visão da equipe" });
  }

  S.PAGES.equipe = async (el) => {
    const u = S.sessao.usuario, coord = u.perfil === "coordenador", gestor = u.perfil === "gestor";
    const titulo = gestor ? "Visão das equipes" : coord ? "Visão da coordenação" : "Visão da equipe";
    const migalha = gestor ? "Painel" : coord ? "Minha coordenação" : "Minha equipe";
    const q = new URLSearchParams({ ...(est.mes ? { mes: est.mes } : {}), ...(est.equipe ? { equipe: est.equipe } : {}) });
    const j = await api("/painel-equipe?" + q);
    VV = j.permissoes?.valores !== false;
    est.mes = j.competencia;
    const hojeMes = new Date().toISOString().slice(0, 7), meses = [];
    for (let i = 0; i < 12; i++) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); meses.push(d.toISOString().slice(0, 7)); }
    if (!meses.includes(est.mes)) meses.push(est.mes);
    if (!j.total.hc && !j.total.mes_vendas) {
      el.innerHTML = `<div class="cab"><div><div class="migalha">${migalha}</div><h1>${titulo}</h1></div></div><div class="aviso">Ainda não há vendedores ou vendas para mostrar. Se você acabou de receber este acesso, peça ao gerente para ligar você às equipes em <b>Usuários e acessos → Equipes</b>.</div>`;
      return;
    }
    const serie = j.serie;
    const graf = painel("Vendas por dia (14 dias)", CH.empilhadas({ cats: serie.map((d) => d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7)), rotuloY: "Vendas", titulo: "Vendas por dia", altura: 240,
      series: [{ nome: "Instaladas", cor: CH.COR.ok, valores: serie.map((d) => d.conectadas) }, { nome: "Pendentes", cor: CH.COR.base, valores: serie.map((d) => d.pendentes) }, { nome: "Canceladas", cor: CH.COR.ruim, valores: serie.map((d) => d.canceladas) }] }),
      "Pela data da venda, na situação de hoje.");
    el.innerHTML = `<div class="cab"><div><div class="migalha">${migalha}</div><h1>${titulo}</h1><div class="fx-subt">${mesRot(j.competencia)}${j.competencia === hojeMes ? ` · até hoje (${br(j.dia)})` : " · mês fechado"} · comparado com ${br(j.mes_anterior.de)} a ${br(j.mes_anterior.ate)}</div></div>
        <div class="acoes"><div class="campo" style="width:150px"><label>Mês</label><select id="ms">${meses.sort().reverse().map((m) => `<option value="${m}" ${m === est.mes ? "selected" : ""}>${mesRot(m)}</option>`).join("")}</select></div>
          ${gestor ? `<div class="campo" style="width:190px"><label>Equipe</label><select id="eq"><option value="">Todas</option>${j.equipes.map((e) => `<option value="${e.id}" ${String(e.id) === String(est.equipe) ? "selected" : ""}>${esc(e.nome)}</option>`).join("")}</select></div>` : ""}
          <button class="btn sec" id="xl" style="align-self:flex-end">${S.fx.ico("xls")} Excel</button></div></div>
      ${cartoes(j)}
      ${S.ui.previsao(j.total, { titulo: "Previsão de BL da equipe" })}
      <section class="painel"><h2><span>Vendedores</span><small>clique no título da coluna para ordenar</small></h2>${tabela(j)}
        <div class="nota">Vendas no mês = válidas (sem as canceladas). Mês ant. = mesmo período do mês anterior. FPD 3m = primeira fatura não paga no prazo nas 3 últimas safras fechadas.</div></section>
      <div class="grade fx-dupla">${graf}${atencao(j)}</div>`;
    const go = () => S.PAGES.equipe(el).catch(S.erroEm(el));
    el.querySelector("#ms").addEventListener("change", (e) => { est.mes = e.target.value; go(); });
    el.querySelector("#eq")?.addEventListener("change", (e) => { est.equipe = e.target.value; go(); });
    el.querySelector("#xl").addEventListener("click", () => excel(j).catch((e) => alert(e.message)));
    const repinta = () => { el.querySelector(".eq-tabela").outerHTML = tabela(j); liga(); };
    const liga = () => {
      el.querySelectorAll(".eq-ord").forEach((th) => th.addEventListener("click", () => { const k = th.dataset.o; if (est.ordem === k) est.desc = !est.desc; else { est.ordem = k; est.desc = k !== "dias_sem_venda"; } repinta(); }));
      el.querySelectorAll(".fx-g[data-g]").forEach((tr) => tr.addEventListener("click", () => { const g = j.grupos[+tr.dataset.g].grupo; est.abertos.has(g) ? est.abertos.delete(g) : est.abertos.add(g); repinta(); }));
    };
    liga();
  };
})();
