"use strict";
/* Administração → Feriados e dias úteis. A previsão de vendas usa a escala 6x1 (segunda a sábado) menos os feriados
   nacionais (calculados pelo sistema, inclusive Sexta-feira Santa), estaduais e municipais da cidade de cada equipe. */
(() => {
  const { esc, api, painel, tabela } = S;
  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const SEM = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const ABR = { NACIONAL: "Nacional", ESTADUAL: "Estadual", MUNICIPAL: "Municipal" };
  const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

  S.PAGES.feriados = async (el) => {
    const est = { ano: new Date().getFullYear(), cidade: "" };
    const desenhar = async () => {
      const j = await api(`/feriados?ano=${est.ano}&cidade_id=${est.cidade}`);
      const dow = (d) => SEM[new Date(d + "T12:00:00Z").getUTCDay()];
      const tot = Math.round(j.meses.reduce((s, m) => s + m.dias_uteis, 0) * 2) / 2;
      el.innerHTML = `<div class="cab"><div><div class="migalha">Administração</div><h1>Feriados e dias úteis</h1><p>A previsão usa a escala 6x1: segunda a sexta valem 1 dia útil, sábado vale 0,5 e domingo não conta. Os feriados da cidade de cada equipe são descontados.</p></div></div>
        <div class="filtros"><div class="campo"><label>Ano</label><select id="an">${[est.ano - 1, est.ano, est.ano + 1].filter((v, i, a) => a.indexOf(v) === i).map((a) => `<option ${a === j.ano ? "selected" : ""}>${a}</option>`).join("")}</select></div>
          <div class="campo" style="min-width:260px"><label>Calendário da cidade</label><select id="cd"><option value="">Só feriados nacionais</option>${j.cidades.map((c) => `<option value="${c.id}" ${String(c.id) === String(est.cidade) ? "selected" : ""}>${esc(c.nome)} (${esc(c.uf)})</option>`).join("")}</select></div></div>
        <div class="grade g2">${painel(`Dias úteis por mês · ${j.regiao ? `${j.regiao.nome} (${j.regiao.uf})` : "nacional"}`, CH.colunas({ titulo: "Dias úteis por mês", rotuloY: "Dias úteis", dados: j.meses.map((m, i) => ({ x: MESES[i], y: m.dias_uteis, cor: i === new Date().getMonth() && j.ano === new Date().getFullYear() ? CH.COR.base : CH.COR.claro })) }), `${S.du(tot)} dias úteis no ano (sábado vale meio dia). Mês atual em destaque.`, "escala 6x1")}
        ${painel(`Feriados em ${j.ano}`, tabela([{ t: "Data", f: (f) => `<b>${f.data.split("-").reverse().join("/")}</b>` }, { t: "Dia", f: (f) => dow(f.data) }, { t: "Feriado", f: (f) => esc(f.nome) }, { t: "Abrangência", f: (f) => `<span class="chip ${f.abrangencia === "NACIONAL" ? "azul" : f.abrangencia === "ESTADUAL" ? "alerta" : "ok"}">${ABR[f.abrangencia]}</span>` }, { t: "Conta como folga", f: (f) => (f.considera ? "Sim" : `<span class="mut">Não (ponto facultativo)</span>`) }], j.calendario), "Domingo já é folga na escala 6x1: feriado no domingo não muda a conta.", `${j.calendario.filter((f) => f.considera).length} dias`)}</div>
        ${painel("Feriados estaduais e municipais cadastrados", tabela([{ t: "Feriado", f: (r) => `<b>${esc(r.nome)}</b>` }, { t: "Quando", f: (r) => (r.recorrente ? `${String(r.dia).padStart(2, "0")}/${String(r.mes).padStart(2, "0")} (todo ano)` : String(r.data).split("-").reverse().join("/")) }, { t: "Onde", f: (r) => (r.abrangencia === "MUNICIPAL" ? esc(`${r.cidade || "?"} (${r.uf || ""})`) : r.abrangencia === "ESTADUAL" ? esc(r.uf) : "Brasil") }, { t: "Abrangência", f: (r) => ABR[r.abrangencia] },
          { t: "Conta como folga", f: (r) => `<label class="chk"><input type="checkbox" data-c="${r.id}" ${r.considera ? "checked" : ""}> ${r.considera ? "Sim" : "Não"}</label>` }, { t: "", f: (r) => `<button class="btn sec pq" data-x="${r.id}">Excluir</button>` }], j.regras), "Desmarque “conta como folga” para pontos facultativos em que a equipe trabalha (ex.: Carnaval). Os feriados nacionais são calculados pelo sistema e não precisam ser cadastrados.", `${j.regras.length} regras`)}
        ${painel("Cadastrar feriado", `<form id="nf" class="form-fer">
          <div class="campo" style="grid-column:span 2"><label>Nome</label><input name="nome" required maxlength="120" placeholder="ex.: Aniversário da cidade"></div>
          <div class="campo"><label>Abrangência</label><select name="abrangencia" id="ab"><option value="MUNICIPAL">Municipal</option><option value="ESTADUAL">Estadual</option><option value="NACIONAL">Nacional (extra)</option></select></div>
          <div class="campo" id="cUf" hidden><label>UF</label><select name="uf">${UFS.map((u) => `<option>${u}</option>`).join("")}</select></div>
          <div class="campo" id="cCid"><label>Cidade</label><select name="cidade_id">${j.cidades.map((c) => `<option value="${c.id}">${esc(c.nome)} (${esc(c.uf)})</option>`).join("")}</select></div>
          <div class="campo"><label>Repete</label><select name="recorrente" id="rc"><option value="1">Todo ano (dia e mês)</option><option value="0">Só uma vez (data)</option></select></div>
          <div class="campo" id="cDm"><label>Dia / mês</label><div style="display:flex;gap:6px"><input name="dia" type="number" min="1" max="31" placeholder="dia" style="width:80px"><select name="mes">${MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}</select></div></div>
          <div class="campo" id="cDt" hidden><label>Data</label><input name="data" type="date"></div>
          <div class="campo"><label>Tipo</label><select name="considera"><option value="1">Feriado (folga)</option><option value="0">Ponto facultativo (trabalha)</option></select></div>
          <div style="grid-column:1/-1;display:flex;gap:10px;align-items:center;justify-content:flex-end"><span id="nm" class="mut"></span><button class="btn">Cadastrar</button></div></form>`, "", "novo")}`;
      const q = (s) => el.querySelector(s);
      q("#an").onchange = (e) => { est.ano = +e.target.value; desenhar(); };
      q("#cd").onchange = (e) => { est.cidade = e.target.value; desenhar(); };
      const ab = () => { const v = q("#ab").value; q("#cUf").hidden = v !== "ESTADUAL"; q("#cCid").hidden = v !== "MUNICIPAL"; };
      const rc = () => { const v = q("#rc").value === "1"; q("#cDm").hidden = !v; q("#cDt").hidden = v; };
      q("#ab").onchange = ab; q("#rc").onchange = rc; ab(); rc();
      el.querySelectorAll("[data-c]").forEach((c) => (c.onchange = async () => { await api("/feriados/" + c.dataset.c, { method: "PATCH", body: { considera: c.checked } }); desenhar(); }));
      el.querySelectorAll("[data-x]").forEach((b) => (b.onclick = async () => { if (!confirm("Excluir este feriado? A previsão passa a contar esse dia como útil.")) return; await api("/feriados/" + b.dataset.x, { method: "DELETE" }); desenhar(); }));
      q("#nf").onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target)), rec = f.recorrente === "1";
        try {
          await api("/feriados", { method: "POST", body: { nome: f.nome, abrangencia: f.abrangencia, uf: f.uf, cidade_id: +f.cidade_id || null, recorrente: rec, dia: rec ? +f.dia : null, mes: rec ? +f.mes : null, data: rec ? null : f.data, considera: f.considera === "1" } });
          desenhar();
        } catch (er) { q("#nm").textContent = er.message; q("#nm").className = "erro"; }
      };
    };
    await desenhar();
  };
})();
