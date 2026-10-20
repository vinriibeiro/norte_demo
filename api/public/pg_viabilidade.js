"use strict";
/* Viabilidade (Operação / Minha área)
   Vendedor: pede a verificação (CEP + endereço), acompanha a resposta e conversa nas observações.
   Backoffice de Cadastro e gerente: fila por ordem de chegada, pega para análise, responde Atende / Não atende. */
(() => {
  const { esc, api, modal } = S;
  const ROT = { PENDENTE: "Aguardando", EM_ANALISE: "Em análise", ATENDE: "Atende", NAO_ATENDE: "Não atende", NAO_PEDIDO: "Só checagens" };
  const COR = { PENDENTE: "alerta", EM_ANALISE: "azul", ATENDE: "ok", NAO_ATENDE: "ruim", NAO_PEDIDO: "azul" };
  const pill = (s) => `<span class="vb-pill ${COR[s]}">${ROT[s] || esc(s)}</span>`;
  const cepFmt = (c) => (c ? String(c).replace(/^(\d{5})(\d{3})$/, "$1-$2") : "");
  const hora = (d) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const ha = (d) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(d)) / 6e4));
    return m < 1 ? "agora" : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}` : `há ${Math.floor(m / 1440)} dia${m >= 2880 ? "s" : ""}`;
  };
  const ped = (v) => [v.checa_endereco && "Endereço", v.checa_credito && "Crédito", v.checa_linha && "Linha móvel"].filter(Boolean).join(" + ");
  const pillPedido = (v) => (v.checa_endereco ? pill(v.status) : `<span class="vb-pill azul">Só checagens</span>`);
  const endereco = (v) => `${esc(v.logradouro)}${v.numero ? ", " + esc(v.numero) : ""}${v.complemento ? " · " + esc(v.complemento) : ""}`;
  const local = (v) => [cepFmt(v.cep), v.bairro, v.uf === "DF" ? "Brasília-DF" : v.cidade && v.uf ? `${v.cidade}/${v.uf}` : v.cidade].filter(Boolean).map(esc).join(" · ");
  const mapa = (v) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([v.logradouro, v.numero, v.bairro, v.cidade, v.uf, cepFmt(v.cep)].filter(Boolean).join(", "));
  const ehVendedor = () => S.sessao.usuario.perfil === "vendedor";
  const responde = () => { const u = S.sessao.usuario; return u.perfil === "gestor" || (u.perfil === "backoffice" && u.setor !== "QUALIDADE"); };
  const ICO = {
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.6"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    som: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/>', mudo: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>', env: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  };
  const ico = (k, s = 16) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k]}</svg>`;

  const dinheiro = (n) => Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cpfFmt = (c) => (c ? String(c).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : "");
  const nascFmt = (d) => { if (!d) return ""; if (d instanceof Date) return d.toLocaleDateString("pt-BR"); const [a, m, dd] = String(d).slice(0, 10).split("-"); return `${dd}/${m}/${a}`; };
  const NOME_CHK = { CREDITO: "Crédito", LINHA: "Linha móvel" };
  const pedidas = (v) => [v.checa_credito && "CREDITO", v.checa_linha && "LINHA"].filter(Boolean);
  const stChk = (v, t) => (t === "CREDITO" ? v.credito_status : v.linha_status);
  // crédito usa Aprovado / Reprovado (e Oferta Single); a linha móvel segue Atende / Não atende
  const rotChk = (v, t) => { const st = stChk(v, t); if (t !== "CREDITO") return ROT[st]; return st === "ATENDE" ? (v.credito_oferta_single ? "Aprovado (Oferta Single)" : "Aprovado") : st === "NAO_ATENDE" ? "Reprovado" : ROT[st]; };
  const pillChk = (v, t) => `<span class="vb-pill ${COR[stChk(v, t)]}">${esc(rotChk(v, t))}</span>`;

  const est = { status: "ABERTAS", busca: "", vendedor: "", sel: null, pagina: 1 };

  /* ---------- conversa (observações) ---------- */
  function conversa(v) {
    const eu = S.sessao.usuario.id;
    const msgs = v.obs.map((o) => `<div class="vb-msg ${o.autor_id === eu ? "eu" : ""} ${o.autor_id === v.vendedor_id ? "vend" : "bo"}"><div class="vb-bolha">${esc(o.texto).replace(/\n/g, "<br>")}</div><small>${esc(o.autor_id === eu ? "Você" : o.autor)} · ${hora(o.em)}</small></div>`).join("");
    return `<div class="vb-conv">${msgs || `<p class="mut vb-vazio">Nenhuma observação ainda.</p>`}</div>
      <form class="vb-env" data-env="${v.id}"><textarea name="t" rows="2" maxlength="1000" placeholder="Escrever observação…" required></textarea><button class="btn" title="Enviar">${ico("env")}<span>Enviar</span></button></form>`;
  }
  function ligarConversa(box, v, depois) {
    box.querySelector("[data-env]")?.addEventListener("submit", async (e) => {
      e.preventDefault(); const t = e.target.t.value.trim(); if (!t) return;
      const b = e.target.querySelector("button"); b.disabled = true;
      try { await api(`/viabilidade/${v.id}/obs`, { method: "POST", body: { texto: t } }); depois(); } catch (er) { alert(er.message); b.disabled = false; }
    });
    const c = box.querySelector(".vb-conv"); if (c) c.scrollTop = c.scrollHeight;
  }

  /* ---------- formulário de pedido (vendedor) ---------- */
  function formNovo(depois) {
    const m = modal("Nova consulta de viabilidade", `<form id="f" class="vb-form" autocomplete="off">
      <div class="vb-extra"><span class="mut">O que você quer pedir? Escolha uma, duas ou as três:</span>
        <label class="vb-chk"><input type="checkbox" name="checa_endereco" id="ce"> Endereço</label>
        <label class="vb-chk"><input type="checkbox" name="checa_credito" id="cc"> Crédito</label>
        <label class="vb-chk"><input type="checkbox" name="checa_linha" id="cl"> Linha móvel</label></div>
      <div id="se" style="display:none">
        <div class="vb-cep"><div class="campo"><label>CEP</label><input name="cep" inputmode="numeric" maxlength="9" placeholder="00000-000"></div><span class="mut" id="cs">Digite o CEP: o endereço é preenchido sozinho.</span></div>
        <div class="vb-g"><div class="campo vb-rua"><label>Rua / avenida</label><input name="logradouro" maxlength="200"></div><div class="campo vb-num"><label>Número</label><input name="numero" maxlength="20" placeholder="ou S/N"></div></div>
        <div class="vb-g"><div class="campo"><label>Complemento</label><input name="complemento" maxlength="100" placeholder="apto, bloco, casa 2…"></div><div class="campo"><label>Bairro</label><input name="bairro" maxlength="100"></div></div>
        <div class="vb-g"><div class="campo"><label>Cidade</label><input name="cidade" maxlength="100"></div><div class="campo vb-uf"><label>UF</label><input name="uf" maxlength="2"></div></div>
        <div class="campo"><label>Ponto de referência</label><input name="referencia" maxlength="200"></div>
      </div>
      <div class="vb-sub" id="sc" style="display:none"><div class="vb-g"><div class="campo"><label>Nome completo <small class="mut">(crédito)</small></label><input name="cred_nome" maxlength="150"></div><div class="campo"><label>CPF <small class="mut">(crédito)</small></label><input name="cred_cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00"></div></div>
        <div class="vb-g"><div class="campo"><label>Data de nascimento</label><input name="cred_nascimento" type="date"></div><div class="campo"><label>Cidade <small class="mut">(crédito)</small></label><input name="cred_cidade" maxlength="100"></div></div></div>
      <div class="vb-sub" id="sl" style="display:none"><div class="campo"><label>CPF <small class="mut">(linha móvel)</small></label><input name="linha_cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00"></div></div>
      <div class="vb-g"><div class="campo"><label>Nome do cliente <small class="mut">(opcional)</small></label><input name="cliente_nome" maxlength="150"></div><div class="campo"><label>Telefone <small class="mut">(opcional)</small></label><input name="cliente_contato" inputmode="tel" maxlength="40"></div></div>
      <div class="campo"><label>Observação para o backoffice</label><textarea name="observacao" rows="3" maxlength="1000" placeholder="Ex.: prédio de 3 andares, cliente quer 500 mega…"></textarea></div>
      <div data-anx-novo style="margin-top:6px"></div>
      <div class="erro" id="e"></div></form>`, `<button class="btn sec" id="x">Cancelar</button><button class="btn" id="s">Enviar para verificação</button>`);
    m.querySelector(".caixa").classList.add("vb-modal");
    const f = m.querySelector("#f"), cs = m.querySelector("#cs");
    const anexos = S.anexos?.seletor(m.querySelector("[data-anx-novo]"));
    // só o que foi escolhido é obrigatório / aparece
    const mostra = () => {
      const e = f.checa_endereco.checked;
      m.querySelector("#se").style.display = e ? "" : "none";
      ["cep", "logradouro", "numero"].forEach((n) => (f[n].required = e));
      m.querySelector("#sc").style.display = f.checa_credito.checked ? "" : "none";
      m.querySelector("#sl").style.display = f.checa_linha.checked ? "" : "none";
    };
    f.checa_endereco.addEventListener("change", () => { mostra(); if (f.checa_endereco.checked) f.cep.focus(); });
    f.checa_credito.addEventListener("change", mostra);
    f.checa_linha.addEventListener("change", mostra);
    f.cep.addEventListener("input", async () => {
      let d = f.cep.value.replace(/\D/g, "").slice(0, 8);
      f.cep.value = d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
      if (d.length !== 8) return;
      cs.textContent = "Buscando endereço…";
      try {
        const e = await api("/cep/" + d);
        for (const k of ["logradouro", "bairro", "cidade", "uf"]) if (e[k] && !f[k].value) f[k].value = e[k];
        cs.textContent = e.logradouro ? "Endereço encontrado. Confira e informe o número." : "CEP da cidade inteira: preencha a rua.";
        (e.logradouro ? f.numero : f.logradouro).focus();
      } catch (er) { cs.textContent = er.message; f.logradouro.focus(); }
    });
    m.querySelector("#x").addEventListener("click", () => m.remove());
    m.querySelector("#s").addEventListener("click", async () => {
      if (!f.checa_endereco.checked && !f.checa_credito.checked && !f.checa_linha.checked) { m.querySelector("#e").textContent = "Escolha ao menos uma checagem: endereço, crédito ou linha móvel."; return; }
      if (!f.reportValidity()) return;
      const b = m.querySelector("#s"); b.disabled = true;
      try {
        const r = await api("/viabilidade", { method: "POST", body: Object.fromEntries(new FormData(f)) });
        const falhas = await S.anexos.enviarVarios("VIABILIDADE", r.id, anexos.arquivos());
        m.remove(); depois(true);
        if (falhas.length) alert("Pedido enviado. Alguns arquivos não subiram, anexe de novo pelo detalhe:\n" + falhas.join("\n"));
        detalheVendedor(r.id, depois);
      }
      catch (e) { m.querySelector("#e").textContent = e.message; b.disabled = false; }
    });
  }

  /* ---------- tela do vendedor ---------- */
  async function telaVendedor(el) {
    const j = await api("/viabilidade?status=" + (est.status === "ABERTAS" ? "" : est.status));
    const c = j.contagem, novas = j.itens.filter((v) => v.respondido_em && !v.visto_vendedor_em).length;
    el.innerHTML = `${window.NORTE_APP?.convite() || ""}<div class="cab"><div><div class="migalha">Minha área</div><h1>Viabilidade</h1><div class="mut" style="margin-top:3px">Peça a verificação do endereço aqui. O backoffice responde e você recebe o aviso.</div></div>
        <div class="acoes"><button class="btn vb-novo" id="nv">${ico("plus")} Nova consulta</button></div></div>
      <div class="vb-resumo">
        <div><b>${(c.PENDENTE || 0) + (c.EM_ANALISE || 0)}</b><span>aguardando</span></div><div class="ok"><b>${c.ATENDE || 0}</b><span>atende</span></div><div class="ruim"><b>${c.NAO_ATENDE || 0}</b><span>não atende</span></div>
        ${novas ? `<div class="novo"><b>${novas}</b><span>resposta${novas === 1 ? "" : "s"} nova${novas === 1 ? "" : "s"}</span></div>` : ""}</div>
      <div class="vb-cards">${j.itens.length ? j.itens.map((v) => {
        const nova = v.respondido_em && !v.visto_vendedor_em;
        return `<button class="vb-card ${nova ? "nova" : ""} st-${v.status}" data-id="${v.id}">
          <div class="vb-card-t">${pillPedido(v)}${nova ? `<span class="vb-nova">Nova resposta</span>` : ""}<span class="mut vb-quando">${v.respondido_em ? "respondida " + ha(v.respondido_em) : "enviada " + ha(v.criado_em)}</span></div>
          ${v.checa_endereco ? `<div class="vb-end">${ico("pin", 15)} ${endereco(v)}</div><div class="mut">${local(v)}${v.cliente_nome ? " · " + esc(v.cliente_nome) : ""}</div>` : `<div class="vb-end">${ico("pin", 15)} Só checagens: ${esc(ped(v))}</div>${v.cliente_nome ? `<div class="mut">${esc(v.cliente_nome)}</div>` : ""}`}
          ${v.ultima_obs && v.respondido_em ? `<div class="vb-resp">“${esc(v.ultima_obs.slice(0, 140))}${v.ultima_obs.length > 140 ? "…" : ""}”<small> — ${esc(v.respondido_por_nome || "backoffice")}</small></div>` : v.status === "EM_ANALISE" ? `<div class="vb-resp mut">${esc(v.em_analise_por_nome || "Backoffice")} está verificando…</div>` : ""}
          ${v.n_obs ? `<div class="vb-nobs">${v.n_obs} observaç${v.n_obs === 1 ? "ão" : "ões"}</div>` : ""}</button>`;
      }).join("") : `<div class="vb-vazio-g"><p>Você ainda não pediu nenhuma viabilidade.</p><button class="btn" id="nv2">${ico("plus")} Fazer a primeira consulta</button></div>`}</div>`;
    window.NORTE_APP?.ligarConvite(el);
    const go = () => S.PAGES.viabilidade(el).catch(S.erroEm(el));
    const novo = () => formNovo(() => { go(); S.avisos?.atualizar(); });
    el.querySelector("#nv").addEventListener("click", novo);
    el.querySelector("#nv2")?.addEventListener("click", novo);
    el.querySelectorAll(".vb-card").forEach((b) => b.addEventListener("click", () => detalheVendedor(+b.dataset.id, go)));
  }
  async function detalheVendedor(id, depois) {
    const v = await api("/viabilidade/" + id);
    if (v.respondido_em && !v.visto_vendedor_em && !S.sessao.vercomo) { api(`/viabilidade/${id}/visto`, { method: "POST" }).then(() => S.avisos?.atualizar()).catch(() => {}); }
    const DEST = { SISTEMA_A: "Sistema A", SISTEMA_B: "Sistema B" };
    const faltam = pedidas(v).filter((t) => stChk(v, t) !== "ATENDE").map((t) => NOME_CHK[t]);
    const encaminhar = (!v.checa_endereco || v.status === "ATENDE") && !S.sessao.vercomo ? (v.encaminhado_para
        ? `<div class="vb-enc ok">Venda encaminhada para <b>${DEST[v.encaminhado_para]}</b> em ${hora(v.encaminhado_em)}.</div>`
        : faltam.length
          ? `<div class="vb-enc"><b>Encaminhar a venda</b><span class="mut">Aguardando a aprovação de: ${faltam.join(" e ")}.</span></div>`
          : `<div class="vb-enc"><b>Encaminhar a venda</b><span class="mut">Escolha para onde ela vai.</span><div class="vb-bts"><button class="btn" data-enc="SISTEMA_A">Sistema A</button><button class="btn sec" data-enc="SISTEMA_B">Sistema B</button></div></div>`) : "";
    const chkVend = pedidas(v).map((t) => {
      const st = stChk(v, t), lim = t === "LINHA" && st === "ATENDE" && v.linha_limite != null ? ` · limite liberado R$ ${dinheiro(v.linha_limite)}` : "";
      return `<div class="vb-chk-l"><b>${NOME_CHK[t]}</b> ${pillChk(v, t)}<span class="mut">${st === "PENDENTE" ? "aguardando o backoffice" : esc(lim)}</span></div>`;
    }).join("");
    // contestação: só depois de "Não atende", em até 7 dias da resposta, quantas vezes quiser
    const dias7 = v.respondido_em && Date.now() - new Date(v.respondido_em) < 7 * 864e5;
    const contestar = v.checa_endereco && v.status === "NAO_ATENDE" && dias7 && !S.sessao.vercomo
      ? `<div class="vb-enc"><b>Contestar esta resposta</b><span class="mut">Se a viabilidade estiver correta, escreva o motivo: o pedido volta para o backoffice. Prazo até ${hora(new Date(new Date(v.respondido_em).getTime() + 7 * 864e5))}.</span>
          <textarea id="cont" rows="2" maxlength="1000" placeholder="Ex.: o cliente mostrou a conta de luz no endereço; o vizinho do lado tem Operadora"></textarea>
          <div class="vb-bts"><button class="btn" id="contbt">Contestar e voltar para o backoffice</button></div></div>`
      : "";
    const m = modal(`Viabilidade nº ${v.id}`, `<div class="vb-det">
      <div class="vb-det-t">${pillPedido(v)}<span class="mut">enviada em ${hora(v.criado_em)}</span></div>
      ${v.checa_endereco && (v.status === "ATENDE" || v.status === "NAO_ATENDE") ? `<div class="vb-veredito ${COR[v.status]}"><b>${v.status === "ATENDE" ? "Atende! Pode seguir com a venda." : "Não atende neste endereço."}</b><span>Respondida por ${esc(v.respondido_por_nome || "backoffice")} em ${hora(v.respondido_em)}</span></div>` : ""}
      ${v.hp ? `<div class="vb-hp-info">HP: <b>${esc(v.hp)}</b></div>` : ""}
      ${chkVend ? `<div class="vb-chks"><span class="mut">Checagens pedidas</span>${chkVend}</div>` : ""}
      ${encaminhar}
      ${contestar}
      ${v.checa_endereco ? `<div class="vb-end">${ico("pin", 15)} ${endereco(v)}</div><div class="mut">${local(v)}${v.referencia ? " · ref.: " + esc(v.referencia) : ""}</div>` : `<div class="mut">Sem endereço neste pedido (só checagens).</div>`}
      ${v.cliente_nome || v.cliente_contato ? `<div class="mut">Cliente: ${esc([v.cliente_nome, v.cliente_contato].filter(Boolean).join(" · "))}</div>` : ""}
      <h3 class="vb-h3">Observações</h3>${conversa(v)}</div>`, `<button class="btn sec" id="x">Fechar</button>`);
    m.querySelector(".caixa").classList.add("vb-modal");
    const fechar = () => { m.remove(); depois(); };
    m.querySelector(".vb-det")?.insertAdjacentHTML("beforeend", '<div data-anx></div>');
    S.anexos?.montar(m.querySelector("[data-anx]"), "VIABILIDADE", v.id, { enviar: true, remover: S.sessao.usuario.perfil === "gestor" });
    m.querySelector("#x").addEventListener("click", fechar);
    m.querySelectorAll("[data-enc]").forEach((b) => b.addEventListener("click", async () => {
      const nome = DEST[b.dataset.enc];
      if (!confirm(`Encaminhar esta venda para ${nome}? Depois de enviada não dá para mudar.`)) return;
      m.querySelectorAll("[data-enc]").forEach((x) => (x.disabled = true));
      try { await api(`/viabilidade/${v.id}/encaminhar`, { method: "POST", body: { destino: b.dataset.enc } }); m.remove(); detalheVendedor(id, depois); }
      catch (e) { alert(e.message); m.querySelectorAll("[data-enc]").forEach((x) => (x.disabled = false)); }
    }));
    m.querySelector("#contbt")?.addEventListener("click", async () => {
      const t = m.querySelector("#cont").value.trim();
      if (t.length < 3) { alert("Escreva o motivo da contestação."); return; }
      const b = m.querySelector("#contbt"); b.disabled = true;
      try { await api(`/viabilidade/${v.id}/contestar`, { method: "POST", body: { texto: t } }); m.remove(); detalheVendedor(id, depois); }
      catch (e) { alert(e.message); b.disabled = false; }
    });
    ligarConversa(m, v, () => { m.remove(); detalheVendedor(id, depois); });
  }

  /* ---------- tela do backoffice ---------- */
  async function telaBackoffice(el) {
    const q = new URLSearchParams({ status: est.status === "TODAS" ? "" : est.status, busca: est.busca, vendedor: est.vendedor, pagina: est.pagina });
    const j = await api("/viabilidade?" + q);
    const c = j.contagem, som = S.avisos?.somLigado();
    const paginas = Math.max(1, Math.ceil(j.total / 50));
    if (est.sel && !j.itens.some((v) => v.id === est.sel)) est.sel = null;
    if (!est.sel && j.itens[0] && window.innerWidth > 1000) est.sel = j.itens[0].id;
    const filtros = [["ABERTAS", "Na fila"], ["ATENDE", "Atende"], ["NAO_ATENDE", "Não atende"], ["TODAS", "Todas"]];
    el.innerHTML = `<div class="cab"><div><div class="migalha">Operação</div><h1>Viabilidade</h1><div class="mut" style="margin-top:3px">Pedidos dos vendedores, por ordem de chegada. Um aviso com som toca quando chega pedido novo.</div></div>
        <div class="acoes"><button class="btn sec" id="sm" title="Ligar ou desligar o som do aviso">${ico(som ? "som" : "mudo")} Som ${som ? "ligado" : "desligado"}</button>${"Notification" in window && Notification.permission === "default" ? `<button class="btn sec" id="nt">Avisar com o navegador minimizado</button>` : ""}</div></div>
      <div class="vb-kpis">
        <div class="alerta"><span>Aguardando</span><b>${c.PENDENTE || 0}</b></div><div class="azul"><span>Em análise</span><b>${c.EM_ANALISE || 0}</b></div>
        <div class="ok"><span>Atende</span><b>${c.ATENDE || 0}</b></div><div class="ruim"><span>Não atende</span><b>${c.NAO_ATENDE || 0}</b></div></div>
      <div class="filtros"><div class="campo" style="width:auto"><label>Mostrar</label><div class="seg" id="fs">${filtros.map(([k, n]) => `<button data-s="${k}" class="${est.status === k ? "on" : ""}">${n}</button>`).join("")}</div></div>
        <div class="campo" style="width:240px"><label>Buscar (rua, bairro, CEP, cliente, vendedor)</label><input id="fb" value="${esc(est.busca)}"></div>
        <div class="campo" style="width:200px"><label>Vendedor</label><select id="fv"><option value="">Todos</option>${j.vendedores.map((x) => `<option value="${x.id}" ${String(x.id) === String(est.vendedor) ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></div></div>
      <div class="vb-dupla"><div class="vb-lista">${j.itens.length ? j.itens.map((v) => `<button class="vb-item ${v.id === est.sel ? "on" : ""} st-${v.status}" data-id="${v.id}">
          <div class="vb-item-t">${pillPedido(v)}<b class="vb-espera ${v.status === "PENDENTE" && Date.now() - new Date(v.criado_em) > 30 * 6e4 ? "atraso" : ""}">${v.respondido_em ? hora(v.respondido_em) : ha(v.criado_em)}</b></div>
          ${v.checa_endereco ? `<div class="vb-end">${endereco(v)}</div><div class="mut">${local(v)}</div>` : `<div class="vb-end">Só checagens: ${esc(ped(v))}</div>`}
          <div class="vb-item-r"><span>${esc(v.vendedor_nome)}</span>${v.checa_credito ? `<span class="vb-tag">+ crédito</span>` : ""}${v.checa_linha ? `<span class="vb-tag">+ linha</span>` : ""}${v.n_obs ? `<span class="mut">${v.n_obs} obs.</span>` : ""}${v.status === "EM_ANALISE" ? `<span class="mut">com ${esc((v.em_analise_por_nome || "").split(" ")[0])}</span>` : ""}</div></button>`).join("")
        : `<p class="legenda-vazia">${est.status === "ABERTAS" ? "Fila vazia. Nenhum pedido aguardando." : "Nada encontrado."}</p>`}
        ${paginas > 1 ? `<div class="pag"><button class="btn sec pq" id="pa" ${est.pagina <= 1 ? "disabled" : ""}>‹</button><span>página ${est.pagina}/${paginas}</span><button class="btn sec pq" id="pp" ${est.pagina >= paginas ? "disabled" : ""}>›</button></div>` : ""}</div>
        <div class="vb-painel" id="dp">${est.sel ? `<p class="mut">Carregando…</p>` : `<p class="legenda-vazia">Escolha um pedido na lista.</p>`}</div></div>`;
    const go = () => S.PAGES.viabilidade(el).catch(S.erroEm(el));
    el.querySelector("#sm").addEventListener("click", () => { S.avisos?.alternarSom(); go(); });
    el.querySelector("#nt")?.addEventListener("click", async () => { await S.avisos?.pedirNotificacao(); go(); });
    el.querySelector("#fs").addEventListener("click", (e) => { const s = e.target.closest("[data-s]")?.dataset.s; if (s) { est.status = s; est.pagina = 1; est.sel = null; go(); } });
    el.querySelector("#fb").addEventListener("keydown", (e) => { if (e.key === "Enter") { est.busca = e.target.value.trim(); est.pagina = 1; go(); } });
    el.querySelector("#fv").addEventListener("change", (e) => { est.vendedor = e.target.value; est.pagina = 1; go(); });
    el.querySelector("#pa")?.addEventListener("click", () => { est.pagina--; go(); });
    el.querySelector("#pp")?.addEventListener("click", () => { est.pagina++; go(); });
    const dp = el.querySelector("#dp");
    const abrir = (id) => { est.sel = id; el.querySelectorAll(".vb-item").forEach((b) => b.classList.toggle("on", +b.dataset.id === id)); detalheBackoffice(dp, id, go); if (window.innerWidth <= 1000) dp.scrollIntoView({ behavior: "smooth" }); };
    el.querySelectorAll(".vb-item").forEach((b) => b.addEventListener("click", () => abrir(+b.dataset.id)));
    if (est.sel) detalheBackoffice(dp, est.sel, go);
    // chegou pedido novo enquanto a tela está aberta: atualiza a fila sozinha
    const ouvinte = () => { if (!el.isConnected) return document.removeEventListener("norte-aviso", ouvinte); go(); };
    document.addEventListener("norte-aviso", ouvinte, { once: true });
  }
  function blocoChecagensBO(v) {
    const blocos = pedidas(v).map((t) => {
      const st = stChk(v, t), cred = t === "CREDITO";
      const dados = cred
        ? `Nome <b>${esc(v.cred_nome || "")}</b> · CPF <b>${esc(cpfFmt(v.cred_cpf))}</b> · Nascimento <b>${esc(nascFmt(v.cred_nascimento))}</b> · Cidade <b>${esc(v.cred_cidade || "")}</b>`
        : `CPF <b>${esc(cpfFmt(v.linha_cpf))}</b>`;
      return `<div class="vb-chk-bo" data-tipo="${t}">
        <div class="vb-chk-t"><h4>${NOME_CHK[t]}</h4>${pillChk(v, t)}${st !== "PENDENTE" ? `<span class="mut">por ${esc(v.respondido_por_nome || "")}</span>` : ""}</div>
        <div class="mut vb-chk-dados">${dados}</div>
        ${!cred ? `<div class="campo"><label>Limite liberado (R$) <small class="mut">obrigatório para Atende</small></label><input data-lim inputmode="decimal" placeholder="0,00" value="${st === "ATENDE" ? esc(dinheiro(v.linha_limite)) : ""}"></div>` : ""}
        <textarea data-res rows="2" maxlength="1000" placeholder="${cred ? "Motivo" : "Motivo ou observação"} (obrigatório se não atender)"></textarea>
        <div class="vb-bts">${cred ? `<button class="btn vb-ok" data-cst="ATENDE">✓ Aprovado</button><button class="btn vb-ok" data-cst="SINGLE">✓ Aprovado (Oferta Single)</button><button class="btn vb-nao" data-cst="NAO_ATENDE">✕ Reprovado</button>` : `<button class="btn vb-ok" data-cst="ATENDE">✓ Atende</button><button class="btn vb-nao" data-cst="NAO_ATENDE">✕ Não atende</button>`}${st !== "PENDENTE" ? `<button class="btn sec pq" data-cst="PENDENTE">Reabrir</button>` : ""}</div></div>`;
    }).join("");
    return blocos ? `<h3 class="vb-h3">Checagens pedidas</h3>${blocos}` : "";
  }
  async function detalheBackoffice(box, id, recarregar) {
    const v = await api("/viabilidade/" + id);
    const eu = S.sessao.usuario.id, aberta = v.checa_endereco && (v.status === "PENDENTE" || v.status === "EM_ANALISE");
    const comOutro = v.status === "EM_ANALISE" && v.em_analise_por && v.em_analise_por !== eu;
    // HP: preenchido junto com o "Atende" (campo acima dos botões). Depois de salvo, aparece só para leitura.
    const hpBloco = `${v.hp ? `<div class="mut">HP: <b>${esc(v.hp)}</b></div>` : ""}${v.encaminhado_para ? `<div class="mut">Encaminhada pelo vendedor para <b>${v.encaminhado_para === "SISTEMA_A" ? "Sistema A" : "Sistema B"}</b> em ${hora(v.encaminhado_em)}</div>` : ""}`;
    box.innerHTML = `<div class="vb-det">
      <div class="vb-det-t">${pillPedido(v)}<span class="mut">nº ${v.id} · pedido ${hora(v.criado_em)} (${ha(v.criado_em)})</span></div>
      ${v.checa_endereco ? `<div class="vb-end grande">${ico("pin", 18)} ${endereco(v)}</div><div class="mut">${local(v)}${v.referencia ? " · ref.: " + esc(v.referencia) : ""}</div>` : `<div class="vb-end grande">Sem endereço · só checagens: ${esc(ped(v))}</div>`}
      <div class="vb-det-info"><span>Vendedor <b>${esc(v.vendedor_nome)}</b></span>${v.cliente_nome || v.cliente_contato ? `<span>Cliente <b>${esc([v.cliente_nome, v.cliente_contato].filter(Boolean).join(" · "))}</b></span>` : ""}
        ${v.checa_endereco ? `<a class="btn sec pq" href="${esc(mapa(v))}" target="_blank" rel="noopener">${ico("map", 14)} Ver no mapa</a>` : ""}</div>
      ${v.checa_endereco && !aberta ? `<div class="vb-veredito ${COR[v.status]}"><b>${ROT[v.status]}</b><span>por ${esc(v.respondido_por_nome || "")} em ${hora(v.respondido_em)}${v.visto_vendedor_em ? " · vendedor já viu" : " · vendedor ainda não viu"}</span></div>` : ""}
      ${S.sessao.vercomo || !responde() || !v.checa_endereco ? "" : aberta ? `<div class="vb-acoes">
          ${v.status === "PENDENTE" ? `<button class="btn sec" data-st="EM_ANALISE">Pegar para análise</button>` : comOutro ? `<span class="mut">Com ${esc(v.em_analise_por_nome)} em análise.</span>` : `<button class="btn sec" data-st="PENDENTE">Devolver para a fila</button>`}
          <div class="vb-hp"><label>HP (número da operadora, obrigatório para atender)<input id="hpa" inputmode="numeric" maxlength="20" pattern="[0-9]*" placeholder="só números" value="${esc(v.hp || "")}"></label></div>
          <textarea id="rp" rows="2" maxlength="1000" placeholder="Resposta para o vendedor (obrigatória se não atender)"></textarea>
          <div class="vb-bts"><button class="btn vb-ok" data-st="ATENDE">✓ Atende</button><button class="btn vb-nao" data-st="NAO_ATENDE">✕ Não atende</button></div></div>`
        : `<div class="vb-acoes"><button class="btn sec pq" data-st="PENDENTE">Reabrir pedido</button></div>`}
      ${hpBloco}
      ${S.sessao.vercomo || !responde() ? "" : blocoChecagensBO(v)}
      <h3 class="vb-h3">Observações</h3>${conversa(v)}</div>`;
    box.querySelectorAll("[data-cst]").forEach((b) => b.addEventListener("click", async () => {
      const bl = b.closest("[data-tipo]"), tipo = bl.dataset.tipo, cst = b.dataset.cst, st = cst === "SINGLE" ? "ATENDE" : cst, oferta = cst === "SINGLE";
      const resposta = bl.querySelector("[data-res]").value.trim(), limite = bl.querySelector("[data-lim]")?.value.trim() || "";
      if (st === "ATENDE" && tipo === "LINHA" && !(Number(limite.replace(/\./g, "").replace(",", ".")) > 0)) { alert("Informe o limite liberado em R$ antes de marcar Atende na linha móvel."); bl.querySelector("[data-lim]").focus(); return; }
      if (st === "NAO_ATENDE" && !resposta) { alert("Explique por que não atende (o vendedor vai ler)."); bl.querySelector("[data-res]").focus(); return; }
      if (st === "PENDENTE" && !confirm(`Reabrir a checagem de ${NOME_CHK[tipo]}?`)) return;
      b.disabled = true;
      try { await api(`/viabilidade/${v.id}/checagem/${tipo}`, { method: "PATCH", body: { status: st, resposta, limite, oferta_single: oferta } }); S.avisos?.atualizar(); recarregar(); }
      catch (e) { alert(e.message); b.disabled = false; }
    }));
    box.querySelectorAll("[data-st]").forEach((b) => b.addEventListener("click", async () => {
      const st = b.dataset.st, resposta = box.querySelector("#rp")?.value.trim() || "", hp = box.querySelector("#hpa")?.value.trim() || "";
      if (st === "ATENDE" && !/^[0-9]{1,20}$/.test(hp)) { alert("Preencha o HP (só números) antes de marcar Atende."); box.querySelector("#hpa")?.focus(); return; }
      if (st === "PENDENTE" && !aberta && !confirm("Reabrir este pedido? A resposta anterior continua nas observações.")) return;
      b.disabled = true;
      try { await api("/viabilidade/" + v.id, { method: "PATCH", body: { status: st, resposta, hp } }); S.avisos?.atualizar(); recarregar(); }
      catch (e) { alert(e.message); b.disabled = false; }
    }));
    box.querySelector(".vb-det")?.insertAdjacentHTML("beforeend", '<div data-anx></div>');
    S.anexos?.montar(box.querySelector("[data-anx]"), "VIABILIDADE", v.id, { enviar: true, remover: S.sessao.usuario.perfil === "gestor" });
    ligarConversa(box, v, () => detalheBackoffice(box, id, recarregar));
  }

  S.PAGES.viabilidade = async (el) => (ehVendedor() ? telaVendedor(el) : telaBackoffice(el));
})();
