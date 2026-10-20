"use strict";
/* CRM do vendedor: calendário (dia, semana e mês), cards de retorno e carteira de clientes.
   O vendedor cria e edita; gerente e administrador consultam (somente leitura). */
(() => {
  const { esc, api, modal } = S;
  const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const DSEM = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const TIPO = { TRATANDO: "Tratando", RETORNAR: "Retornar contato", PROPOSTA: "Enviar proposta" };
  const SITU = [["ATIVO", "Em acompanhamento"], ["CONVERTIDO", "Convertidos"], ["PERDIDO", "Perdidos"], ["ARQUIVADO", "Arquivados"]];
  const REP = [["", "Não repete"], ["7", "Semanal"], ["15", "A cada 15 dias"], ["30", "Mensal"]];
  const pad = (n) => String(n).padStart(2, "0");
  const chaveDia = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dia0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const segunda = (d) => addDias(dia0(d), -((d.getDay() + 6) % 7));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const dataBr = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const parseDia = (k) => { const [a, m, d] = k.split("-").map(Number); return new Date(a, m - 1, d); };

  if (!document.getElementById("crm-css-v2")) {
    const st = document.createElement("style");
    st.id = "crm-css-v2";
    st.textContent = `
      .t-TRATANDO{--c:var(--ambar)} .t-RETORNAR{--c:var(--brand)} .t-PROPOSTA{--c:var(--verde)}
      .cr-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between;margin-bottom:14px}
      .cr-nav{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .cr-nav h3{margin:0 0 0 8px;font-size:16px;font-weight:600;text-transform:none}
      .cr-nav .btn{min-width:34px}
      .cr-acoes{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .cr-seletor{margin-bottom:14px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center}
      .cr-seletor select{width:auto;min-width:200px}
      /* mês */
      .cr-mes-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid var(--borda);border-radius:4px;overflow:hidden;background:var(--borda);gap:1px}
      .cr-dsem{background:var(--z1);font-size:11.5px;color:var(--suave);text-align:center;padding:6px 0;font-weight:600;letter-spacing:.3px}
      .cr-celula{background:var(--painel);min-height:112px;padding:6px;display:flex;flex-direction:column;gap:4px;cursor:pointer;min-width:0}
      .cr-celula:hover{background:var(--hov)}
      .cr-celula.fora{background:var(--z1)}
      .cr-celula.fora .cr-num{color:var(--suave)}
      .cr-num{font-size:12.5px;font-weight:600;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%}
      .cr-celula.hoje .cr-num{background:var(--brand);color:#fff}
      .cr-pills{display:flex;flex-direction:column;gap:3px;min-width:0}
      .cr-pill{all:unset;box-sizing:border-box;cursor:pointer;font-size:11.5px;padding:2px 6px;border-radius:3px;background:color-mix(in srgb,var(--c) 16%,var(--painel));border-left:3px solid var(--c);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--texto)}
      .cr-pill:hover{background:color-mix(in srgb,var(--c) 28%,var(--painel))}
      .cr-mais{font-size:11px;color:var(--suave);padding-left:4px}
      .cr-pontos{display:none;gap:3px;margin-top:auto;flex-wrap:wrap}
      .cr-pontos i{width:7px;height:7px;border-radius:50%;background:var(--c)}
      /* semana */
      .cr-semana{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;align-items:start}
      .cr-dcol{background:var(--z1);border:1px solid var(--borda);border-radius:4px;padding:6px;min-height:320px;display:flex;flex-direction:column;gap:6px;min-width:0}
      .cr-dcol.hoje{border-color:var(--brand)}
      .cr-dhead{all:unset;cursor:pointer;display:flex;justify-content:space-between;align-items:baseline;padding:2px 4px 6px;border-bottom:1px solid var(--borda)}
      .cr-dhead span{font-size:11.5px;color:var(--suave);font-weight:600}
      .cr-dhead b{font-size:16px}
      .cr-dcol.hoje .cr-dhead b{color:var(--brand)}
      .cr-add-l{all:unset;cursor:pointer;font-size:12px;color:var(--suave);padding:4px;text-align:center;border:1px dashed var(--borda);border-radius:3px}
      .cr-add-l:hover{color:var(--brand);border-color:var(--brand)}
      .cr-vazio-s{font-size:11.5px;color:var(--suave);text-align:center;padding:10px 0}
      /* cards */
      .cr-card{background:var(--painel);border:1px solid var(--borda);border-left:4px solid var(--c);border-radius:4px;padding:8px 9px;cursor:pointer;min-width:0;box-shadow:0 1px 2px rgba(0,0,0,.04)}
      .cr-card:hover{box-shadow:0 3px 10px rgba(0,0,0,.08)}
      .cr-card-h{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:12px;color:var(--suave);font-variant-numeric:tabular-nums}
      .cr-card-h b{color:var(--texto)}
      .cr-nome{font-weight:600;font-size:13.5px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cr-tag{display:inline-block;margin-top:3px;font-size:11px;color:var(--c);font-weight:600}
      .cr-meta{font-size:11.5px;color:var(--suave);margin-top:3px}
      .cr-obs{font-size:12px;color:var(--suave);margin-top:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
      /* dia */
      .cr-dia{display:flex;flex-direction:column;gap:0;border:1px solid var(--borda);border-radius:4px;background:var(--painel);overflow:hidden}
      .cr-hr{display:grid;grid-template-columns:64px 1fr;border-top:1px solid var(--borda);min-height:56px}
      .cr-hr:first-child{border-top:0}
      .cr-h{font-size:12px;color:var(--suave);padding:8px 10px;font-variant-numeric:tabular-nums;border-right:1px solid var(--borda)}
      .cr-slot{padding:6px 8px;display:flex;flex-direction:column;gap:6px;position:relative;min-width:0}
      .cr-slot .cr-card{display:flex;gap:10px;align-items:flex-start}
      .cr-slot .cr-card .cr-card-h{flex-direction:column;align-items:flex-start;min-width:64px}
      .cr-livre{all:unset;cursor:pointer;color:var(--suave);font-size:12px;padding:6px 4px;border-radius:3px;opacity:.7}
      .cr-livre:hover{opacity:1;color:var(--brand);background:var(--hov)}
      .cr-outros-t{font-size:12px;color:var(--suave);padding:8px 10px;background:var(--z1);border-bottom:1px solid var(--borda)}
      /* clientes */
      .cr-cli-filtro{margin-bottom:12px;display:flex;flex-wrap:wrap;gap:8px}
      .cr-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
      .cr-cli{background:var(--painel);border:1px solid var(--borda);border-radius:4px;padding:12px;display:flex;flex-direction:column;gap:6px;min-width:0}
      .cr-cli .cr-nome{white-space:normal}
      .cr-cli-acoes{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:6px}
      .cr-cli-acoes .btn{font-size:12px}
      .cr-pilula{font-size:11px;padding:1px 8px;border-radius:10px;border:1px solid var(--borda);align-self:flex-start;color:var(--suave)}
      .cr-pilula.ATIVO{color:var(--verde);border-color:var(--verde)}
      .cr-pilula.PERDIDO{color:var(--verm);border-color:var(--verm)}
      .cr-pilula.CONVERTIDO{color:var(--brand);border-color:var(--brand)}
      /* formulário */
      .cr-form .campo{margin-bottom:12px}
      .cr-form .campo>label{display:block;font-size:12px;color:var(--suave);margin-bottom:4px}
      .cr-form .linha{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .cr-chips{display:flex;flex-wrap:wrap;gap:6px}
      .cr-chip{border:1px solid var(--in);background:var(--bco);border-radius:16px;padding:4px 11px;cursor:pointer;font-size:12.5px;color:var(--texto)}
      .cr-chip:hover{border-color:var(--brand)}
      .cr-chip.on{background:var(--brand-cl);border-color:var(--brand);color:var(--brand-esc);font-weight:600}
      .cr-chip.t-TRATANDO.on{background:color-mix(in srgb,var(--ambar) 20%,var(--painel));border-color:var(--ambar);color:var(--texto)}
      .cr-chip.t-PROPOSTA.on{background:color-mix(in srgb,var(--verde) 20%,var(--painel));border-color:var(--verde);color:var(--texto)}
      .cr-chip.t-RETORNAR.on{background:color-mix(in srgb,var(--brand) 16%,var(--painel));border-color:var(--brand);color:var(--texto)}
      .cr-rod{display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:6px;flex-wrap:wrap}
      .cr-rod .direita{display:flex;gap:8px;margin-left:auto}
      .cr-erro{color:var(--verm);font-size:12.5px;min-height:16px;margin-bottom:4px}
      .cr-ficha p{margin:4px 0}
      .cr-enc{font-size:12px;padding:3px 6px;width:auto}
      .cr-mais-opc{margin:4px 0 10px;border:1px dashed var(--borda);border-radius:4px;padding:8px 10px}
      .cr-mais-opc summary{cursor:pointer;color:var(--suave);font-size:12.5px}
      .cr-mais-opc .campo{margin-top:10px}
      @media (max-width:820px){
        .cr-semana{grid-template-columns:1fr}
        .cr-dcol{min-height:0}
        .cr-dhead{flex-direction:row}
      }
      @media (max-width:700px){
        .cr-mes-grid .cr-pills{display:none}
        .cr-pontos{display:flex}
        .cr-celula{min-height:58px;padding:4px;align-items:center}
        .cr-celula .cr-num{margin:0 auto}
        .cr-celula .cr-pontos{justify-content:center}
        .cr-form .linha{grid-template-columns:1fr}
        .cr-hr{grid-template-columns:52px 1fr}
      }
      @media (min-width:701px){ .cr-celula .cr-pontos{display:none} }
    `;
    document.head.appendChild(st);
  }

  S.PAGES.crm = async (el) => {
    const u = S.sessao.usuario;
    const leitura = u.perfil !== "vendedor" || !!S.sessao.vercomo; // gerente e modo "ver como" só consultam
    const hoje = new Date();
    const est = { modo: "mes", ref: dia0(hoje), aba: "cal", st: "ATIVO", vend: "", vendedores: new Map() };
    const ult = { eventos: [], clientes: [] };

    // período visível (grade do mês começa numa segunda e tem 6 semanas)
    const grade = () => {
      if (est.modo === "mes") { const ini = segunda(new Date(est.ref.getFullYear(), est.ref.getMonth(), 1)); return { ini, fim: addDias(ini, 42) }; }
      if (est.modo === "semana") { const ini = segunda(est.ref); return { ini, fim: addDias(ini, 7) }; }
      return { ini: dia0(est.ref), fim: addDias(est.ref, 1) };
    };

    // repetições: cada ocorrência dentro do período vira um item próprio
    const expandir = (lista, ini, fim) => {
      const a = ini.getTime(), b = fim.getTime(), out = [];
      lista.forEach((it) => {
        const t0 = new Date(it.data_hora).getTime();
        if (!it.repetir_dias) { if (t0 >= a && t0 < b) out.push({ ...it, t: t0 }); return; }
        const passo = it.repetir_dias * 864e5;
        let t = t0;
        if (t < a) t += Math.ceil((a - t) / passo) * passo;
        for (; t < b; t += passo) out.push({ ...it, t });
      });
      return out.sort((x, y) => x.t - y.t);
    };

    const carregar = async () => {
      const g = grade(), meses = [];
      const ultimo = new Date(g.fim.getTime() - 1);
      for (let c = new Date(g.ini.getFullYear(), g.ini.getMonth(), 1); c <= ultimo; c = new Date(c.getFullYear(), c.getMonth() + 1, 1)) meses.push([c.getFullYear(), c.getMonth() + 1]);
      const fv = est.vend ? `&vendedor=${est.vend}` : "";
      const respostas = await Promise.all(meses.map(([a, m]) => api(`/crm/mes?ano=${a}&mes=${m}${fv}&nocache=1`)));
      const mapa = new Map();
      respostas.forEach((r) => r.itens.forEach((it) => { mapa.set(it.id, it); est.vendedores.set(String(it.vendedor_id), it.vendedor_nome); }));
      return expandir([...mapa.values()], g.ini, g.fim);
    };

    const rotulo = () => {
      const r = est.ref;
      if (est.modo === "mes") return `${cap(MES[r.getMonth()])} de ${r.getFullYear()}`;
      if (est.modo === "semana") {
        const a = segunda(r), b = addDias(a, 6);
        return a.getMonth() === b.getMonth()
          ? `${a.getDate()} a ${b.getDate()} de ${MES[b.getMonth()]}`
          : `${a.getDate()} de ${MES[a.getMonth()]} a ${b.getDate()} de ${MES[b.getMonth()]}`;
      }
      return `${cap(DIAS[r.getDay()])}, ${r.getDate()} de ${MES[r.getMonth()]}`;
    };

    const navegar = (n) => {
      if (n === 0) { est.ref = dia0(hoje); return; }
      if (est.modo === "mes") est.ref = new Date(est.ref.getFullYear(), est.ref.getMonth() + n, 1);
      else if (est.modo === "semana") est.ref = addDias(est.ref, 7 * n);
      else est.ref = addDias(est.ref, n);
    };

    const card = (e, i) => `<article class="cr-card t-${e.tipo}" data-ev="${i}" tabindex="0">
        <div class="cr-card-h"><b>${hm(new Date(e.t))}</b>${e.repetir_dias ? `<span title="Repete">↻</span>` : ""}</div>
        <div class="cr-nome">${esc(e.nome)}</div>
        <div class="cr-tag">${esc(TIPO[e.tipo])}</div>
        ${e.observacao ? `<div class="cr-obs">${esc(e.observacao)}</div>` : ""}
        ${leitura ? `<div class="cr-meta">${esc(e.vendedor_nome)}</div>` : ""}
      </article>`;

    const visaoMes = (ev) => {
      const ini = segunda(new Date(est.ref.getFullYear(), est.ref.getMonth(), 1));
      const cabec = DSEM.map((s) => `<div class="cr-dsem">${s}</div>`).join("");
      let celulas = "";
      for (let i = 0; i < 42; i++) {
        const d = addDias(ini, i), k = chaveDia(d);
        const lista = ev.map((e, ix) => [e, ix]).filter(([e]) => chaveDia(new Date(e.t)) === k);
        celulas += `<div class="cr-celula${d.getMonth() !== est.ref.getMonth() ? " fora" : ""}${k === chaveDia(hoje) ? " hoje" : ""}" data-dia="${k}">
          <div class="cr-num">${d.getDate()}</div>
          <div class="cr-pills">${lista.slice(0, 3).map(([e, ix]) => `<button class="cr-pill t-${e.tipo}" data-ev="${ix}">${hm(new Date(e.t))} ${esc(e.nome)}</button>`).join("")}${lista.length > 3 ? `<span class="cr-mais">+${lista.length - 3} mais</span>` : ""}</div>
          <div class="cr-pontos">${lista.slice(0, 4).map(([e]) => `<i class="t-${e.tipo}"></i>`).join("")}</div>
        </div>`;
      }
      return `<div class="cr-mes-grid">${cabec}${celulas}</div>`;
    };

    const visaoSemana = (ev) => {
      const ini = segunda(est.ref);
      return `<div class="cr-semana">${Array.from({ length: 7 }, (_, i) => {
        const d = addDias(ini, i), k = chaveDia(d);
        const lista = ev.map((e, ix) => [e, ix]).filter(([e]) => chaveDia(new Date(e.t)) === k);
        return `<div class="cr-dcol${k === chaveDia(hoje) ? " hoje" : ""}">
          <button class="cr-dhead" data-dia="${k}"><span>${DSEM[i]}</span><b>${d.getDate()}</b></button>
          ${lista.map(([e, ix]) => card(e, ix)).join("") || `<div class="cr-vazio-s">Sem retornos</div>`}
          ${leitura ? "" : `<button class="cr-add-l" data-novo-dia="${k}">+ retorno</button>`}
        </div>`;
      }).join("")}</div>`;
    };

    const visaoDia = (ev) => {
      const linhas = [];
      for (let h = 7; h <= 21; h++) {
        const lista = ev.map((e, ix) => [e, ix]).filter(([e]) => new Date(e.t).getHours() === h);
        linhas.push(`<div class="cr-hr"><div class="cr-h">${pad(h)}:00</div><div class="cr-slot">
          ${lista.map(([e, ix]) => card(e, ix)).join("")}
          ${leitura ? "" : `<button class="cr-livre" data-novo-h="${h}">+ agendar</button>`}
        </div></div>`);
      }
      const fora = ev.map((e, ix) => [e, ix]).filter(([e]) => { const h = new Date(e.t).getHours(); return h < 7 || h > 21; });
      const foraHtml = fora.length ? `<div class="cr-outros-t">Fora do horário de 7h às 21h</div><div class="cr-slot" style="padding:8px">${fora.map(([e, ix]) => card(e, ix)).join("")}</div>` : "";
      return `<div class="cr-dia">${foraHtml}${linhas.join("")}</div>`;
    };

    const visaoClientes = async () => {
      const fv = est.vend ? `&vendedor=${est.vend}` : "";
      ult.clientes = (await api(`/crm/clientes?status=${est.st}${fv}&nocache=1`)).itens;
      const botoes = (c) => est.st === "ATIVO"
        ? `<button class="btn pq" data-acao="agendar" data-cid="${c.id}">Agendar retorno</button>
           <button class="btn sec pq" data-acao="editar" data-cid="${c.id}">Editar</button>
           <select class="cr-enc" data-encerrar="${c.id}" aria-label="Encerrar cliente"><option value="">Encerrar…</option><option value="CONVERTIDO">Convertido em cliente</option><option value="PERDIDO">Perdido</option><option value="ARQUIVADO">Arquivar</option></select>`
        : `<button class="btn sec pq" data-acao="ATIVO" data-cid="${c.id}">Reabrir</button>`;
      const lista = ult.clientes.length ? `<div class="cr-cards">${ult.clientes.map((c) => `<div class="cr-cli">
          <span class="cr-pilula ${c.status}">${esc(SITU.find(([v]) => v === c.status)?.[1] || c.status)}</span>
          <div class="cr-nome">${esc(c.nome)}</div>
          ${c.telefone ? `<div class="cr-meta">${esc(c.telefone)}</div>` : ""}
          ${c.observacao ? `<div class="cr-obs">${esc(c.observacao)}</div>` : ""}
          <div class="cr-meta">${c.proximo_retorno ? `Próximo retorno: ${dataBr(new Date(c.proximo_retorno))} às ${hm(new Date(c.proximo_retorno))}` : "Sem retorno agendado"}${leitura ? " · " + esc(c.vendedor_nome) : ""}</div>
          ${leitura ? "" : `<div class="cr-cli-acoes">${botoes(c)}</div>`}
        </div>`).join("")}</div>` : `<div class="cr-vazio-s" style="padding:30px">Nenhum cliente nesta lista.</div>`;
      return `<div class="cr-cli-filtro">${SITU.map(([v, l]) => `<button class="btn ${v === est.st ? "" : "sec"} pq" data-situ="${v}">${l}</button>`).join("")}</div>${lista}`;
    };

    // ----- formulários (modal) -----
    const grupo = (nome, ops, valor) => `<input type="hidden" name="${nome}" value="${esc(String(valor))}">
      <div class="cr-chips" data-grupo="${nome}">${ops.map(([v, l, c]) => `<button type="button" class="cr-chip ${c || ""}${String(v) === String(valor) ? " on" : ""}" data-v="${esc(String(v))}">${esc(l)}</button>`).join("")}</div>`;

    const abrir = (titulo, campos, enviar, extra) => {
      const d = modal(titulo, `<form class="cr-form">${campos}
        <div class="cr-erro"></div>
        <div class="cr-rod"><div>${extra || ""}</div><div class="direita"><button type="button" class="btn sec" data-fechar>Cancelar</button><button class="btn" type="submit">Salvar</button></div></div>
      </form>`);
      d.querySelectorAll(".cr-chips").forEach((g) => (g.onclick = (e) => {
        const b = e.target.closest("button"); if (!b) return;
        g.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        d.querySelector(`input[name="${g.dataset.grupo}"]`).value = b.dataset.v;
      }));
      d.querySelector("[data-fechar]").onclick = () => d.remove();
      d.querySelector("form").onsubmit = async (e) => {
        e.preventDefault();
        const bt = d.querySelector("button[type=submit]"); bt.disabled = true;
        try { await enviar(Object.fromEntries(new FormData(e.target)), d); d.remove(); desenhar(); }
        catch (er) { d.querySelector(".cr-erro").textContent = er.message; bt.disabled = false; }
      };
      return d;
    };

    const formRetorno = async (r, cliente, pre = {}) => {
      const hojeK = chaveDia(hoje);
      const dt = r ? new Date(r.data_hora) : null;
      const dataV = r ? chaveDia(dt) : (pre.dia || (chaveDia(est.ref) >= hojeK ? chaveDia(est.ref) : hojeK));
      const horaV = r ? hm(dt) : (pre.hora || "09:00");
      let escolha = "";
      if (!r) {
        const ativos = (await api("/crm/clientes?status=ATIVO&nocache=1")).itens;
        escolha = `<div class="campo"><label>Cliente</label><select name="cliente_id" required>${ativos.length
          ? ativos.map((c) => `<option value="${c.id}"${cliente && String(cliente.id) === String(c.id) ? " selected" : ""}>${esc(c.nome)}</option>`).join("")
          : `<option value="">Nenhum cliente em acompanhamento</option>`}</select></div>`;
      } else escolha = `<div class="campo"><label>Cliente</label><div><b>${esc(r.nome)}</b></div></div>`;
      const avancado = `<div class="campo"><label>O que é</label>${grupo("tipo", Object.entries(TIPO).map(([v, l]) => [v, l, "t-" + v]), r?.tipo || "RETORNAR")}</div>
        <div class="campo"><label>Avisar no celular</label>${grupo("aviso_minutos", Array.from({ length: 10 }, (_, i) => [String(i + 1), i === 0 ? "1 min antes" : `${i + 1} min antes`]), String(r?.aviso_minutos ?? 5))}</div>
        <div class="campo"><label>Repetir</label>${grupo("repetir", REP, r?.repetir_dias != null ? String(r.repetir_dias) : "")}</div>`;
      const campos = `${escolha}
        <div class="linha">
          <div class="campo"><label>Data</label><input type="date" name="data" required value="${dataV}"></div>
          <div class="campo"><label>Hora</label><input type="time" name="hora" required value="${horaV}"></div>
        </div>
        <div class="campo"><label>Observação</label><textarea name="observacao" maxlength="1000" rows="3">${esc(r?.observacao || "")}</textarea></div>
        <details class="cr-mais-opc"><summary>Mais opções (tipo, aviso, repetir)</summary>${avancado}</details>`;
      const extra = r ? `<button type="button" class="btn ruim" data-excluir>Excluir</button>` : "";
      const d = abrir(r ? "Editar retorno" : "Novo retorno", campos, async (f) => {
        if (!r && !f.cliente_id) throw new Error("Escolha o cliente.");
        const dh = new Date(`${f.data}T${f.hora}:00`);
        if (isNaN(dh)) throw new Error("Informe a data e a hora.");
        const body = { tipo: f.tipo, data_hora: dh.toISOString(), aviso_minutos: +f.aviso_minutos, repetir_dias: f.repetir || null, observacao: f.observacao };
        if (r) await api(`/crm/retornos/${r.id}`, { method: "PUT", body });
        else await api("/crm/retornos", { method: "POST", body: { ...body, cliente_id: +f.cliente_id } });
      }, extra);
      d.querySelector("[data-excluir]")?.addEventListener("click", async () => {
        if (!confirm("Excluir este retorno? Se ele se repete, a série inteira é removida.")) return;
        await api(`/crm/retornos/${r.id}`, { method: "DELETE" }); d.remove(); desenhar();
      });
    };

    const formCliente = (c) => abrir(c ? "Editar cliente" : "Novo cliente", `
        <div class="campo"><label>Nome</label><input name="nome" required maxlength="150" value="${esc(c?.nome || "")}"></div>
        <div class="campo"><label>Telefone</label><input name="telefone" maxlength="40" value="${esc(c?.telefone || "")}"></div>
        <div class="campo"><label>Observação</label><textarea name="observacao" maxlength="1000" rows="3">${esc(c?.observacao || "")}</textarea></div>`,
      async (f) => {
        const body = { nome: f.nome, telefone: f.telefone, observacao: f.observacao };
        if (c) await api(`/crm/clientes/${c.id}`, { method: "PATCH", body });
        else await api("/crm/clientes", { method: "POST", body });
      });

    const detalhe = (e) => modal(e.nome, `<div class="cr-ficha">
        <p><span class="cr-tag">${esc(TIPO[e.tipo])}</span></p>
        <p>${dataBr(new Date(e.t))} às ${hm(new Date(e.t))}</p>
        <p class="cr-meta">Vendedor: ${esc(e.vendedor_nome)}</p>
        <p class="cr-meta">Aviso ${e.aviso_minutos} min antes${e.repetir_dias ? ` · repete a cada ${e.repetir_dias} dias` : ""}</p>
        ${e.telefone ? `<p>${esc(e.telefone)}</p>` : ""}
        ${e.observacao ? `<p>${esc(e.observacao)}</p>` : ""}
      </div>`);

    const evento = (e) => {
      if (leitura) return detalhe(e);
      return formRetorno({ ...e, data_hora: new Date(e.t).toISOString() });
    };

    const mudarSituacao = async (id, v) => {
      const avisos = { PERDIDO: "Marcar como perdido? Os retornos deste cliente deixam de avisar.", ARQUIVADO: "Arquivar este cliente? Os retornos deixam de avisar. Ele fica guardado por 12 meses.", CONVERTIDO: "Marcar como convertido em cliente? Os retornos deixam de avisar." };
      if (avisos[v] && !confirm(avisos[v])) return;
      await api(`/crm/clientes/${id}`, { method: "PATCH", body: { status: v } });
      desenhar();
    };

    const desenhar = async () => {
      let corpo;
      if (est.aba === "cal") {
        ult.eventos = await carregar();
        const ev = ult.eventos;
        corpo = `<div class="cr-top">
            <div class="cr-nav">
              <button class="btn sec" data-nav="-1" aria-label="Anterior">‹</button>
              <button class="btn sec" data-nav="0">Hoje</button>
              <button class="btn sec" data-nav="1" aria-label="Próximo">›</button>
              <h3>${rotulo()}</h3>
            </div>
            <div class="seg">${[["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]].map(([v, l]) => `<button data-modo="${v}" class="${est.modo === v ? "on" : ""}">${l}</button>`).join("")}</div>
          </div>
          ${est.modo === "mes" ? visaoMes(ev) : est.modo === "semana" ? visaoSemana(ev) : visaoDia(ev)}`;
      } else {
        corpo = await visaoClientes();
      }
      const vendedores = [...est.vendedores.entries()];
      el.innerHTML = `
        <div class="cab">
          <div><div class="migalha">${u.perfil === "vendedor" ? "Minha área" : "Acompanhamento"}</div><h1>CRM</h1>
          <p>${leitura ? "Visualização somente leitura." : "Agende retornos e receba o aviso no celular antes do horário."}</p></div>
          ${leitura ? "" : `<div class="cr-acoes"><button class="btn" id="nr">+ Novo retorno</button><button class="btn sec" id="nc">+ Novo cliente</button></div>`}
        </div>
        <div class="cr-seletor">
          <div class="abas" style="margin:0;border:0">
            <button data-aba="cal" class="${est.aba === "cal" ? "on" : ""}">Calendário</button>
            <button data-aba="cli" class="${est.aba === "cli" ? "on" : ""}">Clientes</button>
          </div>
          ${leitura && vendedores.length ? `<select id="fv"><option value="">Todos os vendedores</option>${vendedores.map(([id, nome]) => `<option value="${id}"${est.vend === id ? " selected" : ""}>${esc(nome)}</option>`).join("")}</select>` : ""}
        </div>
        <section class="painel"><div class="corpo">${corpo}</div></section>`;
    };

    // um único ouvinte para toda a tela (os elementos são redesenhados)
    el.onclick = async (e) => {
      const q = (s) => e.target.closest(s);
      let b;
      if ((b = q("[data-aba]"))) { est.aba = b.dataset.aba; return desenhar(); }
      if ((b = q("[data-modo]"))) { est.modo = b.dataset.modo; return desenhar(); }
      if ((b = q("[data-nav]"))) { navegar(+b.dataset.nav); return desenhar(); }
      if ((b = q("[data-situ]"))) { est.st = b.dataset.situ; return desenhar(); }
      if ((b = q("[data-ev]"))) return evento(ult.eventos[+b.dataset.ev]);
      if ((b = q("[data-dia]"))) { est.ref = parseDia(b.dataset.dia); est.modo = "dia"; return desenhar(); }
      if ((b = q("[data-novo-dia]"))) return formRetorno(null, null, { dia: b.dataset.novoDia, hora: "09:00" });
      if ((b = q("[data-novo-h]"))) return formRetorno(null, null, { dia: chaveDia(est.ref), hora: `${pad(b.dataset.novoH)}:00` });
      if ((b = q("[data-acao]"))) {
        const c = ult.clientes.find((x) => String(x.id) === b.dataset.cid), v = b.dataset.acao;
        if (v === "agendar") return formRetorno(null, c);
        if (v === "editar") return formCliente(c);
        return mudarSituacao(c.id, v);
      }
      if (q("#nr")) return formRetorno(null, null);
      if (q("#nc")) return formCliente(null);
    };
    el.onchange = (e) => {
      if (e.target.id === "fv") { est.vend = e.target.value; desenhar(); }
      if (e.target.dataset.encerrar && e.target.value) mudarSituacao(e.target.dataset.encerrar, e.target.value);
    };

    await desenhar();
  };
})();
