"use strict";
/* Notificações no celular (Gerente e Administrador) + telas "Sem venda hoje" e "Pendências".
   - Ativar: pede permissão, inscreve o aparelho (Web Push) e manda um aviso de teste.
   - iPhone: só funciona com o app instalado na Tela de Início (Safari > Compartilhar > Adicionar à Tela de Início), iOS 16.4+. */
(() => {
  const { esc, nf, api, painel, tabela, kpi, modal } = S;
  const ehAdmin = () => { const u = S.sessao?.usuario; return !!u && !S.sessao.vercomo && (u.perfil === "gestor" || u.master); };
  const base = () => (ehAdmin() ? "/notificacoes" : "/notificacoes/equipe");
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const suportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const chaveBin = (b64) => { const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
  const aparelho = () => {
    const ua = navigator.userAgent;
    const so = /iphone/i.test(ua) ? "iPhone" : /ipad/i.test(ua) ? "iPad" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac/i.test(ua) ? "Mac" : "Aparelho";
    const nav = /edg\//i.test(ua) ? "Edge" : /crios|chrome/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : /firefox/i.test(ua) ? "Firefox" : "";
    return `${so}${nav ? " · " + nav : ""}${instalado() ? " · app" : ""}`;
  };
  const registro = async () => {
    let r = await navigator.serviceWorker.getRegistration();
    if (!r) r = await navigator.serviceWorker.register("/sw.js");
    return navigator.serviceWorker.ready.then(() => r);
  };
  async function inscricaoAtual() { if (!suportado()) return null; try { return await (await registro()).pushManager.getSubscription(); } catch { return null; } }

  /** O que impede de ativar neste aparelho (texto) ou null se dá para ativar. */
  function impedimento() {
    if (ios && !instalado()) return "No iPhone, as notificações só funcionam pelo app: abra controleseven.com.br no Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”. Entre pelo ícone e ative aqui.";
    if (!suportado()) return ios ? "Este iPhone não aceita notificações de app. Atualize para o iOS 16.4 ou mais novo." : "Este navegador não aceita notificações. Use o Chrome (Android ou computador).";
    if (Notification.permission === "denied") return ios ? "As notificações foram bloqueadas. Libere em Ajustes > Notificações > Norte Link." : "As notificações foram bloqueadas neste navegador. Toque no cadeado ao lado do endereço > Permissões > Notificações > Permitir.";
    return null;
  }

  async function ativar() {
    const imp = impedimento(); if (imp) throw new Error(imp);
    const perm = await Notification.requestPermission();   // precisa ser o 1º passo do toque (exigência do iPhone)
    if (perm !== "granted") throw new Error("Permissão não concedida. Toque em Ativar de novo e escolha “Permitir”.");
    const reg = await registro();
    const { chave } = await api(base() + "/chave");
    let sub = await reg.pushManager.getSubscription();
    if (sub && sub.options?.applicationServerKey) {   // inscrição antiga com outra chave do servidor: refaz
      const atual = new Uint8Array(sub.options.applicationServerKey), nova = chaveBin(chave);
      if (atual.length !== nova.length || atual.some((b, i) => b !== nova[i])) { await sub.unsubscribe().catch(() => {}); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBin(chave) });
    await api(base() + "/inscrever", { method: "POST", body: { inscricao: sub.toJSON(), aparelho: aparelho() } });
    if (ehAdmin()) await api("/notificacoes/teste", { method: "POST", body: {} }).catch(() => {});
  }
  async function desativar() {
    const sub = await inscricaoAtual();
    if (sub) { await api(base() + "/cancelar", { method: "POST", body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
  }

  /** Painel "Notificações no celular" (vai na tela Meu perfil). */
  /** Equipe (vendedor, líder, coordenador, backoffice): só os avisos de tratativa, neste aparelho. */
  async function painelEquipe(box) {
    const u = S.sessao?.usuario;
    if (!u || S.sessao.vercomo || u.master) { box.innerHTML = ""; return; }
    const sub = await inscricaoAtual();
    let st = { este_aparelho: false };
    try { st = await api("/notificacoes/equipe/estado?nocache=1&endpoint=" + encodeURIComponent(sub?.endpoint || "")); } catch {}
    const ativo = !!sub && st.este_aparelho && Notification.permission === "granted", imp = impedimento();
    box.innerHTML = painel("Avisos de tratativa no celular", `
      <p style="margin:0 0 10px">${ativo ? `<span class="tag ok">Ativos neste aparelho</span>` : `<span class="tag">Desligados neste aparelho</span>`}</p>
      ${imp && !ativo ? `<div class="aviso">${esc(imp)}</div>` : ""}
      <p class="mut" style="margin:0 0 10px">Aviso quando chegar mensagem numa venda Sistema A / Sistema B${u.perfil === "backoffice" ? "" : ""} e quando uma viabilidade for contestada. O aviso não mostra o texto.</p>
      <p style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">${ativo ? `<button class="btn sec" id="nd">Desligar neste aparelho</button>` : `<button class="btn" id="na" ${imp ? "disabled" : ""}>Ativar neste aparelho</button>`}</p>
      <div class="mut" id="nm" role="status"></div>`, "Ative em cada celular que for receber.", "Equipe");
    const msg = (t, ok) => { const m = box.querySelector("#nm"); if (!m) return; m.textContent = t; m.style.color = ok === false ? "var(--ert)" : ""; };
    box.querySelector("#na")?.addEventListener("click", async (e) => {
      e.target.disabled = true; msg("Ativando…");
      try { await ativar(); await painelEquipe(box); msg("Pronto! Este aparelho vai receber os avisos.", true); }
      catch (er) { msg(er.message, false); e.target.disabled = false; }
    });
    box.querySelector("#nd")?.addEventListener("click", async () => { await desativar(); await painelEquipe(box); msg("Desligado neste aparelho."); });
  }

  async function painelNotificacoes(box) {
    if (!ehAdmin()) return painelEquipe(box);
    const sub = await inscricaoAtual();
    let st = { nova_venda: true, relatorio: true, aparelhos: 0, este_aparelho: false, horarios: ["12:00", "17:00"] };
    try { st = await api("/notificacoes/estado?nocache=1&endpoint=" + encodeURIComponent(sub?.endpoint || "")); } catch {}
    const ativo = !!sub && st.este_aparelho && Notification.permission === "granted", imp = impedimento();
    box.innerHTML = painel("Notificações no celular", `
      <p style="margin:0 0 10px">${ativo ? `<span class="tag ok">Ativas neste aparelho</span>` : `<span class="tag">Desligadas neste aparelho</span>`}
        <span class="mut"> · ${nf.format(st.aparelhos)} aparelho(s) seu(s) recebendo</span></p>
      ${imp && !ativo ? `<div class="aviso">${esc(imp)}</div>` : ""}
      <label class="push-op"><input type="checkbox" id="pv" ${st.nova_venda ? "checked" : ""}><span>Avisar a cada <b>venda lançada</b> (vendedor, equipe e produtos)</span></label>
      <label class="push-op"><input type="checkbox" id="pr" ${st.relatorio ? "checked" : ""}><span>Resumo de <b>quem ainda não vendeu</b>, às ${esc(st.horarios.join(" e "))} (seg. a sáb.)</span></label>
      <p style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">${ativo ? `<button class="btn sec" id="nt">Enviar teste</button><button class="btn sec" id="nd">Desligar neste aparelho</button>` : `<button class="btn" id="na" ${imp && !(ios && instalado()) && Notification?.permission === "denied" ? "disabled" : ""}>Ativar neste aparelho</button>`}</p>
      <div class="mut" id="nm" role="status"></div>`,
      "Ative em cada celular que for receber. No iPhone, só pelo app instalado na Tela de Início (iOS 16.4 ou mais novo).", "Gerente e Administrador");
    const msg = (t, ok) => { const m = box.querySelector("#nm"); m.textContent = t; m.style.color = ok === false ? "var(--ert)" : ""; };
    const pref = async (k, v) => { try { await api("/notificacoes/preferencias", { method: "PUT", body: { [k]: v } }); msg("Preferência salva."); } catch (e) { msg(e.message, false); } };
    box.querySelector("#pv").addEventListener("change", (e) => pref("nova_venda", e.target.checked));
    box.querySelector("#pr").addEventListener("change", (e) => pref("relatorio", e.target.checked));
    box.querySelector("#na")?.addEventListener("click", async (e) => {
      e.target.disabled = true; msg("Ativando…");
      try { await ativar(); fecharFaixa(); await painelNotificacoes(box); msg("Pronto! Você deve receber um aviso de teste em instantes.", true); }
      catch (err) { msg(err.message, false); e.target.disabled = false; }
    });
    box.querySelector("#nt")?.addEventListener("click", async () => { try { const r = await api("/notificacoes/teste", { method: "POST", body: {} }); msg(`Teste enviado para ${r.enviados} de ${r.aparelhos} aparelho(s).`, true); } catch (e) { msg(e.message, false); } });
    box.querySelector("#nd")?.addEventListener("click", async () => { await desativar(); await painelNotificacoes(box); msg("Desligado neste aparelho."); });
  }

  /* Convite discreto no rodapé para o Gerente/Adm que ainda não ativou neste celular (some por 7 dias ao tocar em "Agora não"). */
  const CHAVE_FAIXA = "seven_push_adiado";
  const fecharFaixa = () => document.getElementById("push-faixa")?.remove();
  async function iniciar() {
    if (!ehAdmin() || window.innerWidth > 900) return;
    try { if (+localStorage.getItem(CHAVE_FAIXA) > Date.now()) return; } catch {}
    if (suportado() && Notification.permission === "granted" && (await inscricaoAtual())) return;
    if (!suportado() && !ios) return;
    if (suportado() && Notification.permission === "denied") return;
    fecharFaixa();
    const d = document.createElement("div"); d.id = "push-faixa"; d.className = "push-faixa";
    const soInstalar = ios && !instalado();
    d.innerHTML = `<div><b>${soInstalar ? "Receba as vendas no iPhone" : "Receba as vendas no celular"}</b><br><span>${soInstalar ? "Safari > Compartilhar > <b>Adicionar à Tela de Início</b>. Depois entre pelo ícone e ative." : "Aviso a cada venda lançada e o resumo de quem ainda não vendeu."}</span></div>
      <div class="push-acoes">${soInstalar ? "" : `<button class="btn pq" id="pf-a">Ativar</button>`}<button class="btn sec pq" id="pf-n">Agora não</button></div>`;
    document.body.appendChild(d);
    d.querySelector("#pf-n").addEventListener("click", () => { try { localStorage.setItem(CHAVE_FAIXA, String(Date.now() + 7 * 864e5)); } catch {} fecharFaixa(); });
    d.querySelector("#pf-a")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      try { await ativar(); d.innerHTML = `<div><b>Notificações ativadas ✓</b><br><span>Um aviso de teste deve chegar em instantes.</span></div>`; setTimeout(fecharFaixa, 4000); }
      catch (err) { d.querySelector("span").textContent = err.message; e.target.disabled = false; }
    });
  }
  // toque na notificação com o app aberto: o service worker pede para ir à tela da venda/resumo
  navigator.serviceWorker?.addEventListener("message", (e) => { const u = e.data?.ir; if (u && new URL(u, location.href).origin === location.origin) { const h = new URL(u, location.href).hash; if (h) location.hash = h; else location.href = u; } });
  S.push = { iniciar, painel: painelNotificacoes, ativar, desativar };

  /* ------------------------------------------------------------ Sem venda hoje */
  const hojeBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const br = (d) => (d ? d.split("-").reverse().join("/") : "");
  const est = { dia: null };
  const tit = (s) => String(s || "").toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());
  S.PAGES.semvenda = async (el) => {
    const dia = est.dia || hojeBR();
    const j = await api("/sem-venda?dia=" + dia);
    const haDias = (d) => { if (!d) return "nunca vendeu"; const n = Math.round((new Date(dia + "T12:00:00Z") - new Date(d + "T12:00:00Z")) / 864e5); return n <= 0 ? "" : n === 1 ? "última venda ontem" : `última venda há ${n} dias`; };
    el.innerHTML = `<div class="cab"><div><div class="migalha">Operação</div><h1>Sem venda ${dia === hojeBR() ? "hoje" : "em " + br(dia)}</h1></div>
        <div class="acoes"><input type="date" id="sd" value="${dia}" max="${hojeBR()}" style="max-width:170px"></div></div>
      <div class="kpis">${kpi("Vendedores ativos", nf.format(j.total), "com equipe")}${kpi("Já venderam", nf.format(j.com_venda), j.total ? Math.round((j.com_venda / j.total) * 100) + "% da equipe" : "")}
        ${kpi("Sem venda", nf.format(j.sem_venda), "ainda não lançaram")}${kpi("Vendas do dia", nf.format(j.vendas), "lançadas no sistema")}</div>
      <div class="grade g2">${j.equipes.map((g) => painel(tit(g.equipe), g.sem.length
        ? `<ul class="sv-lista">${g.sem.map((p) => `<li><b>${esc(tit(p.nome))}</b><span class="mut">${esc(haDias(p.ultima_venda))}</span></li>`).join("")}</ul>`
        : `<p class="mut" style="margin:0">Todos já venderam ✓</p>`, "", `${g.sem.length} de ${g.total} sem venda · ${g.vendas} venda(s)`)).join("") || `<p class="mut">Nenhum vendedor com equipe cadastrada.</p>`}</div>
      <p class="mut" style="margin-top:10px">Vendedor = colaborador ativo, com equipe e função de vendedor. Conta qualquer venda lançada no dia (inclusive cancelada depois).</p>`;
    el.querySelector("#sd").addEventListener("change", (e) => { est.dia = e.target.value || null; S.PAGES.semvenda(el).catch(S.erroEm(el)); });
  };

  /* ------------------------------------------------------------ Pendências */
  const TIPO = { PENDENCIA: "Pendências", CHIP_PENDENTE: "Chips a ativar", CADASTRO_ANDAMENTO: "Cadastros em andamento" };
  const ep = { tipo: "", situacao: "abertas", busca: "" };
  S.PAGES.pendencias = async (el) => {
    const q = new URLSearchParams({ tipo: ep.tipo, situacao: ep.situacao, busca: ep.busca, nocache: 1 });
    const j = await api("/pendencias?" + q);
    const total = Object.values(j.contagem).reduce((a, b) => a + b, 0);
    el.innerHTML = `<div class="cab"><div><div class="migalha">Operação</div><h1>Pendências</h1></div></div>
      <div class="abas">${[["", `Todas (${total})`], ...Object.entries(TIPO).map(([k, n]) => [k, `${n} (${j.contagem[k] || 0})`])].map(([k, n]) => `<button data-t="${k}" class="${ep.tipo === k ? "on" : ""}">${esc(n)}</button>`).join("")}</div>
      <div class="filtros"><div class="campo" style="width:auto"><label>Mostrar</label><div class="seg" id="ps">${[["abertas", "Abertas"], ["resolvidas", "Resolvidas"], ["todas", "Todas"]].map(([k, n]) => `<button data-s="${k}" class="${ep.situacao === k ? "on" : ""}">${n}</button>`).join("")}</div></div>
        <div class="campo" style="flex:1;min-width:200px"><label>Buscar</label><input id="pb" value="${esc(ep.busca)}" placeholder="cliente, vendedor, proposta, HP, observação"></div></div>
      ${painel(`${nf.format(j.itens.length)} ${ep.situacao === "abertas" ? "aberta(s)" : "registro(s)"}`, tabela([
        { t: "Abertura", f: (x) => `${esc(br(String(x.data_abertura).slice(0, 10)))}${x.aberta ? `<br><small class="mut">${x.dias} dia(s)</small>` : ""}` },
        ...(ep.tipo ? [] : [{ t: "Tipo", f: (x) => `<span class="tag">${esc(TIPO[x.tipo] || x.tipo)}</span>` }]),
        { t: "Vendedor", f: (x) => `${esc(x.vendedor || "–")}${x.equipe ? `<br><small class="mut">${esc(tit(x.equipe))}</small>` : ""}` },
        { t: "Cliente", f: (x) => esc(x.cliente_nome || "–") },
        { t: "Proposta / HP", f: (x) => esc([x.proposta, x.hp && "HP " + x.hp].filter(Boolean).join(" · ") || "–") },
        { t: "Contrato", f: (x) => (x.contrato_id ? `<a href="#/venda/${x.contrato_id}">${esc(x.numero_contrato)}</a>` : "–") },
        { t: "Observação", f: (x) => `<span style="white-space:normal">${esc(x.descricao || "")}</span>` },
        { t: "", f: (x) => `<div class="pend-acoes" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sec pq" data-id="${x.id}" data-ab="${x.aberta ? 0 : 1}">${x.aberta ? "Resolver" : "Reabrir"}</button><button class="btn sec pq" data-ed="${x.id}">Editar</button><button class="btn sec pq" data-del="${x.id}">Excluir</button></div>` },
      ], j.itens), "Vêm das abas PENDÊNCIAS, CHIP PENDENTES DE ATIVAÇÃO e CADASTROS EM ANDAMENTO da planilha. Ao importar de novo, o que saiu da planilha é marcado como resolvido.")}`;
    const rec = () => S.PAGES.pendencias(el).catch(S.erroEm(el));
    el.querySelector(".abas").addEventListener("click", (e) => { const t = e.target.dataset.t; if (t !== undefined) { ep.tipo = t; rec(); } });
    el.querySelector("#ps").addEventListener("click", (e) => { const s = e.target.dataset.s; if (s) { ep.situacao = s; rec(); } });
    let tm; el.querySelector("#pb").addEventListener("input", (e) => { clearTimeout(tm); tm = setTimeout(() => { ep.busca = e.target.value.trim(); rec(); }, 400); });
    el.querySelectorAll("button[data-id]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try { await api("/pendencias/" + b.dataset.id, { method: "PATCH", body: { aberta: b.dataset.ab === "1" } }); rec(); } catch (e) { alert(e.message); b.disabled = false; }
    }));
    // editar: tipo, HP, cliente, proposta e observação
    const editar = (x) => {
      const m = modal("Editar pendência", `<form id="fp" class="vb-form">
        <div class="vb-g"><div class="campo"><label>Tipo</label><select name="tipo">${Object.entries(TIPO).map(([k, n]) => `<option value="${k}" ${x.tipo === k ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
          <div class="campo"><label>HP</label><input name="hp" maxlength="20" value="${esc(x.hp || "")}"></div></div>
        <div class="campo"><label>Cliente</label><input name="cliente_nome" maxlength="150" value="${esc(x.cliente_nome || "")}"></div>
        <div class="campo"><label>Proposta</label><input name="proposta" maxlength="60" value="${esc(x.proposta || "")}"></div>
        <div class="campo"><label>Observação</label><textarea name="descricao" rows="4" maxlength="1000">${esc(x.descricao || "")}</textarea></div>
        <div class="erro" id="e"></div></form>`, `<button class="btn sec" id="x">Cancelar</button><button class="btn" id="s">Salvar</button>`);
      const f = m.querySelector("#fp");
      m.querySelector("#x").addEventListener("click", () => m.remove());
      m.querySelector("#s").addEventListener("click", async () => {
        const b = m.querySelector("#s"); b.disabled = true;
        try { await api("/pendencias/" + x.id, { method: "PUT", body: Object.fromEntries(new FormData(f)) }); m.remove(); rec(); }
        catch (e) { m.querySelector("#e").textContent = e.message; b.disabled = false; }
      });
    };
    const itens = Object.fromEntries(j.itens.map((x) => [x.id, x]));
    el.querySelectorAll("button[data-ed]").forEach((b) => b.addEventListener("click", () => editar(itens[b.dataset.ed])));
    el.querySelectorAll("button[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Excluir esta pendência? Ela sai das telas, mas fica registrada no banco para auditoria.")) return;
      b.disabled = true;
      try { await api("/pendencias/" + b.dataset.del, { method: "DELETE" }); rec(); } catch (e) { alert(e.message); b.disabled = false; }
    }));
  };
})();
