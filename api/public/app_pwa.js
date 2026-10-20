"use strict";
/* App do vendedor (PWA): o mesmo sistema, instalado na tela inicial do celular, com o ícone da marca (sem o nome).
   Aberto pelo ícone, aceita vendedores e também Gerente/Administrador (que recebem as notificações de venda); os demais cargos usam o navegador. */
window.NORTE_APP = (() => {
  const q = new URLSearchParams(location.search);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  try { if (q.has("app") || standalone) sessionStorage.setItem("seven_app", "1"); } catch {}
  const noApp = (() => { try { return sessionStorage.getItem("seven_app") === "1"; } catch { return standalone; } })();
  if (noApp) document.body.classList.add("app-vendedor");

  /* Alguns celulares abrem o app como "site para computador" (tela com ~980px de largura): tudo fica miúdo.
     Aqui o app mede a largura real do aparelho, aumenta a página na mesma proporção e aplica as regras de celular. */
  const doCss = (() => {
    const regras = [];
    for (const sh of document.styleSheets) {
      let rs; try { rs = sh.cssRules; } catch { continue; }
      for (const r of rs) if (r.media && r.cssRules && !/print|prefers|hover|pointer|orientation/.test(r.media.mediaText)) regras.push(r);
    }
    return regras;
  });
  const casa = (txt, w) => {
    const t = txt.replace(/\s+/g, "");
    if (/[a-z-]+:/.test(t.replace(/\((max|min)-width:\d+(\.\d+)?px\)/g, "").replace(/and/g, ""))) return false;
    let ok = /width/.test(t);
    t.replace(/\(max-width:(\d+(?:\.\d+)?)px\)/g, (_, n) => { if (w > +n) ok = false; });
    t.replace(/\(min-width:(\d+(?:\.\d+)?)px\)/g, (_, n) => { if (w < +n) ok = false; });
    return ok;
  };
  function escala() {
    if (!noApp) return;
    const d = document.documentElement;
    d.style.zoom = ""; d.classList.remove("zoom-app");
    document.getElementById("mq-app")?.remove();
    const lw = d.clientWidth || innerWidth, sw = Math.min(screen.width || lw, screen.height || lw);
    let f = 1;
    if (sw && sw < 760 && lw > sw * 1.15) f = lw / sw;
    else if (window.visualViewport && visualViewport.scale < 0.85) f = 1 / visualViewport.scale;
    if (f < 1.08) return;
    d.style.zoom = f.toFixed(3); d.style.setProperty("--zv", f.toFixed(3)); d.classList.add("zoom-app");
    const w = lw / f, st = document.createElement("style"); st.id = "mq-app";
    st.textContent = doCss().filter((r) => !matchMedia(r.media.mediaText).matches && casa(r.media.mediaText, w)).map((r) => [...r.cssRules].map((x) => x.cssText).join("\n")).join("\n");
    document.head.appendChild(st);
  }
  let ultima = 0;
  if (noApp) { escala(); ultima = innerWidth; let t; addEventListener("resize", () => { if (innerWidth === ultima) return; ultima = innerWidth; clearTimeout(t); t = setTimeout(escala, 150); }); addEventListener("orientationchange", () => setTimeout(escala, 300)); }
  if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

  let pedido = null;   // Android/Chrome: guarda o convite de instalação para mostrar no botão
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedido = e; document.dispatchEvent(new Event("seven-instalavel")); });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone;

  return {
    noApp,
    /** No app, quem não é vendedor vê um aviso em vez do sistema. */
    bloqueia(u) {
      if (!noApp || u.perfil === "vendedor" || u.perfil === "gestor" || u.master || u.vercomo) return false;
      document.getElementById("app").innerHTML = `<div class="login"><div class="caixa app-aviso">
        <h1>App Norte Link</h1><p class="sub">O aplicativo é dos vendedores e do Gerente/Administrador. Para o seu cargo, use o sistema pelo navegador do computador ou do celular.</p>
        <a class="btn" href="/" id="nav" style="justify-content:center">Abrir no navegador</a><button class="btn sec" id="sx" style="margin-top:8px;width:100%">Sair</button></div></div>`;
      document.getElementById("sx").addEventListener("click", () => S.sair());
      document.getElementById("nav").addEventListener("click", () => { try { sessionStorage.removeItem("seven_app"); } catch {} });
      return true;
    },
    /** Faixa "Instalar o app" para o vendedor que abriu pelo navegador do celular. */
    convite() {
      if (noApp || !(pedido || ios) || window.innerWidth > 900) return "";
      return `<div class="app-instalar" id="ai"><img src="icone-192.png" alt=""><div><b>Instale o app Norte Link</b><br>${ios ? "Toque em Compartilhar e depois em <b>Adicionar à Tela de Início</b>." : "Abra direto da tela inicial e receba os avisos de viabilidade."}</div>${pedido ? `<button class="btn pq" id="ai-b">Instalar</button>` : ""}</div>`;
    },
    ligarConvite(el) { el.querySelector("#ai-b")?.addEventListener("click", async () => { if (!pedido) return; pedido.prompt(); await pedido.userChoice.catch(() => {}); pedido = null; el.querySelector("#ai")?.remove(); }); },
  };
})();

/* Puxar para atualizar: estando no topo da tela, arrastar para baixo e soltar recarrega o sistema
   (não precisa sair e limpar o cache). Não dispara com uma janela aberta, para não perder o que está sendo digitado. */
(() => {
  let y0 = null, dy = 0, aviso = null;
  const noTopo = () => (document.scrollingElement || document.documentElement).scrollTop <= 0;
  const barra = () => {
    if (aviso) return aviso;
    aviso = document.createElement("div");
    aviso.setAttribute("aria-live", "polite");
    aviso.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:9999;text-align:center;font:600 13px system-ui,sans-serif;padding:10px;background:#fff;color:#334155;box-shadow:0 2px 8px rgba(0,0,0,.14);transform:translateY(-100%);transition:transform .15s";
    document.body.appendChild(aviso);
    return aviso;
  };
  addEventListener("touchstart", (e) => {
    y0 = e.touches.length === 1 && noTopo() && !document.querySelector(".caixa") ? e.touches[0].clientY : null;
    dy = 0;
  }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0) return;
    const b = barra();
    b.textContent = dy > 90 ? "Solte para atualizar" : "Puxe para atualizar";
    b.style.transform = `translateY(${Math.min(0, dy - 60)}px)`;
  }, { passive: true });
  addEventListener("touchend", () => {
    if (y0 != null && dy > 90) { barra().textContent = "Atualizando…"; location.reload(); return; }
    if (aviso) aviso.style.transform = "translateY(-100%)";
    y0 = null;
  });
})();
