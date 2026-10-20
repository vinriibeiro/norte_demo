"use strict";
/* Operação: Produtividade dos agentes (o Fechamento do dia fica em pg_fechamento.js).
   Departamentos: Backoffice, Gerente e Administrador. */
(() => {
  const { esc, nf, api, painel, tabela, brl, pct } = S;
  const kpi = S.kpi;
  const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const somaDias = (d, n) => new Date(new Date(d + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
  const br = (d) => d.split("-").reverse().join("/");
  const SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  const diaSemana = (d) => SEMANA[new Date(d + "T12:00:00Z").getUTCDay()];
  const permitido = () => ["gestor", "backoffice"].includes(S.sessao.usuario.perfil);
  const semAcesso = (el) => { el.innerHTML = `<div class="aviso erro">Esta tela é dos departamentos Backoffice, Gerente e Administrador.</div>`; };

  /* =================== PRODUTIVIDADE =================== */
  const pr = { de: null, ate: null, vendedor: "", equipe: "", atalho: "hoje", verSem: false };
  function atalho(k) {
    const h = hoje(), ini = h.slice(0, 8) + "01";
    const mesPassadoFim = somaDias(ini, -1), mesPassadoIni = mesPassadoFim.slice(0, 8) + "01";
    return { hoje: [h, h], ontem: [somaDias(h, -1), somaDias(h, -1)], d7: [somaDias(h, -6), h], mes: [ini, h], mespassado: [mesPassadoIni, mesPassadoFim] }[k];
  }
  const ATALHOS = [["hoje", "Hoje"], ["ontem", "Ontem"], ["d7", "7 dias"], ["mes", "Este mês"], ["mespassado", "Mês passado"]];

  function csvProdutividade(j) {
    const cab = ["Agente", "Equipe", "Vendas", "Válidas", "Instaladas", "Pendentes", "Canceladas", "Aproveitamento %", "Banda larga", "TV", "Móvel", "Fone", "Dias com venda", "Média por dia", ...(S.sessao.usuario.perfil === "gestor" ? ["Ticket médio (R$)", "Valor (R$)"] : [])];
    const c = (v) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const n2 = (v) => (v == null ? "" : String(v).replace(".", ","));
    const linhas = j.agentes.map((a) => [a.nome, a.equipe || "", a.vendas, a.validas, a.ativas, a.pendentes, a.canceladas, a.aproveitamento == null ? "" : n2((a.aproveitamento * 100).toFixed(1)), a.bl, a.tv, a.movel, a.fone, a.dias, n2(a.media_dia), ...(S.sessao.usuario.perfil === "gestor" ? [n2(a.ticket), n2(a.valor)] : [])].map(c).join(";"));
    const blob = new Blob(["﻿" + [cab.join(";"), ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `produtividade_${j.de}_a_${j.ate}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  S.PAGES.produtividade = async (el) => {
    if (!permitido()) return semAcesso(el);
    if (!pr.de) [pr.de, pr.ate] = atalho(pr.atalho);
    const q = new URLSearchParams({ de: pr.de, ate: pr.ate, vendedor: pr.vendedor, equipe: pr.equipe });
    const j = await api("/produtividade?" + q);
    const t = j.total, um = !!pr.vendedor, periodo = j.de === j.ate ? `${diaSemana(j.de)} ${br(j.de)}` : `${br(j.de)} a ${br(j.ate)}`;
    const ativos = j.agentes.filter((a) => a.vendas), semVenda = j.agentes.filter((a) => !a.vendas);
    const aprov = t.vendas ? t.ativas / t.vendas : null;
    const opt = (lista, v) => lista.map((x) => `<option value="${x.id}" ${String(x.id) === String(v) ? "selected" : ""}>${esc(x.nome)}</option>`).join("");
    const grafDia = j.por_dia.length > 1 ? painel("Vendas por dia", CH.empilhadas({ cats: j.por_dia.map((d) => d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7)), rotuloY: "Vendas", titulo: "Vendas por dia",
      series: [{ nome: "Instaladas", cor: CH.COR.ok, valores: j.por_dia.map((d) => d.ativas) }, { nome: "Pendentes", cor: CH.COR.azul, valores: j.por_dia.map((d) => d.pendentes) }, { nome: "Canceladas", cor: CH.COR.ruim, valores: j.por_dia.map((d) => d.canceladas) }] })) : "";
    const grafSit = um && t.vendas ? painel("Situação das vendas", CH.rosca({ centro: "vendas", altura: 230, titulo: "Situação das vendas", partes: [{ rot: "Instaladas", y: t.ativas, cor: CH.COR.ok }, { rot: "Pendentes", y: t.pendentes, cor: CH.COR.azul }, { rot: "Canceladas", y: t.canceladas, cor: CH.COR.ruim }] })) : "";
    const grafRank = um ? grafSit : ativos.length ? painel("Ranking de vendas válidas", CH.barrasH({ dados: ativos.slice(0, 15).map((a) => ({ rot: a.nome, y: a.validas })), rotuloX: "Vendas válidas", titulo: "Ranking de vendas válidas" }), ativos.length > 15 ? `Mostrando os 15 primeiros de ${ativos.length}.` : "") : "";
    el.innerHTML = `<div class="cab"><div><div class="migalha">Operação</div><h1>Produtividade dos agentes</h1></div><div class="acoes"><button class="btn sec" id="ex">Exportar CSV</button></div></div>
      <div class="filtros">
        <div class="campo" style="width:auto"><label>Período</label><div class="seg" id="at">${ATALHOS.map(([k, n]) => `<button data-a="${k}" class="${pr.atalho === k ? "on" : ""}">${n}</button>`).join("")}</div></div>
        <div class="campo" style="width:140px"><label>De</label><input type="date" id="fd" value="${pr.de}"></div>
        <div class="campo" style="width:140px"><label>Até</label><input type="date" id="fa" value="${pr.ate}"></div>
        <div class="campo" style="width:210px"><label>Agente</label><select id="fv"><option value="">Todos os agentes</option>${opt(j.vendedores, pr.vendedor)}</select></div>
        <div class="campo" style="width:170px"><label>Equipe</label><select id="fq"><option value="">Todas</option>${opt(j.equipes, pr.equipe)}</select></div>
        <button class="btn" id="ok">Filtrar</button>${pr.vendedor || pr.equipe ? `<button class="btn sec" id="lp">Limpar</button>` : ""}
      </div>
      <div class="kpis">${kpi("Vendas válidas", nf.format(t.validas), periodo)}${kpi("Instaladas", nf.format(t.ativas), aprov == null ? "" : `aproveitamento ${pct(aprov)}`)}
        ${kpi("Canceladas", nf.format(t.canceladas), t.vendas ? `${pct(t.canceladas / t.vendas)} das vendas` : "")}${kpi("Banda larga", nf.format(t.bl), `TV ${t.tv} · Móvel ${t.movel}`)}
        ${um && S.sessao.usuario.perfil === "gestor" ? kpi("Ticket médio", t.validas ? brl(t.valor / t.validas) : "–", `${brl(t.valor)} no período`) : kpi("Agentes que venderam", `${nf.format(t.com_venda)} <small class="mut">de ${nf.format(t.agentes)}</small>`, t.com_venda ? `média ${(t.validas / t.com_venda).toFixed(1).replace(".", ",")} por agente` : "")}</div>
      ${grafDia || grafRank ? `<div class="grade ${grafDia && grafRank ? "g2" : ""}">${grafDia}${grafRank}</div>` : ""}
      ${painel(um ? "Resultado do agente" : "Resultado por agente", tabela([
        { t: "Agente", f: (a) => `<a href="#" data-v="${a.id}"><b>${esc(a.nome)}</b></a>${a.inativo ? ` <span class="tag">inativo</span>` : ""}` }, { t: "Equipe", f: (a) => esc(a.equipe || "–") },
        { t: "Vendas", n: 1, k: "vendas" }, { t: "Instaladas", n: 1, k: "ativas" }, { t: "Pend.", n: 1, k: "pendentes" }, { t: "Canc.", n: 1, k: "canceladas" },
        { t: "Aproveit.", n: 1, f: (a) => (a.aproveitamento == null ? "–" : pct(a.aproveitamento)) }, { t: "BL", n: 1, k: "bl" }, { t: "TV", n: 1, k: "tv" }, { t: "Móvel", n: 1, k: "movel" },
        { t: "Dias c/ venda", n: 1, k: "dias" }, { t: "Média/dia", n: 1, f: (a) => String(a.media_dia).replace(".", ",") }, ...(S.sessao.usuario.perfil === "gestor" ? [{ t: "Ticket", n: 1, f: (a) => (a.ticket == null ? "–" : brl(a.ticket)) }] : [])], ativos),
        "Aproveitamento = vendas instaladas ÷ vendas do período. Clique no nome para ver as vendas do agente.", um ? "" : `${ativos.length} agente(s) com venda`)}
      ${!um && semVenda.length ? painel(`Sem venda no período (${semVenda.length})`, pr.verSem ? `<div class="sem-venda">${semVenda.map((a) => `<span class="tag">${esc(a.nome)}${a.equipe ? " · " + esc(a.equipe) : ""}</span>`).join(" ")}</div>` : `<button class="btn sec pq" id="vs">Mostrar a lista</button>`, "Agentes ativos com função de vendedor que não registraram venda nas datas escolhidas.") : ""}
      ${um && j.detalhe ? painel(`Vendas de ${ativos[0]?.nome || j.agentes[0]?.nome || ""}`, tabela([
        { t: "Data", f: (k) => S.dt(k.data_venda) }, { t: "Contrato", f: (k) => `<a href="#/venda/${k.id}">${esc(k.numero_contrato || "–")}</a>` }, { t: "Cliente", f: (k) => esc(k.cliente) },
        { t: "Situação", f: (k) => `<span class="tag ${k.status_venda === "ATIVO" ? "ok" : k.status_venda === "CANCELADO" ? "ruim" : "alerta"}">${esc({ ATIVO: "INSTALADA", PENDENTE: "PENDENTE", CANCELADO: "CANCELADA" }[k.status_venda] || k.status_venda)}</span>` },
        { t: "Produtos", f: (k) => esc(k.produtos || "–") }, { t: "Cidade", f: (k) => esc(k.cidade || "–") }, { t: "Instalação", f: (k) => S.dt(k.data_agendamento) }, { t: "Pacote", n: 1, f: (k) => brl(k.pacote_valor) }], j.detalhe)) : ""}`;
    const go = () => S.PAGES.produtividade(el).catch(S.erroEm(el));
    el.querySelector("#at").addEventListener("click", (e) => { const k = e.target.dataset.a; if (!k) return; pr.atalho = k; [pr.de, pr.ate] = atalho(k); go(); });
    el.querySelector("#ok").addEventListener("click", () => { pr.de = el.querySelector("#fd").value || pr.de; pr.ate = el.querySelector("#fa").value || pr.de; pr.vendedor = el.querySelector("#fv").value; pr.equipe = el.querySelector("#fq").value; pr.atalho = ""; go(); });
    ["#fv", "#fq"].forEach((s) => el.querySelector(s).addEventListener("change", () => el.querySelector("#ok").click()));
    el.querySelector("#lp")?.addEventListener("click", () => { pr.vendedor = ""; pr.equipe = ""; go(); });
    el.querySelector("#vs")?.addEventListener("click", () => { pr.verSem = true; go(); });
    el.querySelector("#ex").addEventListener("click", () => csvProdutividade(j));
    el.querySelectorAll("[data-v]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); pr.vendedor = a.dataset.v; go(); }));
  };
})();
