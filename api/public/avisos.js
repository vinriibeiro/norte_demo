"use strict";
/* Avisos em tempo real (sem recarregar a página): consulta /api/avisos a cada 20 s.
   Backoffice de Cadastro e gerente: nova viabilidade para verificar.  Vendedor: viabilidade respondida.
   Mostra número no menu e no título da aba, toca um som e, com o navegador em segundo plano, mostra notificação do sistema. */
S.avisos = (() => {
  let timer = null, ativo = false, ultimo = null, ctx = null;
  const ler = (k, p) => { try { return localStorage.getItem(k) ?? p; } catch { return p; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const somLigado = () => ler("seven_som", "1") === "1";
  const tituloBase = () => document.title.replace(/^\(\d+\)\s*/, "");

  // o navegador só deixa tocar som depois de um clique/toque na página: destrava no primeiro gesto
  const destravar = () => { try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); } catch {} };
  ["pointerdown", "keydown", "touchstart"].forEach((e) => addEventListener(e, destravar, { passive: true }));

  /** Som curto de duas notas (gerado na hora, sem arquivo). */
  function tocar(forcar) {
    if (!forcar && !somLigado()) return;
    try {
      destravar(); if (!ctx) return;
      const t0 = ctx.currentTime + 0.02;
      [[880, 0], [1318.5, 0.16], [1760, 0.32]].forEach(([f, dt], i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(i === 2 ? 0.22 : 0.16, t0 + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.42);
        o.connect(g).connect(ctx.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.45);
      });
    } catch {}
    try { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([120, 60, 120]); } catch {}
  }

  function toast(titulo, texto, ir) {
    document.querySelector(".av-toast")?.remove();
    const d = document.createElement("div"); d.className = "av-toast"; d.setAttribute("role", "status");
    d.innerHTML = `<span class="av-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/></svg></span>
      <div><b>${S.esc(titulo)}</b><span>${S.esc(texto)}</span></div><button class="btn pq" data-a="ir">Abrir</button><button class="av-x" data-a="x" aria-label="Fechar">×</button>`;
    d.addEventListener("click", (e) => { const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return; d.remove(); if (a === "ir") location.hash = ir; });
    document.body.appendChild(d);
    setTimeout(() => d.isConnected && d.classList.add("sai"), 12000); setTimeout(() => d.remove(), 12600);
  }
  function notificar(titulo, texto, ir) {
    try {
      if (!document.hidden || !("Notification" in window) || Notification.permission !== "granted") return;
      const n = new Notification(titulo, { body: texto, icon: "icone-192.png", tag: "norte-viabilidade" });
      n.onclick = () => { window.focus(); location.hash = ir; n.close(); };
    } catch {}
  }
  function marcarMenu(n, cls) {
    const a = document.querySelector('#mn a[data-k="viabilidade"]'); if (!a) return;
    a.querySelector(".av-badge")?.remove();
    if (n > 0) a.insertAdjacentHTML("beforeend", `<span class="av-badge ${cls || ""}">${n > 99 ? "99+" : n}</span>`);
    document.title = (n > 0 ? `(${n}) ` : "") + tituloBase();
  }

  /** Número no item do menu (Sistema A / Sistema B), sem mexer no título da aba. */
  function badge(k, n, cls) {
    const a = document.querySelector(`#mn a[data-k="${k}"]`); if (!a) return;
    a.querySelector(".av-badge")?.remove();
    if (n > 0) a.insertAdjacentHTML("beforeend", `<span class="av-badge ${cls || ""}">${n > 99 ? "99+" : n}</span>`);
  }

  async function consultar() {
    if (!S.sessao) return parar();
    try {
      const j = await S.api("/avisos");
      const vendedor = S.sessao.usuario.perfil === "vendedor";
      const cx = j.conexao;
      if (cx) {
        const nCx = vendedor ? cx.avisos : cx.pendentes;
        badge("vendaexterna", nCx, vendedor ? "ok" : "");
        const chaveCx = "seven_aviso_cx_" + S.sessao.usuario.id, antesCx = ler(chaveCx, "0");
        if (cx.marca !== "0" && cx.marca !== antesCx && BigInt(cx.marca) > BigInt(antesCx || "0") && !S.sessao.vercomo) {
          if (vendedor) { tocar(); toast("Sistema A / Sistema B", "Há retorno, mensagem ou prazo para ver numa venda sua. Toque para ver.", "#/vendaexterna"); notificar("Sistema A / Sistema B", "Há retorno, mensagem ou prazo para ver numa venda sua.", "#/vendaexterna"); }
          else { tocar(); toast("Nova venda Sistema A / Sistema B", `${nCx} aguardando tratamento.`, "#/vendaexterna"); notificar("Nova venda Sistema A / Sistema B", `${nCx} aguardando tratamento.`, "#/vendaexterna"); }
        }
        gravar(chaveCx, cx.marca);
      }
      const v = j.viabilidade; if (!v) return;
      const n = vendedor ? v.respondidas : v.pendentes;
      marcarMenu(n, vendedor ? "ok" : "");
      const chave = "seven_aviso_" + S.sessao.usuario.id, antes = ultimo ?? ler(chave, "0");
      if (v.marca !== "0" && v.marca !== antes && BigInt(v.marca) > BigInt(antes || "0") && !S.sessao.vercomo) {
        if (vendedor) { tocar(); toast("Viabilidade respondida", "O backoffice respondeu o seu pedido. Toque para ver.", "#/viabilidade"); notificar("Viabilidade respondida", "O backoffice respondeu o seu pedido.", "#/viabilidade"); }
        else { tocar(); toast("Nova viabilidade", `${n} pedido${n === 1 ? "" : "s"} aguardando verificação.`, "#/viabilidade"); notificar("Nova viabilidade para verificar", `${n} aguardando na fila.`, "#/viabilidade"); }
        document.dispatchEvent(new CustomEvent("norte-aviso", { detail: v }));
      }
      ultimo = v.marca; gravar(chave, v.marca);
    } catch {}
  }
  function agendar() { clearTimeout(timer); if (ativo) timer = setTimeout(async () => { await consultar(); agendar(); }, document.hidden ? 60000 : 20000); }
  function parar() { ativo = false; clearTimeout(timer); ultimo = null; }
  document.addEventListener("visibilitychange", () => { if (ativo && !document.hidden) { consultar(); agendar(); } });

  return {
    /** Liga para quem recebe avisos: gerente, backoffice de Cadastro e vendedor. */
    iniciar(u) {
      parar();
      if (!(u.perfil === "vendedor" || u.perfil === "gestor" || (u.perfil === "backoffice" && u.setor !== "QUALIDADE"))) { document.title = tituloBase(); return; }
      ativo = true; consultar(); agendar();
    },
    parar, tocar, atualizar: consultar, somLigado,
    alternarSom() { gravar("seven_som", somLigado() ? "0" : "1"); if (somLigado()) tocar(true); return somLigado(); },
    async pedirNotificacao() { try { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); } catch {} return "Notification" in window ? Notification.permission : "indisponivel"; },
  };
})();
