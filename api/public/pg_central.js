"use strict";
/* Central de alterações (gestor): quem fez o quê, quando, com gráficos, ficha da pessoa e exportação */
(() => {
  const { esc, nf, api, painel } = S;
  const ACAO = { INSERT: "criou", UPDATE: "alterou", DELETE: "apagou" };
  const TABELAS = { contrato: "Vendas", cliente: "Clientes", contrato_item: "Produtos da venda", agenda_instalacao: "Rota", usuario: "Usuários", equipe_membro: "Equipes", viabilidade: "Viabilidade", confirmacao_venda: "Confirmação D-1/D-15", cliente_observacao: "Observações do cliente" };
  const est = { pagina: 1, usuario: "", tabela: "", acao: "", de: "", ate: "", q: "" };
  const hora = (s) => (s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–");
  const dia = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const kpi = S.kpi;

  S.filtrarCentral = (f) => { Object.assign(est, { pagina: 1 }, f); if (location.hash === "#/central") S.PAGES.central(document.getElementById("ct")).catch(S.erroEm(document.getElementById("ct"))); else location.hash = "#/central"; };

  S.PAGES.central = async (el) => {
    if (S.sessao.usuario.perfil !== "gestor") { el.innerHTML = `<div class="aviso erro">Somente o gerente ou o administrador acessa a central de alterações.</div>`; return; }
    const filtros = () => Object.entries(est).filter(([k, v]) => k !== "pagina" && v !== "" && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    const [pessoas, r, j] = await Promise.all([api("/atividade/pessoas"), api("/atividade/resumo?" + filtros()), api("/atividade?pagina=" + est.pagina + "&" + filtros())]);
    const t = r.totais, paginas = Math.max(1, Math.ceil(j.total / j.tam));
    const p = r.pessoa;
    const ficha = p ? `<div class="ficha"><span class="avatar grande">${p.foto ? `<img src="${esc(p.foto)}" alt="">` : esc(S.iniciais(p.nome_completo))}</span>
      <div><b>${esc(p.nome_completo)}</b> <span class="tag ${p.ativo ? "ok" : "ruim"}">${p.ativo ? "ativo" : "inativo"}</span><br><span class="mut">${esc(p.perfil_acesso ? S.rotPerfil(p.perfil_acesso) : "sem acesso")}${p.equipe ? " · equipe " + esc(p.equipe) : ""}${p.email ? " · " + esc(p.email) : ""}</span><br>
      <span class="mut">Último acesso: ${hora(p.ultimo_login)} · ${nf.format(p.logins || 0)} entrada(s) · ${nf.format(t.total)} alteração(ões) no filtro</span></div></div>` : "";
    el.innerHTML = `<div class="cab"><div><div class="migalha">Administração</div><h1>Central de alterações</h1></div><div class="acoes"><button class="btn sec" id="ex">Exportar CSV</button></div></div>
      <div class="filtros"><div class="campo" style="width:190px"><label>Pessoa</label><select id="fu"><option value="">Todas</option>${pessoas.map((x) => `<option value="${x.id}" ${String(x.id) === String(est.usuario) ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></div>
        <div class="campo" style="width:150px"><label>O quê</label><select id="ft"><option value="">Tudo</option>${Object.entries(TABELAS).map(([k, v]) => `<option value="${k}" ${est.tabela === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="campo" style="width:120px"><label>Ação</label><select id="fc"><option value="">Todas</option>${Object.entries(ACAO).map(([k, v]) => `<option value="${k}" ${est.acao === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="campo" style="width:135px"><label>De</label><input type="date" id="fd" value="${esc(est.de)}"></div><div class="campo" style="width:135px"><label>Até</label><input type="date" id="fa" value="${esc(est.ate)}"></div>
        <div class="campo" style="width:200px"><label>Contrato, cliente ou CPF</label><input id="fq" value="${esc(est.q)}"></div>
        <button class="btn" id="ok">Filtrar</button><button class="btn sec" id="lp">Limpar</button></div>
      ${ficha}
      <div class="kpis">${kpi("Alterações", nf.format(t.total), t.primeira ? "desde " + hora(t.primeira).slice(0, 10) : "")}${kpi("Criações", nf.format(t.criou))}${kpi("Edições", nf.format(t.alterou))}${kpi("Exclusões", nf.format(t.apagou), t.apagou ? "só gerente/administrador apaga" : "")}${kpi("Pessoas", nf.format(t.pessoas), t.ultima ? "última em " + hora(t.ultima) : "")}</div>
      <div class="grade g2">${painel("Alterações por dia", CH.empilhadas({ cats: r.por_dia.map((d) => dia(d.dia)), rotuloY: "Registros", titulo: "Alterações por dia",
        series: [{ nome: "Criou", cor: CH.COR.ok, valores: r.por_dia.map((d) => d.criou) }, { nome: "Alterou", cor: CH.COR.azul, valores: r.por_dia.map((d) => d.alterou) }, { nome: "Apagou", cor: CH.COR.ruim, valores: r.por_dia.map((d) => d.apagou) }],
        irCat: (i) => ({ cen: { de: r.por_dia[i].dia, ate: r.por_dia[i].dia } }) }), "Clique em uma coluna para filtrar o dia.")}
      ${painel("Quem mais alterou", r.por_pessoa.length ? CH.barrasH({ dados: r.por_pessoa.map((x) => ({ rot: x.quem, y: x.n, ir: x.usuario_id ? { cen: { usuario: x.usuario_id } } : null })), rotuloX: "Registros", titulo: "Quem mais alterou" }) : `<p class="legenda-vazia">Sem dados.</p>`, "Clique em uma barra para ver só essa pessoa.")}</div>
      ${painel("Histórico", `<div class="ativ">${j.itens.map(S.itemAtividade).join("") || `<div class="it"><div class="mut">Nenhuma alteração encontrada.</div></div>`}</div>
        <div class="pag"><button class="btn sec pq" id="an" ${j.pagina <= 1 ? "disabled" : ""}>‹ Anterior</button><span>${nf.format(j.total)} registro(s) · página ${j.pagina}/${paginas}</span><button class="btn sec pq" id="px" ${j.pagina >= paginas ? "disabled" : ""}>Próxima ›</button></div>`)}`;
    const go = () => S.PAGES.central(el).catch(S.erroEm(el));
    const ler = () => Object.assign(est, { usuario: el.querySelector("#fu").value, tabela: el.querySelector("#ft").value, acao: el.querySelector("#fc").value, de: el.querySelector("#fd").value, ate: el.querySelector("#fa").value, q: el.querySelector("#fq").value.trim(), pagina: 1 });
    el.querySelector("#ok").addEventListener("click", () => { ler(); go(); });
    el.querySelector("#fq").addEventListener("keydown", (e) => e.key === "Enter" && el.querySelector("#ok").click());
    el.querySelector("#lp").addEventListener("click", () => { Object.assign(est, { usuario: "", tabela: "", acao: "", de: "", ate: "", q: "", pagina: 1 }); go(); });
    el.querySelector("#ex").addEventListener("click", () => S.baixar("/atividade/exportar?" + filtros(), "central-alteracoes.csv").catch((e) => alert(e.message)));
    el.querySelector("#an").addEventListener("click", () => { est.pagina--; go(); });
    el.querySelector("#px").addEventListener("click", () => { est.pagina++; go(); });
  };
})();
