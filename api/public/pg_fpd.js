"use strict";
/* Lançamento de FPD (somente Gerente e Administrador): envio da planilha de Qualidade (anexo .xlsx/.csv) com prévia,
   lançamento manual por contrato, histórico de envios e exportação no mesmo modelo da planilha (uma aba por safra). */
(() => {
  const { esc, nf, api, painel, tabela, dt } = S;
  const COLUNAS = ["CONTRATO", "STATUS CONTRATO", "DATA BASE", "FORMA DE PAGAMENTO", "1ª FATURA", "DT DE PG 1° FATURA", "2ª FATURA", "DT DE PG 2° FATURA", "FPD", "DEPOIS DO PRAZO", "PRAZO OPERADORA", "TRATATIVA CHURN", "STATUS OBS", "C/ OU S/ OFERTA"];
  const EXTRAS = ["DATA DA VENDA", "CLIENTE", "VENDEDOR", "EQUIPE"];
  const MES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  const chave = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[ºª°]/g, "").replace(/[^A-Z0-9/]+/g, " ").replace(/\s+/g, " ").trim();
  const MAPA = new Map(COLUNAS.map((c) => [chave(c), c]));
  MAPA.set(chave("Nº CONTRATO"), "CONTRATO"); MAPA.set(chave("NUMERO CONTRATO"), "CONTRATO"); MAPA.set(chave("C/ OU S/ OFERTA"), "C/ OU S/ OFERTA"); MAPA.set(chave("OFERTA"), "C/ OU S/ OFERTA");
  // variações de cabeçalho vistas nas abas mensais da planilha de Qualidade
  [["PG 1° FATURA", "DT DE PG 1° FATURA"], ["DT PG 1° FATURA", "DT DE PG 1° FATURA"], ["PG 2° FATURA", "DT DE PG 2° FATURA"], ["DT PG 2° FATURA", "DT DE PG 2° FATURA"],
   ["1 FATURA", "1ª FATURA"], ["2 FATURA", "2ª FATURA"], ["PRAZO OPERADORA ", "PRAZO OPERADORA"]].forEach(([a, b]) => MAPA.set(chave(a), b));
  const SIT_TXT = { PAGA_NO_PRAZO: "PAGA NO PRAZO", PAGA_FORA_DO_PRAZO: "PAGO FORA DO PRAZO", NAO_PAGA: "NAO PAGA", EM_ABERTO: "EM ABERTO" };
  const FPD_TXT = { OK: "FPD OK", NAO_OK: "FPD Ñ OK", PRAZO: "FPD PRAZO" };
  const br = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
  const abaDe = (m) => `${MES[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;

  /** Planilhas lidas -> linhas no formato da API ({aba, CONTRATO, ...}). Procura a linha de cabeçalho com "CONTRATO" em cada aba. */
  function extrair(folhas) {
    const linhas = [], abas = [];
    for (const f of folhas) {
      const ih = f.linhas.findIndex((l) => (l || []).some((c) => chave(c) === "CONTRATO" || chave(c) === "N CONTRATO"));
      if (ih < 0) continue;
      const cols = (f.linhas[ih] || []).map((c) => MAPA.get(chave(c)) || null);
      if (!cols.includes("CONTRATO")) continue;
      // aba com o título da coluna FPD apagado (ex.: "JUL 26"): a coluna sem título logo antes de "DEPOIS DO PRAZO" é o FPD
      const iDep = cols.indexOf("DEPOIS DO PRAZO");
      if (!cols.includes("FPD") && iDep > 0 && chave((f.linhas[ih] || [])[iDep - 1]) === "") cols[iDep - 1] = "FPD";
      let n = 0;
      for (const l of f.linhas.slice(ih + 1)) {
        if (!l || !l.length) continue;
        const o = { aba: f.nome };
        cols.forEach((c, i) => { if (c && l[i] != null && l[i] !== "") o[c] = l[i]; });
        if (o.CONTRATO == null || String(o.CONTRATO).trim() === "") continue;
        linhas.push(o); n++;
      }
      abas.push({ nome: f.nome, linhas: n, colunas: cols.filter(Boolean).length });
    }
    return { linhas, abas };
  }
  function lerCsv(texto, nome) {
    const t = texto.replace(/^﻿/, ""), sep = (t.split("\n")[0].match(/;/g) || []).length >= (t.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
    const linhas = []; let l = [], c = "", q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"' && t[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; continue; }
      if (ch === '"') q = true; else if (ch === sep) { l.push(c); c = ""; } else if (ch === "\n") { l.push(c.replace(/\r$/, "")); linhas.push(l); l = []; c = ""; } else c += ch;
    }
    if (c || l.length) { l.push(c); linhas.push(l); }
    return [{ nome: nome.replace(/\.[^.]+$/, "").slice(0, 30), linhas }];
  }

  S.PAGES.fpd = async (el) => {
    const hoje = new Date().toISOString().slice(0, 7), ant = (m, n) => { const [a, mm] = m.split("-").map(Number); const d = new Date(Date.UTC(a, mm - 1 - n, 1)); return d.toISOString().slice(0, 7); };
    el.innerHTML = `<div class="cab"><div><div class="migalha">Indicadores · Qualidade</div><h1>Lançamento de FPD</h1><p>Envie a planilha de Qualidade (anexo) ou lance contrato a contrato. Só gerente e administrador veem esta tela.</p></div>
        <div class="acoes" data-sem-exp><button class="btn sec" id="mod">Baixar modelo em branco</button></div></div>
      <div class="grade g2">
        ${painel("Enviar planilha", `<label class="soltar" id="drop"><input type="file" id="arq" accept=".xlsx,.csv" hidden><span class="soltar-ic"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg></span><b>Arraste a planilha aqui ou clique para escolher</b><span>.xlsx (uma aba por safra, ex.: “OUT 26”) ou .csv · mesmo modelo da planilha CONTROLE DE QUALIDADE</span></label><div id="prev"></div>`, "Nada é gravado antes de você conferir a prévia e confirmar. Linhas de contratos que não existem no sistema são ignoradas e listadas.", "anexo")}
        ${painel("Lançamento manual", `<form id="fb" class="busca-ct"><div class="campo" style="flex:1"><label>Número do contrato</label><input name="n" required placeholder="ex.: 100771" inputmode="numeric"></div><button class="btn">Buscar</button></form><div id="man"></div>`, "Use para corrigir um contrato ou lançar poucos casos sem montar planilha.", "por contrato")}
      </div>
      ${painel("Exportar no modelo da planilha", `<div class="filtros" style="border:0;box-shadow:none;padding:0;margin:0"><div class="campo"><label>Da safra</label><input type="month" id="de" value="${ant(hoje, 3)}"></div><div class="campo"><label>Até a safra</label><input type="month" id="ate" value="${hoje}"></div><button class="btn" id="exp">Exportar Excel</button><span class="mut" id="expm"></span></div>`, "Uma aba por safra (mês da venda), com as mesmas colunas do modelo. Dá para editar e enviar de volta por aqui. Vendas canceladas não entram.", "mesmo modelo")}
      <div id="hist"></div>`;
    const hist = async () => {
      const l = await api("/qualidade/lotes").catch(() => []);
      el.querySelector("#hist").innerHTML = painel("Histórico de lançamentos", tabela([{ t: "Quando", f: (r) => new Date(r.enviado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) }, { t: "Arquivo", f: (r) => `<b>${esc(r.arquivo_nome)}</b>` }, { t: "Origem", f: (r) => `<span class="tag ${r.origem === "MANUAL" ? "" : "ok"}">${r.origem === "MANUAL" ? "Manual" : "Planilha"}</span>` }, { t: "Abas", f: (r) => esc(r.abas || "–") }, { t: "Linhas", n: 1, f: (r) => nf.format(r.linhas) }, { t: "Atualizadas", n: 1, f: (r) => nf.format(r.atualizadas) }, { t: "Sem contrato", n: 1, f: (r) => nf.format(r.sem_contrato) }, { t: "Enviado por", f: (r) => esc(r.enviado_por_nome || "") }], l), "", `${l.length} envios`);
    };
    hist();

    /* ---------- anexo ---------- */
    let pend = null;
    const prev = el.querySelector("#prev"), arq = el.querySelector("#arq"), drop = el.querySelector("#drop");
    const mostrar = (r, nome, abas) => {
      const ok = r.atualizadas > 0;
      prev.innerHTML = `<div class="prev-imp"><div class="prev-imp-cab"><b>${esc(nome)}</b><span class="mut">${abas.map((a) => `${esc(a.nome)}: ${nf.format(a.linhas)}`).join(" · ")}</span></div>
        <div class="mini-kpis"><div><span>Linhas lidas</span><b>${nf.format(r.linhas)}</b></div><div><span>Vão mudar</span><b class="okt">${nf.format(r.atualizadas)}</b></div><div><span>Sem mudança</span><b>${nf.format(r.sem_mudanca)}</b></div><div><span>Contrato não encontrado</span><b class="${r.sem_contrato.length ? "rmt" : ""}">${nf.format(r.sem_contrato.length)}</b></div></div>
        <div class="mut" style="margin:8px 0">Mudanças: ${nf.format(r.mudancas.status)} status · ${nf.format(r.mudancas.forma)} forma de pagamento · ${nf.format(r.mudancas.fatura1)} 1ª fatura · ${nf.format(r.mudancas.fatura2)} 2ª fatura · ${nf.format(r.mudancas.fpd)} FPD · ${nf.format(r.mudancas.tratativas)} tratativas</div>
        ${r.amostra.length ? tabela([{ t: "Contrato", k: "contrato" }, { t: "Cliente", k: "cliente" }, { t: "Aba", k: "aba" }, { t: "O que muda", f: (x) => x.muda.map((m) => `<span class="chip azul">${esc(m)}</span>`).join(" ") }], r.amostra.slice(0, 8)) : ""}
        ${r.avisos.length ? `<details class="avisos-imp"><summary>${nf.format(r.avisos.length)} aviso(s) de valores não reconhecidos (esses campos ficam como estão)</summary><ul>${r.avisos.slice(0, 60).map((a) => `<li>${esc(a)}</li>`).join("")}</ul></details>` : ""}
        ${r.sem_contrato.length ? `<details class="avisos-imp"><summary>${nf.format(r.sem_contrato.length)} contrato(s) não encontrado(s)</summary><p>${r.sem_contrato.slice(0, 200).map(esc).join(", ")}</p></details>` : ""}
        <div class="rod-imp"><button class="btn sec" id="canc">Cancelar</button><button class="btn" id="conf" ${ok ? "" : "disabled"}>${ok ? `Confirmar e gravar ${nf.format(r.atualizadas)} contrato(s)` : "Nada para gravar"}</button></div></div>`;
      prev.querySelector("#canc").onclick = () => { prev.innerHTML = ""; pend = null; arq.value = ""; };
      prev.querySelector("#conf").onclick = async (ev) => {
        ev.target.disabled = true; ev.target.textContent = "Gravando…";
        try { const g = await api("/qualidade/importar", { method: "POST", body: pend }); prev.innerHTML = `<div class="aviso ok">Pronto: ${nf.format(g.atualizadas)} contrato(s) atualizados. Os indicadores de FPD já consideram os novos dados.</div>`; pend = null; arq.value = ""; hist(); }
        catch (e) { ev.target.disabled = false; ev.target.textContent = "Tentar de novo"; prev.insertAdjacentHTML("afterbegin", `<div class="aviso erro">${esc(e.message)}</div>`); }
      };
    };
    const processar = async (f) => {
      if (!f) return;
      prev.innerHTML = `<p class="mut">Lendo ${esc(f.name)}…</p>`;
      try {
        const folhas = /\.csv$/i.test(f.name) ? lerCsv(await f.text(), f.name) : await XLSX7.ler(f);
        const { linhas, abas } = extrair(folhas);
        if (!linhas.length) throw new Error("Não achei a coluna CONTRATO em nenhuma aba. Use o modelo (botão “Baixar modelo em branco”).");
        pend = { arquivo: f.name, origem: "ARQUIVO", linhas };
        mostrar(await api("/qualidade/analisar", { method: "POST", body: pend }), f.name, abas);
      } catch (e) { prev.innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; pend = null; }
    };
    arq.addEventListener("change", () => processar(arq.files[0]));
    ["dragover", "dragenter"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("sobre")));
    drop.addEventListener("drop", (e) => { e.preventDefault(); processar(e.dataTransfer.files[0]); });

    /* ---------- manual ---------- */
    const man = el.querySelector("#man");
    el.querySelector("#fb").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const n = new FormData(ev.target).get("n").trim(); man.innerHTML = `<p class="mut">Buscando…</p>`;
      try {
        const c = await api("/qualidade/contrato/" + encodeURIComponent(n));
        const sel = (nome, ops, atual) => `<select name="${nome}"><option value="">—</option>${ops.map(([v, t]) => `<option value="${esc(v)}" ${v === atual ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
        const SIT = Object.entries(SIT_TXT).map(([k, v]) => [v, v]), FP = Object.entries(FPD_TXT).map(([k, v]) => [v, v]);
        man.innerHTML = `<div class="ficha-ct"><div><b>${esc(c.cliente || "")}</b><span class="mut"> · contrato ${esc(c.numero_contrato)} · venda em ${dt(c.data_venda)} · ${esc(c.vendedor || "")}${c.equipe ? " · " + esc(c.equipe) : ""}</span></div>
          <span class="chip ${c.fpd_calc === "NAO_OK" ? "ruim" : c.fpd_calc === "OK" ? "ok" : "alerta"}">FPD atual: ${esc(FPD_TXT[c.fpd_calc] || "sem fatura")}</span></div>
          <form id="fm" class="form-fpd">
            <div class="campo"><label>Status do contrato</label>${sel("STATUS CONTRATO", c.opcoes_status.map((s) => [s, s]), c.status_contrato)}</div>
            <div class="campo"><label>Forma de pagamento</label>${sel("FORMA DE PAGAMENTO", [["BOLETO", "Boleto"], ["DCC", "DCC (débito recorrente)"]], c.forma_pagamento)}</div>
            <div class="campo"><label>Data base</label><input type="date" name="DATA BASE" value="${esc(c.data_base_qualidade || "")}"></div>
            <div class="campo"><label>Prazo operadora</label><input type="date" name="PRAZO OPERADORA" value="${esc(c.prazo_limite || "")}"></div>
            <div class="campo"><label>1ª fatura</label>${sel("1ª FATURA", SIT, SIT_TXT[c.f1])}</div>
            <div class="campo"><label>Pagamento da 1ª</label><input type="date" name="DT DE PG 1° FATURA" value="${esc(c.f1_pg || "")}"></div>
            <div class="campo"><label>2ª fatura</label>${sel("2ª FATURA", SIT, SIT_TXT[c.f2])}</div>
            <div class="campo"><label>Pagamento da 2ª</label><input type="date" name="DT DE PG 2° FATURA" value="${esc(c.f2_pg || "")}"></div>
            <div class="campo"><label>FPD</label>${sel("FPD", FP, FPD_TXT[c.fpd_planilha])}</div>
            <div class="campo"><label>Depois do prazo</label>${sel("DEPOIS DO PRAZO", FP, FPD_TXT[c.fpd_apos_prazo_planilha])}</div>
            <div class="campo"><label>Tratativa churn</label><input name="TRATATIVA CHURN" maxlength="200" value="${esc(c.churn || "")}"></div>
            <div class="campo"><label>Oferta</label>${sel("C/ OU S/ OFERTA", [["C/ OFERTA", "Com oferta"], ["S/ OFERTA", "Sem oferta"]], c.oferta == null ? "" : c.oferta ? "C/ OFERTA" : "S/ OFERTA")}</div>
            <div class="campo" style="grid-column:1/-1"><label>Status obs. (cobrança)</label><input name="STATUS OBS" maxlength="200" value="${esc(c.obs || "")}"></div>
            <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><span class="mut" id="mm" style="margin-right:auto;align-self:center"></span><button class="btn">Gravar lançamento</button></div>
          </form>`;
        man.querySelector("#fm").addEventListener("submit", async (e2) => {
          e2.preventDefault();
          const o = { CONTRATO: c.numero_contrato };
          for (const [k, v] of new FormData(e2.target)) if (v !== "") o[k] = v;
          const mm = man.querySelector("#mm");
          try { const r = await api("/qualidade/importar", { method: "POST", body: { arquivo: `Manual · contrato ${c.numero_contrato}`, origem: "MANUAL", linhas: [o] } }); mm.textContent = r.atualizadas ? "Gravado ✓" : "Nada mudou."; mm.className = r.atualizadas ? "okt" : "mut"; if (r.avisos.length) mm.textContent += " " + r.avisos.join(" "); hist(); }
          catch (er) { mm.textContent = er.message; mm.className = "erro"; }
        });
      } catch (e) { man.innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; }
    });

    /* ---------- exportar / modelo ---------- */
    const cab = [...COLUNAS, ...EXTRAS].map((v, i) => ({ v, s: i < COLUNAS.length ? "h" : "hg" }));
    const larg = [14, 18, 12, 18, 20, 14, 20, 14, 12, 14, 12, 22, 22, 14, 12, 28, 26, 22];
    el.querySelector("#mod").addEventListener("click", () => XLSX7.baixar("Modelo_Controle_de_Qualidade.xlsx", [{ nome: abaDe(hoje), linhas: [COLUNAS.map((v) => ({ v, s: "h" }))], larguras: larg, congelar: { linha: 1, coluna: 1 } }], { titulo: "Modelo · Controle de Qualidade" }));
    el.querySelector("#exp").addEventListener("click", async (ev) => {
      const de = el.querySelector("#de").value, ate = el.querySelector("#ate").value, m = el.querySelector("#expm");
      ev.target.disabled = true; m.textContent = "Gerando…";
      try {
        const j = await api(`/qualidade/exportar?de=${de}&ate=${ate}`);
        const porSafra = new Map();
        for (const r of j.linhas) { const s = String(r.data_venda).slice(0, 7); if (!porSafra.has(s)) porSafra.set(s, []); porSafra.get(s).push(r); }
        if (!porSafra.size) throw new Error("Nenhuma venda nessas safras.");
        const folhas = [...porSafra.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([s, rs]) => {
          const fpdTom = (x) => (x === "NAO_OK" ? "ruim" : x === "OK" ? "ok" : x === "PRAZO" ? "alerta" : "");
          return { nome: abaDe(s), larguras: larg, congelar: { linha: 1, coluna: 1 }, linhas: [cab, ...rs.map((r) => {
            const f = r.fpd_planilha || r.fpd_calc;
            return [{ v: r.numero_contrato, s: "b" }, r.status_contrato || "", br(r.data_base_qualidade), r.forma_pagamento || "", SIT_TXT[r.f1] || "", br(r.f1_pg), SIT_TXT[r.f2] || "", br(r.f2_pg),
              { v: FPD_TXT[f] || "", s: fpdTom(f) }, FPD_TXT[r.fpd_apos_prazo_planilha] || "", br(r.prazo_limite), r.churn || "", r.obs || "", r.oferta == null ? "" : r.oferta ? "C/ OFERTA" : "S/ OFERTA",
              br(r.data_venda), r.cliente || "", r.vendedor || "", r.equipe || ""].map((x) => (typeof x === "object" ? x : { v: x }));
          })] };
        });
        XLSX7.baixar(`Controle_de_Qualidade_${de}_a_${ate}.xlsx`, folhas, { titulo: "Controle de Qualidade", autor: S.sessao.usuario.nome });
        m.textContent = `${nf.format(j.linhas.length)} contratos em ${folhas.length} aba(s).`;
      } catch (e) { m.textContent = e.message; }
      ev.target.disabled = false;
    });
  };
})();
