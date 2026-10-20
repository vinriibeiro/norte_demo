"use strict";
/* Operação → Fechamento do dia.
   Uma tela só, lida de cima para baixo: resumo do dia → mix de produtos → resultado por equipe/vendedor (com meta do mês) → últimos 14 dias e destaques.
   Exporta PDF (com logo, pronto para imprimir/mandar), Excel (.xlsx com logo, 3 abas) e texto para os grupos do WhatsApp.
   Departamentos: Backoffice, Gerente e Administrador. */
(() => {
  const { esc, nf, api, brl } = S;
  const CFG = window.NORTE_CFG || {};
  const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const somaDias = (d, n) => new Date(new Date(d + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
  const br = (d) => d.split("-").reverse().join("/");
  const SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  const SEMANA_LONGA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const dsem = (d) => new Date(d + "T12:00:00Z").getUTCDay();
  const diaSemana = (d) => SEMANA[dsem(d)];
  const porExtenso = (d) => { const [a, m, dd] = d.split("-").map(Number); return `${SEMANA_LONGA[dsem(d)]}, ${dd} de ${MESES[m - 1]} de ${a}`; };
  const permitido = () => ["gestor", "backoffice"].includes(S.sessao.usuario.perfil);
  const brl0 = (x) => Number(x || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const pct0 = (x) => (x == null || !isFinite(x) ? "–" : Math.round(x * 100) + "%");
  const z = (n, f = (v) => nf.format(v)) => (n ? f(n) : `<span class="fx-z">–</span>`);
  const plural = (n, s, p) => `${nf.format(n)} ${n === 1 ? s : p || s + "s"}`;
  const iniciais = (n) => String(n || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const RITMO = { ok: "No ritmo", alerta: "Atenção", ruim: "Abaixo" };

  const IC = {
    pdf: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h4"/>',
    xls: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 9.5h16M4 15h16M10 4v16"/>',
    msg: '<path d="M20 11.5a8 8 0 01-11.7 7.1L4 20l1.4-4.1A8 8 0 1120 11.5z"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>', dn: '<path d="M12 5v14M6 13l6 6 6-6"/>', eq: '<path d="M5 12h14"/>',
    chev: '<path d="M9 6l6 6-6 6"/>', star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"/>',
    zz: '<circle cx="12" cy="12" r="8.5"/><path d="M9 10h6l-6 5h6"/>', alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.3"/>',
  };
  const ico = (k, s = 16) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;

  const fe = { dia: null, agrupar: "equipe", equipe: "", cidade: "", vendedor: "", zerados: true, abertos: new Set(),
    itens: { produtos: true, instalacoes: true, mes: true, pessoas: true, canceladas: true } };

  /* ---------- peças visuais ---------- */
  function variacao(atual, ant) {
    if (ant == null) return "";
    const d = atual - ant, cls = d > 0 ? "up" : d < 0 ? "dn" : "eq";
    const txt = d === 0 ? "igual a ontem" : `${d > 0 ? "+" : "−"}${nf.format(Math.abs(d))} vs ontem${ant ? ` (${d > 0 ? "+" : "−"}${Math.round(Math.abs(d) / ant * 100)}%)` : ""}`;
    return `<span class="fx-delta ${cls}">${ico(cls, 13)}${txt}</span>`;
  }
  /** Barra empilhada instaladas / pendentes / canceladas */
  function composicao(o) {
    const tot = o.conectadas + o.pendentes + o.canceladas;
    if (!tot) return `<div class="fx-comp vazio"></div>`;
    const w = (n) => (n / tot * 100).toFixed(2) + "%";
    return `<div class="fx-comp" role="img" aria-label="${o.conectadas} instaladas, ${o.pendentes} pendentes, ${o.canceladas} canceladas">
      ${o.conectadas ? `<i class="c" style="width:${w(o.conectadas)}"></i>` : ""}${o.pendentes ? `<i class="p" style="width:${w(o.pendentes)}"></i>` : ""}${o.canceladas ? `<i class="x" style="width:${w(o.canceladas)}"></i>` : ""}</div>`;
  }
  /** Anel de progresso (SVG) */
  function anel(v, tot, tam = 64) {
    const r = tam / 2 - 6, c = 2 * Math.PI * r, f = tot ? Math.min(v / tot, 1) : 0;
    return `<svg class="fx-anel" viewBox="0 0 ${tam} ${tam}" width="${tam}" height="${tam}" aria-hidden="true"><circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" class="tr"/>
      ${f > 0 ? `<circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" class="vl" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${tam / 2} ${tam / 2})"/>` : ""}
      <text x="50%" y="50%" dy=".35em" text-anchor="middle">${tot ? Math.round(f * 100) + "%" : "–"}</text></svg>`;
  }
  /** Meta de BL do mês: conectado (cheio) + pendente (listrado) e a marca de onde deveria estar hoje */
  function barraMeta(o, frac, compacta) {
    if (!o.meta_bl) return `<span class="fx-z">sem meta</span>`;
    const m = Math.max(o.meta_bl, o.mes_bl_con + o.mes_bl_pend, 1);
    const wc = (o.mes_bl_con / m * 100).toFixed(1), wp = (o.mes_bl_pend / m * 100).toFixed(1), mk = (Math.min(frac * o.meta_bl / m, 1) * 100).toFixed(1);
    const tit = `${o.mes_bl_con} BL instalados + ${o.mes_bl_pend} pendentes de ${o.meta_bl} da meta. A marca mostra onde deveria estar hoje (${Math.round(frac * o.meta_bl)}).`;
    return `<div class="fx-meta ${compacta ? "pq" : ""}" title="${esc(tit)}"><div class="fx-bar"><i class="c" style="width:${wc}%"></i><i class="p" style="width:${wp}%"></i><b style="left:${mk}%"></b></div>
      <span class="fx-meta-n"><b>${nf.format(o.mes_bl_con + o.mes_bl_pend)}</b><small>/${nf.format(o.meta_bl)}</small></span></div>`;
  }
  const pilula = (rt) => (rt ? `<span class="fx-pill ${rt.status}" title="Projeção para o fim do mês: ${nf.format(rt.projecao)} BL (${pct0(rt.pct)} da meta)">${RITMO[rt.status]}</span>` : `<span class="fx-z">–</span>`);

  /* ---------- tabela principal ---------- */
  const COLS = 16;
  const fpdTd = (o) => (o.fpd == null ? `<span class="fx-z" title="Sem faturas resolvidas nas 3 safras">–</span>` : `<span class="eq-fpd ${o.fpd > 0.25 ? "ruim" : o.fpd > 0.2 ? "alerta" : "ok"}" title="${o.fpd_nao_ok} de ${o.fpd_resolvidas} primeiras faturas não pagas no prazo (3 últimas safras)">${(o.fpd * 100).toFixed(1).replace(".", ",")}%</span>`);
  function linhaNums(o, frac, nivel) {
    const tk = o.vendas ? o.v_total / o.vendas : 0;
    return `<td class="num fx-forte">${z(o.vendas)}</td><td class="num">${z(o.conectadas)}</td><td class="num">${z(o.pendentes)}</td><td class="num ${o.canceladas ? "fx-neg" : ""}">${z(o.canceladas)}</td>
      ${VV ? `<td class="num fx-sep-d" title="${o.vendas ? "Ticket médio " + brl(tk) : ""}">${z(o.v_total, brl0)}</td>` : ""}
      <td class="num">${z(o.bl)}</td><td class="num">${z(o.tv)}</td><td class="num">${z(o.chip_nova)}</td><td class="num">${z(o.chip_mig)}</td><td class="num">${z(o.chip_port)}</td><td class="num fx-sep-d">${z(o.dcc)}</td>
      <td class="num">${z(o.mes_vendas)}</td><td class="fx-mcel">${barraMeta(o, frac, nivel === "p")}</td>
      <td class="num">${o.meta_chip ? `${nf.format(o.mes_chip_mp)}<small class="mut">/${nf.format(o.meta_chip)}</small>` : z(o.mes_chip_mp)}</td><td>${pilula(o.ritmo)}</td><td class="num">${fpdTd(o)}</td>`;
  }
  let VV = true;   // vê valores em R$ (só gerente/administrador)
  function tabelaResultado(j) {
    const frac = j.mes.frac, porPessoa = j.agrupar !== "vendedor";
    const cab = `<thead><tr class="fx-gh"><th></th><th colspan="${VV ? 5 : 4}">Vendas do dia</th><th colspan="6">Produtos do dia</th><th colspan="5">Mês até hoje · meta · qualidade</th></tr>
      <tr><th class="fx-c1">${esc(j.rotulo)}${porPessoa ? " / vendedor" : ""}</th><th class="num" title="Vendas válidas (sem as canceladas)">Vendas</th><th class="num">Conect.</th><th class="num">Pend.</th><th class="num">Canc.</th>${VV ? `<th class="num fx-sep-d" title="Valor dos pacotes vendidos (passe o mouse para ver o ticket)">Valor</th>` : ""}
      <th class="num">BL</th><th class="num">TV</th><th class="num" title="Chip linha nova">Chip novo</th><th class="num" title="Chip migração">Migr.</th><th class="num" title="Chip portabilidade">Port.</th><th class="num fx-sep-d" title="Débito em conta">DCC</th>
      <th class="num">Vendas</th><th title="BL no mês (instalado + pendente) x meta">BL × meta</th><th class="num" title="Chips de migração/portabilidade no mês x meta">Chips M/P</th><th>Ritmo</th><th class="num" title="FPD: primeira fatura não paga no prazo, nas 3 últimas safras fechadas (referência 25%)">FPD 3m</th></tr></thead>`;
    const corpo = j.grupos.map((g, gi) => {
      const pessoas = fe.zerados ? g.pessoas : g.pessoas.filter((p) => p.vendas || p.canceladas || p.mes_vendas);
      const aberto = porPessoa && (fe.abertos.has(g.grupo) || j.grupos.length === 1);   // começa fechado: toque no nome para abrir
      const cidade = j.agrupar === "equipe" ? (g.pessoas.find((p) => p.cidade)?.cidade || "") : "";
      const info = [cidade, porPessoa ? plural(g.hc, "vendedor", "vendedores") : "", porPessoa && g.sem_venda ? `${g.sem_venda} sem venda hoje` : ""].filter(Boolean).join(" · ");
      const cab = `<tr class="fx-g ${aberto ? "aberto" : ""}" ${porPessoa ? `data-g="${gi}"` : ""}><td class="fx-c1"><div class="fx-gn ${porPessoa ? "" : "sem-seta"}">${porPessoa ? `<span class="fx-chev">${ico("chev", 14)}</span>` : ""}<div class="fx-gt"><b>${esc(g.grupo)}</b>${info ? `<small>${esc(info)}</small>` : ""}</div></div></td>${linhaNums(g, frac, "g")}</tr>`;
      if (!aberto) return cab;
      return cab + pessoas.map((p) => `<tr class="fx-p ${p.vendas ? "" : "zerado"}"><td class="fx-c1"><span class="fx-av">${esc(iniciais(p.nome))}</span><span class="fx-nm">${esc(p.nome)}${j.agrupar !== "cidade" && j.agrupar !== "equipe" && p.equipe ? `<small>${esc(p.equipe)}</small>` : ""}</span></td>${linhaNums(p, frac, "p")}</tr>`).join("");
    }).join("");
    const t = j.total;
    const rod = `<tfoot><tr class="fx-t"><td class="fx-c1"><b>Total</b><small>${plural(t.hc, "vendedor", "vendedores")} · ${nf.format(t.com_venda)} venderam hoje</small></td>${linhaNums(t, frac, "t")}</tr></tfoot>`;
    return `<div class="tab fx-tabela"><table>${cab}<tbody>${corpo || `<tr><td colspan="${COLS + 1}" class="mut">Nenhuma venda nem vendedor com esses filtros.</td></tr>`}</tbody>${rod}</table></div>`;
  }

  /* ---------- resumo (topo) ---------- */
  function resumo(j) {
    const t = j.total, tk = t.vendas ? t.v_total / t.vendas : 0, abertas = t.agendadas - t.instaladas;
    const rt = t.ritmo;
    return `<div class="fx-hero">
      <section class="fx-card fx-dia">
        <div class="fx-rot">Vendas do dia <span class="fx-dt">${diaSemana(j.dia)} ${br(j.dia)}</span></div>
        <div class="fx-big">${nf.format(t.vendas)}</div>
        ${variacao(t.vendas, t.ontem)}
        ${composicao(t)}
        <div class="fx-leg"><span><i class="c"></i>Instaladas <b>${nf.format(t.conectadas)}</b></span><span><i class="p"></i>Pendentes <b>${nf.format(t.pendentes)}</b></span><span><i class="x"></i>Canceladas <b>${nf.format(t.canceladas)}</b></span></div>
        <div class="fx-rodape">${VV ? `<span>Vendido <b>${brl(t.v_total)}</b></span><span>Ticket médio <b>${tk ? brl(tk) : "–"}</b></span>` : `<span>Ontem <b>${nf.format(t.ontem)}</b></span><span>No mês <b>${nf.format(t.mes_vendas)}</b></span>`}</div>
      </section>
      <section class="fx-card fx-inst">
        <div class="fx-rot">Instalações do dia</div>
        <div class="fx-inst-c">${anel(t.instaladas, t.agendadas)}<div><div class="fx-med">${nf.format(t.instaladas)}<small> de ${nf.format(t.agendadas)}</small></div><div class="mut">instaladas das agendadas</div></div></div>
        <div class="fx-rodape"><span>${abertas > 0 ? `<b>${nf.format(abertas)}</b> ainda ${abertas === 1 ? "aberta" : "abertas"}` : t.agendadas ? "Todas instaladas" : "Nada agendado"}</span></div>
      </section>
      <section class="fx-card fx-canc ${t.canceladas ? "tem" : ""}">
        <div class="fx-rot">Canceladas no dia</div>
        <div class="fx-med">${nf.format(t.canceladas)}</div>
        <div class="mut">${t.canceladas ? (VV ? `${brl(t.v_perdido)} em pacotes perdidos` : "vendas canceladas hoje") : "Nenhum cancelamento hoje"}</div>
        <div class="fx-rodape"><span>No mês: <b>${nf.format(t.mes_canceladas)}</b> (${pct0(t.mes_canceladas / ((t.mes_vendas + t.mes_canceladas) || 1))} das vendas)</span></div>
      </section>
      <section class="fx-card fx-mes">
        <div class="fx-rot">Banda larga no mês <span class="fx-dt">dia útil ${S.du(j.mes.uteis?.decorridos ?? j.mes.dia_mes)} de ${S.du(j.mes.uteis?.total ?? j.mes.dias_mes)}</span></div>
        <div class="fx-med">${nf.format(t.mes_bl)}${t.meta_bl ? `<small> / ${nf.format(t.meta_bl)} meta</small>` : ""}</div>
        ${barraMeta(t, j.mes.frac)}
        <div class="fx-leg"><span><i class="c"></i>Instalados <b>${nf.format(t.mes_bl_con)}</b></span><span><i class="p"></i>Pendentes <b>${nf.format(t.mes_bl_pend)}</b></span>${t.meta_bl ? `<span><i class="mk"></i>Esperado hoje <b>${nf.format(Math.round(j.mes.frac * t.meta_bl))}</b></span>` : ""}</div>
        <div class="fx-rodape">${rt ? `${pilula(rt)}<span>Projeção <b>${nf.format(rt.projecao)} BL</b> · ${pct0(rt.pct)} da meta</span>` : `<span class="mut">Defina a meta em Premiação → Plano do mês</span>`}</div>
      </section>
    </div>`;
  }
  function mix(t) {
    const it = [["BL", t.bl, "Banda larga"], ["TV", t.tv, "TV"], ["Chip novo", t.chip_nova, "Chip linha nova"], ["Migração", t.chip_mig, "Chip migração"], ["Portab.", t.chip_port, "Chip portabilidade"],
      ["Multi", t.multi, "Acesso Fibra Mult"], ["DCC", t.dcc, "Débito em conta"], ["APT", t.apt, "Apartamento (MDU)"], ["Sistema C", t.netsales, "Finalizado no Sistema C"], ["Sistema B", t.solar, "Finalizado no Sistema B"]];
    if (t.fone) it.splice(5, 0, ["Fone", t.fone, "Fone fixo"]);
    return `<section class="fx-mix"><div class="fx-mix-t">Mix do dia</div>${it.map(([k, v, d], i) => `<div class="fx-mix-i ${v ? "" : "zero"} ${i === 4 || i === it.length - 3 ? "sep" : ""}" title="${esc(d)}"><b>${nf.format(v)}</b><span>${esc(k)}</span></div>`).join("")}</section>`;
  }
  function destaques(j) {
    const d = j.destaques, top = d.top;
    const pod = top.length ? `<ol class="fx-top">${top.map((p, i) => `<li><span class="fx-pos p${i + 1}">${i + 1}º</span><span class="fx-av">${esc(iniciais(p.nome))}</span><span class="fx-nm">${esc(p.nome)}<small>${esc(p.equipe || "")}</small></span><b>${p.vendas}<small> ${p.vendas === 1 ? "venda" : "vendas"}</small></b></li>`).join("")}</ol>` : `<p class="legenda-vazia">Ninguém vendeu neste dia.</p>`;
    const sem = d.sem_venda.length ? `<div class="fx-sem">${d.sem_venda.slice(0, 40).map((p) => `<span class="tag" title="${esc(p.equipe || "")}">${esc(p.nome)}</span>`).join("")}${d.sem_venda.length > 40 ? `<span class="mut">+${d.sem_venda.length - 40}</span>` : ""}</div>` : `<p class="mut" style="margin:4px 0 0">Todos os vendedores venderam hoje.</p>`;
    return `<section class="painel"><h2><span>Destaques do dia</span></h2><div class="corpo fx-dest">
      <div><div class="fx-sub-t">${ico("star", 14)} Quem mais vendeu</div>${pod}</div>
      <div><div class="fx-sub-t">${ico("zz", 14)} Sem venda hoje <b>${d.sem_venda.length}</b></div>${sem}</div>
      ${d.abaixo_ritmo ? `<div class="fx-alerta">${ico("alert", 15)}<span><b>${plural(d.abaixo_ritmo, "vendedor", "vendedores")}</b> abaixo do ritmo da meta de BL (projeção menor que 75% da meta).</span></div>` : ""}
    </div></section>`;
  }

  /* ---------- texto do WhatsApp ---------- */
  const ITENS = [["produtos", "Produtos"], ["instalacoes", "Instalações do dia"], ["mes", "Acumulado do mês"], ["pessoas", "Vendedores de cada grupo"], ["canceladas", "Canceladas"]];
  const linhaProdutos = (x) => { const p = [`BL: ${x.bl}`, `TV: ${x.tv}`, `Chips: ${x.movel}`]; if (x.dcc) p.push(`DCC: ${x.dcc}`); if (x.fone) p.push(`Fone: ${x.fone}`); return p.join(" | "); };
  function textoGrupo(j, g) {
    const it = fe.itens, L = [`*FECHAMENTO ${br(j.dia)} (${diaSemana(j.dia)})*`, `*${j.rotulo}: ${g.grupo}*`, `✅ Vendas do dia: *${g.vendas}*`];
    if (it.produtos) L.push(`   ${linhaProdutos(g)}`);
    if (it.canceladas && g.canceladas) L.push(`❌ Canceladas no dia: ${g.canceladas}`);
    if (it.instalacoes) L.push(`🛠️ Instalações: ${g.instaladas} de ${g.agendadas} agendada${g.agendadas === 1 ? "" : "s"}`);
    if (it.mes) L.push(`📅 Mês: ${g.mes_vendas} venda${g.mes_vendas === 1 ? "" : "s"} · ${g.mes_bl} BL${g.meta_bl ? ` de ${g.meta_bl} (${pct0(g.mes_bl / g.meta_bl)})` : ""}`);
    if (it.pessoas && g.pessoas.length && j.agrupar !== "vendedor") {
      L.push("", "*Vendedores*");
      g.pessoas.forEach((p, i) => L.push(`${i + 1}. ${p.nome} – ${p.vendas}${it.produtos && p.vendas ? ` (BL ${p.bl} · TV ${p.tv} · Chip ${p.movel})` : ""}${it.canceladas && p.canceladas ? ` · ${p.canceladas} canc.` : ""}`));
    }
    return L.join("\n");
  }
  function textoGeral(j) {
    const it = fe.itens, t = j.total, L = [`*FECHAMENTO ${br(j.dia)} (${diaSemana(j.dia)})*`, `Por ${j.rotulo.toLowerCase()}`, ""];
    const comVenda = j.grupos.filter((g) => g.vendas || g.canceladas || g.agendadas);
    if (!comVenda.length) L.push("Nenhuma venda registrada no dia.");
    comVenda.forEach((g) => L.push(`▪️ *${g.grupo}*: ${g.vendas} venda${g.vendas === 1 ? "" : "s"}${it.produtos && g.vendas ? ` (BL ${g.bl} · TV ${g.tv} · Chip ${g.movel})` : ""}${it.instalacoes && g.agendadas ? ` · inst. ${g.instaladas}/${g.agendadas}` : ""}${it.mes ? ` · mês ${g.mes_bl} BL` : ""}`));
    L.push("", `*TOTAL DO DIA: ${t.vendas} venda${t.vendas === 1 ? "" : "s"}*`);
    if (it.produtos) L.push(linhaProdutos(t));
    if (it.canceladas && t.canceladas) L.push(`❌ Canceladas: ${t.canceladas}`);
    if (it.instalacoes) L.push(`🛠️ Instalações: ${t.instaladas} de ${t.agendadas} agendadas`);
    if (it.mes) L.push(`📅 Mês: ${t.mes_vendas} vendas · ${t.mes_bl} BL${t.meta_bl ? ` de ${t.meta_bl} (${pct0(t.mes_bl / t.meta_bl)})` : ""}`);
    return L.join("\n");
  }
  async function copiar(texto, btn) {
    try { await navigator.clipboard.writeText(texto); }
    catch { const t = document.createElement("textarea"); t.value = texto; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
    if (btn) { const o = btn.innerHTML; btn.textContent = "Copiado ✓"; btn.disabled = true; setTimeout(() => { btn.innerHTML = o; btn.disabled = false; }, 1600); }
  }
  function abrirWhats(j) {
    const m = S.modal("Texto para o WhatsApp", `<div class="fx-wz">
      <div class="campo"><label>Mensagem de</label><select id="wg"><option value="">Todos os grupos (geral)</option>${j.grupos.map((g, i) => `<option value="${i}">${esc(g.grupo)}</option>`).join("")}</select></div>
      <div class="itens-msg fx-wz-it">${ITENS.map(([k, n]) => `<label class="chip ${fe.itens[k] ? "on" : ""}"><input type="checkbox" data-i="${k}" ${fe.itens[k] ? "checked" : ""}> ${n}</label>`).join("")}</div>
      <textarea class="msg-whats" id="wt" rows="16" readonly></textarea><p class="mut" style="margin:6px 0 0">Os asteriscos deixam o texto em negrito no WhatsApp.</p></div>`,
      `<button class="btn sec" id="wx">Fechar</button><button class="btn" id="wc">Copiar texto</button>`);
    m.querySelector(".caixa").classList.add("fx-modal");
    const pinta = () => { const v = m.querySelector("#wg").value; m.querySelector("#wt").value = v === "" ? textoGeral(j) : textoGrupo(j, j.grupos[+v]); };
    pinta();
    m.querySelector("#wg").addEventListener("change", pinta);
    m.querySelectorAll("[data-i]").forEach((c) => c.addEventListener("change", () => { fe.itens[c.dataset.i] = c.checked; c.closest(".chip").classList.toggle("on", c.checked); pinta(); }));
    m.querySelector("#wx").addEventListener("click", () => m.remove());
    m.querySelector("#wc").addEventListener("click", (e) => copiar(m.querySelector("#wt").value, e.currentTarget));
  }

  /* ---------- filtros em texto (para PDF/Excel) ---------- */
  function descFiltros(j) {
    const nome = (lista, id) => lista.find((x) => String(x.id) === String(id))?.nome;
    const f = j.recorte ? [`${j.rotulo}: ${j.recorte}`] : [`Agrupado por ${j.rotulo.toLowerCase()}`];
    if (fe.equipe) f.push(`Equipe: ${nome(j.equipes, fe.equipe) || fe.equipe}`);
    if (fe.cidade) f.push(`Cidade: ${nome(j.cidades, fe.cidade) || fe.cidade}`);
    if (fe.vendedor) f.push(`Vendedor: ${nome(j.vendedores, fe.vendedor) || fe.vendedor}`);
    return f.join(" · ");
  }
  const agora = () => new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const quem = () => S.sessao?.usuario?.nome || "";

  /* ---------- PDF (impressão com layout próprio; “Salvar como PDF” no navegador) ---------- */
  function imprimir(j) {
    const t = j.total, frac = j.mes.frac, tk = t.vendas ? t.v_total / t.vendas : 0;
    const kp = (r, v, d, cls = "") => `<div class="pp-k ${cls}"><span>${r}</span><b>${v}</b><small>${d || "&nbsp;"}</small></div>`;
    const dl = t.vendas - t.ontem;
    const linha = (o, cls, nomeHtml) => `<tr class="${cls}"><td class="c1">${nomeHtml}</td><td>${z(o.vendas)}</td><td>${z(o.conectadas)}</td><td>${z(o.pendentes)}</td><td>${z(o.canceladas)}</td><td>${z(o.v_total, brl0)}</td>
      <td>${z(o.bl)}</td><td>${z(o.tv)}</td><td>${z(o.chip_nova)}</td><td>${z(o.chip_mig)}</td><td>${z(o.chip_port)}</td><td>${z(o.multi)}</td><td>${z(o.dcc)}</td>
      <td>${z(o.instaladas)}${o.agendadas ? `<small>/${o.agendadas}</small>` : ""}</td><td>${z(o.mes_vendas)}</td><td>${nf.format(o.mes_bl)}${o.meta_bl ? `<small>/${o.meta_bl}</small>` : ""}</td><td>${o.meta_bl ? pct0(o.mes_bl / o.meta_bl) : "–"}</td>
      <td>${o.ritmo ? `<span class="pp-pill ${o.ritmo.status}">${RITMO[o.ritmo.status]}</span>` : "–"}</td><td>${o.fpd == null ? "–" : (o.fpd * 100).toFixed(1).replace(".", ",") + "%"}</td></tr>`;
    const porPessoa = j.agrupar !== "vendedor";
    const corpo = j.grupos.map((g) => {
      const ps = fe.zerados ? g.pessoas : g.pessoas.filter((p) => p.vendas || p.canceladas || p.mes_vendas);
      return `<tbody class="pp-bloco">${linha(g, "g", `<b>${esc(g.grupo)}</b>${porPessoa ? ` <small>${plural(g.hc, "vendedor", "vendedores")}</small>` : ""}`)}${porPessoa ? ps.map((p) => linha(p, p.vendas ? "p" : "p zr", esc(p.nome))).join("") : ""}</tbody>`;
    }).join("");
    const d = j.destaques;
    const html = `<div id="fx-print">
      <header class="pp-cab"><img src="${esc(CFG.logo || "logo.png")}" alt="" class="pp-logo"><div class="pp-tit"><h1>Fechamento do dia</h1><p>${esc(porExtenso(j.dia))} · ${esc(descFiltros(j))}</p></div>
        <div class="pp-emit">${esc(CFG.empresa || "")}<br>Emitido em ${esc(agora())}${quem() ? `<br>por ${esc(quem())}` : ""}</div></header>
      <div class="pp-kpis">
        ${kp("Vendas do dia", nf.format(t.vendas), `${dl === 0 ? "igual a ontem" : (dl > 0 ? "▲ +" : "▼ −") + nf.format(Math.abs(dl)) + " vs ontem"}`, "dest")}
        ${kp("Instaladas", nf.format(t.conectadas), brl(t.v_conectado))}${kp("Pendentes", nf.format(t.pendentes), brl(t.v_pendente))}
        ${kp("Canceladas", nf.format(t.canceladas), t.canceladas ? brl(t.v_perdido) + " perdidos" : "", t.canceladas ? "ruim" : "")}
        ${kp("Ticket médio", tk ? brl(tk) : "–", "vendido " + brl(t.v_total))}
        ${kp("Instalações", `${nf.format(t.instaladas)}<small>/${nf.format(t.agendadas)}</small>`, "instaladas / agendadas")}
        ${kp("BL no mês", `${nf.format(t.mes_bl)}${t.meta_bl ? `<small>/${nf.format(t.meta_bl)}</small>` : ""}`, t.ritmo ? `${RITMO[t.ritmo.status]} · projeção ${nf.format(t.ritmo.projecao)}` : "", t.ritmo?.status || "")}
      </div>
      <div class="pp-mix"><b>Mix do dia</b> BL ${t.bl} · TV ${t.tv} · Chip novo ${t.chip_nova} · Migração ${t.chip_mig} · Portabilidade ${t.chip_port} · Multi ${t.multi} · DCC ${t.dcc} · APT ${t.apt} · Sistema C ${t.netsales} · Sistema B ${t.solar}</div>
      <table class="pp-tab"><thead><tr class="gh"><th></th><th colspan="5">Vendas do dia</th><th colspan="7">Produtos do dia</th><th>Inst.</th><th colspan="5">Mês até hoje</th></tr>
        <tr><th class="c1">${esc(j.rotulo)}${porPessoa ? " / vendedor" : ""}</th><th>Vendas</th><th>Conect.</th><th>Pend.</th><th>Canc.</th><th>Valor</th><th>BL</th><th>TV</th><th>Chip novo</th><th>Migr.</th><th>Port.</th><th>Multi</th><th>DCC</th><th>Feitas</th><th>Vendas</th><th>BL/meta</th><th>%</th><th>Ritmo</th><th>FPD 3m</th></tr></thead>
        ${corpo}<tfoot>${linha(t, "t", "<b>Total</b>")}</tfoot></table>
      <div class="pp-rod"><div><b>Quem mais vendeu:</b> ${d.top.length ? d.top.map((p, i) => `${i + 1}º ${esc(p.nome)} (${p.vendas})`).join(" · ") : "–"}</div>
        <div><b>Sem venda hoje (${d.sem_venda.length}):</b> ${d.sem_venda.length ? esc(d.sem_venda.map((p) => p.nome).join(", ")) : "nenhum"}</div>
        <div class="pp-nota">Vendas = vendas válidas do dia (sem as canceladas). BL/meta = banda larga do mês (instalada + pendente) sobre a meta do Plano do mês. Ritmo = projeção linear até o fim do mês: No ritmo ≥ 100% da meta, Atenção ≥ 75%, Abaixo &lt; 75%. FPD 3m = primeira fatura não paga no prazo nas 3 últimas safras fechadas (referência 25%).</div></div>
    </div>`;
    document.getElementById("fx-print")?.remove();
    document.body.insertAdjacentHTML("beforeend", html);
    const tituloAnt = document.title;
    document.title = `Fechamento ${br(j.dia).replace(/\//g, "-")}`;   // vira o nome sugerido do PDF
    document.body.classList.add("fx-imprimindo");
    const fim = () => { document.body.classList.remove("fx-imprimindo"); document.getElementById("fx-print")?.remove(); document.title = tituloAnt; removeEventListener("afterprint", fim); };
    addEventListener("afterprint", fim);
    const img = document.querySelector("#fx-print .pp-logo");
    const vai = () => setTimeout(() => window.print(), 60);
    img && !img.complete ? (img.addEventListener("load", vai, { once: true }), img.addEventListener("error", vai, { once: true })) : vai();
  }

  /* ---------- Excel (.xlsx com logo e 3 abas) ---------- */
  async function excel(j, btn) {
    if (btn) { btn.disabled = true; }
    try {
      const t = j.total, porPessoa = j.agrupar !== "vendedor";
      const logo = await XLSX7.png(CFG.logo || "logo.png", 44);
      const N = (v, s = "", f = "_int") => ({ v: +v || 0, s: (+v ? s : s === "" ? "z" : s) + f });
      const linha = (o, nome, s, cidade) => {
        const tk = o.vendas ? +(o.v_total / o.vendas).toFixed(2) : 0;
        const pm = o.meta_bl ? +(o.mes_bl / o.meta_bl).toFixed(4) : null;
        return [{ v: nome, s: s || "" }, { v: cidade || "", s: s || "" }, N(o.vendas, s), N(o.conectadas, s), N(o.pendentes, s), N(o.canceladas, s), N(o.v_total, s, "_brl"), N(o.v_perdido, s, "_brl"), N(tk, s, "_brl"),
          N(o.bl, s), N(o.tv, s), N(o.chip_nova, s), N(o.chip_mig, s), N(o.chip_port, s), N(o.multi, s), N(o.dcc, s), N(o.apt, s), N(o.instaladas, s), N(o.agendadas, s),
          N(o.mes_vendas, s), N(o.mes_bl_con, s), N(o.mes_bl_pend, s), o.meta_bl == null ? { v: "", s: s || "" } : N(o.meta_bl, s), pm == null ? { v: "", s: s || "" } : { v: pm, s: (s || "") + "_pct" },
          N(o.mes_chip_mp, s), o.meta_chip == null ? { v: "", s: s || "" } : N(o.meta_chip, s), o.ritmo ? { v: RITMO[o.ritmo.status], s: s === "t" ? "t" : o.ritmo.status } : { v: "", s: s || "" }, o.fpd == null ? { v: "", s: s || "" } : { v: o.fpd, s: (s || "") + "_pct" }];
      };
      const CAB = ["Vendas", "Instal.", "Pend.", "Canc.", "Valor vendido", "Valor perdido", "Ticket", "BL", "TV", "Chip novo", "Migração", "Portab.", "Multi", "DCC", "APT", "Inst. feitas", "Agendadas",
        "Vendas", "BL conect.", "BL pend.", "Meta BL", "% meta", "Chips M/P", "Meta chips", "Ritmo", "FPD 3 safras"];
      const larg = [34, 18, 9, 9, 9, 9, 14, 14, 12, 7, 7, 10, 10, 9, 8, 8, 8, 11, 11, 9, 11, 10, 10, 9, 11, 11, 12, 12];
      // aba 1: fechamento (igual à tela)
      const L = [], al = {};
      L.push([{ v: "" }, { v: "" }, { v: "Fechamento do dia", s: "titulo" }]); al[0] = 30;
      L.push([{ v: "" }, { v: "" }, { v: `${porExtenso(j.dia)} · ${descFiltros(j)}`, s: "sub" }]);
      L.push([{ v: "" }, { v: "" }, { v: `${CFG.empresa || ""} · emitido em ${agora()}${quem() ? " por " + quem() : ""}`, s: "sub" }]);
      L.push([]);
      const K = [["Vendas do dia", t.vendas, "_int"], ["Instaladas", t.conectadas, "_int"], ["Pendentes", t.pendentes, "_int"], ["Canceladas", t.canceladas, "_int"], ["Valor vendido", t.v_total, "_brl"], ["Instalações feitas", t.instaladas, "_int"], ["BL no mês", t.mes_bl, "_int"], ["Meta BL do mês", t.meta_bl ?? "", "_int"]];
      const kr = [], kv = [];
      K.forEach(([r, v, f], i) => { kr[i * 3] = { v: r, s: "kr" }; kr[i * 3 + 1] = { v: "", s: "kr" }; kr[i * 3 + 2] = { v: "", s: "kr" }; kv[i * 3] = { v, s: "kv" + f }; kv[i * 3 + 1] = { v: "", s: "kv" }; kv[i * 3 + 2] = { v: "", s: "kv" }; });
      L.push(kr); L.push(kv); al[5] = 26;
      const mesclar = ["C1:Q1", "C2:Q2", "C3:Q3"];
      K.forEach((_, i) => { mesclar.push(`${XLSX7.col(i * 3)}5:${XLSX7.col(i * 3 + 2)}5`, `${XLSX7.col(i * 3)}6:${XLSX7.col(i * 3 + 2)}6`); });
      L.push([]);
      const gh = [{ v: "", s: "hg" }, { v: "", s: "hg" }, { v: "VENDAS DO DIA", s: "hg" }, ...Array(6).fill({ v: "", s: "hg" }), { v: "PRODUTOS DO DIA", s: "hg" }, ...Array(7).fill({ v: "", s: "hg" }), { v: "INSTALAÇÕES", s: "hg" }, { v: "", s: "hg" }, { v: "MÊS ATÉ HOJE · META · QUALIDADE", s: "hg" }, ...Array(8).fill({ v: "", s: "hg" })];
      L.push(gh); const rGh = L.length;
      mesclar.push(`C${rGh}:I${rGh}`, `J${rGh}:Q${rGh}`, `R${rGh}:S${rGh}`, `T${rGh}:AB${rGh}`);
      L.push([{ v: porPessoa ? `${j.rotulo} / vendedor` : j.rotulo, s: "h" }, { v: "Cidade", s: "h" }, ...CAB.map((c) => ({ v: c, s: "h" }))]); al[L.length - 1] = 20;
      const rCab = L.length;
      for (const g of j.grupos) {
        const cidade = j.agrupar === "equipe" ? (g.pessoas.find((p) => p.cidade)?.cidade || "") : "";
        L.push(linha(g, g.grupo, "g", cidade));
        if (porPessoa) for (const p of (fe.zerados ? g.pessoas : g.pessoas.filter((p) => p.vendas || p.canceladas || p.mes_vendas))) L.push(linha(p, "    " + p.nome, "", p.cidade));
      }
      L.push(linha(t, "TOTAL", "t", "")); al[L.length - 1] = 20;
      L.push([]);
      L.push([{ v: "BL inst./pend.: banda larga do mês por situação. % meta = BL do mês (instalado + pendente) ÷ meta do Plano do mês. Ritmo = projeção linear até o fim do mês (No ritmo ≥ 100%, Atenção ≥ 75%, Abaixo < 75%). FPD 3 safras = primeira fatura não paga no prazo nas 3 últimas safras fechadas.", s: "sub" }]);
      // aba 2: lista plana (boa para filtro e tabela dinâmica)
      const P = [[{ v: "Equipe", s: "h" }, { v: "Cidade", s: "h" }, { v: "Vendedor", s: "h" }, ...CAB.map((c) => ({ v: c, s: "h" }))]];
      const vistos = new Set();
      for (const g of j.grupos) for (const p of g.pessoas) { if (vistos.has(p.id)) continue; vistos.add(p.id); const l = linha(p, p.equipe || "", "", p.cidade); l.splice(2, 0, { v: p.nome, s: "b" }); P.push(l); }
      // aba 3: últimos 14 dias
      const D = [[{ v: "Dia", s: "h" }, { v: "Semana", s: "h" }, { v: "Instaladas", s: "h" }, { v: "Pendentes", s: "h" }, { v: "Canceladas", s: "h" }, { v: "Vendas válidas", s: "h" }]];
      for (const s of j.serie) D.push([{ v: br(s.dia) }, { v: diaSemana(s.dia) }, N(s.conectadas), N(s.pendentes), N(s.canceladas), N(s.conectadas + s.pendentes, "b")]);
      const abas = [
        { nome: "Fechamento", linhas: L, larguras: larg, mesclar, congelar: { linha: rCab, coluna: 1 }, alturas: al, imagem: logo ? { ...logo, coluna: 0, linha: 0, dx: 4 * 9525, dy: 6 * 9525 } : null },
        { nome: "Vendedores", linhas: P, larguras: [24, 18, 30, ...larg.slice(2)], congelar: { linha: 1, coluna: 3 }, filtro: `A1:${XLSX7.col(P[0].length - 1)}${P.length}` },
      ];
      if (!j.recorte) abas.push({ nome: "Últimos 14 dias", linhas: D, larguras: [12, 9, 12, 12, 12, 15], congelar: { linha: 1 } });   // a série é da empresa toda
      XLSX7.baixar(`Fechamento_${j.dia}${j.recorte ? "_" + arquivoSeguro(j.recorte) : ""}.xlsx`, abas,
        { titulo: `Fechamento do dia ${br(j.dia)}${j.recorte ? " · " + j.recorte : ""}`, autor: quem() });
    } finally { if (btn) btn.disabled = false; }
  }

  /* ---------- exportar separado: um arquivo por equipe / supervisor / cidade ---------- */
  const arquivoSeguro = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "grupo";
  /** Mesmo relatório, mas só com um grupo: os totais e os destaques passam a ser os daquele grupo. */
  function recorte(j, g) {
    const ps = g.pessoas || [];
    const top = ps.filter((p) => p.vendas).sort((a, b) => b.vendas - a.vendas || b.bl - a.bl || b.v_total - a.v_total).slice(0, 3)
      .map((p) => ({ nome: p.nome, equipe: p.equipe, vendas: p.vendas, bl: p.bl }));
    const sem = ps.filter((p) => !p.vendas).map((p) => ({ nome: p.nome, equipe: p.equipe })).sort((a, b) => a.nome.localeCompare(b.nome));
    return { ...j, grupos: [g], total: g, recorte: g.grupo,
      destaques: { top, sem_venda: sem, abaixo_ritmo: ps.filter((p) => p.ritmo?.status === "ruim").length } };
  }

  // peças reaproveitadas na Visão da equipe
  S.fx = { barraMeta, pilula, z, composicao, variacao, ico, iniciais, RITMO };

  /** Botão “Separados”: menu com um arquivo por equipe (ou supervisor, cidade...), individual ou todos de uma vez. */
  function menuSeparar(j) {
    if (j.agrupar === "vendedor" || j.agrupar === "geral" || j.grupos.length < 2) return "";
    const it = j.grupos.map((g, i) => `<div class="ms-it"><span><b>${esc(g.grupo)}</b><small>${plural(g.hc, "vendedor", "vendedores")} · ${nf.format(g.vendas)} ${g.vendas === 1 ? "venda" : "vendas"} hoje</small></span>
      <span class="ms-bt"><button type="button" class="btn sec pq" data-sx="${i}" title="Excel só desta ${j.rotulo.toLowerCase()}">Excel</button><button type="button" class="btn sec pq" data-sp="${i}" title="PDF só desta ${j.rotulo.toLowerCase()}">PDF</button></span></div>`).join("");
    return `<div class="menu-sus" id="ms"><button type="button" class="btn sec" id="bs" aria-haspopup="true" aria-expanded="false" title="Um arquivo separado por ${esc(j.rotulo.toLowerCase())}">${ico("xls")} Separados <i class="ms-seta">▾</i></button>
      <div class="menu-sus-pop" id="msp" hidden><div class="ms-cab">Um arquivo por ${esc(j.rotulo.toLowerCase())}<small>${plural(j.grupos.length, "grupo", "grupos")} no dia de hoje</small></div>
        <button type="button" class="btn pq ms-todos" id="mst">Baixar todos em Excel (${j.grupos.length} arquivos)</button>
        <div class="ms-lista">${it}</div>
        <div class="ms-rod">O navegador pode pedir permissão para baixar vários arquivos de uma vez. O PDF abre a janela de impressão, um de cada vez.</div></div></div>`;
  }
  function ligarSeparar(el, j) {
    const bs = el.querySelector("#bs"); if (!bs) return;
    const pop = el.querySelector("#msp");
    const fechar = () => { pop.hidden = true; bs.setAttribute("aria-expanded", "false"); };
    bs.addEventListener("pointerdown", (e) => e.stopPropagation());
    bs.addEventListener("click", (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; bs.setAttribute("aria-expanded", String(!pop.hidden)); });
    pop.addEventListener("pointerdown", (e) => e.stopPropagation());
    document.addEventListener("pointerdown", fechar);   // o clique do navegador ao baixar o arquivo não fecha o menu
    document.addEventListener("keydown", (e) => e.key === "Escape" && fechar());
    el.querySelectorAll("[data-sx]").forEach((b) => b.addEventListener("click", () => {
      excel(recorte(j, j.grupos[+b.dataset.sx]), b).catch((er) => alert("Não foi possível gerar o Excel: " + er.message));
    }));
    el.querySelectorAll("[data-sp]").forEach((b) => b.addEventListener("click", () => { fechar(); imprimir(recorte(j, j.grupos[+b.dataset.sp])); }));
    el.querySelector("#mst").addEventListener("click", async (e) => {
      const b = e.currentTarget, t0 = b.textContent; b.disabled = true;
      try {
        for (let i = 0; i < j.grupos.length; i++) {
          b.textContent = `Gerando ${i + 1} de ${j.grupos.length}…`;
          await excel(recorte(j, j.grupos[i]));
          await new Promise((r) => setTimeout(r, 350));   // dá tempo do navegador salvar cada arquivo
        }
        b.textContent = "Pronto! " + j.grupos.length + " arquivos baixados";
        setTimeout(() => { b.textContent = t0; b.disabled = false; }, 2500);
      } catch (er) { b.textContent = t0; b.disabled = false; alert("Não foi possível gerar os arquivos: " + er.message); }
    });
  }

  /* ---------- tela ---------- */
  S.PAGES.fechamento = async (el) => {
    if (!permitido()) { el.innerHTML = `<div class="aviso erro">Esta tela é dos departamentos Backoffice, Gerente e Administrador.</div>`; return; }
    fe.dia ||= hoje();
    const q = new URLSearchParams({ dia: fe.dia, agrupar: fe.agrupar, equipe: fe.equipe, cidade: fe.cidade, vendedor: fe.vendedor });
    const j = await api("/fechamento?" + q);
    VV = j.permissoes?.valores !== false;
    const exporta = S.ui?.podeExportar ? S.ui.podeExportar() : true;
    if (!j.mes || !j.serie) throw new Error("O servidor está com a versão antiga do fechamento. Atualize e reinicie o servidor (npm start).");
    const opt = (lista, v) => lista.map((x) => `<option value="${x.id}" ${String(x.id) === String(v) ? "selected" : ""}>${esc(x.nome)}</option>`).join("");
    const futuro = j.dia > hoje();
    const grafico = S.painel("Últimos 14 dias", CH.empilhadas({ cats: j.serie.map((d) => d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7)), rotuloY: "Vendas", titulo: "Vendas por dia", altura: 250,
      series: [{ nome: "Instaladas", cor: CH.COR.ok, valores: j.serie.map((d) => d.conectadas) }, { nome: "Pendentes", cor: CH.COR.base, valores: j.serie.map((d) => d.pendentes) }, { nome: "Canceladas", cor: CH.COR.ruim, valores: j.serie.map((d) => d.canceladas) }] }),
      "Vendas pela data da venda, na situação de hoje (uma venda pendente passa a instalada quando a instalação é feita).");
    el.innerHTML = `<div class="cab fx-cab"><div><div class="migalha">Operação</div><h1>Fechamento do dia</h1><div class="fx-subt">${esc(porExtenso(j.dia))} · dia útil ${S.du(j.mes.uteis?.decorridos ?? j.mes.dia_mes)} de ${S.du(j.mes.uteis?.total ?? j.mes.dias_mes)} (escala 6x1)</div></div>
        <div class="acoes" ${exporta ? "" : "style=\"display:none\""}><button class="btn sec" id="bw" title="Texto pronto para os grupos do WhatsApp">${ico("msg")} WhatsApp</button><button class="btn sec" id="bx" title="Planilha .xlsx com logo, 3 abas">${ico("xls")} Excel</button><button class="btn" id="bp" title="Relatório pronto para imprimir ou salvar em PDF">${ico("pdf")} Exportar PDF</button>${menuSeparar(j)}</div></div>
      <div class="filtros fx-filtros">
        <div class="campo" style="width:auto"><label>Dia</label><div class="dia-nav"><button class="btn sec pq" id="ant" title="Dia anterior" aria-label="Dia anterior">‹</button><input type="date" id="dd" value="${fe.dia}" max="${hoje()}"><button class="btn sec pq" id="prx" title="Próximo dia" aria-label="Próximo dia" ${fe.dia >= hoje() ? "disabled" : ""}>›</button><button class="btn sec pq" id="hj" ${fe.dia === hoje() ? "disabled" : ""}>Hoje</button></div></div>
        <div class="campo" style="width:auto"><label>Agrupar por</label><div class="seg" id="ag">${j.opcoes_agrupar.map((o) => `<button data-a="${o.k}" class="${o.k === j.agrupar ? "on" : ""}">${esc(o.rot)}</button>`).join("")}</div></div>
        <div class="campo" style="width:160px"><label>Equipe</label><select id="fq"><option value="">Todas</option>${opt(j.equipes, fe.equipe)}</select></div>
        <div class="campo" style="width:160px"><label>Cidade</label><select id="fc"><option value="">Todas</option>${opt(j.cidades, fe.cidade)}</select></div>
        <div class="campo" style="width:180px"><label>Vendedor</label><select id="fv"><option value="">Todos</option>${opt(j.vendedores, fe.vendedor)}</select></div>
        ${fe.equipe || fe.cidade || fe.vendedor ? `<button class="btn sec" id="lp">Limpar</button>` : ""}
      </div>
      ${futuro ? `<div class="aviso">Este dia ainda não chegou.</div>` : ""}
      ${resumo(j)}
      ${S.ui ? S.ui.previsao(j.total, { titulo: "Previsão de BL do mês" }) : ""}
      ${mix(j.total)}
      <section class="painel"><h2><span>${j.agrupar === "geral" ? "Resultado geral" : "Resultado por " + esc(j.rotulo.toLowerCase())}</span><span class="fx-h2-acoes">
          <label class="fx-sw"><input type="checkbox" id="zr" ${fe.zerados ? "checked" : ""}><i></i>Mostrar quem não vendeu</label>
          ${j.agrupar !== "vendedor" ? `<button class="btn sec pq" id="ab">${fe.abertos.size ? "Recolher todos" : "Abrir todos"}</button>` : ""}</span></h2>
        ${tabelaResultado(j)}
        <div class="nota">Clique numa ${esc(j.rotulo.toLowerCase())} para abrir ou fechar os vendedores. Na barra de meta: <span class="fx-k c"></span> BL instalado, <span class="fx-k p"></span> BL pendente e o traço é onde a equipe deveria estar hoje.</div></section>
      <div class="grade fx-dupla">${grafico}${destaques(j)}</div>`;

    const go = () => S.PAGES.fechamento(el).catch(S.erroEm(el));
    const muda = (k, v) => { fe[k] = v; go(); };
    el.querySelector("#dd").addEventListener("change", (e) => e.target.value && muda("dia", e.target.value));
    el.querySelector("#ant").addEventListener("click", () => muda("dia", somaDias(fe.dia, -1)));
    el.querySelector("#prx").addEventListener("click", () => muda("dia", somaDias(fe.dia, 1)));
    el.querySelector("#hj").addEventListener("click", () => muda("dia", hoje()));
    el.querySelector("#ag").addEventListener("click", (e) => { const a = e.target.closest("[data-a]")?.dataset.a; if (a) { fe.abertos.clear(); muda("agrupar", a); } });
    el.querySelector("#fq").addEventListener("change", (e) => muda("equipe", e.target.value));
    el.querySelector("#fc").addEventListener("change", (e) => muda("cidade", e.target.value));
    el.querySelector("#fv").addEventListener("change", (e) => muda("vendedor", e.target.value));
    el.querySelector("#lp")?.addEventListener("click", () => { fe.equipe = fe.cidade = fe.vendedor = ""; go(); });
    // abrir/fechar sem ir ao servidor de novo
    const repinta = () => { el.querySelector(".fx-tabela").outerHTML = tabelaResultado(j); liga(); const ab = el.querySelector("#ab"); if (ab) ab.textContent = fe.abertos.size ? "Recolher todos" : "Abrir todos"; };
    const liga = () => el.querySelectorAll(".fx-g[data-g]").forEach((tr) => tr.addEventListener("click", () => {
      const g = j.grupos[+tr.dataset.g].grupo; fe.abertos.has(g) ? fe.abertos.delete(g) : fe.abertos.add(g); repinta();
    }));
    liga();
    el.querySelector("#ab")?.addEventListener("click", () => { if (fe.abertos.size) fe.abertos.clear(); else j.grupos.forEach((g) => fe.abertos.add(g.grupo)); repinta(); });
    el.querySelector("#zr").addEventListener("change", (e) => { fe.zerados = e.target.checked; repinta(); });
    ligarSeparar(el, j);
    el.querySelector("#bw").addEventListener("click", () => abrirWhats(j));
    el.querySelector("#bp").addEventListener("click", () => imprimir(j));
    el.querySelector("#bx").addEventListener("click", (e) => excel(j, e.currentTarget).catch((er) => alert("Não foi possível gerar o Excel: " + er.message)));
  };
})();
