"use strict";
/* Financeiro: Extrato da operadora — envio do CSV (sem duplicar), resumo dos pagamentos e conferência com as vendas.
   Somente Gerente e Administrador. */
(() => {
  const { esc, nf, api, painel, tabela, brl } = S;
  const kpi = S.kpi;
  const est = { aba: "enviar", per: "", det: { mes: "", quinzena: "", tipo: "", pendencia: "", valido: "", busca: "", pagina: 1 }, conf: "sem" };
  const ABAS = [["enviar", "1. Enviar extrato"], ["resumo", "2. Resumo dos pagamentos"], ["conferencia", "3. Conferência com as vendas"], ["linhas", "Linhas do extrato"], ["historico", "Histórico de envios"]];
  const perRot = (mes, q) => `${mes.slice(4, 6)}/${mes.slice(0, 4)} ${q}`;
  const quando = (s) => (s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–");
  const mil = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : brl(v));
  const dinheiro = (v) => `<span class="${v < 0 ? "neg" : ""}">${brl(v)}</span>`;
  const enviados = [];   // prévias desta tela (arquivos escolhidos)

  S.PAGES.extrato = async (el) => {
    if (S.sessao.usuario.perfil !== "gestor") { el.innerHTML = `<div class="aviso erro">O Extrato da operadora é exclusivo do Gerente e do Administrador.</div>`; return; }
    el.innerHTML = `<div class="cab"><div><div class="migalha">Financeiro</div><h1>Extrato da operadora</h1></div><div class="acoes"><button class="btn sec" id="xt">Extrair para Excel</button></div></div>
      <div class="abas" id="ab">${ABAS.map(([k, n]) => `<button data-a="${k}" class="${est.aba === k ? "on" : ""}">${n}</button>`).join("")}</div><div id="cx"></div>`;
    el.querySelector("#ab").addEventListener("click", (e) => { const a = e.target.dataset.a; if (a) { est.aba = a; S.PAGES.extrato(el).catch(S.erroEm(el)); } });
    const cx = el.querySelector("#cx");
    el.querySelector("#xt").addEventListener("click", () => extrair().catch((e) => alert(e.message)));
    await ({ enviar, resumo, conferencia, linhas, historico })[est.aba](cx, el);
  };
  const recarregar = (el) => S.PAGES.extrato(el).catch(S.erroEm(el));

  /* ---------- Extrair para Excel: linhas do extrato, resumo por quinzena e conferência com as vendas ---------- */
  async function extrair() {
    const r = await api("/extrato/resumo");
    if (!r.per.length) { alert("Ainda não há extrato enviado."); return; }
    const m = S.modal("Extrair extrato para Excel", `<form id="f"><div class="campo" style="margin-bottom:10px"><label>Período</label><select name="per"><option value="">Todos os períodos enviados</option>${[...r.per].reverse().map((p) => `<option value="${p.mes}${p.quinzena}">${esc(p.periodo)}</option>`).join("")}</select></div>
      <div class="mut" style="margin-bottom:6px">O arquivo terá estas abas:</div>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="lin" checked style="width:auto"> Linhas do extrato (com a venda do sistema ligada)</label>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="res" checked style="width:auto"> Resumo por quinzena</label>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="con" checked style="width:auto"> Conferência com as vendas</label>
      <div class="mut" id="st" style="margin-top:8px"></div></form>`, `<button class="btn sec" id="x">Cancelar</button><button class="btn" id="ok">Gerar Excel</button>`);
    m.querySelector("#x").addEventListener("click", () => m.remove());
    m.querySelector("#ok").addEventListener("click", async () => {
      const f = m.querySelector("#f"), per = f.per.value, st = m.querySelector("#st"), b = m.querySelector("#ok");
      b.disabled = true; st.textContent = "Preparando…";
      try {
        const folhas = [], H = (l) => l.map((v) => ({ v, s: "h" })), D = (d) => (d ? d.split("-").reverse().join("/") : "");
        const N = (v, f = "_brl") => (v == null || v === "" ? { v: "" } : { v: Number(v), s: (Number(v) < 0 ? "ruim" : "") + f });
        const perTxt = per ? perRot(per.slice(0, 6), per.slice(6)) : "todos os períodos";
        if (f.lin.checked) {
          const q = per ? `?mes=${per.slice(0, 6)}&quinzena=${per.slice(6)}` : "";
          const ls = await api("/extrato/exportar" + q);
          folhas.push({ nome: "Linhas do extrato", larguras: [9, 7, 11, 22, 18, 26, 7, 12, 26, 8, 11, 16, 13, 14, 14, 22, 13, 30, 22, 22, 26],
            congelar: { linha: 1 }, filtro: `A1:U${ls.length + 1}`,
            linhas: [H(["Mês ref.", "Quinz.", "Ativação", "Tipo", "Arquivo", "Plano", "Pago", "Valor", "Pendência", "Cód. irreg.", "Estorno em", "Contrato (EBT)", "Contrato", "NTC", "Venda no sistema", "Situação da venda", "Data da venda", "Cliente", "Vendedor", "Equipe", "Arquivo enviado"]),
              ...ls.map((x) => [x.mes_referencia, x.quinzena, D(x.data_ativacao), x.tipo_operacao, x.arquivo, x.plano, x.valido ? "Sim" : "Não", N(x.valor), x.pendencia, x.cod_irreg ?? "", D(x.data_estorno), x.contrato_ebt, x.contrato_num, x.ntc,
                x.numero_contrato || "não encontrada", x.status_venda || "", D(x.data_venda), x.cliente || "", x.vendedor || "", x.equipe || "", x.arquivo_nome])] });
        }
        if (f.res.checked) {
          const ps = per ? r.per.filter((p) => p.mes + p.quinzena === per) : r.per;
          folhas.push({ nome: "Resumo por quinzena", larguras: [16, 10, 10, 14, 14, 14, 12, 14, 12], congelar: { linha: 1 },
            linhas: [H(["Período", "Linhas", "Pagas", "Recebido", "Estornos", "Líquido", "Não pagas", "A debitar", "Contratos BL"]),
              ...ps.map((p) => [p.periodo, { v: p.linhas, s: "_int" }, { v: p.validas, s: "_int" }, N(p.recebido), N(p.estornos), N(p.liquido), { v: p.nao_pagas, s: "_int" }, N(p.a_debitar), { v: p.contratos_bl, s: "_int" }]),
              [{ v: "TOTAL", s: "t" }, ...["linhas", "validas"].map((k) => ({ v: ps.reduce((s, p) => s + p[k], 0), s: "t_int" })), ...["recebido", "estornos", "liquido"].map((k) => ({ v: +ps.reduce((s, p) => s + Number(p[k]), 0).toFixed(2), s: "t_brl" })),
                { v: ps.reduce((s, p) => s + p.nao_pagas, 0), s: "t_int" }, { v: +ps.reduce((s, p) => s + Number(p.a_debitar), 0).toFixed(2), s: "t_brl" }, { v: ps.reduce((s, p) => s + p.contratos_bl, 0), s: "t_int" }]] });
        }
        if (f.con.checked) {
          const c = await api("/extrato/conferencia");
          const L = [[{ v: "Instaladas sem pagamento de banda larga", s: "titulo" }], H(["Contrato", "Cliente", "Vendedor", "Equipe", "Venda", "Instalação", "Status do contrato", "Observação"]),
            ...(c.sem_pagamento || []).map((x) => [x.numero_contrato, x.cliente, x.vendedor, x.equipe || "", D(x.data_venda), D(x.data_agendamento), x.status_contrato || "", x.aguardar ? "Pode cair na próxima quinzena" : ""]), [],
            [{ v: "Pagas pela operadora, mas canceladas no sistema", s: "titulo" }], H(["Contrato", "Cliente", "Vendedor", "Venda", "Status do contrato", "Recebido", "Períodos"]),
            ...(c.pagas_canceladas || []).map((x) => [x.numero_contrato, x.cliente, x.vendedor, D(x.data_venda), x.status_contrato || "", N(x.total_recebido), x.periodos]), [],
            [{ v: "Pagas pela operadora, mas não lançadas no sistema", s: "titulo" }], H(["Contrato (EBT)", "Contrato", "Ativação", "Plano", "Recebido", "Períodos"]),
            ...(c.fora_do_sistema || []).map((x) => [x.contrato_ebt, x.contrato_num, D(x.data_ativacao), x.plano, N(x.total_recebido), x.periodos])];
          folhas.push({ nome: "Conferência", larguras: [16, 30, 26, 22, 12, 12, 18, 30], linhas: L });
        }
        if (!folhas.length) { st.textContent = "Marque ao menos uma aba."; b.disabled = false; return; }
        XLSX7.baixar(`Extrato_Operadora_${per || "completo"}.xlsx`, folhas, { titulo: "Extrato da operadora · " + perTxt, autor: S.sessao.usuario.nome });
        m.remove();
      } catch (e) { st.textContent = e.message; b.disabled = false; }
    });
  }

  /* ---------- 1. Enviar ---------- */
  function lerArquivo(f) {
    return new Promise((ok, falha) => {
      const ler = (cod) => { const r = new FileReader(); r.onerror = () => falha(new Error("Não foi possível ler o arquivo.")); r.onload = () => ok(r.result); r.readAsText(f, cod); };
      // a operadora manda em UTF-8; se vier acentuação quebrada, relê no padrão do Excel (Windows-1252)
      const r = new FileReader();
      r.onerror = () => falha(new Error("Não foi possível ler o arquivo."));
      r.onload = () => (String(r.result).includes("�") ? ler("windows-1252") : ok(r.result));
      r.readAsText(f, "utf-8");
    });
  }
  function cartaoPrevia(p, i) {
    if (p.erro) return `<div class="arq ruim"><div class="arq-topo"><b>${esc(p.nome)}</b><span class="tag ruim">não reconhecido</span></div><div class="aviso erro">${esc(p.erro)}</div></div>`;
    const a = p.a, rn = a.resumo_novas, rf = a.resumo_arquivo;
    const estado = p.importado ? `<span class="tag ok">importado ✓ ${nf.format(p.importado.novas)} linha(s)</span>`
      : a.novas === 0 ? `<span class="tag">já enviado antes — nada novo</span>`
      : a.repetidas ? `<span class="tag alerta">${nf.format(a.novas)} novas · ${nf.format(a.repetidas)} já existiam</span>` : `<span class="tag ok">${nf.format(a.novas)} linhas novas</span>`;
    return `<div class="arq ${p.importado ? "feito" : ""}"><div class="arq-topo"><b>${esc(p.nome)}</b>${estado}</div>
      <div class="arq-num"><div><span>Quinzena principal</span><b>${esc(rf.principal || "–")}</b></div><div><span>Linhas no arquivo</span><b>${nf.format(a.lidas)}</b></div>
        <div><span>Comissões pagas</span><b>${brl(rf.recebido)}</b></div><div><span>Estornos descontados</span><b class="neg">${brl(rf.estornos)}</b></div>
        <div><span>Líquido pago</span><b>${brl(rf.liquido)}</b></div><div><span>Não pagas (com pendência)</span><b>${nf.format(rf.nao_pagas)}</b></div>
        <div><span>Estornos previstos (60 dias)</span><b class="neg">${brl(rf.a_debitar)}</b></div></div>
      ${rf.pendencias.length ? `<details><summary>Linhas não pagas e estornos previstos, por motivo (${rf.pendencias.reduce((s, x) => s + x.linhas, 0)})</summary>${tabela([{ t: "Pendência", k: "pendencia" }, { t: "Linhas", n: 1, k: "linhas" }, { t: "Valor", n: 1, f: (x) => dinheiro(x.valor) }], rf.pendencias)}</details>` : ""}
      ${rf.periodos.length > 1 ? `<details><summary>Quinzenas dentro do arquivo (${rf.periodos.length})</summary>${tabela([{ t: "Quinzena", k: "periodo" }, { t: "Linhas", n: 1, k: "linhas" }, { t: "Líquido pago", n: 1, f: (x) => dinheiro(x.liquido) }, { t: "Previsto a debitar", n: 1, f: (x) => dinheiro(x.a_debitar) }], rf.periodos)}<p class="mut" style="margin:6px 0 0">Linhas de quinzenas futuras são <b>estornos previstos</b>: a operadora avisa com 60 dias de antecedência. Elas não entram no valor pago.</p></details>` : ""}
      ${a.problemas.length ? `<div class="aviso">${a.problemas.length} linha(s) ignoradas por formato inválido: ${esc(a.problemas.slice(0, 3).join("; "))}</div>` : ""}
      ${!p.importado && a.novas ? `<div class="arq-acoes"><span class="mut">Vai entrar: ${nf.format(a.novas)} linha(s) · líquido ${brl(rn.liquido)}</span><button class="btn" data-imp="${i}">Importar ${nf.format(a.novas)} linha(s) novas</button></div>` : ""}</div>`;
  }
  async function enviar(cx, el) {
    const pend = enviados.filter((p) => !p.erro && !p.importado && p.a.novas);
    cx.innerHTML = `<div class="passos">
        <div><span>1</span><b>Baixe o extrato</b><p>No portal da operadora, baixe o <b>Extrato Detalhado</b> da quinzena (arquivo <code>.csv</code>, ex.: Extrato_Detalhado_2028531_….csv). Não abra nem salve no Excel antes.</p></div>
        <div><span>2</span><b>Envie aqui</b><p>Arraste o(s) arquivo(s) para o quadro abaixo ou clique para escolher. Pode mandar vários de uma vez.</p></div>
        <div><span>3</span><b>Confira a prévia</b><p>O sistema compara linha por linha com o que já foi enviado. <b>Nada é gravado</b> até você confirmar.</p></div>
        <div><span>4</span><b>Importe</b><p>Só as linhas novas entram. Enviar o mesmo arquivo de novo não duplica nada.</p></div></div>
      <label class="soltar" id="sl"><input type="file" id="fi" accept=".csv,text/csv" multiple hidden><b>Arraste o extrato aqui</b><span>ou clique para escolher o arquivo .csv</span></label>
      <div id="st" class="mut" role="status"></div>
      ${pend.length > 1 ? `<div class="arq-acoes topo"><span>${pend.length} arquivos com linhas novas</span><button class="btn" id="todos">Importar todos</button></div>` : ""}
      <div class="arqs">${enviados.map(cartaoPrevia).join("")}</div>
      ${enviados.length ? `<button class="btn sec pq" id="lmp">Limpar lista</button>` : ""}`;
    const st = cx.querySelector("#st");
    async function analisar(files) {
      for (const f of files) {
        st.textContent = `Lendo ${f.name}…`;
        try {
          if (!/\.csv$/i.test(f.name)) throw new Error("Envie o arquivo .csv baixado do portal da operadora.");
          if (f.size > 14 * 1024 * 1024) throw new Error("Arquivo grande demais (máximo 14 MB).");
          const conteudo = await lerArquivo(f);
          const a = await api("/extrato/analisar", { method: "POST", body: { nome: f.name, conteudo } });
          enviados.unshift({ nome: f.name, conteudo, a });
        } catch (e) { enviados.unshift({ nome: f.name, erro: e.message }); }
      }
      st.textContent = ""; recarregar(el);
    }
    async function importar(i, btn) {
      const p = enviados[i]; if (!p) return;
      if (btn) { btn.disabled = true; btn.textContent = "Importando…"; }
      try { p.importado = await api("/extrato/importar", { method: "POST", body: { nome: p.nome, conteudo: p.conteudo } }); p.conteudo = null; }
      catch (e) { p.erro = e.message; }
    }
    const fi = cx.querySelector("#fi"), sl = cx.querySelector("#sl");
    fi.addEventListener("change", () => analisar([...fi.files]));
    ["dragenter", "dragover"].forEach((ev) => sl.addEventListener(ev, (e) => { e.preventDefault(); sl.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach((ev) => sl.addEventListener(ev, (e) => { e.preventDefault(); sl.classList.remove("sobre"); }));
    sl.addEventListener("drop", (e) => analisar([...e.dataTransfer.files]));
    cx.querySelectorAll("[data-imp]").forEach((b) => b.addEventListener("click", async () => { await importar(+b.dataset.imp, b); recarregar(el); }));
    cx.querySelector("#todos")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      for (const [i, p] of enviados.entries()) if (!p.erro && !p.importado && p.a.novas) { st.textContent = `Importando ${p.nome}…`; await importar(i); }
      recarregar(el);
    });
    cx.querySelector("#lmp")?.addEventListener("click", () => { enviados.length = 0; recarregar(el); });
  }

  /* ---------- 2. Resumo ---------- */
  async function resumo(cx, el) {
    const j = await api("/extrato/resumo");
    if (!j.per.length) { cx.innerHTML = `<div class="aviso">Nenhum extrato enviado ainda. Comece pela aba <b>1. Enviar extrato</b>.</div>`; return; }
    const pagos = j.per.filter((p) => p.validas);
    const tot = j.per.reduce((s, p) => ({ recebido: s.recebido + p.recebido, estornos: s.estornos + p.estornos, liquido: s.liquido + p.liquido, nao: s.nao + p.nao_pagas, deb: s.deb + p.a_debitar }), { recebido: 0, estornos: 0, liquido: 0, nao: 0, deb: 0 });
    // previsão de estorno só conta para quinzenas que ainda não chegaram
    const futuras = j.per.filter((p) => !p.validas && p.a_debitar);
    const prevDeb = futuras.reduce((s, p) => s + p.a_debitar, 0);
    if (!est.per || !j.per.some((p) => p.mes + p.quinzena === est.per)) est.per = pagos.length ? pagos[pagos.length - 1].mes + pagos[pagos.length - 1].quinzena : j.per[0].mes + j.per[0].quinzena;
    const sel = j.per.find((p) => p.mes + p.quinzena === est.per);
    const tiposSel = j.tipos.filter((t) => t.mes + t.quinzena === est.per).sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
    const pendSel = j.pend.filter((t) => t.mes + t.quinzena === est.per).sort((a, b) => b.linhas - a.linhas);
    cx.innerHTML = `<div class="aviso">A Operadora paga por <b>quinzena</b>: <b>P1</b> = instalações ativadas do dia 1 ao 15, <b>P2</b> = do dia 16 ao fim do mês. <b>Líquido</b> = comissões pagas menos estornos descontados.</div>
      <div class="kpis">${kpi("Comissões pagas", brl(tot.recebido), `${pagos.length} quinzena(s) enviadas`)}${kpi("Estornos descontados", brl(Math.abs(tot.estornos)), "cancelamentos e inadimplência")}
        ${kpi("Líquido recebido", brl(tot.liquido), "pago − estornos")}${kpi("Linhas não pagas", nf.format(tot.nao), "com pendência na operadora")}${kpi("Estornos a debitar", brl(prevDeb), futuras.length ? "previstos: " + futuras.map((p) => p.periodo).join(", ") : "nenhum previsto")}</div>
      <div class="grade g2">${painel("Comissões pagas por quinzena", CH.empilhadas({ cats: pagos.map((p) => p.periodo), titulo: "Comissões pagas por quinzena", fmt: mil,
          series: [{ nome: "Líquido recebido", cor: CH.COR.ok, valores: pagos.map((p) => +p.liquido.toFixed(2)) }, { nome: "Estornado", cor: CH.COR.ruim, valores: pagos.map((p) => +Math.abs(p.estornos).toFixed(2)) }] }), "Altura da coluna = comissões pagas; a parte vermelha foi descontada como estorno.")}
        ${painel("Contratos de banda larga pagos", CH.colunas({ dados: pagos.map((p) => ({ x: p.periodo, y: p.contratos_bl })), rotuloY: "Contratos", titulo: "Contratos de banda larga pagos" }), "Quantos contratos de banda larga a operadora pagou em cada quinzena.")}</div>
      ${painel("Quinzenas", tabela([{ t: "Quinzena", f: (p) => `<b>${esc(p.periodo)}</b>${p.validas ? "" : ` <span class="tag alerta">só previsão</span>`}` }, { t: "Linhas", n: 1, k: "linhas" },
        { t: "Contratos BL pagos", n: 1, k: "contratos_bl" }, { t: "Comissões pagas", n: 1, f: (p) => brl(p.recebido) }, { t: "Estornos", n: 1, f: (p) => dinheiro(p.estornos) },
        { t: "Líquido", n: 1, f: (p) => `<b>${brl(p.liquido)}</b>` }, { t: "Não pagas", n: 1, f: (p) => (p.nao_pagas ? `<a href="#" data-np="${p.mes}${p.quinzena}">${p.nao_pagas}</a>` : "0") }, { t: "A debitar", n: 1, f: (p) => dinheiro(p.a_debitar) }], j.per),
        "Clique no número de não pagas para ver as linhas.")}
      <div class="filtros"><div class="campo" style="width:200px"><label>Detalhar a quinzena</label><select id="ps">${j.per.map((p) => `<option value="${p.mes}${p.quinzena}" ${p.mes + p.quinzena === est.per ? "selected" : ""}>${esc(p.periodo)}</option>`).join("")}</select></div></div>
      <div class="grade g2">${painel(`O que foi pago em ${sel.periodo}`, tiposSel.length ? tabela([{ t: "Tipo de operação", k: "tipo" }, { t: "Linhas", n: 1, k: "linhas" }, { t: "Valor", n: 1, f: (x) => dinheiro(x.valor) }], tiposSel) : `<p class="legenda-vazia">Nada pago nesta quinzena (só previsões).</p>`)}
        ${painel(`O que não foi pago em ${sel.periodo}`, pendSel.length ? tabela([{ t: "Pendência", f: (x) => `<a href="#" data-pd="${esc(x.pendencia)}">${esc(x.pendencia)}</a>` }, { t: "Linhas", n: 1, k: "linhas" }, { t: "Valor", n: 1, f: (x) => dinheiro(x.valor) }], pendSel) : `<p class="legenda-vazia">Nenhuma pendência.</p>`, "Clique na pendência para ver as linhas.")}</div>`;
    cx.querySelector("#ps").addEventListener("change", (e) => { est.per = e.target.value; recarregar(el); });
    const irLinhas = (f) => { est.det = { mes: "", quinzena: "", tipo: "", pendencia: "", valido: "", busca: "", pagina: 1, ...f }; est.aba = "linhas"; recarregar(el); };
    cx.querySelectorAll("[data-np]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); const v = a.dataset.np; irLinhas({ mes: v.slice(0, 6), quinzena: v.slice(6), valido: "f" }); }));
    cx.querySelectorAll("[data-pd]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); irLinhas({ mes: est.per.slice(0, 6), quinzena: est.per.slice(6), valido: "f", pendencia: a.dataset.pd }); }));
  }

  /* ---------- 3. Conferência com as vendas ---------- */
  async function conferencia(cx, el) {
    const j = await api("/extrato/conferencia");
    if (!j.cobertas?.length) { cx.innerHTML = `<div class="aviso">Envie pelo menos um extrato com pagamentos de banda larga para fazer a conferência.</div>`; return; }
    const sem = j.sem_pagamento, verificar = sem.filter((x) => !x.aguardar);
    const LISTAS = { sem: ["Instaladas sem pagamento", sem.length], canc: ["Pagas, mas canceladas no sistema", j.pagas_canceladas.length], fora: ["Pagas, mas fora do sistema", j.fora_do_sistema.length] };
    const vendaLink = (x) => (x.contrato_id ? `<a href="#/venda/${x.contrato_id}">${esc(x.numero_contrato)}</a>` : esc(x.numero_contrato || "–"));
    const corpo = {
      sem: () => tabela([{ t: "Contrato", f: vendaLink }, { t: "Cliente", f: (x) => esc(x.cliente) }, { t: "Vendedor", f: (x) => esc(x.vendedor) }, { t: "Equipe", f: (x) => esc(x.equipe || "–") },
        { t: "Venda", f: (x) => S.dt(x.data_venda) }, { t: "Instalação", f: (x) => S.dt(x.data_agendamento) },
        { t: "Outros pagos", n: 1, f: (x) => brl(x.total_recebido) }, { t: "O que fazer", f: (x) => (x.aguardar ? `<span class="tag alerta">aguardar quinzena</span>` : `<span class="tag ruim">cobrar da operadora</span>`) }], sem),
      canc: () => tabela([{ t: "Contrato", f: vendaLink }, { t: "Cliente", f: (x) => esc(x.cliente) }, { t: "Vendedor", f: (x) => esc(x.vendedor) }, { t: "Venda", f: (x) => S.dt(x.data_venda) },
        { t: "Status no sistema", f: (x) => esc(x.status_contrato || "CANCELADO") }, { t: "Quinzena(s)", f: (x) => esc(x.periodos.split(", ").map((p) => perRot(p.slice(0, 6), p.slice(7))).join(", ")) }, { t: "Recebido", n: 1, f: (x) => brl(x.total_recebido) }], j.pagas_canceladas),
      fora: () => tabela([{ t: "Contrato (Operadora)", f: (x) => esc(x.contrato_ebt) }, { t: "Número", f: (x) => esc(x.contrato_num) }, { t: "Ativação", f: (x) => S.dt(x.data_ativacao) }, { t: "Plano", f: (x) => esc(x.plano) },
        { t: "Quinzena(s)", f: (x) => esc(x.periodos.split(", ").map((p) => perRot(p.slice(0, 6), p.slice(7))).join(", ")) }, { t: "Recebido", n: 1, f: (x) => brl(x.total_recebido) }], j.fora_do_sistema),
    };
    const NOTA = {
      sem: "Vendas INSTALADAS com banda larga dentro das quinzenas já enviadas, sem nenhuma linha de pagamento de banda larga no extrato. “Outros pagos” = valores de outros itens do mesmo contrato (TV, adicionais) que vieram. Confira o contrato com a operadora. As instaladas nos últimos 3 dias da última quinzena podem cair na quinzena seguinte.",
      canc: "A Operadora pagou a comissão, mas a venda está cancelada no sistema. Atenção: tende a virar estorno nas próximas quinzenas (ou o status no sistema está desatualizado).",
      fora: "A Operadora pagou por esses contratos, mas eles não existem no sistema. Provavelmente são vendas que não foram lançadas: cadastre para entrarem na comissão e nos indicadores.",
    };
    cx.innerHTML = `<div class="aviso">A conferência cruza o extrato com as vendas do sistema pelo <b>número do contrato</b>. Período coberto pelos extratos enviados: <b>${S.dt(j.cobertas[0].de)} a ${S.dt(j.cobertas[j.cobertas.length - 1].ate)}</b> (${j.cobertas.map((c) => c.periodo).join(", ")}).</div>
      <div class="kpis">${kpi("Vendas instaladas com BL", nf.format(j.base), "no período coberto")}${kpi("Pagas pela operadora", nf.format(j.pagas), j.base ? `${((j.pagas / j.base) * 100).toFixed(1).replace(".", ",")}% das instaladas` : "")}
        ${kpi("Instaladas sem pagamento", nf.format(verificar.length), sem.length - verificar.length ? `+ ${sem.length - verificar.length} para aguardar` : "conferir com a operadora")}${kpi("Pagas mas canceladas", nf.format(j.pagas_canceladas.length), "risco de estorno")}${kpi("Pagas fora do sistema", nf.format(j.fora_do_sistema.length), "vendas não lançadas")}</div>
      <div class="seg" id="ls" style="margin-bottom:10px">${Object.entries(LISTAS).map(([k, [n, q]]) => `<button data-l="${k}" class="${est.conf === k ? "on" : ""}">${n} (${q})</button>`).join("")}</div>
      ${painel(LISTAS[est.conf][0], corpo[est.conf](), NOTA[est.conf])}`;
    cx.querySelector("#ls").addEventListener("click", (e) => { const l = e.target.dataset.l; if (l) { est.conf = l; recarregar(el); } });
  }

  /* ---------- Linhas do extrato ---------- */
  async function linhas(cx, el) {
    const d = est.det, q = new URLSearchParams(Object.entries(d).filter(([, v]) => v !== "" && v != null));
    const [r, j] = await Promise.all([api("/extrato/resumo"), api("/extrato/detalhe?" + q)]);
    const tipos = [...new Set(r.tipos.map((t) => t.tipo))].sort(), pends = [...new Set(r.pend.map((t) => t.pendencia))].sort();
    const paginas = Math.max(1, Math.ceil(j.total / 100));
    cx.innerHTML = `<div class="filtros">
        <div class="campo" style="width:150px"><label>Quinzena</label><select id="lq"><option value="">Todas</option>${r.per.map((p) => `<option value="${p.mes}${p.quinzena}" ${d.mes + d.quinzena === p.mes + p.quinzena ? "selected" : ""}>${esc(p.periodo)}</option>`).join("")}</select></div>
        <div class="campo" style="width:130px"><label>Situação</label><select id="lv"><option value="">Todas</option><option value="t" ${d.valido === "t" ? "selected" : ""}>Pagas</option><option value="f" ${d.valido === "f" ? "selected" : ""}>Não pagas</option></select></div>
        <div class="campo" style="width:210px"><label>Tipo de operação</label><select id="lt"><option value="">Todos</option>${tipos.map((t) => `<option ${t === d.tipo ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
        <div class="campo" style="width:230px"><label>Pendência</label><select id="lp"><option value="">Todas</option>${pends.map((t) => `<option ${t === d.pendencia ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
        <div class="campo" style="width:180px"><label>Contrato ou telefone</label><input id="lb" value="${esc(d.busca)}" inputmode="numeric"></div>
        <button class="btn" id="lok">Filtrar</button><button class="btn sec" id="llp">Limpar</button></div>
      ${painel("Linhas", tabela([{ t: "Quinzena", f: (x) => esc(perRot(x.mes_referencia, x.quinzena)) }, { t: "Ativação", f: (x) => S.dt(x.data_ativacao) }, { t: "Tipo / plano", f: (x) => `${esc(x.tipo_operacao)}<br><span class="mut">${esc(x.plano)}</span>` }, { t: "Contrato", f: (x) => (x.contrato_id ? `<a href="#/venda/${x.contrato_id}">${esc(x.contrato_num)}</a>` : esc(x.contrato_num || x.ntc || "–")) },
        { t: "Cliente / vendedor", f: (x) => (x.cliente ? `${esc(x.cliente)}<br><span class="mut">${esc(x.vendedor || "")}</span>` : `<span class="mut">não encontrado no sistema</span>`) },
        { t: "Situação", f: (x) => (x.valido ? `<span class="tag ok">pago</span>` : `${x.valor < 0 ? `<span class="tag alerta">estorno previsto</span>` : `<span class="tag ruim">não pago</span>`}<br><span class="mut">${esc(x.pendencia || "")}</span>`) }, { t: "Valor", n: 1, f: (x) => dinheiro(x.valor) }], j.itens),
        "", `${nf.format(j.total)} linha(s) · pago no filtro: ${brl(j.valor)}`)}
      <div class="pag"><button class="btn sec pq" id="an" ${j.pagina <= 1 ? "disabled" : ""}>‹ Anterior</button><span>página ${j.pagina}/${paginas}</span><button class="btn sec pq" id="px" ${j.pagina >= paginas ? "disabled" : ""}>Próxima ›</button></div>`;
    const ler = () => { const v = cx.querySelector("#lq").value; Object.assign(d, { mes: v.slice(0, 6), quinzena: v.slice(6), valido: cx.querySelector("#lv").value, tipo: cx.querySelector("#lt").value, pendencia: cx.querySelector("#lp").value, busca: cx.querySelector("#lb").value.trim(), pagina: 1 }); recarregar(el); };
    cx.querySelector("#lok").addEventListener("click", ler);
    cx.querySelector("#lb").addEventListener("keydown", (e) => e.key === "Enter" && ler());
    cx.querySelector("#llp").addEventListener("click", () => { est.det = { mes: "", quinzena: "", tipo: "", pendencia: "", valido: "", busca: "", pagina: 1 }; recarregar(el); });
    cx.querySelector("#an").addEventListener("click", () => { d.pagina--; recarregar(el); });
    cx.querySelector("#px").addEventListener("click", () => { d.pagina++; recarregar(el); });
  }

  /* ---------- Histórico de envios ---------- */
  async function historico(cx, el) {
    const j = await api("/extrato/resumo");
    cx.innerHTML = painel("Arquivos enviados", tabela([{ t: "Quando", f: (l) => quando(l.enviado_em) }, { t: "Arquivo", f: (l) => esc(l.arquivo_nome) }, { t: "Quem enviou", f: (l) => esc(l.enviado_por || "–") },
      { t: "Quinzenas", f: (l) => esc(l.periodos || "–") }, { t: "Linhas novas", n: 1, f: (l) => nf.format(l.linhas_novas) }, { t: "Já existiam", n: 1, f: (l) => nf.format(l.linhas_repetidas) },
      { t: "Valor", n: 1, f: (l) => dinheiro(Number(l.valor_novo || 0)) }, { t: "", f: (l) => `<button class="btn sec pq" data-del="${l.id}" data-n="${esc(l.arquivo_nome)}">Desfazer</button>` }], j.lotes),
      "Desfazer apaga só as linhas que entraram naquele envio (para corrigir um arquivo errado). Depois é só enviar o arquivo certo.");
    cx.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(`Desfazer o envio de "${b.dataset.n}"? As linhas que entraram por ele serão apagadas.`)) return;
      try { const r = await api(`/extrato/lotes/${b.dataset.del}`, { method: "DELETE" }); alert(`${nf.format(r.linhas_removidas)} linha(s) removidas.`); recarregar(el); } catch (e) { alert(e.message); }
    }));
  }
})();
