"use strict";
/* Peças de interface compartilhadas:
   - previsão do mês por dias úteis (escala 6x1, com feriados) em faixa de indicadores;
   - exportação de qualquer tela para Excel (supervisor, coordenador e gerente): cada painel vira uma aba,
     com os números dos gráficos e das tabelas, e os indicadores do topo numa aba "Resumo". */
(() => {
  const { esc, nf } = S;
  const pct0 = (x) => (x == null || !isFinite(x) ? "–" : Math.round(x * 100) + "%");

  /** Faixa de previsão. o = objeto do fechamento (total, grupo ou pessoa) com previsao/ritmo/meta_bl/mes_bl. */
  function previsao(o, { titulo = "Previsão para o fim do mês", mostrarVendas = true } = {}) {
    const p = o?.previsao; if (!p) return "";
    const meta = o.meta_bl || 0, real = o.mes_bl || 0, at = meta ? p.bl / meta : null;
    const tom = at == null ? "" : at >= 1 ? "ok" : at >= 0.85 ? "alerta" : "ruim";
    const faltam = Math.max(0, meta - real), porDia = p.dias_restantes ? faltam / p.dias_restantes : null;
    const barra = meta ? `<div class="barra"><i class="p" style="width:${Math.min(100, (p.bl / meta) * 100)}%"></i><i style="width:${Math.min(100, (real / meta) * 100)}%"></i><b style="left:calc(${Math.min(100, (p.dias_decorridos / (p.dias_uteis || 1)) * 100)}% - 1px)" title="onde deveria estar hoje"></b></div>` : "";
    return `<div class="prev-box">
      <div class="dest"><div class="r">${esc(titulo)}</div><div class="v">${nf.format(p.bl)} BL</div><div class="d">${meta ? `${pct0(at)} da meta de ${nf.format(meta)}` : "sem meta definida"}</div></div>
      <div><div class="r">Realizado no mês</div><div class="v">${nf.format(real)} <small class="chip ${tom}">${meta ? pct0(real / meta) : "–"}</small></div><div class="d">BL vendida até hoje</div>${barra}</div>
      ${mostrarVendas ? `<div><div class="r">Vendas previstas</div><div class="v">${nf.format(p.vendas)}</div><div class="d">${nf.format(o.mes_vendas || 0)} até hoje · chips ${nf.format(p.chips)}</div></div>` : ""}
      <div><div class="r">Dias úteis (6x1)</div><div class="v">${S.du(p.dias_decorridos)} <small style="font-size:14px;color:var(--suave)">de ${S.du(p.dias_uteis)}</small></div><div class="d">${S.du(p.dias_restantes)} restantes · domingos e feriados fora</div></div>
      <div><div class="r">Ritmo necessário</div><div class="v">${porDia == null ? "–" : faltam ? (porDia < 10 ? porDia.toFixed(1).replace(".", ",") : nf.format(Math.ceil(porDia))) : "✓"}</div><div class="d">${faltam ? `BL por dia útil para bater a meta (faltam ${nf.format(faltam)})` : meta ? "meta de BL já atingida" : "defina a meta no Plano do mês"}</div></div>
    </div>`;
  }

  /* ---------------- exportar a tela para Excel ---------------- */
  const podeExportar = () => { const p = S.sessao?.usuario?.perfil; return p === "gestor" || p === "lider" || p === "coordenador"; };
  function valor(txt) {
    const t = String(txt ?? "").replace(/\s+/g, " ").trim();
    if (!t || t === "–" || t === "-") return { v: "" };
    let m;
    if ((m = t.match(/^R\$\s?(-?[\d.]+(?:,\d+)?)$/))) return { v: +m[1].replace(/\./g, "").replace(",", "."), s: "_brl" };
    if ((m = t.match(/^(-?[\d.]*\d(?:,\d+)?)\s?%$/))) return { v: +m[1].replace(/\./g, "").replace(",", ".") / 100, s: "_pct" };
    if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(t)) { const n = +t.replace(/\./g, "").replace(",", "."); return { v: n, s: Number.isInteger(n) ? "_int" : "_dec" }; }
    return { v: t };
  }
  const nomeAba = (t, usados) => {
    let b = String(t || "Dados").replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Dados", n = b, i = 2;
    while (usados.has(n.toLowerCase())) n = b.slice(0, 26) + " " + i++;
    usados.add(n.toLowerCase()); return n;
  };
  function lerTabela(tb) {
    const lin = [];
    const cab = [...tb.querySelectorAll("thead tr")].pop();
    if (cab) lin.push([...cab.children].map((c) => ({ v: c.textContent.trim(), s: "h" })));
    tb.querySelectorAll("tbody tr").forEach((tr) => {
      if (tr.offsetParent === null && tr.style.display === "none") return;
      const g = tr.classList.contains("grupo") || tr.classList.contains("eq");
      lin.push([...tr.children].map((td) => { const x = valor(td.textContent); return { v: x.v, s: (g ? "g" : "") + (x.s || "") }; }));
    });
    tb.querySelectorAll("tfoot tr").forEach((tr) => lin.push([...tr.children].map((td) => { const x = valor(td.textContent); return { v: x.v, s: "t" + (x.s || "") }; })));
    return lin;
  }
  async function exportar(el, titulo) {
    const usados = new Set(), folhas = [], hoje = new Date().toLocaleDateString("pt-BR");
    const cab = (t, sub) => [[{ v: t, s: "titulo" }], [{ v: sub, s: "sub" }], []];
    // resumo: indicadores do topo e faixas de previsão
    const res = cab(titulo, `Exportado em ${hoje} por ${S.sessao.usuario.nome}`);
    const kp = [...el.querySelectorAll(".kpi")].map((k) => [k.querySelector(".r")?.textContent.trim(), k.querySelector(".v")?.textContent.trim(), k.querySelector(".d")?.textContent.trim()]);
    const pv = [...el.querySelectorAll(".prev-box > div")].map((k) => [k.querySelector(".r")?.textContent.trim(), k.querySelector(".v")?.textContent.trim(), k.querySelector(".d")?.textContent.trim()]);
    if (kp.length || pv.length) {
      res.push(["Indicador", "Valor", "Detalhe"].map((v) => ({ v, s: "h" })));
      [...kp, ...pv].forEach(([r, v, d]) => { const x = valor(v); res.push([{ v: r, s: "b" }, { v: x.v, s: x.s ? x.s.slice(1) === "int" ? "_int" : x.s : "" }, { v: d || "" }]); });
      folhas.push({ nome: nomeAba("Resumo", usados), linhas: res, larguras: [34, 18, 60] });
    }
    // cada painel: gráfico (números) e/ou tabela
    el.querySelectorAll(".painel").forEach((p) => {
      const t = p.querySelector(":scope > h2 span")?.textContent.trim() || p.querySelector("h2")?.textContent.trim() || "Painel";
      const L = cab(t, p.querySelector(":scope > h2 small")?.textContent.trim() || titulo);
      let tem = false;
      p.querySelectorAll("svg.chart[data-cid]").forEach((svg) => {
        const d = CH.dados(svg.dataset.cid); if (!d) return; tem = true;
        d.linhas.forEach((l, i) => L.push(l.map((c) => (i === 0 ? { v: c, s: "h" } : typeof c === "number" ? { v: c, s: Number.isInteger(c) ? "_int" : Math.abs(c) <= 1.5 && /%|taxa|fpd|conect|cancel/i.test(d.linhas[0].join(" ")) ? "_pct" : "_dec" } : { v: c ?? "" }))));
        L.push([]);
      });
      p.querySelectorAll("table").forEach((tb) => { if (tb.closest(".tv")) return; tem = true; lerTabela(tb).forEach((l) => L.push(l)); L.push([]); });
      if (!tem) return;
      const nc = Math.max(...L.map((l) => l.length));
      folhas.push({ nome: nomeAba(t, usados), linhas: L, larguras: [36, ...Array(Math.max(0, nc - 1)).fill(15)], congelar: { linha: 4, coluna: 1 } });
    });
    // tabelas soltas fora de painel
    el.querySelectorAll(".tab table").forEach((tb) => { if (tb.closest(".painel") || tb.closest(".tv")) return; const L = cab(titulo, ""); lerTabela(tb).forEach((l) => L.push(l)); folhas.push({ nome: nomeAba("Tabela", usados), linhas: L, larguras: [30, ...Array(20).fill(15)] }); });
    if (!folhas.length) throw new Error("Não há dados nesta tela para exportar.");
    const logo = await XLSX7.png((window.NORTE_CFG || {}).logo || "logo.png", 30).catch(() => null);
    if (logo) { folhas[0].imagem = { ...logo, coluna: Math.max(2, (folhas[0].larguras || []).length - 1), linha: 0, dx: 0, dy: 4 * 9525 }; }
    const arq = titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
    XLSX7.baixar(`${arq}_${new Date().toISOString().slice(0, 10)}.xlsx`, folhas, { titulo, autor: S.sessao.usuario.nome });
  }
  const IC_XLS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 12l4 5M13 12l-4 5"/></svg>';
  /** Coloca o botão "Exportar Excel" no cabeçalho da tela (se a tela ainda não tiver exportação própria). */
  /* Botão “Ajuda” no cabeçalho de cada tela: abre a Wiki já no assunto daquela tela. */
  function botaoAjuda(el) {
    const pg = (location.hash || "").split("/")[1] || "";
    const destino = S.wikiLink ? S.wikiLink(pg) : ""; if (!destino || !S.PAGES.wiki) return;
    const temWiki = (S.menuAtual || []).some(([, it]) => it.some(([x]) => x === "wiki")); if (!temWiki) return;
    const cab = el.querySelector(".cab"); if (!cab || cab.querySelector("[data-ajuda]")) return;
    let ac = cab.querySelector(".acoes"); if (!ac) { ac = document.createElement("div"); ac.className = "acoes"; cab.appendChild(ac); }
    const a = document.createElement("a");
    a.className = "btn sec pq btn-ajuda"; a.dataset.ajuda = "1"; a.href = destino;
    a.title = "Abrir a Wiki no assunto desta tela";
    a.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 014.8.8c0 1.7-2.4 2-2.4 3.5"/><path d="M12 17h.01"/></svg> Ajuda';
    ac.insertBefore(a, ac.firstChild);
  }

  function botaoExportar(el) {
    botaoAjuda(el);
    if (!podeExportar()) return;
    const cab = el.querySelector(".cab"); if (!cab || cab.querySelector("[data-exp-pag]") || el.querySelector("[data-sem-exp]") || /Excel/i.test(cab.textContent)) return;
    if (!el.querySelector(".painel, .tab table, .kpi")) return;
    let ac = cab.querySelector(".acoes"); if (!ac) { ac = document.createElement("div"); ac.className = "acoes"; cab.appendChild(ac); }
    const b = document.createElement("button"); b.type = "button"; b.className = "btn exp"; b.dataset.expPag = "1"; b.innerHTML = IC_XLS + "Exportar Excel";
    b.title = "Baixar os indicadores, gráficos e tabelas desta tela em Excel (uma aba por painel)";
    b.addEventListener("click", async () => { const t0 = b.innerHTML; b.disabled = true; b.textContent = "Gerando…"; try { await exportar(el, (cab.querySelector("h1")?.textContent || "Norte Link").trim()); } catch (e) { alert(e.message); } b.disabled = false; b.innerHTML = t0; });
    ac.appendChild(b);
  }

  /* Números grandes nunca podem passar do cartão: encolhe a fonte até caber (R$ 1.234.567,89 num cartão estreito, por exemplo). */
  const GRANDES = ".ap-tile .v, .ap-big b, .ap-trio b, .ap-metas b, .kpi .v, .prev-box .v, .fx-big, .fx-med, .posicao .med, .faixas-res b, .vb-resumo b, .vb-kpis b, .cf-prog b, .eq-duo b, .hero-v";
  function ajustar(raiz) {
    (raiz || document).querySelectorAll(GRANDES).forEach((el) => {
      el.style.fontSize = "";
      if (!el.offsetParent) return;
      let t = parseFloat(getComputedStyle(el).fontSize);
      for (let i = 0; i < 18 && el.scrollWidth > el.clientWidth + 0.5 && t > 12; i++) { t -= 1; el.style.fontSize = t + "px"; }
    });
  }
  /* Tabela larga e tabela longa:
     - barra de rolagem no topo e embaixo da tabela; a de baixo flutua na tela ao descer;
     - títulos da tabela ficam fixos no topo ao descer a página. */
  const FLUT = [];   // { t, cab, tb, fundo } de cada tabela com títulos e barra flutuantes
  const topoBase = () => { const b = document.querySelector(".topo"); return b ? Math.max(0, b.getBoundingClientRect().bottom) : 0; };
  function criarFlut(t) {
    const table = t.querySelector("table"), thead = table && table.querySelector("thead");
    if (!table || !thead) return;
    const cab = document.createElement("div");
    cab.className = (t.className || "").replace(/\btab\b/g, "") + " tab-flut";
    cab.style.cssText = "position:fixed;display:none;overflow:hidden;z-index:40;border:0;border-radius:0;max-height:none;background:var(--painel);box-shadow:0 4px 12px rgba(15,23,42,.12)";
    const tb = document.createElement("table");
    tb.className = table.className; tb.style.cssText = "margin:0;table-layout:fixed;border-collapse:collapse";
    tb.appendChild(document.createElement("colgroup"));
    tb.appendChild(thead.cloneNode(true)); cab.appendChild(tb); document.body.appendChild(cab);
    const barra = document.createElement("div"); barra.className = "tab-fundo tab-fundo-topo";
    barra.style.cssText = "position:fixed;display:none;overflow-x:auto;overflow-y:hidden;height:14px;z-index:41;background:var(--painel);top:0";
    barra.innerHTML = '<div style="height:1px"></div>'; document.body.appendChild(barra);
    barra.addEventListener("scroll", () => { if (t.scrollLeft !== barra.scrollLeft) t.scrollLeft = barra.scrollLeft; }, { passive: true });
    const fundo = document.createElement("div"); fundo.className = "tab-fundo";
    fundo.style.cssText = "position:fixed;display:none;overflow-x:auto;overflow-y:hidden;height:14px;z-index:40;background:var(--painel)";
    fundo.innerHTML = '<div style="height:1px"></div>'; document.body.appendChild(fundo);
    t.addEventListener("scroll", () => { if (fundo.scrollLeft !== t.scrollLeft) fundo.scrollLeft = t.scrollLeft; pedirFlut(); }, { passive: true });
    fundo.addEventListener("scroll", () => { if (t.scrollLeft !== fundo.scrollLeft) t.scrollLeft = fundo.scrollLeft; }, { passive: true });
    FLUT.push({ t, cab, tb, fundo, barra });
  }
  function atualizarFlut() {
    const off = topoBase(), alt = innerHeight;
    for (let i = FLUT.length - 1; i >= 0; i--) {
      const { t, cab, tb, fundo, barra } = FLUT[i];
      if (!t.isConnected) { cab.remove(); fundo.remove(); barra.remove(); FLUT.splice(i, 1); continue; }
      const table = t.querySelector("table"), thead = table && table.querySelector("thead");
      if (!table || !thead) continue;
      const r = t.getBoundingClientRect(), tr = table.getBoundingClientRect();
      if (r.width <= 0) { cab.style.display = "none"; fundo.style.display = "none"; barra.style.display = "none"; continue; }
      const largura = t.scrollWidth > t.clientWidth + 1;
      // barra de rolagem fixa no topo (enquanto a tabela ainda tem linhas abaixo)
      const barraAtiva = largura && tr.top < off && tr.bottom > off + 30;
      if (barraAtiva) {
        barra.style.display = "block"; barra.style.top = off + "px"; barra.style.left = r.left + "px"; barra.style.width = t.clientWidth + "px";
        barra.firstElementChild.style.width = t.scrollWidth + "px";
        if (barra.scrollLeft !== t.scrollLeft) barra.scrollLeft = t.scrollLeft;
      } else barra.style.display = "none";
      const topoCab = off + (barraAtiva ? 14 : 0);
      // títulos fixos: a tabela já passou do topo e ainda tem linhas abaixo dos títulos
      if (tr.top < off && tr.bottom > topoCab + thead.offsetHeight + 4) {
        cab.style.display = "block"; cab.style.top = topoCab + "px"; cab.style.left = r.left + "px"; cab.style.width = t.clientWidth + "px";
        tb.style.width = table.offsetWidth + "px"; tb.style.marginLeft = -t.scrollLeft + "px";
        const corpo = table.tBodies[0] && table.tBodies[0].rows[0];
        const cols = corpo ? [...corpo.cells].map((c) => c.offsetWidth) : [];
        const cg = tb.querySelector("colgroup");
        if (cols.length && cg.children.length !== cols.length) cg.innerHTML = cols.map(() => "<col>").join("");
        [...cg.children].forEach((c, k) => { c.style.width = (cols[k] || 0) + "px"; });
      } else cab.style.display = "none";
      // barra flutuante embaixo: a tabela ainda tem parte abaixo da tela e é mais larga que a caixa
      if (largura && tr.bottom > alt - 6 && tr.top < alt - 60) {
        fundo.style.display = "block"; fundo.style.bottom = "0"; fundo.style.left = r.left + "px"; fundo.style.width = t.clientWidth + "px";
        fundo.firstElementChild.style.width = t.scrollWidth + "px";
        if (fundo.scrollLeft !== t.scrollLeft) fundo.scrollLeft = t.scrollLeft;
      } else fundo.style.display = "none";
    }
  }
  let agendaFlut = 0;
  const pedirFlut = () => { if (agendaFlut) return; agendaFlut = requestAnimationFrame(() => { agendaFlut = 0; try { atualizarFlut(); } catch {} }); };
  /* Tabela larga: barra de rolagem sempre visível e uma sombra na borda avisando que há mais colunas ao lado. */
  function rolagem(raiz) {
    (raiz || document).querySelectorAll(".tab").forEach((t) => {
      if (!t._flut) { t._flut = 1; criarFlut(t); }
      if (t.closest(".tab-env")) return atualizarRol(t);
      if (t.scrollWidth <= t.clientWidth + 1) return;
      const env = document.createElement("div"); env.className = "tab-env";
      t.parentNode.insertBefore(env, t); env.appendChild(t);
      // barra de rolagem também no topo da tabela, sincronizada com a de baixo
      const topo = document.createElement("div"); topo.className = "tab-topo";
      topo.style.cssText = "overflow-x:auto;overflow-y:hidden;height:14px;margin:0 0 4px";
      topo.innerHTML = "<div style=\"height:1px\"></div>";
      env.insertBefore(topo, t);
      topo.addEventListener("scroll", () => { if (t.scrollLeft !== topo.scrollLeft) t.scrollLeft = topo.scrollLeft; }, { passive: true });
      t.addEventListener("scroll", () => { if (topo.scrollLeft !== t.scrollLeft) topo.scrollLeft = t.scrollLeft; atualizarRol(t); }, { passive: true });
      atualizarRol(t);
    });
  }
  function atualizarRol(t) {
    const env = t.closest(".tab-env"); if (!env) return;
    const topo = env.querySelector(":scope > .tab-topo");
    if (topo) { topo.firstElementChild.style.width = t.scrollWidth + "px"; topo.style.display = t.scrollWidth > t.clientWidth + 1 ? "" : "none"; }
    const mais = t.scrollWidth > t.clientWidth + 1;
    env.classList.toggle("rol", mais);
    env.classList.toggle("na-esq", mais && t.scrollLeft > 4);
    env.classList.toggle("na-dir", mais && t.scrollLeft + t.clientWidth < t.scrollWidth - 4);
  }

  let agenda = 0;
  const pedir = () => { if (agenda) return; agenda = requestAnimationFrame(() => { agenda = 0; try { ajustar(); } catch {} try { rolagem(); } catch {} pedirFlut(); }); };
  new MutationObserver(pedir).observe(document.documentElement, { childList: true, characterData: true, subtree: true });
  window.addEventListener("resize", pedir);
  window.addEventListener("scroll", pedirFlut, { passive: true });
  document.fonts?.ready?.then(pedir);

  S.ui = { previsao, exportar, botaoExportar, botaoAjuda, podeExportar, valor, pct0, ajustar, rolagem };
})();
