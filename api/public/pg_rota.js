"use strict";
/* Rota de instalação: agenda do dia/semana, confirmação com o cliente e resultado da instalação (backoffice e gestor) */
(() => {
  const { esc, nf, pct, dt, painel, api, modal } = S, C = CH.COR;
  const SIT = { PENDENTE_INSTALACAO: ["Pendente", "alerta"], INSTALADO: ["Instalado", "ok"], CANCELADO: ["Cancelado", "ruim"], REAGENDADO: ["Reagendado", ""], CLIENTE_AUSENTE: ["Cliente ausente", "ruim"] };
  const COR_SIT = { INSTALADO: C.ok, PENDENTE_INSTALACAO: C.alerta, CLIENTE_AUSENTE: C.ruim, CANCELADO: C.cinza, REAGENDADO: C.cinza };
  const SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const soma = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoLocal(d); };
  const rotDia = (iso) => { const d = new Date(iso + "T12:00:00"); return `${SEM[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const hoje = () => isoLocal(new Date());
  const dia = (r) => String(r.data_rota).slice(0, 10);
  const fone = (t) => { const d = String(t || "").replace(/\D/g, ""); return d.length >= 10 ? (d.startsWith("55") && d.length > 11 ? d : "55" + d) : ""; };

  const est = { dia: hoje(), modo: "dia", sit: "", busca: "" };
  const tag = (s) => `<span class="tag ${SIT[s]?.[1] || ""}">${esc(SIT[s]?.[0] || s)}</span>`;

  S.filtrarRota = (iso) => { est.dia = iso; est.modo = "dia"; if (location.hash.startsWith("#/rota")) S.PAGES.rota(document.getElementById("ct")).catch(S.erroEm(document.getElementById("ct"))); else location.hash = "#/rota"; };

  S.PAGES.rota = async (el) => {
    const cat = await S.catalogos();
    const consulta = () => {
      if (est.modo === "atrasadas") return "/rota?atrasadas=1" + (est.busca ? "&busca=" + encodeURIComponent(est.busca) : "");
      const ate = est.modo === "semana" ? soma(est.dia, 6) : est.dia;
      return `/rota?de=${est.dia}&ate=${ate}` + (est.sit ? "&situacao=" + est.sit : "") + (est.busca ? "&busca=" + encodeURIComponent(est.busca) : "");
    };
    const [linhas, resumo] = await Promise.all([api(consulta()), api(`/rota/resumo?de=${soma(est.dia, -2)}&ate=${soma(est.dia, 7)}`)]);
    const turnos = cat.turnos.map((t) => t.codigo);

    // ---- indicadores do que está na tela ----
    const ativas = linhas.filter((r) => r.situacao !== "REAGENDADO");
    const n = (f) => ativas.filter(f).length;
    const conf = n((r) => r.confirmada === true), inst = n((r) => r.situacao === "INSTALADO"), pend = n((r) => r.situacao === "PENDENTE_INSTALACAO");
    const semConf = n((r) => r.situacao === "PENDENTE_INSTALACAO" && r.confirmada !== true);
    const kp = (r, v, d) => `<div class="kpi"><div class="r">${esc(r)}</div><div class="v">${v}</div><div class="d">${d || "&nbsp;"}</div></div>`;

    // ---- gráfico: agenda dos próximos dias por situação ----
    const dias = Array.from({ length: 10 }, (_, i) => soma(est.dia, i - 2));
    const por = {}; resumo.dias.forEach((r) => ((por[String(r.data_rota).slice(0, 10)] ||= {})[r.situacao] = r.n));
    const ordem = ["INSTALADO", "PENDENTE_INSTALACAO", "CLIENTE_AUSENTE", "CANCELADO"];
    const grafico = CH.empilhadas({
      cats: dias.map(rotDia), rotuloY: "Instalações agendadas", titulo: "Agenda por dia e situação",
      series: ordem.map((s) => ({ nome: SIT[s][0], cor: COR_SIT[s], valores: dias.map((d) => por[d]?.[s] || 0) })),
      irCat: (i) => ({ rota: dias[i] }),
    });

    const cont = {}; ativas.forEach((r) => (cont[r.turno || "sem turno"] = (cont[r.turno || "sem turno"] || 0) + 1));
    const porTurno = ativas.length ? CH.barrasH({ dados: Object.entries(cont).sort((a, b) => b[1] - a[1]).map(([rot, y]) => ({ rot, y })), rotuloX: "Instalações", titulo: "Instalações por turno", larguraRot: 130 }) : `<p class="legenda-vazia">Sem instalações na tela.</p>`;
    el.innerHTML = `<div class="cab"><div><div class="migalha">Operação</div><h1>Rota de instalação</h1></div>
        <div class="acoes"><button class="btn" id="add">Adicionar contrato à rota</button></div></div>
      ${resumo.atrasadas && est.modo !== "atrasadas" ? `<div class="aviso"><b>${nf.format(resumo.atrasadas)}</b> instalação(ões) de dias anteriores ainda sem resultado. <a href="#" id="vat">Ver e resolver</a></div>` : ""}
      <div class="filtros">
        <div class="dia-nav">${est.modo === "atrasadas" ? "" : `<button class="btn sec pq" id="ant" title="Dia anterior">‹</button><input type="date" id="dd" value="${est.dia}"><button class="btn sec pq" id="prx" title="Próximo dia">›</button><button class="btn sec pq" id="hj">Hoje</button>`}</div>
        <div class="seg" id="md"><button data-m="dia" class="${est.modo === "dia" ? "on" : ""}">Dia</button><button data-m="semana" class="${est.modo === "semana" ? "on" : ""}">7 dias</button><button data-m="atrasadas" class="${est.modo === "atrasadas" ? "on" : ""}">Atrasadas</button></div>
        <div class="campo" style="width:160px"><label>Situação</label><select id="fs" ${est.modo === "atrasadas" ? "disabled" : ""}><option value="">Todas</option>${Object.entries(SIT).map(([k, v]) => `<option value="${k}" ${est.sit === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select></div>
        <div class="campo" style="width:230px"><label>Buscar (cliente, contrato, bairro, vendedor)</label><input id="fb" value="${esc(est.busca)}"></div><button class="btn" id="ok">Filtrar</button></div>
      <div class="kpis">${kp("Na tela", nf.format(ativas.length), est.modo === "dia" ? rotDia(est.dia) : est.modo === "semana" ? `${rotDia(est.dia)} a ${rotDia(soma(est.dia, 6))}` : "dias anteriores")}
        ${kp("Confirmadas", nf.format(conf), ativas.length ? pct(conf / ativas.length, 0) + " do total" : "")}
        ${kp("Pendentes sem confirmação", nf.format(semConf), "ligar / WhatsApp")}
        ${kp("Instaladas", nf.format(inst), ativas.length ? pct(inst / ativas.length, 0) + " do total" : "")}
        ${kp("Pendentes", nf.format(pend), "aguardando resultado")}</div>
      ${est.modo === "atrasadas" ? "" : `<div class="grade g2">${painel("Agenda dos dias próximos", grafico, "Clique em uma coluna para abrir aquele dia. Clique na legenda para ocultar uma situação.", "2 dias antes e 7 depois")}${painel("Por turno", porTurno, "Instalações que estão na tela agora (sem as reagendadas).", "contratos")}</div>`}
      <div class="tab rota"><table><thead><tr><th>Cliente</th><th>Contrato</th><th>Endereço</th><th>Vendedor</th><th>Turno</th><th>Confirmou?</th><th>Situação</th><th>Observação</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>`;

    // ---- tabela agrupada por dia e turno ----
    const tb = el.querySelector("#tb");
    const grupos = new Map();
    linhas.forEach((r) => { const k = `${dia(r)}|${r.turno || "sem turno"}`; (grupos.get(k) || grupos.set(k, []).get(k)).push(r); });
    if (!linhas.length) tb.innerHTML = `<tr><td colspan="9" class="mut">Nenhuma instalação encontrada.</td></tr>`;
    const porId = new Map(linhas.map((r) => [r.agenda_id, r]));
    for (const [k, rs] of grupos) {
      const [d, t] = k.split("|");
      tb.insertAdjacentHTML("beforeend", `<tr class="grupo"><td colspan="9">${est.modo === "dia" ? "" : esc(rotDia(d)) + " · "}${esc(t)} <span class="mut">(${rs.length})</span></td></tr>`);
      rs.forEach((r) => {
        const w = fone(r.telefone);
        tb.insertAdjacentHTML("beforeend", `<tr data-id="${r.agenda_id}"><td><b>${esc(r.cliente)}</b><br><span class="mut">${esc(r.telefone || "sem telefone")}</span>${w ? ` <a href="https://wa.me/${w}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</td>
          <td><a href="#/venda/${r.contrato_id}">${esc(r.numero_contrato ?? "–")}</a></td>
          <td style="white-space:normal;min-width:170px">${esc(r.endereco || "")}<br><span class="mut">${esc([r.bairro, r.cidade].filter(Boolean).join(" · "))}</span></td>
          <td>${esc(r.vendedor)}<br><span class="mut">${esc(r.equipe || "")}</span></td>
          <td><select data-c="turno"><option value="">–</option>${turnos.map((x) => `<option ${x === r.turno ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></td>
          <td><div class="conf"><button data-c="conf" data-v="true" class="sim ${r.confirmada === true ? "on" : ""}">Sim</button><button data-c="conf" data-v="false" class="nao ${r.confirmada === false ? "on" : ""}">Não</button></div></td>
          <td><select data-c="situacao">${Object.entries(SIT).filter(([s]) => s !== "REAGENDADO" || r.situacao === "REAGENDADO").map(([s, v]) => `<option value="${s}" ${s === r.situacao ? "selected" : ""}>${v[0]}</option>`).join("")}</select></td>
          <td><input class="obs" data-c="obs" value="${esc(r.obs_agenda ?? "")}" maxlength="300" placeholder="ex.: TUDO OK"><span class="salvo" hidden>✓</span>${r.atualizada_por_nome ? `<br><span class="mut" title="${esc(String(r.atualizada_em).slice(0, 16).replace("T", " "))}">por ${esc(r.atualizada_por_nome)}</span>` : ""}</td>
          <td><button class="btn sec pq" data-c="re">Reagendar</button></td></tr>`);
      });
    }

    // ---- ações ----
    const recarregar = () => S.PAGES.rota(el).catch(S.erroEm(el));
    const salvar = async (tr, corpo) => {
      try { await api("/rota/" + tr.dataset.id, { method: "PATCH", body: corpo }); const s = tr.querySelector(".salvo"); s.hidden = false; setTimeout(() => (s.hidden = true), 1500); return true; }
      catch (e) { alert(e.message); recarregar(); return false; }
    };
    tb.addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-c]"); if (!b) return;
      const tr = b.closest("tr"), r = porId.get(+tr.dataset.id);
      if (b.dataset.c === "conf") {
        const v = b.dataset.v === "true", atual = r.confirmada;
        const novo = atual === v ? null : v;            // clicar de novo limpa
        if (await salvar(tr, { confirmada: novo })) { r.confirmada = novo; tr.querySelectorAll(".conf button").forEach((x) => x.classList.toggle("on", (x.dataset.v === "true") === novo && novo !== null)); }
      } else if (b.dataset.c === "re") reagendar(r, recarregar);
    });
    tb.addEventListener("change", (e) => {
      const c = e.target.dataset.c, tr = e.target.closest("tr"); if (!c || !tr) return;
      if (c === "turno") salvar(tr, { turno: e.target.value || null });
      else if (c === "situacao") salvar(tr, { situacao: e.target.value }).then((ok) => ok && (est.modo === "atrasadas" ? recarregar() : null));
      else if (c === "obs") salvar(tr, { obs_agenda: e.target.value });
    });
    const filtrar = () => { est.sit = el.querySelector("#fs").value; est.busca = el.querySelector("#fb").value.trim(); recarregar(); };
    el.querySelector("#ok").addEventListener("click", filtrar);
    el.querySelector("#fb").addEventListener("keydown", (e) => e.key === "Enter" && filtrar());
    el.querySelector("#fs").addEventListener("change", filtrar);
    el.querySelector("#md").addEventListener("click", (e) => { const m = e.target.dataset.m; if (m) { est.modo = m; recarregar(); } });
    el.querySelector("#ant")?.addEventListener("click", () => { est.dia = soma(est.dia, -1); recarregar(); });
    el.querySelector("#prx")?.addEventListener("click", () => { est.dia = soma(est.dia, 1); recarregar(); });
    el.querySelector("#hj")?.addEventListener("click", () => { est.dia = hoje(); recarregar(); });
    el.querySelector("#dd")?.addEventListener("change", (e) => { if (e.target.value) { est.dia = e.target.value; recarregar(); } });
    el.querySelector("#vat")?.addEventListener("click", (e) => { e.preventDefault(); est.modo = "atrasadas"; recarregar(); });
    el.querySelector("#add").addEventListener("click", () => adicionar(turnos, recarregar));
  };

  function reagendar(r, depois) {
    const cat = S.catalogos();
    cat.then((c) => {
      const m = modal("Reagendar instalação", `<p class="mut">${esc(r.cliente)} · contrato ${esc(r.numero_contrato ?? "")}<br>Hoje: ${dt(r.data_rota)} ${esc(r.turno || "")}</p><form id="f">
        <div class="campo" style="margin-bottom:10px"><label>Nova data</label><input name="d" type="date" required value="${soma(hoje(), 1)}"></div>
        <div class="campo"><label>Turno</label><select name="t"><option value="">–</option>${c.turnos.map((x) => `<option ${x.codigo === r.turno ? "selected" : ""}>${esc(x.codigo)}</option>`).join("")}</select></div>
        <div class="erro" id="e" style="margin-top:8px"></div></form>`, `<button class="btn sec" id="x">Cancelar</button><button class="btn" id="s">Reagendar</button>`);
      m.querySelector("#x").addEventListener("click", () => m.remove());
      m.querySelector("#s").addEventListener("click", async () => {
        const f = m.querySelector("#f"); if (!f.reportValidity()) return;
        try { await api("/rota/" + r.agenda_id, { method: "PATCH", body: { reagendar_para: f.d.value, turno: f.t.value || null } }); m.remove(); depois(); }
        catch (e) { m.querySelector("#e").textContent = e.message; }
      });
    });
  }

  function adicionar(turnos, depois) {
    const m = modal("Adicionar contrato à rota", `<form id="f"><div class="campo" style="margin-bottom:10px"><label>Nº do contrato</label><input name="n" inputmode="numeric" required autofocus></div>
      <div class="campo" style="margin-bottom:10px"><label>Data da instalação</label><input name="d" type="date" required value="${est.dia}"></div>
      <div class="campo"><label>Turno</label><select name="t"><option value="">–</option>${turnos.map((x) => `<option>${esc(x)}</option>`).join("")}</select></div>
      <div class="erro" id="e" style="margin-top:8px"></div></form>`, `<button class="btn sec" id="x">Cancelar</button><button class="btn" id="s">Adicionar</button>`);
    const f = m.querySelector("#f");
    f.n.addEventListener("input", () => (f.n.value = f.n.value.replace(/\D/g, "")));
    m.querySelector("#x").addEventListener("click", () => m.remove());
    m.querySelector("#s").addEventListener("click", async () => {
      if (!f.reportValidity()) return;
      try { await api("/rota", { method: "POST", body: { numero_contrato: f.n.value, data_rota: f.d.value, turno: f.t.value || null } }); est.dia = f.d.value; est.modo = "dia"; m.remove(); depois(); }
      catch (e) { m.querySelector("#e").textContent = e.message; }
    });
  }
})();
