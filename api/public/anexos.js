"use strict";
/* Anexos (vendas Sistema A / Sistema B e viabilidades): lista, envio (até 10 MB) e download.
   S.anexos.montar(elemento, "VENDA_EXTERNA" | "VIABILIDADE", id, { enviar, remover }) */
(() => {
  const { esc, api } = S;
  const LIMITE = 10 * 1024 * 1024;
  const LIMITE_FOTO = 50 * 1024 * 1024;
  const EXT_FOTO = /\.(jpe?g|png|webp|heic)$/i;
  const POR_EXTENSAO = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", mp4: "video/mp4", mov: "video/quicktime" };
  const ACEITA = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.mp4,.mov";
  const tam = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const hora = (d) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const cabecalhos = () => {
    const s = S.sessao;
    return { ...(s ? { Authorization: "Bearer " + s.token } : {}), ...(s?.vercomo != null ? { "X-Ver-Como": String(s.vercomo), "X-Ver-Perfil": s.vercomoPerfil || "", "X-Ver-Setor": s.vercomoSetor || "" } : {}) };
  };
  const erroDe = async (r) => { try { return (await r.json()).erro; } catch { return `Erro ${r.status}`; } };

  async function baixar(a) {
    const r = await fetch(`/api/anexos/${a.id}/arquivo`, { headers: cabecalhos() });
    if (!r.ok) return alert(await erroDe(r));
    const url = URL.createObjectURL(await r.blob());
    const l = document.createElement("a"); l.href = url; l.download = a.nome; document.body.appendChild(l); l.click(); l.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function montar(el, entidade, id, { enviar = false, remover = false } = {}) {
    if (!el) return;
    const recarregar = () => montar(el, entidade, id, { enviar, remover });
    let itens = [];
    try { itens = (await api(`/anexos?entidade=${entidade}&id=${id}`)).itens; }
    catch (e) { el.innerHTML = `<p class="mut">Não foi possível carregar os anexos: ${esc(e.message)}</p>`; return; }
    el.innerHTML = `<h3 class="vb-h3">Anexos</h3>
      ${itens.length ? `<ul class="anx-lista">${itens.map((a) => `<li>
          <button class="btn sec pq" data-baixar="${a.id}">Baixar</button>
          <span class="anx-nome">${esc(a.nome)}</span>
          <span class="mut">${tam(a.tamanho)} · ${esc(a.enviado_por_nome || "")} · ${hora(a.criado_em)}</span>
          ${remover ? `<button class="btn sec pq" data-remover="${a.id}">Remover</button>` : ""}</li>`).join("")}</ul>`
        : `<p class="mut" style="margin:0 0 8px">Nenhum arquivo ainda.</p>`}
      ${enviar ? `<div><label class="btn sec pq" style="cursor:pointer">+ Anexar arquivo<input type="file" accept="${ACEITA}" data-arquivo hidden></label>
        <span class="mut" id="anx-st">Fotos até 50 MB · demais arquivos até 10 MB</span></div>` : ""}`;
    el.querySelectorAll("[data-baixar]").forEach((b) => b.addEventListener("click", () => baixar(itens.find((a) => a.id === +b.dataset.baixar))));
    el.querySelectorAll("[data-remover]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Remover este arquivo?")) return;
      try { await api(`/anexos/${b.dataset.remover}`, { method: "DELETE" }); recarregar(); } catch (e) { alert(e.message); }
    }));
    const inp = el.querySelector("[data-arquivo]");
    inp?.addEventListener("change", async () => {
      const f = inp.files[0]; if (!f) return;
      const st = el.querySelector("#anx-st");
      const foto = EXT_FOTO.test(f.name) || /^image\//.test(f.type);
      if (f.size > (foto ? LIMITE_FOTO : LIMITE)) { alert(foto ? "Foto acima de 50 MB. Reduza o tamanho e tente de novo." : "Arquivo acima de 10 MB. Reduza o tamanho e tente de novo."); inp.value = ""; return; }
      st.textContent = "Enviando…";
      const tipo = f.type || POR_EXTENSAO[(f.name.split(".").pop() || "").toLowerCase()] || "application/octet-stream";
      const r = await fetch(`/api/anexos?entidade=${entidade}&id=${id}&nome=${encodeURIComponent(f.name)}`, {
        method: "POST", headers: { ...cabecalhos(), "Content-Type": tipo }, body: f });
      if (!r.ok) { alert(await erroDe(r)); inp.value = ""; st.textContent = "Fotos até 50 MB · demais arquivos até 10 MB"; return; }
      recarregar();
    });
  }

  // seletor de arquivos dentro de um formulário (antes de enviar)
  function seletor(el) {
    if (!el) return { arquivos: () => [] };
    let lista = [];
    el.innerHTML = `<div class="anx-escolha"><label class="btn sec pq" style="cursor:pointer">+ Anexar arquivos<input type="file" multiple accept="${ACEITA}" hidden></label>
      <span class="mut anx-txt">Fotos até 50 MB; PDF e vídeo até 10 MB</span></div>`;
    const inp = el.querySelector("input"), txt = el.querySelector(".anx-txt");
    inp.addEventListener("change", () => {
      const novos = [...inp.files];
      const grande = novos.find((f) => f.size > LIMITE);
      if (grande) { alert(`"${grande.name}" passa de 10 MB. Reduza o arquivo e escolha de novo.`); inp.value = ""; return; }
      lista = novos;
      txt.textContent = lista.length ? lista.map((f) => f.name).join(", ") : "Fotos até 50 MB; PDF e vídeo até 10 MB";
    });
    return { arquivos: () => lista };
  }

  // sobe os arquivos escolhidos logo depois de criar a venda/consulta; devolve os que falharam
  async function enviarVarios(entidade, id, arquivos) {
    const falhas = [];
    for (const f of arquivos) {
      try {
        const r = await fetch(`/api/anexos?entidade=${entidade}&id=${id}&nome=${encodeURIComponent(f.name)}`, {
          method: "POST", headers: { ...cabecalhos(), "Content-Type": f.type || "application/octet-stream" }, body: f });
        if (!r.ok) falhas.push(`${f.name}: ${await erroDe(r)}`);
      } catch (e) { falhas.push(`${f.name}: ${e.message}`); }
    }
    return falhas;
  }

  S.anexos = { montar, seletor, enviarVarios };
})();
