"use strict";
/* Operação → Confirmação D+1 / D+15 (backoffice de Cadastro e gerente)
   D+1: um dia depois da venda, confirmar com o cliente (dados, plano, valor e agendamento).
   D+15: quinze dias depois da venda, pós-venda (instalação feita, satisfação, primeira fatura).
   As duas listas ficam lado a lado; o que não foi concluído nos dias anteriores aparece em "Ficaram para trás". */
(() => {
  const { esc, api, brl } = S;
  const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const somaDias = (d, n) => new Date(new Date(d + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
  const br = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "–");
  const SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const sem = (d) => SEM[new Date(d + "T12:00:00Z").getUTCDay()];
  const hora = (d) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const RES = { CONFIRMADO: ["Confirmado", "ok"], NAO_ATENDEU: ["Não atendeu", "alerta"], PROBLEMA: ["Problema", "ruim"] };
  const fone = (t) => String(t || "").replace(/\D/g, "");
  const wa = (t) => { const d = fone(t); return d.length >= 10 ? `https://wa.me/55${d.replace(/^55(?=\d{10,11}$)/, "")}` : null; };
  const INFO = {
    D1: { titulo: "D+1", sub: "Confirmação da venda", dica: "Confirme com o cliente os dados, o plano, o valor e o agendamento da instalação." },
    D15: { titulo: "D+15", sub: "Pós-venda", dica: "Pergunte se a instalação foi feita, se está tudo funcionando e lembre da primeira fatura (e do débito em conta)." },
  };
  const est = { dia: null, so: { D1: true, D15: true } };

  function cartao(x, etapa) {
    const r = RES[x.resultado], z = wa(x.contato);
    return `<article class="cf-card ${x.resultado ? "r-" + x.resultado : ""}" data-id="${x.id}" data-etapa="${etapa}">
      <header><div><a href="#/venda/${x.id}" class="cf-cli">${esc(x.cliente)}</a><div class="mut">${esc(x.numero_contrato ? "contrato " + x.numero_contrato : "sem nº de contrato")} · venda ${br(x.data_venda)}</div></div>
        ${r ? `<span class="vb-pill ${r[1]}">${r[0]}${x.tentativas > 1 ? ` · ${x.tentativas}ª` : ""}</span>` : `<span class="vb-pill">A ligar</span>`}</header>
      <div class="cf-tel">${x.contato ? `<a href="tel:${fone(x.contato)}">${esc(x.contato)}</a>${z ? `<a class="cf-wa" href="${z}" target="_blank" rel="noopener">WhatsApp</a>` : ""}` : `<span class="mut">sem telefone</span>`}${x.contato_2 ? ` <a href="tel:${fone(x.contato_2)}" class="mut">${esc(x.contato_2)}</a>` : ""}</div>
      <dl><div><dt>Vendedor</dt><dd>${esc(x.vendedor)}${x.equipe ? ` <span class="mut">· ${esc(x.equipe)}</span>` : ""}</dd></div>
        <div><dt>Produtos</dt><dd>${esc(x.produtos || "–")}${x.pacote_valor ? ` · <b>${brl(x.pacote_valor)}</b>` : ""}${x.forma_pagamento === "DCC" ? ` <span class="tag">DCC</span>` : ""}</dd></div>
        <div><dt>${etapa === "D1" ? "Instalação" : "Situação"}</dt><dd>${etapa === "D1" ? (x.data_agendamento ? `${br(x.data_agendamento)}${x.turno ? " · " + esc(x.turno) : ""}` : `<span class="mut">sem agendamento</span>`) : `${esc(x.status_venda)}${x.status_contrato ? " · " + esc(x.status_contrato) : ""}`}</dd></div></dl>
      ${x.resultado ? `<div class="cf-ult">${x.observacao ? `“${esc(x.observacao)}” ` : ""}<small>${esc(x.feito_por || "")} · ${hora(x.feito_em)}</small></div>` : ""}
      ${S.sessao.vercomo ? "" : `<div class="cf-acoes"><input class="cf-obs" maxlength="1000" placeholder="Observação (obrigatória em Problema)">
        <div class="cf-bts"><button class="btn pq vb-ok" data-r="CONFIRMADO">✓ Confirmado</button><button class="btn sec pq" data-r="NAO_ATENDEU">Não atendeu</button><button class="btn sec pq cf-prob" data-r="PROBLEMA">Problema</button></div></div>`}
    </article>`;
  }
  function coluna(b, etapa) {
    const i = INFO[etapa], c = b.cont, so = est.so[etapa];
    const lista = so ? b.itens.filter((x) => x.resultado !== "CONFIRMADO" && x.resultado !== "PROBLEMA") : b.itens;
    const feitas = c.confirmadas + c.problema, pct = c.total ? Math.round(feitas / c.total * 100) : 0;
    return `<section class="cf-col">
      <header class="cf-cab"><div class="cf-tag">${i.titulo}</div><div><h2>${i.sub}</h2><div class="mut">vendas de ${sem(b.dia_venda)} ${br(b.dia_venda)}</div></div>
        <div class="cf-prog"><b>${feitas}<small>/${c.total}</small></b><div class="fx-bar"><i class="c" style="width:${pct}%"></i></div></div></header>
      <div class="cf-dica">${esc(i.dica)}</div>
      <div class="cf-cont"><span class="ok">${c.confirmadas} confirmadas</span><span class="alerta">${c.nao_atendeu} não atenderam</span><span class="ruim">${c.problema} com problema</span><span>${c.falta} a concluir</span></div>
      <label class="fx-sw cf-so"><input type="checkbox" data-so="${etapa}" ${so ? "checked" : ""}><i></i>Só o que falta concluir</label>
      <div class="cf-lista">${lista.length ? lista.map((x) => cartao(x, etapa)).join("") : `<p class="legenda-vazia">${c.total ? "Tudo concluído nesta lista." : "Nenhuma venda neste dia."}</p>`}</div>
      ${b.atrasadas.length ? `<details class="cf-atr"><summary>Ficaram para trás <b>${b.atrasadas.length}</b> <span class="mut">(vendas dos 7 dias anteriores sem confirmação)</span></summary><div class="cf-lista">${b.atrasadas.map((x) => cartao(x, etapa)).join("")}</div></details>` : ""}
    </section>`;
  }

  S.PAGES.confirmacao = async (el) => {
    est.dia ||= hoje();
    const j = await api("/confirmacao?dia=" + est.dia);
    el.innerHTML = `<div class="cab"><div><div class="migalha">Operação</div><h1>Confirmação D+1 / D+15</h1><div class="mut" style="margin-top:3px">Dias contados da data da venda. Cada ligação fica registrada; vale o último resultado.</div></div></div>
      <div class="filtros"><div class="campo" style="width:auto"><label>Dia das ligações</label><div class="dia-nav"><button class="btn sec pq" id="ant" aria-label="Dia anterior">‹</button><input type="date" id="dd" value="${est.dia}" max="${hoje()}"><button class="btn sec pq" id="prx" aria-label="Próximo dia" ${est.dia >= hoje() ? "disabled" : ""}>›</button><button class="btn sec pq" id="hj" ${est.dia === hoje() ? "disabled" : ""}>Hoje</button></div></div></div>
      <div class="cf-grade">${coluna(j.d1, "D1")}${coluna(j.d15, "D15")}</div>`;
    const go = () => S.PAGES.confirmacao(el).catch(S.erroEm(el));
    const muda = (d) => { est.dia = d; go(); };
    el.querySelector("#dd").addEventListener("change", (e) => e.target.value && muda(e.target.value));
    el.querySelector("#ant").addEventListener("click", () => muda(somaDias(est.dia, -1)));
    el.querySelector("#prx").addEventListener("click", () => muda(somaDias(est.dia, 1)));
    el.querySelector("#hj").addEventListener("click", () => muda(hoje()));
    el.querySelectorAll("[data-so]").forEach((c) => c.addEventListener("change", () => { est.so[c.dataset.so] = c.checked; go(); }));
    el.querySelectorAll(".cf-card [data-r]").forEach((b) => b.addEventListener("click", async () => {
      const card = b.closest(".cf-card"), obs = card.querySelector(".cf-obs");
      if (b.dataset.r === "PROBLEMA" && !obs.value.trim()) { obs.focus(); obs.classList.add("faltando"); obs.placeholder = "Descreva o problema antes de salvar"; return; }
      card.querySelectorAll("button").forEach((x) => (x.disabled = true));
      try { await api("/confirmacao", { method: "POST", body: { contrato_id: +card.dataset.id, etapa: card.dataset.etapa, resultado: b.dataset.r, observacao: obs.value.trim() } }); go(); }
      catch (e) { alert(e.message); card.querySelectorAll("button").forEach((x) => (x.disabled = false)); }
    }));
  };
})();
