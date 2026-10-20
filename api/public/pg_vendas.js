"use strict";
/* Vendas: lista, detalhe/edição, cadastro unitário e lançamento em lote */
(() => {
  const { esc, nf, brl, dt, tabela, painel, api, modal } = S;
  const staff = () => ["gestor", "backoffice"].includes(S.sessao.usuario.perfil);   // quem opera vendas (criar/editar)
  const eqp = () => ["lider", "coordenador"].includes(S.sessao.usuario.perfil);
  const opt = (arr, val, txt, sel, vazio) => (vazio ? `<option value="">${esc(vazio)}</option>` : "") + arr.map((x) => `<option value="${esc(val(x))}" ${String(val(x)) === String(sel ?? "") ? "selected" : ""}>${esc(txt(x))}</option>`).join("");
  const STATUS_V = ["PENDENTE", "ATIVO", "CANCELADO"], STATUS_C = ["CONECTADO", "DESABILITADO", "DESC INADIMPLENCIA", "DESC OPÇÃO", "CANCELADO"];
  const ROT_VENDA = { ATIVO: "INSTALADA", PENDENTE: "PENDENTE", CANCELADO: "CANCELADA" };   // "ATIVO" no banco = "Instalada" na linguagem da operadora
  const tagStatus = (s) => `<span class="tag ${{ ATIVO: "ok", PENDENTE: "alerta", CANCELADO: "ruim" }[s] || ""}">${esc(ROT_VENDA[s] || s)}</span>`;
  const campo = (rot, html, c = "c3") => `<div class="campo ${c}"><label>${esc(rot)}</label>${html}</div>`;
  const iso = (d) => (d ? String(d).slice(0, 10) : "");
  /** Endereço do DF aparece como Brasília-DF (só na tela; o dado guardado não muda). */
  const cidadeTela = (r) => (r.uf === "DF" ? "Brasília-DF" : (r.cidade ?? ""));
  /** Campo que só aceita números (CPF/CNPJ): bloqueia letras ao digitar e limpa pontos/traços ao colar. */
  const soNumeros = (i, max = 14) => {
    i.addEventListener("beforeinput", (e) => { if (e.data && e.inputType === "insertText" && /\D/.test(e.data)) e.preventDefault(); });
    i.addEventListener("input", () => { const v = i.value.replace(/\D/g, "").slice(0, max); if (v !== i.value) i.value = v; });
  };
  S.filtrarVendas = (f) => { filtro = { busca: "", status: "", de: "", ate: "", vendedor: "", pagina: 1, ...f }; if (location.hash === "#/vendas") S.PAGES.vendas(document.getElementById("ct")).catch(S.erroEm(document.getElementById("ct"))); else location.hash = "#/vendas"; };

  /* ---------- lista ---------- */
  let filtro = { busca: "", status: "", de: "", ate: "", vendedor: "", pagina: 1 };
  S.PAGES.vendas = async (el) => {
    let cat = staff() ? await S.catalogos() : null;
    if (eqp()) {   // supervisor/coordenador: o filtro de vendedor lista só quem está no escopo dele
      const m = new Map(); (await api("/equipe/desempenho")).forEach((r) => m.set(r.vendedor_id, r.vendedor_nome));
      cat = { vendedores: [...m].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)) };
    }
    const qs = () => Object.entries(filtro).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    const j = await api("/contratos?" + qs());
    const paginas = Math.max(1, Math.ceil(j.total / 50));
    if (document.body.classList.contains("app-vendedor") && !staff() && !eqp()) return appVendas(el, j, paginas);
    el.innerHTML = `<div class="cab"><div><div class="migalha">Vendas</div><h1>${staff() ? "Lista de vendas" : eqp() ? (S.sessao.usuario.perfil === "lider" ? "Vendas da equipe" : "Vendas da coordenação") : "Minhas vendas"}</h1>${staff() ? "" : `<div class="mut" style="margin-top:3px">${eqp() ? "Você vê apenas as vendas da sua " + (S.sessao.usuario.perfil === "lider" ? "equipe" : "coordenação") + " e as suas próprias." : "Você vê apenas as suas próprias vendas."}</div>`}</div>
      ${staff() && !(S.sessao.usuario.perfil === "backoffice" && S.sessao.usuario.setor === "QUALIDADE") ? `<div class="acoes"><a class="btn sec" href="#/lote">Lançamento em lote</a><a class="btn" href="#/nova">Nova venda</a></div>` : ""}</div>
      <div class="filtros">${campo("Buscar (nome, CPF/CNPJ ou contrato)", `<input id="fb" value="${esc(filtro.busca)}">`, "").replace('class="campo "', 'class="campo" style="width:250px"')}
        <div class="campo" style="width:130px"><label>Situação</label><select id="fs">${opt(STATUS_V, (x) => x, (x) => ROT_VENDA[x] || x, filtro.status, "Todas")}</select></div>
        <div class="campo" style="width:140px"><label>Venda de</label><input id="fd" type="date" value="${esc(filtro.de)}"></div>
        <div class="campo" style="width:140px"><label>até</label><input id="fa" type="date" value="${esc(filtro.ate)}"></div>
        ${cat ? `<div class="campo" style="width:200px"><label>Vendedor</label><select id="fv">${opt(cat.vendedores, (x) => x.id, (x) => x.nome, filtro.vendedor, "Todos")}</select></div>` : ""}
        <button class="btn" id="ok">Filtrar</button><button class="btn sec" id="lp">Limpar</button><button class="btn sec" id="ex" title="Baixa todas as vendas do filtro atual, não só esta página">Exportar CSV (${nf.format(j.total)})</button></div>
      <div class="tab"><table><thead><tr><th>Contrato</th><th>Data</th><th>Cliente</th><th>Vendedor</th><th>Situação</th><th>Status do contrato</th><th>Origem</th><th>Cidade</th><th class="num">Pacote</th></tr></thead>
      <tbody>${j.itens.map((r) => `<tr ${staff() ? `class="clic" data-id="${r.contrato_id}"` : ""}><td>${esc(r.numero_contrato ?? "–")}</td><td>${dt(r.data_venda)}</td><td>${esc(r.cliente ?? "")}</td><td>${esc(r.vendedor ?? "")}</td>
        <td>${tagStatus(r.status_venda)}</td><td>${esc(r.status_contrato ?? "")}</td><td>${esc(r.origem ?? "")}</td><td>${esc(cidadeTela(r))}</td><td class="num">${brl(r.pacote_valor)}</td></tr>`).join("") || `<tr><td colspan="9" class="mut">Nenhuma venda encontrada.</td></tr>`}</tbody></table></div>
      <div class="pag"><button class="btn sec pq" id="an" ${j.pagina <= 1 ? "disabled" : ""}>‹ Anterior</button><span>Exibindo ${j.itens.length ? (j.pagina - 1) * 50 + 1 : 0}–${(j.pagina - 1) * 50 + j.itens.length} de ${nf.format(j.total)} · página ${j.pagina}/${paginas}</span><button class="btn sec pq" id="px" ${j.pagina >= paginas ? "disabled" : ""}>Próxima ›</button></div>`;
    const go = () => S.PAGES.vendas(el).catch(S.erroEm(el));
    el.querySelector("#ok").addEventListener("click", () => { filtro = { busca: el.querySelector("#fb").value.trim(), status: el.querySelector("#fs").value, de: el.querySelector("#fd").value, ate: el.querySelector("#fa").value, vendedor: el.querySelector("#fv")?.value || "", pagina: 1 }; go(); });
    el.querySelector("#fb").addEventListener("keydown", (e) => e.key === "Enter" && el.querySelector("#ok").click());
    el.querySelector("#lp").addEventListener("click", () => { filtro = { busca: "", status: "", de: "", ate: "", vendedor: "", pagina: 1 }; go(); });
    el.querySelector("#ex").addEventListener("click", (e) => { const b = e.target; b.disabled = true; const q = qs().replace(/(^|&)pagina=\d+/, "").replace(/^&/, ""); S.baixar("/exportar/contratos?" + q, "vendas-" + new Date().toISOString().slice(0, 10) + ".csv").catch((x) => alert(x.message)).finally(() => (b.disabled = false)); });
    el.querySelector("#an").addEventListener("click", () => { filtro.pagina--; go(); });
    el.querySelector("#px").addEventListener("click", () => { filtro.pagina++; go(); });
    el.querySelectorAll("tr.clic").forEach((tr) => tr.addEventListener("click", () => (location.hash = "#/venda/" + tr.dataset.id)));
  };

  /* ---------- app do vendedor: vendas em cartões, busca e situação em um toque ---------- */
  const ROT_ST = { "": "Todas", PENDENTE: "Pendentes", ATIVO: "Instaladas", CANCELADO: "Canceladas" };
  const COR_ST = { ATIVO: "ok", PENDENTE: "alerta", CANCELADO: "ruim" };
  const NOME_ST = { ATIVO: "Instalada", PENDENTE: "Pendente", CANCELADO: "Cancelada" };
  function appVendas(el, j, paginas) {
    const go = () => S.PAGES.vendas(el).catch(S.erroEm(el));
    // Mês/ano: últimos 12 meses. "Todos os meses" = sem filtro de data (comportamento anterior).
    const hoje = new Date(), meses = [];
    for (let i = 0; i < 12; i++) { const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); meses.push({ v: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, t: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) }); }
    const mesSel = filtro.de && filtro.de.endsWith("-01") && filtro.ate && filtro.ate.slice(0, 7) === filtro.de.slice(0, 7) ? filtro.de.slice(0, 7) : "";
    el.innerHTML = `<div class="ap-cab"><h1>Minhas vendas</h1><span>${nf.format(j.total)} ${j.total === 1 ? "venda" : "vendas"}${filtro.status ? " · " + ROT_ST[filtro.status].toLowerCase() : ""}</span></div>
      <form class="ap-busca" id="fbusca"><input id="fb" type="search" enterkeyhint="search" placeholder="Buscar contrato ou CPF" value="${esc(filtro.busca)}"><button class="btn" aria-label="Buscar"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg></button></form>
      <label class="ap-mes">Mês<select id="fmes"><option value="">Todos os meses</option>${meses.map((x) => `<option value="${x.v}" ${x.v === mesSel ? "selected" : ""}>${x.t}</option>`).join("")}</select></label>
      <div class="ap-chips">${Object.entries(ROT_ST).map(([k, n]) => `<button type="button" data-st="${k}" class="${filtro.status === k ? "on" : ""}">${n}</button>`).join("")}</div>
      <div class="ap-lista">${j.itens.map((r, i) => `<article class="ap-venda ${COR_ST[r.status_venda] || ""}" data-i="${i}" role="button" tabindex="0">
          <div class="ap-v-topo"><b>${esc(r.cliente || (r.numero_contrato ? "Contrato " + r.numero_contrato : "Venda"))}</b><span class="tag ${COR_ST[r.status_venda] || ""}">${esc(NOME_ST[r.status_venda] || r.status_venda || "")}</span></div>
          <div class="ap-v-prod">${[r.tem_bl && "Banda larga", r.tem_tv && "TV", r.tem_movel && "Móvel", r.tem_multi && "Multi"].filter(Boolean).map((x) => `<span>${x}</span>`).join("")}</div>
          <div class="ap-v-info"><span>${dt(r.data_venda)}</span>${r.cliente && r.numero_contrato ? `<span>Contrato ${esc(r.numero_contrato)}</span>` : ""}${r.cidade ? `<span>${esc(r.cidade)}</span>` : ""}${r.forma_pagamento ? `<span>${esc(r.forma_pagamento === "DCC" ? "Débito em conta" : r.forma_pagamento.toLowerCase())}</span>` : ""}</div>
          ${r.motivo ? `<div class="ap-v-st">Motivo: ${esc(r.motivo)}</div>` : ""}
          ${r.status_contrato ? `<div class="ap-v-st">${esc(r.status_contrato)}</div>` : ""}</article>`).join("") || `<div class="ap-vazio"><b>Nenhuma venda encontrada</b><span>${filtro.busca || filtro.status ? "Tente outra busca ou toque em “Todas”." : "Assim que suas vendas forem lançadas, elas aparecem aqui."}</span></div>`}</div>
      ${paginas > 1 ? `<div class="ap-pag"><button class="btn sec" id="an" ${j.pagina <= 1 ? "disabled" : ""}>‹ Anteriores</button><span>${j.pagina} de ${paginas}</span><button class="btn sec" id="px" ${j.pagina >= paginas ? "disabled" : ""}>Próximas ›</button></div>` : ""}`;
    el.querySelector("#fbusca").addEventListener("submit", (e) => { e.preventDefault(); filtro = { ...filtro, busca: el.querySelector("#fb").value.trim(), pagina: 1 }; go(); });
    el.querySelectorAll("[data-st]").forEach((b) => b.addEventListener("click", () => { filtro = { ...filtro, status: b.dataset.st, pagina: 1 }; go(); }));
    el.querySelector("#fmes").addEventListener("change", (e) => {
      const m = e.target.value, [y, mo] = m ? m.split("-").map(Number) : [0, 0];
      filtro = { ...filtro, de: m ? `${m}-01` : "", ate: m ? `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}` : "", pagina: 1 }; go();
    });
    el.querySelector("#an")?.addEventListener("click", () => { filtro.pagina--; go(); });
    el.querySelector("#px")?.addEventListener("click", () => { filtro.pagina++; go(); });
    el.querySelectorAll(".ap-venda[data-i]").forEach((c) => c.addEventListener("click", () => detalheApp(j.itens[+c.dataset.i])));
  }
  /** Toque numa venda: abre a ficha dela por baixo da tela (folha do app). */
  function detalheApp(r) {
    const lin = (k, v) => (v ? `<div class="ap-ficha-l"><span>${k}</span><b>${v}</b></div>` : "");
    const prods = [r.tem_bl && "Banda larga", r.tem_tv && "TV", r.tem_movel && "Móvel", r.tem_multi && "Multi"].filter(Boolean).join(" · ");
    const m = S.modal(r.numero_contrato ? "Contrato " + r.numero_contrato : "Venda", `<div class="ap-ficha"><div class="ap-ficha-st"><span class="tag ${COR_ST[r.status_venda] || ""}">${esc(NOME_ST[r.status_venda] || r.status_venda || "")}</span></div>
      ${lin("Data da venda", dt(r.data_venda))}${lin("Produtos", esc(prods))}${lin("Status do contrato", esc(r.status_contrato || ""))}${lin("Cidade", esc([r.bairro, r.uf === "DF" ? "Brasília-DF" : r.cidade].filter(Boolean).join(" · ")))}
      ${lin("Pagamento", esc(r.forma_pagamento === "DCC" ? "Débito em conta" : r.forma_pagamento || ""))}${lin("Origem", esc(r.origem || ""))}${lin("Motivo", esc(r.motivo || ""))}</div>`, `<button class="btn" type="button" data-fecha>Fechar</button>`);
    m.querySelector("[data-fecha]").addEventListener("click", () => m.remove());
  }

  /* ---------- produtos (checklist) ---------- */
  const NOME_CAT = { FIBRA: "Internet", TV: "TV", MOVEL: "Móvel", MESH: "Wi-Fi Mesh", FONE: "Fone", STREAMING: "MPlay", PONTO_ADICIONAL: "Ponto adicional" };
  /** Produtos em "chips": uma linha por categoria; clicar liga/desliga; ao marcar aparece o controle de quantidade. */
  const resumoProdutos = (cat, sel) => sel.length ? sel.map((x) => `<span class="rp">${x.q > 1 ? x.q + "× " : ""}${esc(x.nome)}</span>`).join("") : `<span class="mut">Nenhum produto marcado</span>`;
  function checklistProdutos(cat, marcados = []) {
    const m = new Map(marcados.map((i) => [i.produto_id, i]));
    const grupos = {}; cat.produtos.forEach((p) => (grupos[p.categoria] ||= []).push(p));
    const sel = cat.produtos.filter((p) => m.has(p.id)).map((p) => ({ nome: p.nome, q: m.get(p.id).quantidade || 1 }));
    const ORDEM = ["FIBRA", "TV", "MOVEL", "FONE", "MESH", "STREAMING", "PONTO_ADICIONAL"], gs = Object.entries(grupos).sort((a, b) => (ORDEM.indexOf(a[0]) + 1 || 99) - (ORDEM.indexOf(b[0]) + 1 || 99));
    return `<div class="prods"><div class="prods-sel"><b>Selecionados</b><div class="rps">${resumoProdutos(cat, sel)}</div></div>
      ${gs.map(([g, ps]) => `<div class="prods-cat"><div class="prods-nome">${esc(NOME_CAT[g] || g)}</div><div class="prods-chips">
        ${ps.map((p) => { const x = m.get(p.id); return `<label class="chip ${x ? "on" : ""}"><input type="checkbox" data-p="${p.id}" data-n="${esc(p.nome)}" ${x ? "checked" : ""}><span class="cn">${esc(p.nome)}</span><span class="qt" title="Quantidade"><button type="button" class="qm" tabindex="-1">−</button><input type="number" min="1" value="${x?.quantidade || 1}" data-q="${p.id}"><button type="button" class="qp" tabindex="-1">+</button></span></label>`; }).join("")}</div></div>`).join("")}</div>`;
  }
  if (!window.__prodsLigado) {
    window.__prodsLigado = true;
    const atualiza = (box) => {
      const sel = [...box.querySelectorAll("input[data-p]:checked")].map((c) => ({ nome: c.dataset.n, q: +box.querySelector(`input[data-q="${c.dataset.p}"]`).value || 1 }));
      box.querySelector(".rps").innerHTML = resumoProdutos(null, sel);
    };
    document.addEventListener("change", (e) => { const c = e.target; if (c.matches?.(".prods input[data-p]")) { c.closest(".chip").classList.toggle("on", c.checked); atualiza(c.closest(".prods")); } else if (c.matches?.(".prods input[data-q]")) atualiza(c.closest(".prods")); });
    document.addEventListener("click", (e) => {
      const b = e.target.closest?.(".prods .qm, .prods .qp"); if (!b) return;
      e.preventDefault(); const i = b.parentElement.querySelector("input"); i.value = Math.max(1, (+i.value || 1) + (b.classList.contains("qp") ? 1 : -1)); i.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  const lerProdutos = (el) => [...el.querySelectorAll("input[data-p]:checked")].map((c) => ({ produto_id: +c.dataset.p, quantidade: +el.querySelector(`input[data-q="${c.dataset.p}"]`).value || 1 }));

  /* ---------- campos da venda (formulário unitário e edição) ---------- */
  function camposVenda(cat, v = {}) {
    return `${campo("Data da venda", `<input name="data_venda" type="date" value="${iso(v.data_venda) || iso(new Date().toISOString())}" required>`)}
      ${campo("Nº do contrato", `<input name="numero_contrato" inputmode="numeric" value="${esc(v.numero_contrato ?? "")}">`)}
      ${campo("Vendedor", `<select name="vendedor_id" ${v.id ? "disabled" : "required"}>${opt(cat.vendedores, (x) => x.id, (x) => x.nome, v.vendedor_id, "Selecione…")}</select>`, "c4")}
      ${campo("Equipe", `<select name="equipe_id">${opt(cat.equipes, (x) => x.id, (x) => x.nome, v.equipe_id, "Automática (última do vendedor)")}</select>`, "c2")}
      ${campo("Origem", `<select name="origem" ${v.id ? "" : "required"}>${opt(cat.origens, (x) => x.codigo, (x) => x.codigo, v.origem, "Selecione…")}</select>`, "c2")}
      ${campo("Canal", `<select name="canal">${opt(cat.canais, (x) => x.codigo, (x) => x.codigo, v.canal, "–")}</select>`, "c2")}
      ${campo("Tipo", `<select name="tipo_contrato">${opt(cat.tipos, (x) => x.codigo, (x) => x.codigo, v.tipo_contrato || "PROSPECT")}</select>`, "c2")}
      ${campo("Forma de pagamento", `<select name="forma_pagamento">${opt(cat.formas, (x) => x.codigo, (x) => x.codigo + (x.codigo === "DCC" ? " (débito em conta)" : ""), v.forma_pagamento, "–")}</select>`, "c3")}
      ${campo("Dia do vencimento", `<input name="dia_vencimento" type="number" min="1" max="31" value="${esc(v.dia_vencimento ?? "")}">`, "c2")}
      ${campo("Valor do pacote (R$)", `<input name="pacote_valor" inputmode="decimal" value="${v.pacote_valor ?? ""}">`, "c2")}
      ${campo("Cidade", `<select name="cidade_id" required>${opt(cat.cidades, (x) => x.id, (x) => `${x.uf} - ${x.nome}`, v.cidade_id, "Selecione…")}</select>`, "c3")}
      ${campo("Bairro", `<input name="bairro" value="${esc(v.bairro ?? "")}">`, "c3")}
      ${campo("Endereço", `<input name="endereco" value="${esc(v.endereco ?? "")}">`, "c6")}
      ${campo("Agendamento", `<input name="data_agendamento" type="date" value="${iso(v.data_agendamento)}">`, "c3")}
      ${campo("Turno", `<select name="turno">${opt(cat.turnos, (x) => x.codigo, (x) => x.codigo, v.turno, "–")}</select>`, "c3")}
      ${campo("Observação", `<input name="observacao" value="${esc(v.observacao ?? "")}">`, "c6")}`;
  }
  const lerForm = (form) => Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, v]));

  /* ---------- nova venda ---------- */
  S.PAGES.nova = async (el) => {
    const cat = await S.catalogos();
    el.innerHTML = `<div class="cab"><div><div class="migalha">Vendas</div><h1>Nova venda</h1></div><div class="acoes"><a class="btn sec" href="#/lote">Cadastrar várias de uma vez</a></div></div>
      <form id="f"><section class="painel"><h2><span>Cliente</span><small id="cli"></small></h2><div class="corpo"><div class="form">
        ${campo("CPF / CNPJ", `<input name="documento" inputmode="numeric" maxlength="14" pattern="(\\d{11}|\\d{14})" title="Somente números: 11 dígitos (CPF) ou 14 (CNPJ)" placeholder="só números" required autocomplete="off">`)}
        ${campo("Nome completo / razão social", `<input name="nome" required>`, "c6")}
        ${campo("Nascimento", `<input name="data_nascimento" type="date">`, "c3")}
        ${campo("Telefone principal", `<input name="contato" inputmode="tel" placeholder="(69) 99999-9999">`, "c3")}
        ${campo("Telefone 2", `<input name="contato_2" inputmode="tel">`, "c3")}</div></div></section>
      <section class="painel"><h2><span>Venda</span></h2><div class="corpo"><div class="form">${camposVenda(cat)}</div></div></section>
      <section class="painel"><h2><span>Produtos</span><small>marque e ajuste a quantidade</small></h2><div class="corpo">${checklistProdutos(cat)}</div></section>
      <div id="msg"></div><div style="display:flex;gap:8px"><button class="btn" type="submit" id="sv">Salvar venda</button><a class="btn sec" href="#/vendas">Cancelar</a></div></form>`;
    const f = el.querySelector("#f");
    soNumeros(f.documento);
    f.documento.addEventListener("blur", async () => {   // reaproveita cliente já cadastrado
      const d = f.documento.value.replace(/\D/g, "");
      if (d.length < 9) return;
      try {
        const r = (await api("/clientes?busca=" + d)).find((c) => c.documento === d.padStart(d.length > 11 ? 14 : 11, "0"));
        el.querySelector("#cli").textContent = r ? "Cliente já cadastrado" : "Cliente novo";
        aviso2p(r);
        if (r) { f.nome.value = r.nome; f.contato.value ||= r.contato || ""; f.contato_2.value ||= r.contato_2 || ""; f.data_nascimento.value ||= iso(r.data_nascimento); }
      } catch {}
    });
    // CPF/CNPJ já cadastrado: não barra, só avisa e pergunta se é um segundo ponto
    let doc2 = null;   // { cliente, segundoPonto: true|false|null }
    const aviso2p = (r) => {
      let box = el.querySelector("#doc2"); if (!box) { box = document.createElement("div"); box.id = "doc2"; el.querySelector("#cli").closest("section").after(box); }
      if (!r) { doc2 = null; box.innerHTML = ""; return; }
      doc2 = { cliente: r, segundoPonto: null };
      const n = r.contratos || 0, ult = r.ultima_venda ? S.dt(r.ultima_venda) : "–";
      box.innerHTML = `<div class="aviso aviso-2p"><b>Já existe cadastro com este ${esc(r.tipo_pessoa)}:</b> ${esc(r.nome)}.
        ${n ? `Ele já tem <b>${n}</b> venda(s)${r.situacoes ? " (" + esc(r.situacoes) + ")" : ""}, a última em ${esc(ult)}.` : "Ainda não tem vendas."}
        <div style="margin-top:6px"><b>Esta venda é um segundo ponto (nova contratação do mesmo cliente)?</b></div>
        <div class="seg" style="margin-top:6px"><button type="button" data-r="1">Sim, é um segundo ponto</button><button type="button" data-r="0">Não, é outro contrato / conferir CPF</button></div>
        <div class="mut" style="margin-top:6px">O sistema não bloqueia: a venda será gravada no cadastro que já existe. A resposta fica na observação da venda.</div></div>`;
      box.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => { doc2.segundoPonto = b.dataset.r === "1"; box.querySelectorAll("[data-r]").forEach((x) => x.classList.toggle("on", x === b)); }));
    };
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const msg = el.querySelector("#msg"); msg.innerHTML = ""; el.querySelector("#sv").disabled = true;
      try {
        const linha = { ...lerForm(f), produtos: lerProdutos(f) };
        if (!linha.produtos.length) throw Object.assign(new Error("Marque ao menos 1 produto."), {});
        if (doc2?.segundoPonto) linha.observacao = ("[2º ponto] " + (linha.observacao || "")).trim();
        const j = await api("/vendas", { method: "POST", body: { linhas: [linha], gravar: true } });
        const r = j.resultado[0];
        if (!r.ok) { msg.innerHTML = `<div class="aviso erro">${r.erros.map(esc).join("<br>")}</div>`; return; }
        msg.innerHTML = `<div class="aviso" style="border-color:var(--okl);background:var(--okb)">Venda salva${r.cliente_novo ? "" : " (cliente já existia)"}. <a href="#/venda/${r.contrato_id}">Abrir</a> · <a href="#/nova" id="outra">Cadastrar outra</a></div>`;
        el.querySelector("#outra").addEventListener("click", (e) => { e.preventDefault(); S.PAGES.nova(el); });
        window.scrollTo(0, document.body.scrollHeight);
      } catch (e) { msg.innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; }
      finally { el.querySelector("#sv") && (el.querySelector("#sv").disabled = false); }
    });
  };

  /* ---------- detalhe / edição ---------- */
  S.PAGES.venda = async (el, id) => {
    const [cat, d] = await Promise.all([S.catalogos(), api("/contratos/" + parseInt(id, 10))]);
    const c = d.contrato, gestor = S.sessao.usuario.perfil === "gestor", soLeitura = S.sessao.usuario.perfil === "backoffice" && S.sessao.usuario.setor === "QUALIDADE";
    el.innerHTML = `<div class="cab"><div><div class="migalha"><a href="#/vendas">Vendas</a> › contrato ${esc(c.numero_contrato ?? "s/ nº")}</div><h1>${esc(c.cliente_nome)} ${tagStatus(c.status_venda)}</h1></div>
      <div class="acoes">${gestor ? `<button class="btn ruim" id="ap">Apagar venda</button>` : ""}${soLeitura ? "" : `<button class="btn" id="sv">Salvar alterações</button>`}</div></div>
      <div id="msg"></div><form id="f"><div class="grade" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start">
      <div><section class="painel"><h2><span>Situação</span></h2><div class="corpo"><div class="form">
        ${campo("Situação da venda", `<select name="status_venda">${opt(STATUS_V, (x) => x, (x) => ROT_VENDA[x] || x, c.status_venda)}</select>`, "c4")}
        ${campo("Status do contrato", `<select name="status_contrato">${opt(STATUS_C, (x) => x, (x) => x, c.status_contrato, "–")}</select>`, "c4")}
        ${campo("Motivo (cancelamento / pendência)", `<select name="motivo_id">${opt(cat.motivos, (x) => x.id, (x) => (x.codigo ? x.codigo + " · " : "") + x.descricao, c.motivo_id, "–")}</select>`, "c4")}</div></div></section>
      <section class="painel"><h2><span>Venda</span><small>vendedor: ${esc(c.vendedor_nome)}</small></h2><div class="corpo"><div class="form">${camposVenda(cat, { ...c, id: c.id })}</div></div></section>
      <section class="painel"><h2><span>Cliente</span><small>${esc(c.tipo_pessoa)} ${esc(c.documento ?? "sem documento")}</small></h2><div class="corpo"><div class="form">
        ${campo("Nome", `<input name="c_nome" value="${esc(c.cliente_nome)}">`, "c6")}${campo("Nascimento", `<input name="c_data_nascimento" type="date" value="${iso(c.data_nascimento)}">`, "c3")}
        ${campo("Telefone", `<input name="c_contato" value="${esc(c.contato ?? "")}">`, "c3")}${campo("Telefone 2", `<input name="c_contato_2" value="${esc(c.contato_2 ?? "")}">`, "c3")}</div></div></section>
      <section class="painel"><h2><span>Produtos</span>${gestor ? "" : `<small>remover produto: só gerente ou administrador</small>`}</h2><div class="corpo">${checklistProdutos(cat, d.itens)}</div></section></div>
      <div><section class="painel ob-painel"><h2><span>Observações do cliente</span><small>histórico · não se apaga</small></h2><div class="corpo" id="obs"><p class="mut">Carregando…</p></div></section>
        ${painel("Faturas", tabela([{ t: "Nº", k: "numero" }, { t: "Vencimento", f: (r) => dt(r.vencimento) }, { t: "Pago em", f: (r) => dt(r.data_pagamento) }, { t: "Situação", f: (r) => esc((r.situacao || "").replaceAll("_", " ").toLowerCase()) }], d.faturas))}
        ${painel("Histórico de status", tabela([{ t: "Quando", f: (r) => dt(r.ocorrido_em) }, { t: "Venda", f: (r) => esc(ROT_VENDA[r.status_venda] || r.status_venda || "") }, { t: "Contrato", k: "status_contrato" }], d.historico))}
        ${gestor ? painel("Quem alterou", tabela([{ t: "Quando", f: (r) => dt(r.em) }, { t: "Quem", f: (r) => esc(r.quem ?? "carga") }, { t: "Ação", k: "acao" }, { t: "Campos", f: (r) => esc(Object.keys(r.depois || {}).slice(0, 4).join(", ")) }], d.alteracoes)) : ""}</div></div></form>`;
    const f = el.querySelector("#f"), msg = el.querySelector("#msg");
    observacoes(el.querySelector("#obs"), c);
    el.querySelector("#sv")?.addEventListener("click", async () => {
      msg.innerHTML = "";
      const v = lerForm(f);
      const corpo = { status_venda: v.status_venda, status_contrato: v.status_contrato, motivo_id: v.motivo_id ? +v.motivo_id : null, data_venda: v.data_venda, numero_contrato: v.numero_contrato || null,
        equipe_id: v.equipe_id ? +v.equipe_id : null, origem: v.origem, canal: v.canal, tipo_contrato: v.tipo_contrato, forma_pagamento: v.forma_pagamento, dia_vencimento: v.dia_vencimento || null,
        pacote_valor: v.pacote_valor ? String(v.pacote_valor).replace(",", ".") : null, cidade_id: +v.cidade_id, bairro: (v.bairro || "").toUpperCase(), endereco: (v.endereco || "").toUpperCase(),
        data_agendamento: v.data_agendamento || null, turno: v.turno, observacao: v.observacao,
        cliente: { nome: (v.c_nome || "").toUpperCase(), data_nascimento: v.c_data_nascimento || null, contato: v.c_contato, contato_2: v.c_contato_2 }, itens: lerProdutos(f) };
      delete corpo.tipo_contrato;   // tipo é definido na criação
      try { await api("/contratos/" + c.id, { method: "PATCH", body: corpo }); msg.innerHTML = `<div class="aviso" style="border-color:var(--okl);background:var(--okb)">Alterações salvas.</div>`; setTimeout(() => S.PAGES.venda(el, c.id).catch(S.erroEm(el)), 700); }
      catch (e) { msg.innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; window.scrollTo(0, 0); }
    });
    el.querySelector("#ap")?.addEventListener("click", () => {
      const m = modal("Apagar venda", `<p>Esta ação remove a venda <b>${esc(c.numero_contrato ?? "")}</b> de <b>${esc(c.cliente_nome)}</b>, com itens, faturas e histórico. O registro fica guardado no histórico de alterações, mas a venda não volta sozinha.</p><p>Digite <b>APAGAR</b> para confirmar:</p><input id="cf">`,
        `<button class="btn sec" id="nx">Cancelar</button><button class="btn ruim" id="ok">Apagar</button>`);
      m.querySelector("#nx").addEventListener("click", () => m.remove());
      m.querySelector("#ok").addEventListener("click", async () => {
        if (m.querySelector("#cf").value.trim() !== "APAGAR") return;
        try { await api("/contratos/" + c.id, { method: "DELETE" }); m.remove(); location.hash = "#/vendas"; } catch (e) { m.remove(); msg.innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; }
      });
    });
  };

  /** Observações do cliente: histórico com data e autor (vale para todas as vendas do mesmo cliente). */
  async function observacoes(box, c) {
    const lista = await api(`/clientes/${c.cliente_id}/obs`).catch((e) => { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return null; });
    if (!lista) return;
    const quando = (d) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
    box.innerHTML = `${S.sessao.vercomo ? "" : `<div class="ob-form"><textarea id="ob-t" rows="3" maxlength="2000" placeholder="Anotar algo sobre o cliente (ligação, pedido, combinado…)"></textarea><div><button type="button" class="btn pq" id="ob-s">Salvar observação</button></div></div>`}
      <ol class="ob-lista">${lista.length ? lista.map((o) => `<li><div class="ob-txt">${esc(o.texto).replace(/\n/g, "<br>")}</div><div class="ob-meta">${esc(o.autor || "—")} · ${quando(o.em)}${o.numero_contrato && o.contrato_id !== c.id ? ` · venda ${esc(o.numero_contrato)}` : ""}</div></li>`).join("") : `<li class="mut ob-vazio">Nenhuma observação ainda.</li>`}</ol>`;
    // (sem <form>: este painel fica dentro do formulário da venda e formulário dentro de formulário não funciona)
    box.querySelector("#ob-s")?.addEventListener("click", async (e) => {
      const t = box.querySelector("#ob-t").value.trim(); if (!t) { box.querySelector("#ob-t").focus(); return; }
      e.currentTarget.disabled = true;
      try { await api(`/clientes/${c.cliente_id}/obs`, { method: "POST", body: { texto: t, contrato_id: c.id } }); observacoes(box, c); }
      catch (er) { alert(er.message); e.currentTarget.disabled = false; }
    });
  }

  /* ---------- lançamento em lote ---------- */
  const COLS = [
    ["data_venda", "Data venda", 96, "dd/mm/aaaa"], ["nome", "Nome do cliente", 200], ["documento", "CPF/CNPJ", 130], ["contato", "Telefone", 120], ["vendedor", "Vendedor (login)", 150, null, "dl-v"],
    ["origem", "Origem", 90, null, "dl-o"], ["cidade", "Cidade", 190, "UF - CIDADE", "dl-c"], ["bairro", "Bairro", 130], ["endereco", "Endereço", 190], ["dia_vencimento", "Venc.", 54],
    ["forma_pagamento", "Pagamento", 96, null, "dl-f"], ["pacote_valor", "Pacote R$", 80], ["produtos", "Produtos (separe com ;)", 300, "500; MOVEL PÓS 30 GB; 2x WI-FI MESH"], ["numero_contrato", "Nº contrato", 100],
  ];
  S.PAGES.lote = async (el) => {
    const cat = await S.catalogos();
    el.innerHTML = `<div class="cab"><div><div class="migalha">Vendas</div><h1>Lançamento em lote</h1></div><div class="acoes"><a class="btn sec" href="#/importvendas">Importar planilha da operadora</a><a class="btn sec" href="#/nova">Venda única (formulário)</a></div></div>
      <div class="aviso">Cole direto do Excel (Ctrl+V) a partir da primeira célula, na ordem das colunas abaixo, ou digite. <b>Validar</b> mostra os erros linha a linha sem gravar; <b>Gravar</b> salva as linhas corretas e mantém as com erro para você corrigir. Novas vendas entram como <b>Pendente</b>.</div>
      <div class="filtros"><div class="campo" style="width:190px"><label>Preencher vendedor vazio com</label><input id="dv" list="dl-v" placeholder="login"></div>
        <div class="campo" style="width:110px"><label>Origem</label><input id="do" list="dl-o"></div><div class="campo" style="width:140px"><label>Data</label><input id="dd" type="date"></div>
        <button class="btn sec" id="pf">Preencher linhas</button><span style="flex:1"></span><button class="btn sec" id="ml">+ 10 linhas</button><button class="btn sec" id="va">Validar</button><button class="btn" id="gr">Gravar válidas</button></div>
      <datalist id="dl-v">${cat.vendedores.map((v) => `<option value="${esc(v.login)}">${esc(v.nome)}</option>`).join("")}</datalist>
      <datalist id="dl-o">${cat.origens.map((o) => `<option value="${esc(o.codigo)}">`).join("")}</datalist>
      <datalist id="dl-c">${cat.cidades.map((c) => `<option value="${esc(c.uf + " - " + c.nome)}">`).join("")}</datalist>
      <datalist id="dl-f">${cat.formas.map((o) => `<option value="${esc(o.codigo)}">`).join("")}</datalist>
      <div class="lote"><table><thead><tr><th>#</th>${COLS.map((c) => `<th style="min-width:${c[2]}px">${esc(c[1])}</th>`).join("")}<th>Resultado</th></tr></thead><tbody id="tb"></tbody></table></div><div id="res" style="margin-top:10px"></div>`;
    const tb = el.querySelector("#tb");
    const linha = () => { const tr = document.createElement("tr"); tr.innerHTML = `<td class="n"></td>${COLS.map((c) => `<td><input data-k="${c[0]}" ${c[4] ? `list="${c[4]}"` : ""} ${c[3] ? `placeholder="${esc(c[3])}"` : ""} autocomplete="off"></td>`).join("")}<td class="st mut"></td>`; return tr; };
    const numerar = () => [...tb.rows].forEach((tr, i) => (tr.cells[0].textContent = i + 1));
    // CPF/CNPJ já cadastrado: avisa na própria linha e pergunta se é segundo ponto (não bloqueia)
    const checarDoc = async (tr) => {
      const inp = tr.querySelector('input[data-k="documento"]'), st = tr.querySelector(".st"), d = inp.value.replace(/\D/g, "");
      delete tr.dataset.dup; delete tr.dataset.p2;
      if (tr.classList.contains("good")) return;
      if (d.length !== 11 && d.length !== 14) { if (st.dataset.aviso) { st.innerHTML = ""; delete st.dataset.aviso; } return; }
      try {
        const r = (await api("/clientes?busca=" + d)).find((c) => c.documento === d);
        if (!r) { if (st.dataset.aviso) { st.innerHTML = ""; delete st.dataset.aviso; } return; }
        tr.dataset.dup = "1"; st.dataset.aviso = "1";
        st.innerHTML = `<span class="tag alerta">CPF já cadastrado</span> ${esc(r.nome)} (${r.contratos || 0} venda(s)). <b>É segundo ponto?</b> <span class="seg"><button type="button" data-p2="1">Sim</button><button type="button" data-p2="0">Não</button></span>`;
        st.querySelectorAll("[data-p2]").forEach((b) => b.addEventListener("click", () => { tr.dataset.p2 = b.dataset.p2; st.querySelectorAll("[data-p2]").forEach((x) => x.classList.toggle("on", x === b)); }));
      } catch {}
    };
    tb.addEventListener("change", (e) => { if (e.target.dataset?.k === "documento") checarDoc(e.target.closest("tr")); });
    const add = (n) => { for (let i = 0; i < n; i++) tb.appendChild(linha()); numerar(); };
    add(15);
    const valores = (tr) => Object.fromEntries([...tr.querySelectorAll("input")].map((i) => [i.dataset.k, i.value.trim()]));
    const vazia = (tr) => Object.values(valores(tr)).every((v) => !v);
    tb.addEventListener("paste", (e) => {
      const t = e.clipboardData.getData("text");
      if (!/[\t\n]/.test(t.replace(/\n$/, ""))) return;
      e.preventDefault();
      const inp = e.target.closest("input"); if (!inp) return;
      const tr0 = inp.closest("tr"), c0 = COLS.findIndex((c) => c[0] === inp.dataset.k);
      const linhas = t.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((l) => l.split("\t"));
      let tr = tr0;
      linhas.forEach((cols, li) => {
        if (li > 0) { if (!tr.nextElementSibling) add(1); tr = tr.nextElementSibling; }
        cols.forEach((v, ci) => { const c = COLS[c0 + ci]; if (c) tr.querySelector(`input[data-k="${c[0]}"]`).value = c[0] === "documento" ? v.replace(/\D/g, "").slice(0, 14) : v.trim(); });
      });
      numerar();
      linhas.forEach((_, li) => { let t = tr0; for (let k = 0; k < li; k++) t = t.nextElementSibling; if (t) checarDoc(t); });
    });
    tb.addEventListener("beforeinput", (e) => { if (e.target.dataset?.k === "documento" && e.data && e.inputType === "insertText" && /\D/.test(e.data)) e.preventDefault(); });
    tb.addEventListener("input", (e) => { const i = e.target; if (i.dataset?.k === "documento") { const v = i.value.replace(/\D/g, "").slice(0, 14); if (v !== i.value) i.value = v; } });
    tb.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !e.target.matches("input")) return; e.preventDefault();
      const nx = e.target.closest("tr").nextElementSibling; if (nx) nx.querySelector(`input[data-k="${e.target.dataset.k}"]`).focus();
    });
    el.querySelector("#ml").addEventListener("click", () => add(10));
    el.querySelector("#pf").addEventListener("click", () => {
      const dv = el.querySelector("#dv").value.trim(), dor = el.querySelector("#do").value.trim(), dd = el.querySelector("#dd").value;
      const brData = dd ? dd.split("-").reverse().join("/") : "";
      [...tb.rows].filter((tr) => !vazia(tr) && !tr.classList.contains("good")).forEach((tr) => {
        for (const [k, v] of [["vendedor", dv], ["origem", dor], ["data_venda", brData]]) { const i = tr.querySelector(`input[data-k="${k}"]`); if (v && !i.value.trim()) i.value = v; }
      });
    });
    async function enviar(gravar) {
      const trs = [...tb.rows].filter((tr) => !vazia(tr) && !tr.classList.contains("good"));
      const res = el.querySelector("#res");
      if (!trs.length) { res.innerHTML = `<div class="aviso">Nenhuma linha preenchida.</div>`; return; }
      const b1 = el.querySelector("#va"), b2 = el.querySelector("#gr"); b1.disabled = b2.disabled = true;
      try {
        const j = await api("/vendas", { method: "POST", body: { linhas: trs.map((tr) => { const v = valores(tr); if (tr.dataset.p2 === "1") v.observacao = "[2º ponto]"; return v; }), gravar } });
        j.resultado.forEach((r) => {
          const tr = trs[r.linha], st = tr.querySelector(".st");
          tr.classList.remove("bad", "good"); delete st.dataset.aviso;
          if (r.ok) { tr.classList.add(gravar ? "good" : "good"); st.innerHTML = gravar ? `Gravada · <a href="#/venda/${r.contrato_id}">abrir</a>${r.cliente_novo ? "" : " · cliente já existia"}` : "OK"; if (gravar) tr.querySelectorAll("input").forEach((i) => (i.disabled = true)); }
          else { tr.classList.add("bad"); st.innerHTML = r.erros.map(esc).join("<br>"); }
        });
        res.innerHTML = `<div class="aviso" ${j.invalidas ? "" : `style="border-color:var(--okl);background:var(--okb)"`}>${gravar ? `<b>${j.validas}</b> venda(s) gravada(s).` : `<b>${j.validas}</b> linha(s) válida(s).`} ${j.invalidas ? `<b>${j.invalidas}</b> com erro (em vermelho): corrija e envie novamente.` : ""}</div>`;
      } catch (e) { res.innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; }
      finally { b1.disabled = b2.disabled = false; }
    }
    el.querySelector("#va").addEventListener("click", () => enviar(false));
    el.querySelector("#gr").addEventListener("click", () => enviar(true));
  };
})();
