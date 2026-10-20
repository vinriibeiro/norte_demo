"use strict";
/* Sistema A / Sistema B (Minha área e Operação)
   Vendedor: preenche o formulário da venda, acompanha o retorno e o prazo da Criação de HP.
   Backoffice de Cadastro: fila das vendas, responde com um dos retornos (correção, criação de HP com prazo, pendência, finalizado). */
(() => {
  const { esc, api, modal } = S;
  const SIS = { SISTEMA_A: "Sistema A", SISTEMA_B: "Sistema B" };
  const ST = { PENDENTE_TRATAMENTO: "Pendente tratamento", ATIVO_SEM_SUCESSO: "Ativo sem sucesso", CRIACAO_HP: "Criação de HP", PENDENCIA: "Pendência", FINALIZADO: "Finalizado" };
  const COR = { PENDENTE_TRATAMENTO: "alerta", ATIVO_SEM_SUCESSO: "ruim", CRIACAO_HP: "azul", PENDENCIA: "alerta", FINALIZADO: "ok" };
  const pill = (s) => `<span class="vb-pill ${COR[s] || ""}">${esc(ST[s] || s)}</span>`;
  const hora = (d) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const ha = (d) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(d)) / 6e4));
    return m < 1 ? "agora" : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.floor(m / 60)} h` : `há ${Math.floor(m / 1440)} dia(s)`;
  };
  const prazo = (d) => {
    const m = Math.round((new Date(d) - Date.now()) / 6e4);
    if (m <= 0) return `<b class="ruim">prazo vencido</b>`;
    return `faltam <b>${m >= 1440 ? Math.floor(m / 1440) + "d " : ""}${Math.floor((m % 1440) / 60)}h ${m % 60}min</b>`;
  };
  const cpfFmt = (c) => (c ? String(c).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : "");
  const dinheiro = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const resumo = (v) => (v.sistema === "SISTEMA_A" ? `${v.cliente_nome || ""} · código ${v.codigo_conexao || ""}` : `${cpfFmt(v.cpf)} · ${v.cidade || ""} · ${v.produto || ""}`);
  const est = { sel: null, sistema: "", status: "ABERTAS", busca: "" };
  const ehVendedor = () => S.sessao.usuario.perfil === "vendedor";
  const responde = () => { const u = S.sessao.usuario; return u.perfil === "gestor" || (u.perfil === "backoffice" && u.setor === "CADASTRO"); };

  /* conversa da venda: vendedor, backoffice de Cadastro e gerente */
  const msgsHtml = (v) => {
    const eu = S.sessao.usuario.id;
    return (v.obs || []).map((o) => `<div class="vb-msg ${o.autor_id === eu ? "eu" : ""}"><div class="vb-bolha">${esc(o.texto).replace(/\n/g, "<br>")}</div><small>${esc(o.autor_id === eu ? "Você" : o.autor)} · ${hora(o.em)}</small></div>`).join("")
      || `<p class="mut vb-vazio">Nenhuma mensagem ainda.</p>`;
  };
  /* a conversa atualiza sozinha (a cada 5 s) enquanto a tela estiver aberta; o que está sendo digitado não é apagado */
  const acompanharConversa = (raiz, id) => {
    clearInterval(raiz._acomp);
    raiz._acomp = setInterval(async () => {
      if (!raiz.isConnected) return clearInterval(raiz._acomp);
      const c = raiz.querySelector(".vb-conv"); if (!c) return;
      try {
        const v = await api(`/venda-externa/${id}?nocache=1`);
        const html = msgsHtml(v);
        if (c.dataset.h !== html) {
          const fundo = c.scrollHeight - c.scrollTop - c.clientHeight < 40;
          c.innerHTML = html; c.dataset.h = html;
          if (fundo) c.scrollTop = c.scrollHeight;
        }
      } catch {}
    }, 5000);
  };
  const chatHtml = (v) => {
    const fechada = v.status === "FINALIZADO" && S.sessao.usuario.perfil === "vendedor";
    return `<h3 class="vb-h3">Conversa</h3><div class="vb-conv">${msgsHtml(v)}</div>
      ${fechada ? `<p class="mut" style="margin:6px 0 0">Venda finalizada: conversa fechada.</p>` : `<form class="vb-env" data-vobs><textarea name="t" rows="2" maxlength="1000" placeholder="Escrever mensagem…" required></textarea><button class="btn">Enviar</button></form>`}`;
  };
  const ligarChat = (box, v, recarregar) => {
    const f = box.querySelector("[data-vobs]");
    const c = box.querySelector(".vb-conv"); if (c) c.scrollTop = c.scrollHeight;
    if (!f) return;
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const t = f.t.value.trim(); if (!t) return;
      const b = f.querySelector("button"); b.disabled = true;
      try { await api(`/venda-externa/${v.id}/obs`, { method: "POST", body: { texto: t } }); recarregar(); }
      catch (er) { alert(er.message); b.disabled = false; }
    });
  };

  /* ---------- formulário (vendedor: nova ou edição) ---------- */
  function formulario(sistema, venda, depois) {
    const v = venda || {};
    const campos = sistema === "SISTEMA_A"
      ? `<div class="vb-g"><div class="campo"><label>Nome do cliente</label><input name="cliente_nome" maxlength="150" value="${esc(v.cliente_nome || "")}" required></div>
           <div class="campo"><label>Código Sistema A</label><input name="codigo_conexao" maxlength="60" value="${esc(v.codigo_conexao || "")}" required></div></div>
         <div class="campo"><label>Biometria feita?</label><select name="biometria" required><option value="">Escolha…</option>
           <option value="true" ${v.biometria === true ? "selected" : ""}>Sim</option><option value="false" ${v.biometria === false ? "selected" : ""}>Não</option></select></div>
         <div class="campo"><label>Possui chip?</label><select name="possui_chip" required><option value="">Escolha…</option>
           <option value="true" ${v.possui_chip === true ? "selected" : ""}>Sim</option><option value="false" ${v.possui_chip === false ? "selected" : ""}>Não</option></select>
           <small class="mut">Se sim, anexe a foto do chip: a venda sobe como prioridade para finalizar.</small></div>`
      : `<div class="vb-g"><div class="campo"><label>CPF</label><input name="cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" value="${esc(cpfFmt(v.cpf))}" required></div>
           <div class="campo"><label>Cidade</label><input name="cidade" maxlength="100" value="${esc(v.cidade || "")}" required></div></div>
         <div class="vb-g"><div class="campo"><label>Contrato</label><input name="contrato" maxlength="60" value="${esc(v.contrato || "")}" required></div>
           <div class="campo"><label>Produto</label><input name="produto" maxlength="100" value="${esc(v.produto || "")}" required></div></div>
         <div class="campo"><label>Valor (R$)</label><input name="valor" inputmode="decimal" placeholder="0,00" value="${v.valor ? esc(String(v.valor).replace(".", ",")) : ""}" required></div>`;
    const m = modal(`${venda ? "Editar" : "Nova"} venda ${SIS[sistema]}`, `<form id="fv" class="vb-form" autocomplete="off">${campos}
      <div class="campo"><label>Observação</label><textarea name="observacao" rows="3" maxlength="1000">${esc(v.observacao || "")}</textarea></div>
      ${venda ? "" : '<div data-anx-novo style="margin-top:10px"></div>'}
      <div class="erro" id="e"></div></form>`, `<button class="btn sec" id="x">Cancelar</button><button class="btn" id="s">${venda ? "Salvar" : "Enviar para o backoffice"}</button>`);
    m.querySelector(".caixa").classList.add("vb-modal");
    const f = m.querySelector("#fv");
    const anexos = S.anexos?.seletor(m.querySelector("[data-anx-novo]"));
    m.querySelector("#x").addEventListener("click", () => m.remove());
    m.querySelector("#s").addEventListener("click", async () => {
      if (!f.reportValidity()) return;
      const b = m.querySelector("#s"); b.disabled = true;
      const body = { ...Object.fromEntries(new FormData(f)), sistema };
      try {
        if (venda) { await api("/venda-externa/" + venda.id, { method: "PUT", body }); m.remove(); depois(); }
        else {
          const r = await api("/venda-externa", { method: "POST", body });
          const falhas = await S.anexos.enviarVarios("VENDA_EXTERNA", r.id, anexos?.arquivos() || []);
          m.remove(); depois();
          if (falhas.length) alert("Venda enviada. Alguns arquivos não subiram, anexe de novo pelo detalhe:\n" + falhas.join("\n"));
          detalheVendedor(r.id, depois);
        }
      } catch (e) { m.querySelector("#e").textContent = e.message; b.disabled = false; }
    });
  }
  function escolherSistema(depois) {
    const m = modal("Nova venda", `<p class="mut" style="margin:0 0 12px">Qual sistema?</p><div class="vb-bts"><button class="btn" data-sis="SISTEMA_A">Sistema A</button><button class="btn sec" data-sis="SISTEMA_B">Sistema B</button></div>`, `<button class="btn sec" id="x">Cancelar</button>`);
    m.querySelector("#x").addEventListener("click", () => m.remove());
    m.querySelectorAll("[data-sis]").forEach((b) => b.addEventListener("click", () => { m.remove(); formulario(b.dataset.sis, null, depois); }));
  }

  /* ---------- vendedor ---------- */
  async function telaVendedor(el) {
    const j = await api("/venda-externa?status=" + (est.status === "ABERTAS" ? "ABERTAS" : est.status));
    const c = j.contagem;
    const novas = j.itens.filter((v) => v.respondido_em && !v.visto_vendedor_em).length;
    el.innerHTML = `<div class="cab"><div><div class="migalha">Minha área</div><h1>Sistema A / Sistema B</h1><div class="mut" style="margin-top:3px">Preencha a venda aqui. O backoffice de Cadastro confere e responde.</div></div>
        <div class="acoes"><button class="btn" id="nv">+ Nova venda</button></div></div>
      <div class="vb-resumo">
        <div><b>${(c.PENDENTE_TRATAMENTO || 0) + (c.ATIVO_SEM_SUCESSO || 0) + (c.CRIACAO_HP || 0) + (c.PENDENCIA || 0)}</b><span>em andamento</span></div>
        <div class="ok"><b>${c.FINALIZADO || 0}</b><span>finalizadas</span></div>
        ${novas ? `<div class="novo"><b>${novas}</b><span>retorno${novas === 1 ? "" : "s"} novo${novas === 1 ? "" : "s"}</span></div>` : ""}</div>
      <div class="vb-cards">${j.itens.length ? j.itens.map((v) => {
        const nova = v.respondido_em && !v.visto_vendedor_em;
        return `<div class="vb-card ${nova ? "nova" : ""}">
          <div class="vb-card-t">${pill(v.status)}<span class="tag">${SIS[v.sistema]}</span>${nova ? `<span class="vb-nova">Novo retorno</span>` : ""}<span class="mut vb-quando">enviada ${ha(v.criado_em)}</span></div>
          <div class="vb-end">${esc(resumo(v))}</div>
          ${v.retorno_msg ? `<div class="vb-resp">“${esc(v.retorno_msg)}”<small> — ${esc(v.respondido_por_nome || "backoffice")}</small></div>` : ""}
          ${v.status === "CRIACAO_HP" && v.prazo_em ? `<div class="mut">HP: ${prazo(v.prazo_em)}</div>` : ""}
          <div class="vb-bts"><button class="btn sec pq" data-ver="${v.id}">Ver</button>${v.status !== "FINALIZADO" ? `<button class="btn sec pq" data-edit="${v.id}">Editar</button>` : ""}</div>
        </div>`;
      }).join("") : `<div class="vb-vazio-g"><p>Nenhuma venda Sistema A ou Sistema B ainda.</p><button class="btn" id="nv2">+ Nova venda</button></div>`}</div>`;
    const go = () => S.PAGES.vendaexterna(el).catch(S.erroEm(el));
    const itens = Object.fromEntries(j.itens.map((v) => [v.id, v]));
    el.querySelector("#nv").addEventListener("click", () => escolherSistema(go));
    el.querySelector("#nv2")?.addEventListener("click", () => escolherSistema(go));
    el.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => formulario(itens[b.dataset.edit].sistema, itens[b.dataset.edit], go)));
    el.querySelectorAll("[data-ver]").forEach((b) => b.addEventListener("click", () => detalheVendedor(+b.dataset.ver, go)));
  }
  async function detalheVendedor(id, depois) {
    const v = await api("/venda-externa/" + id);
    if (v.respondido_em && !v.visto_vendedor_em) api(`/venda-externa/${id}/visto`, { method: "POST" }).then(() => S.avisos?.atualizar()).catch(() => {});
    api(`/venda-externa/${id}/chat-visto`, { method: "POST" }).then(() => S.avisos?.atualizar()).catch(() => {});
    const linhas = v.sistema === "SISTEMA_A"
      ? `<div>Cliente <b>${esc(v.cliente_nome)}</b></div><div>Código Sistema A <b>${esc(v.codigo_conexao)}</b></div><div>Biometria <b>${v.biometria ? "Sim" : "Não"}</b></div><div>Possui chip <b>${v.possui_chip ? "Sim" : "Não"}</b></div>`
      : `<div>CPF <b>${esc(cpfFmt(v.cpf))}</b></div><div>Cidade <b>${esc(v.cidade)}</b></div><div>Contrato <b>${esc(v.contrato)}</b></div><div>Produto <b>${esc(v.produto)}</b></div><div>Valor <b>${dinheiro(v.valor)}</b></div>`;
    const m = modal(`Venda ${SIS[v.sistema]} nº ${v.id}`, `<div class="vb-det">
      <div class="vb-det-t">${pill(v.status)}<span class="mut">enviada ${hora(v.criado_em)}</span></div>
      ${v.retorno_msg ? `<div class="vb-veredito"><b>${esc(ST[v.status])}</b><span>${esc(v.retorno_msg)}</span></div>` : ""}
      ${v.status === "CRIACAO_HP" && v.prazo_em ? `<div class="vb-hp-info">Prazo para o HP: ${prazo(v.prazo_em)}</div>` : ""}
      <div class="vb-det-info">${linhas}</div>
      ${v.observacao ? `<div class="mut">Observação: ${esc(v.observacao)}</div>` : ""}</div>`,
      `<button class="btn sec" id="x">Fechar</button>${v.status !== "FINALIZADO" ? `<button class="btn" id="ed">Editar</button>` : ""}`);
    m.querySelector(".caixa").classList.add("vb-modal");
    m.querySelector(".vb-det").insertAdjacentHTML("beforeend", `<div data-chat>${chatHtml(v)}</div>`);
    ligarChat(m.querySelector("[data-chat]"), v, () => { m.remove(); detalheVendedor(id, depois); });
    acompanharConversa(m, id);
    m.querySelector(".vb-det").insertAdjacentHTML("beforeend", `${v.possui_chip && v.status !== "FINALIZADO" ? `<p class="mut" style="margin:6px 0 0">Venda com chip: anexe a foto do chip para o backoffice finalizar.</p>` : ""}<div data-anx></div>`);
    S.anexos?.montar(m.querySelector("[data-anx]"), "VENDA_EXTERNA", v.id, { enviar: v.status !== "FINALIZADO", remover: S.sessao.usuario.perfil === "gestor" });
    m.querySelector("#x").addEventListener("click", () => { m.remove(); depois(); });
    m.querySelector("#ed")?.addEventListener("click", () => { m.remove(); formulario(v.sistema, v, depois); });
  }

  /* ---------- backoffice de Cadastro ---------- */
  async function telaBackoffice(el) {
    const q = new URLSearchParams({ status: est.status === "TODAS" ? "" : est.status, busca: est.busca, sistema: est.sistema });
    const j = await api("/venda-externa?" + q);
    const c = j.contagem;
    if (est.sel && !j.itens.some((v) => v.id === est.sel)) est.sel = null;
    if (!est.sel && j.itens[0] && window.innerWidth > 1000) est.sel = j.itens[0].id;
    const filtros = [["ABERTAS", "Em aberto"], ["PENDENTE_TRATAMENTO", "Pendente"], ["CRIACAO_HP", "Criação de HP"], ["PENDENCIA", "Pendência"], ["FINALIZADO", "Finalizadas"], ["TODAS", "Todas"]];
    el.innerHTML = `<div class="cab"><div><div class="migalha">Operação</div><h1>Sistema A / Sistema B</h1><div class="mut" style="margin-top:3px">Vendas enviadas pelos vendedores. Confira, responda e acompanhe os prazos de HP.</div></div></div>
      <div class="filtros"><div class="campo" style="width:auto"><label>Mostrar</label><div class="seg" id="fs">${filtros.map(([k, n]) => `<button data-s="${k}" class="${est.status === k ? "on" : ""}">${n}</button>`).join("")}</div></div>
        <div class="campo" style="width:160px"><label>Sistema</label><select id="fsis"><option value="">Todos</option><option value="SISTEMA_A" ${est.sistema === "SISTEMA_A" ? "selected" : ""}>Sistema A</option><option value="SISTEMA_B" ${est.sistema === "SISTEMA_B" ? "selected" : ""}>Sistema B</option></select></div>
        <div class="campo" style="flex:1;min-width:200px"><label>Buscar</label><input id="fb" value="${esc(est.busca)}" placeholder="cliente, código, CPF, contrato, vendedor"></div></div>
      <div class="vb-dupla"><div class="vb-lista">${j.itens.length ? j.itens.map((v) => `<button class="vb-item ${v.id === est.sel ? "on" : ""}" data-id="${v.id}">
          <div class="vb-item-t">${pill(v.status)}<span class="tag">${SIS[v.sistema]}</span></div>
          <div class="vb-end">${esc(resumo(v))}</div>
          <div class="vb-item-r"><span>${esc(v.vendedor_nome)}</span><span class="mut">${v.status === "CRIACAO_HP" && v.prazo_em ? prazo(v.prazo_em) : ha(v.criado_em)}</span></div></button>`).join("")
        : `<p class="legenda-vazia">Nada por aqui.</p>`}</div>
        <div class="vb-painel" id="dp">${est.sel ? `<p class="mut">Carregando…</p>` : `<p class="legenda-vazia">Escolha uma venda na lista.</p>`}</div></div>`;
    const go = () => S.PAGES.vendaexterna(el).catch(S.erroEm(el));
    el.querySelector("#fs").addEventListener("click", (e) => { const s = e.target.closest("[data-s]")?.dataset.s; if (s) { est.status = s; est.sel = null; go(); } });
    el.querySelector("#fsis").addEventListener("change", (e) => { est.sistema = e.target.value; est.sel = null; go(); });
    el.querySelector("#fb").addEventListener("keydown", (e) => { if (e.key === "Enter") { est.busca = e.target.value.trim(); est.sel = null; go(); } });
    const dp = el.querySelector("#dp");
    const abrir = (id) => { est.sel = id; el.querySelectorAll(".vb-item").forEach((b) => b.classList.toggle("on", +b.dataset.id === id)); detalheBackoffice(dp, id, go); };
    el.querySelectorAll(".vb-item").forEach((b) => b.addEventListener("click", () => abrir(+b.dataset.id)));
    if (est.sel) detalheBackoffice(dp, est.sel, go);
  }
  async function detalheBackoffice(box, id, recarregar) {
    const v = await api("/venda-externa/" + id);
    const linhas = v.sistema === "SISTEMA_A"
      ? `<span>Cliente <b>${esc(v.cliente_nome)}</b></span><span>Código Sistema A <b>${esc(v.codigo_conexao)}</b></span><span>Biometria <b>${v.biometria ? "Sim" : "Não"}</b></span><span>Possui chip <b>${v.possui_chip ? "Sim" : "Não"}</b></span>`
      : `<span>CPF <b>${esc(cpfFmt(v.cpf))}</b></span><span>Cidade <b>${esc(v.cidade)}</b></span><span>Contrato <b>${esc(v.contrato)}</b></span><span>Produto <b>${esc(v.produto)}</b></span><span>Valor <b>${dinheiro(v.valor)}</b></span>`;
    const bts = [["PENDENTE_TRATAMENTO", "Pendente tratamento"], ["ATIVO_SEM_SUCESSO", "Ativo sem sucesso"], ["CRIACAO_HP", "Criação de HP"], ["PENDENCIA", "Pendência"], ["FINALIZADO", "Finalizado"]];
    box.innerHTML = `<div class="vb-det">
      <div class="vb-det-t">${pill(v.status)}<span class="tag">${SIS[v.sistema]}</span><span class="mut">nº ${v.id} · ${hora(v.criado_em)} · vendedor ${esc(v.vendedor_nome)}</span></div>
      ${v.status === "CRIACAO_HP" && v.prazo_em ? `<div class="vb-hp-info">Prazo para o HP: ${prazo(v.prazo_em)}</div>` : ""}
      <div class="vb-det-info">${linhas}</div>
      ${v.observacao ? `<div class="mut">Observação do vendedor: ${esc(v.observacao)}</div>` : ""}
      ${v.retorno_msg ? `<div class="mut">Último retorno (${esc(v.respondido_por_nome || "")}): ${esc(v.retorno_msg)}</div>` : ""}
      ${responde() && !S.sessao.vercomo ? `<h3 class="vb-h3">Retorno ao vendedor</h3>
        <div class="campo"><label>Mensagem para o vendedor <small class="mut">(obrigatória em Pendência)</small></label><textarea id="rm" rows="2" maxlength="1000" placeholder="Ex.: falta o comprovante de endereço"></textarea></div>
        <div class="campo"><label>Prazo em horas <small class="mut">(só para Criação de HP)</small></label><input id="rp" inputmode="numeric" maxlength="3" placeholder="ex.: 72"></div>
        <div class="vb-bts">${bts.map(([k, n]) => `<button class="btn ${k === "FINALIZADO" ? "vb-ok" : "sec"}" data-rt="${k}">${esc(n)}</button>`).join("")}</div>` : ""}</div>`;
    box.querySelector(".vb-det").insertAdjacentHTML("beforeend", `<div data-chat>${chatHtml(v)}</div>`);
    ligarChat(box.querySelector("[data-chat]"), v, recarregar);
    acompanharConversa(box, id);
    box.querySelector(".vb-det").insertAdjacentHTML("beforeend", '<div data-anx></div>');
    S.anexos?.montar(box.querySelector("[data-anx]"), "VENDA_EXTERNA", v.id, { enviar: true, remover: S.sessao.usuario.perfil === "gestor" });
    box.querySelectorAll("[data-rt]").forEach((b) => b.addEventListener("click", async () => {
      const st = b.dataset.rt, mensagem = box.querySelector("#rm")?.value.trim() || "", prazo_horas = box.querySelector("#rp")?.value.trim() || "";
      if (st === "PENDENCIA" && !mensagem) { alert("Escreva o que falta para o vendedor."); box.querySelector("#rm").focus(); return; }
      if (st === "CRIACAO_HP" && !/^[0-9]{1,3}$/.test(prazo_horas)) { alert("Informe o prazo em horas para o HP (ex.: 72)."); box.querySelector("#rp").focus(); return; }
      b.disabled = true;
      try { await api(`/venda-externa/${id}/retorno`, { method: "PATCH", body: { status: st, mensagem, prazo_horas } }); S.avisos?.atualizar?.(); recarregar(); }
      catch (e) { alert(e.message); b.disabled = false; }
    }));
  }

  S.PAGES.vendaexterna = async (el) => (ehVendedor() ? telaVendedor(el) : telaBackoffice(el));
})();
