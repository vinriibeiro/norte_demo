"use strict";
/* Núcleo: sessão, chamadas à API, utilidades, layout e rotas (#/pagina) */
const S = (() => {
  const CFG = window.NORTE_CFG || {};
  let sessao = null;
  try { sessao = normaliza(JSON.parse(sessionStorage.getItem("norte") || "null")); } catch {}
  const guardar = (k, v) => { try { v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch {} };
  const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = new Intl.NumberFormat("pt-BR");
  const pct = (x, d = 1) => (x == null || isNaN(x) ? "–" : (x * 100).toFixed(d).replace(".", ",") + "%");
  const brl = (x) => (x == null ? "–" : Number(x).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  /** Dias úteis podem ter meio dia (sábado vale 0,5): mostra 8 ou 8,5 em vez de 8.5 */
  const du = (v) => (v == null ? "–" : (Math.round(v * 2) / 2).toString().replace(".5", ",5"));
  const dt = (s) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "–");
  const mes = (s) => { const [a, m] = String(s).slice(0, 7).split("-"); return `${m}/${a.slice(2)}`; };
  const PAGES = {};
  let cat = null, S_perfil = null;

  async function api(path, opt = {}) {
    const r = await fetch("/api" + path, {
      method: opt.method || "GET",
      headers: { "Content-Type": "application/json", ...(sessao ? { Authorization: "Bearer " + sessao.token } : {}), ...(sessao?.vercomo != null ? { "X-Ver-Como": String(sessao.vercomo), "X-Ver-Perfil": sessao.vercomoPerfil || "", "X-Ver-Setor": sessao.vercomoSetor || "" } : {}) },
      body: opt.body ? JSON.stringify(opt.body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    const ap = r.headers.get("X-Perfil-Aplicado");
    if (ap && sessao && ap !== sessao.usuario.perfil && !path.startsWith("/auth/")) throw new Error(`Conferência falhou: a tela está como “${sessao.usuario.perfil}” mas o servidor aplicou “${ap}”. Feche e abra o sistema de novo; se persistir, reinicie o servidor.`);
    if (r.status === 401 && sessao && !path.startsWith("/auth/login") && !path.startsWith("/auth/trocar-senha")) { sair(j.erro || "Sessão expirada. Entre novamente."); throw new Error(j.erro || "Sessão expirada. Entre novamente."); }
    if (r.status === 403 && j.trocar_senha) { telaTrocarSenha(true); throw new Error(j.erro); }
    if (r.status === 404 && !j.erro) throw Object.assign(new Error("O servidor está com uma versão antiga e não tem esta função. Feche a janela do CMD, entre na pasta api nova e rode npm start de novo."), { dados: j });
    if (!r.ok) throw Object.assign(new Error(j.erro || "Erro " + r.status), { dados: j });
    return j;
  }
  /** Baixa um arquivo da API (com login) e entrega ao navegador. */
  async function baixar(path, nome) {
    const r = await fetch("/api" + path, { headers: { ...(sessao ? { Authorization: "Bearer " + sessao.token } : {}), ...(sessao?.vercomo != null ? { "X-Ver-Como": String(sessao.vercomo), "X-Ver-Perfil": sessao.vercomoPerfil || "", "X-Ver-Setor": sessao.vercomoSetor || "" } : {}) } });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.erro || (r.status === 404 ? "Servidor desatualizado: reinicie o npm start." : "Erro " + r.status)); }
    const b = await r.blob(), a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const catalogos = async () => (cat ||= await api("/catalogos"));
  const limparCatalogos = () => (cat = null);
  /** O master (desenvolvedor) usa as telas do gestor; o servidor continua tratando como master. */
  function normaliza(s) {
    if (s?.usuario?.perfil === "master") s.usuario = { ...s.usuario, perfil: "gestor", master: true };
    // administrador = mesmas telas e permissões do gerente; só o nome muda
    if (s?.usuario?.perfil === "administrador") s.usuario = { ...s.usuario, perfil: "gestor", cargo: "administrador" };
    return s;
  }
  /** Nome do perfil que aparece nas telas ("gestor" é o perfil interno do Gerente). */
  const ROTULO_PERFIL = { master: "Master", administrador: "Administrador", gestor: "Gerente", gerente: "Gerente", coordenador: "Coordenador", lider: "Supervisor", backoffice: "Backoffice", vendedor: "Vendedor" };
  const rotPerfil = (p) => ROTULO_PERFIL[p] || p || "";
  const salvar = (s) => { sessao = normaliza(s); sessionStorage.setItem("norte", JSON.stringify(sessao)); };
  const sair = (msg) => { S.avisos?.parar(); sessao = null; cat = null; sessionStorage.removeItem("norte"); telaLogin(msg); };

  /* ---------- segurança: sai sozinho após 30 min sem uso (vale para todas as abas) ---------- */
  const OCIOSO_MS = 2 * 60 * 60 * 1000;   // 2 horas sem nenhum uso
  const marcar = () => { try { localStorage.setItem("seven_ativo", String(Date.now())); } catch {} };
  let ultMarca = 0;
  ["click", "keydown", "mousemove", "touchstart", "scroll"].forEach((ev) => addEventListener(ev, () => { const n = Date.now(); if (n - ultMarca > 15000) { ultMarca = n; marcar(); } }, { passive: true }));
  marcar();
  setInterval(() => {
    if (!sessao) return;
    const ult = Number(ler("seven_ativo") || Date.now());
    if (Date.now() - ult > OCIOSO_MS) sair("Você saiu automaticamente após 2 horas sem uso.");
  }, 30000);
  const logo = (h) => { const st = `height:${h || CFG.logoAltura || 30}px`, alt = esc(CFG.empresa || ""); return `<img class="logo-c" src="${esc(CFG.logo || "logo.png")}" alt="${alt}" style="${st}"><img class="logo-e" src="${esc(CFG.logoEscuro || "logo_escuro.png")}" alt="${alt}" style="${st}">`; };

  /* ---------- cartão de indicador (ícone escolhido pelo nome do indicador) ---------- */
  const ICO = {
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>', check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    x: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>', wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 14.5h2"/>', pct: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/>',
    wifi: '<path d="M2.5 9a15 15 0 0119 0M6 12.5a10 10 0 0112 0M9.3 16a5 5 0 015.4 0"/><circle cx="12" cy="19.2" r="1"/>', users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3.2 3.2 0 010 5.6M18.5 14.4c1.6.8 2.5 2.6 2.5 5.6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>', cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    bars: '<path d="M5 20V11M12 20V4M19 20v-6"/>', pen: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  };
  const ICO_REGRAS = [[/cancel|inadimpl|perd|apagou|exclus/, "x", "ruim"], [/pendent|aberto|prazo/, "clock", "alerta"], [/conectad|quitad|ativ|bateram/, "check", "ok"], [/ticket|receita|pacote|comiss|premia|pagar|valor/, "wallet", "azul"],
    [/fpd|taxa|conectividade|%/, "pct", "alerta"], [/banda|\bbl\b/, "wifi", "azul"], [/pessoa|vendedor|colabor|equipe|acess/, "users", "azul"], [/meta/, "target", "azul"], [/alter|edi[çc]|cria/, "pen", "azul"], [/venda/, "trend", "azul"], [/m[eê]s|dia|semana|safra/, "cal", "azul"]];
  /** Cartão de indicador. serie (opcional): valores para o minigráfico; chip (opcional): {txt, tom} ao lado do valor. */
  function kpi(rotulo, valor, detalhe, serie, chip) {
    const [, ic, tom] = ICO_REGRAS.find(([re]) => re.test(String(rotulo).toLowerCase())) || [0, "trend", "azul"];
    const sp = Array.isArray(serie) && serie.filter((x) => x != null).length > 1 ? CH.spark(serie.slice(-12), { cor: { ok: CH.COR.ok, ruim: CH.COR.ruim, alerta: CH.COR.alerta }[tom] || CH.COR.base, w: 84, h: 28 }) : "";
    return `<div class="kpi"><div class="kpi-topo"><div class="r">${esc(rotulo)}</div><span class="ico ${tom}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[ic]}</svg></span></div><div class="kpi-val"><div class="v">${valor}${chip ? ` <span class="chip ${chip.tom || ""}">${esc(chip.txt)}</span>` : ""}</div>${sp}</div><div class="d">${esc(detalhe || "") || "&nbsp;"}</div></div>`;
  }

  function tabela(cols, rows, opt = {}) {
    const cab = cols.map((c) => `<th class="${c.n ? "num" : ""}">${esc(c.t)}</th>`).join("");
    const corpo = rows.map((r, i) => `<tr ${opt.clic ? `class="clic" data-i="${i}"` : ""}>${cols.map((c) => `<td data-l="${esc(c.t || "")}" class="${c.n ? "num" : ""} ${c.c || ""}">${c.f ? c.f(r) : esc(r[c.k] ?? "")}</td>`).join("")}</tr>`).join("");
    return `<div class="tab"><table><thead><tr>${cab}</tr></thead><tbody>${corpo || `<tr><td colspan="${cols.length}" class="mut">Nenhum registro.</td></tr>`}</tbody></table></div>`;
  }
  function modal(titulo, html, rod) {
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<div class="caixa"><h2>${esc(titulo)}</h2><div class="corpo">${html}</div>${rod ? `<div class="rod">${rod}</div>` : ""}</div>`;
    d.addEventListener("mousedown", (e) => { if (e.target === d) d.remove(); });
    document.body.appendChild(d); return d;
  }
  const painel = (titulo, corpo, nota, extra) => `<section class="painel"><h2><span>${esc(titulo)}</span>${extra ? `<small>${esc(extra)}</small>` : ""}</h2><div class="corpo">${corpo}</div>${nota ? `<div class="nota">${esc(nota)}</div>` : ""}</section>`;
  const erroEm = (el) => (e) => { el.innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; };

  /* ---------- telas de entrada ---------- */
  function telaLogin(msg) {
    document.getElementById("app").innerHTML = `<div class="login"><div class="lado"><div class="marca">${logo(54)}<h2>Mais vendas instaladas, mais resultado.</h2><p>Acompanhe vendas, qualidade, rota e premiação da sua equipe em tempo real.</p></div></div><div class="caixa"><div class="login-logo">${logo(40)}</div><h1>Entrar</h1><p class="sub">Use o e-mail e a senha do seu acesso.</p>
      <form id="f"><div class="campo"><label>E-mail</label><input name="email" type="email" autocomplete="username" required autofocus></div>
      <div class="campo"><label>Senha</label><input name="senha" type="password" autocomplete="current-password" required></div>
      <button class="btn" type="submit">Entrar</button><div class="erro" id="e" style="margin-top:10px">${esc(msg || "")}</div>
      <button type="button" class="link-esqueci" id="esq">Esqueci a senha</button></form></div></div>`;
    document.getElementById("esq").addEventListener("click", () => telaEsqueci(document.querySelector("#f [name=email]").value));
    document.getElementById("f").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const j = await api("/auth/login", { method: "POST", body: Object.fromEntries(new FormData(ev.target)) });
        salvar(j);
        if (j.usuario.trocar) telaTrocarSenha(true);
        else if (sessao.usuario.master) telaEntrarComo();   // master escolhe com qual função entrar
        else iniciar();
      } catch (e) { document.getElementById("e").textContent = e.message; }
    });
  }
  function telaEsqueci(email0) {
    document.getElementById("app").innerHTML = `<div class="login"><div class="lado"><div class="marca">${logo(54)}<h2>Mais vendas instaladas, mais resultado.</h2><p>Acompanhe vendas, qualidade, rota e premiação da sua equipe em tempo real.</p></div></div><div class="caixa"><div class="login-logo">${logo(40)}</div><h1>Esqueci a senha</h1><p class="sub">Informe o e-mail do seu acesso. Seu gerente é avisado e gera uma senha temporária para você entrar.</p>
      <form id="f"><div class="campo"><label>E-mail</label><input name="email" type="email" autocomplete="username" required autofocus value="${esc(email0 || "")}"></div>
      <button class="btn" type="submit">Pedir nova senha</button><div class="erro" id="e" style="margin-top:10px"></div>
      <button type="button" class="link-esqueci" id="vl">Voltar para o login</button></form></div></div>`;
    document.getElementById("vl").addEventListener("click", () => telaLogin());
    document.getElementById("f").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const b = ev.target.querySelector("button[type=submit]"); b.disabled = true;
      try {
        const j = await api("/auth/esqueci-senha", { method: "POST", body: Object.fromEntries(new FormData(ev.target)) });
        ev.target.innerHTML = `<div class="aviso ok-msg">${esc(j.mensagem)}</div><button type="button" class="btn" id="vl2" style="margin-top:14px">Voltar para o login</button>`;
        document.getElementById("vl2").addEventListener("click", () => telaLogin());
      } catch (e) { b.disabled = false; document.getElementById("e").textContent = e.message; }
    });
  }
  function telaTrocarSenha(obrig) {
    document.getElementById("app").innerHTML = `<div class="login"><div class="caixa">${logo(46)}
      <p>${obrig ? "Defina uma senha nova para continuar." : "Trocar senha"}</p>
      <form id="f"><div class="campo"><label>Senha atual</label><input name="senha_atual" type="password" autocomplete="current-password" required></div>
      <div class="campo"><label>Senha nova (10+ caracteres, com letras e números; nada óbvio como 12345678 ou senha123)</label><input name="senha_nova" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></div>
      <button class="btn" type="submit">Salvar</button> ${obrig ? "" : `<button class="btn sec" type="button" id="v" style="margin-top:6px">Voltar</button>
      <p class="mut" style="margin-top:14px">Esqueceu o sistema aberto em outro computador ou celular?</p><button class="btn sec" type="button" id="st">Sair de todos os aparelhos</button>`}
      <div class="erro" id="e" style="margin-top:10px"></div></form></div></div>`;
    document.getElementById("v")?.addEventListener("click", () => iniciar());
    document.getElementById("st")?.addEventListener("click", async () => {
      if (!confirm("Encerrar o acesso em todos os aparelhos, inclusive este? Você vai precisar entrar de novo.")) return;
      try { await api("/auth/sair-todos", { method: "POST", body: {} }); sair("Sessões encerradas em todos os aparelhos. Entre novamente."); }
      catch (e) { document.getElementById("e").textContent = e.message; }
    });
    document.getElementById("f").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const j = await api("/auth/trocar-senha", { method: "POST", body: Object.fromEntries(new FormData(ev.target)) });
        salvar({ token: j.token, usuario: { ...sessao.usuario, trocar: false } }); iniciar();
      } catch (e) { document.getElementById("e").textContent = e.message; }
    });
  }

  /* ---------- layout ---------- */
  const MENUS = {
    gestor: [["Painel", [["dashboard", "Visão geral"], ["equipe", "Visão das equipes"]]], ["Vendas", [["vendas", "Lista de vendas"], ["nova", "Nova venda"], ["lote", "Lançamento em lote"], ["importvendas", "Importar planilha"]]],
      ["Operação", [["viabilidade", "Viabilidade"], ["confirmacao", "Confirmação D+1 / D+15"], ["rota", "Rota de instalação"], ["fechamento", "Fechamento do dia"], ["semvenda", "Sem venda hoje"], ["pendencias", "Pendências"], ["produtividade", "Produtividade"]]],
      ["Indicadores", [["ind-vendas", "Vendas"], ["ind-qualidade", "Qualidade (FPD)"], ["fpd", "Lançar FPD"], ["ind-operacao", "Operação"], ["ind-pessoas", "Vendedores"], ["ind-geo", "Geografia"]]], ["Premiação", [["comissao", "Premiação do mês"], ["plano", "Plano do mês (metas)"]]], ["Financeiro", [["extrato", "Extrato da operadora"]]], ["CRM", [["crm", "Calendário e clientes"]]], ["Administração", [["usuarios", "Usuários e acessos"], ["feriados", "Feriados e dias úteis"], ["central", "Central de alterações"]]], ["Ajuda", [["wiki", "Wiki · como usar"]]]],
    // backoffice de Cadastro: cria e alimenta vendas, responde viabilidade, rota e confirmações
    backoffice_cadastro: [["Painel", [["dashboard", "Visão geral"]]], ["Operação", [["viabilidade", "Viabilidade"], ["vendaexterna", "Sistema A / Sistema B"], ["confirmacao", "Confirmação D+1 / D+15"], ["rota", "Rota de instalação"], ["fechamento", "Fechamento do dia"], ["pendencias", "Pendências"], ["produtividade", "Produtividade"]]],
      ["Vendas", [["vendas", "Lista de vendas"], ["nova", "Nova venda"], ["lote", "Lançamento em lote"], ["importvendas", "Importar planilha"]]], ["Ajuda", [["wiki", "Wiki · como usar"]]]],
    // backoffice de Qualidade: indicadores e FPD (vendas só para consulta)
    backoffice_qualidade: [["Painel", [["dashboard", "Visão geral"]]], ["Indicadores", [["ind-vendas", "Vendas"], ["ind-operacao", "Operação"], ["ind-pessoas", "Vendedores"], ["ind-geo", "Geografia"]]],
      ["Vendas", [["vendas", "Lista de vendas"]]], ["Ajuda", [["wiki", "Wiki · como usar"]]]],
    lider: [["Minha equipe", [["equipe", "Visão da equipe"], ["vendas", "Vendas da equipe"]]], ["Premiação", [["comissao", "Premiação da equipe"]]], ["Ajuda", [["wiki", "Wiki · como usar"]]]],
    coordenador: [["Minha coordenação", [["equipe", "Visão da coordenação"], ["vendas", "Vendas da coordenação"]]], ["Premiação", [["comissao", "Premiação da coordenação"]]], ["Ajuda", [["wiki", "Wiki · como usar"]]]],
    vendedor: [["Minha área", [["meu", "Meu desempenho"], ["vendas", "Minhas vendas"], ["viabilidade", "Viabilidade"], ["vendaexterna", "Sistema A / Sistema B"]]], ["Premiação", [["comissao", "Minha premiação"]]], ["CRM", [["crm", "Calendário e clientes"]]], ["Ajuda", [["wiki", "Wiki · como usar"]]]],
  };
  /** Menu do usuário: o backoffice muda conforme o setor (Cadastro ou Qualidade). */
  const ICM = {
    dashboard: '<rect x="3.5" y="3.5" width="7" height="8" rx="2"/><rect x="13.5" y="3.5" width="7" height="5" rx="2"/><rect x="13.5" y="11.5" width="7" height="9" rx="2"/><rect x="3.5" y="14.5" width="7" height="6" rx="2"/>',
    equipe: ICO.users, meu: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
    vendas: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>', nova: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    lote: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>', importvendas: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>', viabilidade: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    vendaexterna: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M8 10h8M8 14h5"/>',
    confirmacao: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/>', rota: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H16a3.5 3.5 0 000-7H8a3.5 3.5 0 010-7h7.5"/>',
    fechamento: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V2.8h6V4M9 11h6M9 15h4"/>', semvenda: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', pendencias: '<path d="M12 3l9.5 16.5h-19z"/><path d="M12 10v4M12 17.2v.1"/>', produtividade: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    "ind-vendas": ICO.trend, "ind-qualidade": '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>', fpd: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>',
    "ind-operacao": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    "ind-pessoas": '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>', "ind-geo": '<path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4z"/><path d="M9 4v13.5M15 6.5V20"/>',
    comissao: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>', plano: ICO.target, extrato: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/><path d="M19 8v6M16 11h6"/>', feriados: ICO.cal, crm: ICO.cal, wiki: '<path d="M4 4.5A1.5 1.5 0 015.5 3H18a1 1 0 011 1v15a1 1 0 01-1 1H5.5A1.5 1.5 0 014 18.5z"/><path d="M4 16.5A1.5 1.5 0 015.5 15H19"/><path d="M8.5 7.5h6M8.5 11h4"/>', central: '<path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  };
  const CURTO = { crm: "CRM", meu: "Início", vendas: "Vendas", viabilidade: "Viabil.", vendaexterna: "Sistema A", comissao: "Premiação", dashboard: "Início", semvenda: "Sem venda", fechamento: "Hoje", equipe: "Equipes", pendencias: "Pendências" };
  // barra inferior do app: atalhos escolhidos por perfil (os demais perfis usam os 5 primeiros itens do menu)
  const ABAS_APP = { gestor: ["dashboard", "semvenda", "vendas", "fechamento", "equipe"], vendedor: ["meu", "vendas", "crm", "viabilidade", "vendaexterna", "comissao"] };
  const abasApp = (u) => { const it = menuDe(u).flatMap(([, x]) => x), esc0 = ABAS_APP[u.perfil]; return esc0 ? esc0.map((k) => it.find(([c]) => c === k)).filter(Boolean) : it.slice(0, 5); };
  const icm = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICM[k] || ICO.bars}</svg>`;
  const menuDe = (u) => MENUS[u.perfil === "backoffice" ? (u.setor === "QUALIDADE" ? "backoffice_qualidade" : "backoffice_cadastro") : u.perfil] || [];

  const iniciais = (n) => String(n || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  function pintarAvatar(foto, nome) {
    const av = document.getElementById("av"); if (!av) return;
    av.innerHTML = foto ? `<img src="${esc(foto)}" alt="">` : esc(iniciais(nome));
  }
  /** Avisos fixos logo abaixo do topo (não rolam com a página). */
  function faixa(html) { let f = document.getElementById("faixas"); if (!f) { f = document.createElement("div"); f.id = "faixas"; document.querySelector(".topo").after(f); } f.insertAdjacentHTML("beforeend", html); document.body.classList.add("com-faixa"); }
  function iniciar() {
    if (window.NORTE_APP?.bloqueia(sessao.usuario)) return;   // app do celular: só vendedores
    document.body.classList.remove("com-faixa");
    const u = sessao.usuario;
    S.menuAtual = menuDe(u);   // a Wiki usa isto para mostrar só os assuntos das telas deste perfil
    document.getElementById("app").innerHTML = `<header class="topo"><button class="burger" id="bg" aria-label="Menu">☰</button><button class="btn-menu" id="bm" title="Abrir/fechar menu lateral" aria-label="Abrir ou fechar menu">☰</button><div class="tt" id="tt"><small></small><b></b></div><span class="sep"></span>
      <a class="usu" href="#/perfil" title="Meu perfil"><span class="avatar" id="av">${iniciais(u.nome)}</span><span class="nm"><b>${esc(u.nome)}</b><br>${esc(rotPerfil(u.master ? "master" : u.cargo || u.perfil))}${u.perfil === "backoffice" ? (u.setor === "QUALIDADE" ? " · Qualidade" : " · Cadastro") : ""}</span></a>${u.master ? `<button class="btn sec pq" id="vc" title="Ver o sistema como outro usuário (somente leitura)">Ver como…</button>` : ""}<button class="btn-tema" id="tm" title="Modo escuro / claro" aria-label="Alternar modo escuro"></button><button class="ib" id="sn" title="Trocar senha" aria-label="Trocar senha"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/></svg></button><button class="ib" id="sx" title="Sair" aria-label="Sair"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l4-4-4-4M14 12H4"/></svg></button></header>
      <nav class="menu" id="mn"><div class="marca">${logo(28)}<img class="marca-app" src="icone-192.png" alt=""><span class="marca-nome">Norte Link</span><button type="button" class="menu-fechar" id="mf" title="Fechar menu" aria-label="Fechar menu"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>${menuDe(u).map(([g, it]) => `<h6>${esc(g)}</h6>${it.map(([k, n]) => `<a href="#/${k}" data-k="${k}" data-g="${esc(g)}">${icm(k)}<span>${esc(n)}</span></a>`).join("")}`).join("")}<div class="menu-rod">Norte Link · canal Operadora<span class="dev">Desenvolvido por Vinícius Ribeiro</span></div></nav><div class="menu-fundo" id="mfu"></div>${document.body.classList.contains("app-vendedor") ? `<nav class="tabbar">${abasApp(u).map(([k, n]) => `<a href="#/${k}" data-k="${k}">${icm(k)}<span>${esc(CURTO[k] || n)}</span></a>`).join("")}</nav>` : ""}
      <main class="conteudo" id="ct"></main>`;
    document.getElementById("sx").addEventListener("click", () => sair());
    document.getElementById("vc")?.addEventListener("click", escolherUsuario);
    if (sessao.vercomo != null) {
      faixa(`<div class="faixa-ver"><span class="fv-txt">Vendo como <b>${esc(u.nome)}</b> · ${esc(rotPerfil(u.cargo || u.perfil))} · só consulta</span>
        <button class="btn pq" id="vv">Voltar ao master</button>
        <button type="button" class="fv-min" id="vmin" title="Minimizar este aviso" aria-label="Minimizar este aviso">–</button></div>`);
      // minimizar: vira uma pastilha pequena, para a tela ficar livre (fica assim até clicar nela de novo)
      const min = (v) => { document.body.classList.toggle("faixa-min", v); try { sessionStorage.setItem("seven_faixa_min", v ? "1" : ""); } catch {} };
      let guardado = ""; try { guardado = sessionStorage.getItem("seven_faixa_min") || ""; } catch {}
      min(!!guardado);
      document.getElementById("vmin").addEventListener("click", (e) => { e.stopPropagation(); min(!document.body.classList.contains("faixa-min")); });
      document.querySelector(".faixa-ver").addEventListener("click", (e) => { if (document.body.classList.contains("faixa-min") && !e.target.closest("#vv")) min(false); });
    }
    document.getElementById("vv")?.addEventListener("click", () => { sessao = { ...sessao, usuario: sessao.original, vercomo: null, vercomoPerfil: null, vercomoSetor: null, original: null }; sessionStorage.setItem("norte", JSON.stringify(sessao)); cat = null; S_perfil = null; location.hash = "#/dashboard"; iniciar(); });
    document.getElementById("sn").addEventListener("click", () => telaTrocarSenha(false));
    const mn = document.getElementById("mn"), fechaMenu = () => { mn.classList.remove("aberto"); document.body.classList.remove("menu-aberto"); };
    document.getElementById("bg").addEventListener("click", () => { const a = mn.classList.toggle("aberto"); document.body.classList.toggle("menu-aberto", a); });
    document.getElementById("mf").addEventListener("click", () => { fechaMenu(); if (innerWidth > 900 && !document.body.classList.contains("app-vendedor")) { document.body.classList.add("menu-fechado"); guardar("seven_menu", "fechado"); } });
    document.getElementById("mfu").addEventListener("click", fechaMenu);
    CH.iniciar();
    const tm = document.getElementById("tm"), pintaTema = () => { tm.textContent = document.documentElement.dataset.tema === "escuro" ? "☀" : "☾"; tm.title = document.documentElement.dataset.tema === "escuro" ? "Voltar ao modo claro" : "Modo escuro"; };
    pintaTema();
    tm.addEventListener("click", () => { const e = document.documentElement.dataset.tema === "escuro"; if (e) delete document.documentElement.dataset.tema; else document.documentElement.dataset.tema = "escuro"; guardar("seven_tema", e ? "claro" : "escuro"); pintaTema(); rotear(); });
    document.body.classList.toggle("menu-fechado", ler("seven_menu") === "fechado");
    document.getElementById("bm").addEventListener("click", () => { const f = document.body.classList.toggle("menu-fechado"); guardar("seven_menu", f ? "fechado" : "aberto"); });
    fetch("/api/saude").then((r) => r.json()).then((j) => {
      if ((j.versao || 0) < (CFG.apiMinima || 0)) faixa(`<div class="faixa-erro">O servidor está desatualizado (versão ${j.versao || 1}, o site espera ${CFG.apiMinima}). Feche a janela preta do CMD, entre na pasta <b>api</b> nova e rode <b>npm start</b> de novo. Rota, Perfil e Novo colaborador só funcionam depois disso.</div>`);
    }).catch(() => {});
    window.NORTE_GO = (d) => { if (d.f) S.filtrarVendas?.(d.f); else if (d.rota) S.filtrarRota?.(d.rota); else if (d.cen) S.filtrarCentral?.(d.cen); else if (d.h) location.hash = d.h; };
    api("/perfil").then((p) => { S.perfil = p; pintarAvatar(p.foto, p.nome_completo); }).catch(() => {});
    window.onhashchange = rotear; rotear();
    S.avisos?.iniciar(u);
    S.push?.iniciar();   // convite para ativar as notificações no celular (Gerente/Adm)
  }
  /** Master: menu suspenso para ver o sistema como qualquer perfil / pessoa (somente leitura), sem criar usuário de teste. */
  /** Pessoas que realmente têm aquele perfil (e, no backoffice, aquele setor). */
  const doPerfil = (pessoas, p) => {
    const [base, setor] = String(p).split(":");
    return pessoas.filter((x) => x.perfil_acesso === base && (!setor || (x.setor || "CADASTRO") === setor));
  };
  const PERFIS_VER = { vendedor: "Vendedor", lider: "Supervisor", coordenador: "Coordenador", "backoffice:CADASTRO": "Backoffice · Cadastro", "backoffice:QUALIDADE": "Backoffice · Qualidade", gestor: "Gerente", administrador: "Administrador" };

  /** Entra no sistema com o perfil de outra pessoa (só leitura). Usado pelo master. */
  function verComo(p, perfil, setor) {
    sessao = { ...sessao, original: sessao.original || sessao.usuario, vercomo: p.id, vercomoPerfil: perfil, vercomoSetor: setor || "",
      usuario: { id: p.id, nome: p.nome, perfil: perfil === "administrador" ? "gestor" : perfil, cargo: perfil === "administrador" ? "administrador" : undefined, setor: setor || null, master: false, vercomo: true, trocar: false } };
    sessionStorage.setItem("norte", JSON.stringify(sessao)); cat = null; S_perfil = null; location.hash = "#/"; iniciar();
  }

  /** Depois do login do master: pergunta com qual função entrar (master mesmo ou vendo como alguém). */
  async function telaEntrarComo() {
    const nome = String(sessao.usuario.nome || "").split(" ")[0];
    const icoDe = (k) => icm(k === "master" ? "usuarios" : k.split(":")[0] === "backoffice" ? "lote" : k === "vendedor" ? "meu" : (k === "gestor" || k === "administrador") ? "dashboard" : "equipe");
    const cartao = (k, n, d) => `<button type="button" class="ec-op" data-p="${esc(k)}"><span class="ec-ic">${icoDe(k)}</span><span><b>${esc(n)}</b><small>${esc(d)}</small></span></button>`;
    document.getElementById("app").innerHTML = `<div class="login entrar-como"><div class="caixa ec"><div class="login-logo">${logo(40)}</div>
      <h1>Olá, ${esc(nome)}</h1><p class="sub">Você entrou como <b>master</b>. Com qual função quer abrir o sistema agora?</p>
      <div class="ec-lista">
        ${cartao("master", "Master (acesso total)", "Todas as telas, podendo alterar dados")}
        ${Object.entries(PERFIS_VER).map(([k, n]) => cartao(k, n, "Abre como esse perfil enxerga, só para consulta")).join("")}
      </div>
      <div class="erro" id="e" style="margin-top:10px"></div></div></div>`;
    const el = document.getElementById("app");
    el.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", async () => {
      const k = b.dataset.p;
      if (k === "master") return iniciar();
      try {
        const pessoas = await api("/equipes/pessoas").catch(() => []);
        const lista = doPerfil(pessoas, k);
        const [perfil, setor] = k.split(":");
        if (!lista.length) return verComo({ id: 0, nome: `${PERFIS_VER[k]} (sem pessoa)` }, perfil, setor);   // entra só com o perfil
        el.querySelector(".ec-lista").innerHTML = lista.map((p) => `<button type="button" class="ec-op" data-id="${p.id}"><span class="ec-ic ini">${esc(iniciais(p.nome))}</span><span><b>${esc(p.nome)}</b><small>${esc(p.email || "sem e-mail de acesso")}</small></span></button>`).join("")
          + `<button type="button" class="ec-op" data-id="0"><span class="ec-ic">${icm("dashboard")}</span><span><b>Sem pessoa específica</b><small>só as telas do perfil, em branco</small></span></button>`
          + `<button type="button" class="btn sec" id="ec-volta" style="margin-top:12px;width:100%">← Escolher outra função</button>`;
        el.querySelector(".sub").innerHTML = `Entrando como <b>${esc(PERFIS_VER[k])}</b>. Escolha a pessoa:`;
        el.querySelectorAll("[data-id]").forEach((c) => c.addEventListener("click", () => verComo(lista.find((x) => x.id === +c.dataset.id) || { id: 0, nome: `${PERFIS_VER[k]} (sem pessoa)` }, perfil, setor)));
        el.querySelector("#ec-volta").addEventListener("click", () => telaEntrarComo());
      } catch (e) { el.querySelector("#e").textContent = e.message; }
    }));
  }

  async function escolherUsuario() {
    const pessoas = await api("/equipes/pessoas");
    const ROT = PERFIS_VER;
    const m = modal("Ver como…", `<p class="mut" style="margin-top:0">Escolha o perfil e a pessoa. O sistema abre exatamente como aquele perfil enxerga, só para consulta. Você volta ao master quando quiser.</p>
      <div class="campo" style="margin-bottom:10px"><label>Perfil</label><select id="vp">${Object.entries(ROT).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
      <div class="campo"><label>Pessoa</label><select id="vs"></select></div><div class="mut" id="vd" style="margin-top:8px"></div>`,
      `<button class="btn sec" id="vx">Cancelar</button><button class="btn" id="vo">Ver como</button>`);
    const vp = m.querySelector("#vp"), vs = m.querySelector("#vs");
    const NOTA = { lider: "Supervisor vê as equipes em que ele estiver como supervisor (Usuários e acessos → Equipes). Sem equipe atribuída, a tela aparece vazia.", coordenador: "Coordenador vê as equipes em que ele estiver como coordenador. Sem equipe atribuída, a tela aparece vazia.", vendedor: "Vendedor vê só as vendas da pessoa escolhida.", "backoffice:CADASTRO": "Backoffice de Cadastro: vendas, viabilidade, confirmações D+1/D+15, rota e fechamento (aqui, só consulta).", "backoffice:QUALIDADE": "Backoffice de Qualidade: indicadores e FPD; vendas só para consulta.", gestor: "Gerente vê e administra tudo, inclusive o Extrato da operadora (aqui, só consulta).", administrador: "Administrador tem as mesmas permissões do gerente (aqui, só consulta)." };
    const pinta = () => {
      const p = vp.value, opt = (x) => `<option value="${x.id}">${esc(x.nome)}</option>`;
      const iguais = doPerfil(pessoas, p);   // só quem realmente está nessa função
      vs.innerHTML = iguais.map(opt).join("") + `<option value="0">— Sem pessoa (só as telas do perfil) —</option>`;
      vs.disabled = false; m.querySelector("#vo").disabled = false;
      m.querySelector("#vd").textContent = iguais.length ? (NOTA[p] || "") : `Ninguém está com o perfil ${ROT[p]} hoje: dá para entrar assim mesmo, só para ver as telas.`;
    };
    pinta(); vp.addEventListener("change", pinta);
    m.querySelector("#vx").addEventListener("click", () => m.remove());
    m.querySelector("#vo").addEventListener("click", () => {
      const [perfil, setor] = vp.value.split(":");
      const p = pessoas.find((x) => x.id === +vs.value) || { id: 0, nome: `${ROT[vp.value]} (sem pessoa)` };
      m.remove();
      verComo(p, perfil, setor);
    });
  }
  async function rotear() {
    if (!sessao) return;
    const [, pg, arg] = (location.hash || "").split("/");
    const menu = menuDe(sessao.usuario);
    const padrao = menu[0][1][0][0];
    const nome = PAGES[pg] && (menu.some(([, it]) => it.some(([k]) => k === pg)) || pg === "venda" || pg === "perfil") ? pg : padrao;
    document.querySelectorAll("#mn a, .tabbar a").forEach((a) => a.classList.toggle("on", a.dataset.k === (nome === "venda" ? "vendas" : nome)));
    const ativo = document.querySelector("#mn a.on"), tt = document.getElementById("tt");
    if (tt) { tt.querySelector("small").textContent = ativo?.dataset.g || (nome === "perfil" ? "Conta" : ""); tt.querySelector("b").textContent = (document.body.classList.contains("app-vendedor") && CURTO[ativo?.dataset.k] ? CURTO[ativo.dataset.k] : ativo?.textContent) || (nome === "perfil" ? "Meu perfil" : nome === "venda" ? "Detalhe da venda" : ""); }
    document.getElementById("mn")?.classList.remove("aberto"); document.body.classList.remove("menu-aberto");
    // cada navegação ganha o seu próprio contêiner: uma tela lenta que termina depois não sobrescreve a atual
    const ct = document.getElementById("ct"), el = document.createElement("div"); el.innerHTML = `<p class="mut">Carregando…</p>`; ct.replaceChildren(el);
    try { await PAGES[nome](el, arg); S.ui?.botaoExportar(el); } catch (e) { erroEm(el)(e); }
    window.scrollTo(0, 0); ct.scrollTop = 0;
  }
  return { rotPerfil, get sessao() { return sessao; }, pintarAvatar, iniciais, get perfil() { return S_perfil; }, set perfil(v) { S_perfil = v; }, api, esc, nf, pct, brl, dt, du, mes, tabela, kpi, modal, painel, erroEm, baixar, catalogos, limparCatalogos, logo, telaLogin, telaEsqueci, telaTrocarSenha, iniciar, PAGES, sair, salvar };
})();
