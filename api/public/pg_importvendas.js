"use strict";
/* Importar vendas da exportação da operadora (somente Gerente e Administrador): envia o CSV/XLSX, vê a prévia e confirma.
   Só entram contratos que ainda não existem; vendedor não cadastrado fica de fora e aparece na lista. */
(() => {
  const { esc, nf, api, painel, tabela } = S;
  const chave = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

  /** CSV (separador ; ou ,) -> matriz de células. */
  function lerCsv(texto) {
    const t = texto.replace(/^﻿/, ""), primeira = t.split("\n")[0];
    const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ";" : ",";
    const linhas = []; let l = [], c = "", q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"' && t[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; continue; }
      if (ch === '"') q = true; else if (ch === sep) { l.push(c); c = ""; } else if (ch === "\n") { l.push(c.replace(/\r$/, "")); linhas.push(l); l = []; c = ""; } else c += ch;
    }
    if (c || l.length) { l.push(c); linhas.push(l); }
    return linhas;
  }

  /** Matriz -> linhas como objetos (cabeçalho = linha que tem CONTRATO). */
  function paraObjetos(matriz) {
    const ih = matriz.findIndex((l) => (l || []).some((c) => chave(c) === "CONTRATO"));
    if (ih < 0) return [];
    const cab = matriz[ih].map((c) => String(c ?? "").trim());
    const out = [];
    for (const l of matriz.slice(ih + 1)) {
      if (!l || !l.length) continue;
      const o = {};
      cab.forEach((k, i) => { if (k && l[i] != null && String(l[i]).trim() !== "") o[k] = String(l[i]).trim(); });
      if (o.CONTRATO) out.push(o);
    }
    return out;
  }

  async function lerArquivo(f) {
    if (/\.csv$/i.test(f.name)) return paraObjetos(lerCsv(await f.text()));
    const folhas = await XLSX7.ler(f);
    for (const fl of folhas) { const o = paraObjetos(fl.linhas); if (o.length) return o; }
    return [];
  }

  S.PAGES.importvendas = async (el) => {
    el.innerHTML = `<div class="cab"><div><div class="migalha">Vendas</div><h1>Importar vendas da planilha</h1><p>Envie a exportação de vendas da operadora (.csv ou .xlsx). Só entram contratos que ainda não existem no sistema; o que já existe não é alterado. Vendedor que não está cadastrado fica de fora e aparece na lista.</p></div></div>
      ${painel("Enviar exportação", `<label class="soltar" id="drop"><input type="file" id="arq" accept=".csv,.xlsx" hidden><span class="soltar-ic"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg></span><b>Arraste a exportação aqui ou clique para escolher</b><span>.csv ou .xlsx como vem da operadora (colunas CONTRATO, VENDEDOR, CLIENTE, CPF…)</span></label><div id="prev"></div>`, "Nada é gravado antes de você conferir a prévia e confirmar. Pode enviar o mesmo arquivo de novo: as vendas já cadastradas não se repetem.", "exportação")}`;
    let pend = null;
    const prev = el.querySelector("#prev"), arq = el.querySelector("#arq"), drop = el.querySelector("#drop");
    const lista = (titulo, itens, rotulo) => (itens.length ? `<details class="avisos-imp"><summary>${esc(titulo)} (${nf.format(itens.length)})</summary>${tabela([{ t: rotulo, f: (x) => esc(x.nome || x.valor || x.cidade || x.situacao) }, { t: "Linhas", n: 1, f: (x) => nf.format(x.linhas) }], itens.slice(0, 100))}</details>` : "");
    const mostrar = (r, nome) => {
      const ok = r.novas > 0;
      const motivos = Object.entries(r.motivos || {});
      prev.innerHTML = `<div class="prev-imp"><div class="prev-imp-cab"><b>${esc(nome)}</b><span class="mut">prévia · nada gravado ainda</span></div>
        <div class="mini-kpis"><div><span>Linhas lidas</span><b>${nf.format(r.lidas)}</b></div><div><span>Novas (serão gravadas)</span><b class="okt">${nf.format(r.novas)}</b></div><div><span>Já existem (ignoradas)</span><b>${nf.format(r.ja_existem)}</b></div><div><span>Rejeitadas</span><b class="${r.rejeitadas ? "rmt" : ""}">${nf.format(r.rejeitadas)}</b></div></div>
        ${motivos.length ? `<div class="mut" style="margin:8px 0">Motivos das rejeitadas: ${motivos.map(([m, n]) => `${esc(m)} (${nf.format(n)})`).join(" · ")}</div>` : ""}
        ${r.amostra.length ? tabela([{ t: "Contrato", k: "contrato" }, { t: "Data", k: "data" }, { t: "Cliente", k: "cliente" }, { t: "Situação", k: "situacao" }], r.amostra) : ""}
        ${lista("Vendedores não cadastrados (ficam de fora)", r.vendedores_nao_cadastrados, "Vendedor na planilha")}
        ${lista("Planos não reconhecidos (venda entra sem esse item)", r.itens_nao_mapeados, "Plano")}
        ${lista("Cidades não cadastradas (venda entra sem cidade)", r.cidades_nao_cadastradas, "Cidade")}
        ${lista("Situações não reconhecidas (entram como pendentes)", r.situacoes_nao_reconhecidas, "Situação")}
        <div class="rod-imp"><button class="btn sec" id="canc">Cancelar</button><button class="btn" id="conf" ${ok ? "" : "disabled"}>${ok ? `Importar ${nf.format(r.novas)} venda(s) nova(s)` : "Nada novo para importar"}</button></div></div>`;
      prev.querySelector("#canc").onclick = () => { prev.innerHTML = ""; pend = null; arq.value = ""; };
      prev.querySelector("#conf").onclick = async (ev) => {
        ev.target.disabled = true; ev.target.textContent = "Importando…";
        try {
          const g = await api("/importacao-vendas/importar", { method: "POST", body: pend });
          prev.innerHTML = `<div class="aviso ok">Pronto: ${nf.format(g.gravadas)} venda(s) importada(s). ${nf.format(g.ja_existem)} já existiam e foram ignoradas; ${nf.format(g.rejeitadas)} linha(s) ficaram de fora.</div>`;
          pend = null; arq.value = "";
        } catch (e) { ev.target.disabled = false; ev.target.textContent = "Tentar de novo"; prev.insertAdjacentHTML("afterbegin", `<div class="aviso erro">${esc(e.message)}</div>`); }
      };
    };
    const processar = async (f) => {
      if (!f) return;
      prev.innerHTML = `<p class="mut">Lendo ${esc(f.name)}…</p>`;
      try {
        const linhas = await lerArquivo(f);
        if (!linhas.length) throw new Error("Não achei a coluna CONTRATO no arquivo. Envie a exportação de vendas da operadora.");
        pend = { arquivo: f.name, linhas };
        mostrar(await api("/importacao-vendas/analisar", { method: "POST", body: pend }), f.name);
      } catch (e) { prev.innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; pend = null; }
    };
    arq.addEventListener("change", () => processar(arq.files[0]));
    ["dragover", "dragenter"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("sobre")));
    drop.addEventListener("drop", (e) => { e.preventDefault(); processar(e.dataTransfer.files[0]); });
  };
})();
