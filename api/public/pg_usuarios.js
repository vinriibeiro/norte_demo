"use strict";
/* Administração: colaboradores (novo, equipe, funções) e acesso ao site (só o gestor) */
(() => {
  const { esc, nf, tabela, api, modal } = S;
  let pg = 1, busca = "", ac = "";
  S.PAGES.usuarios = async (el) => {
    const [j, pedidos] = await Promise.all([api(`/agentes?pagina=${pg}&busca=${encodeURIComponent(busca)}&acesso=${ac}`), api("/agentes/pedidos-senha").catch(() => [])]);
    const paginas = Math.max(1, Math.ceil(j.total / 50));
    el.innerHTML = `<div class="cab"><div><div class="migalha">Administração</div><h1>Usuários e acessos</h1></div><div class="acoes"><button class="btn" id="nv">Novo colaborador</button></div></div>
      ${pedidos.length ? `<div class="aviso pedidos-senha"><b>${pedidos.length === 1 ? "1 pessoa pediu" : pedidos.length + " pessoas pediram"} nova senha na tela de login:</b>${pedidos.map((p) => `<div class="ped"><span><b>${esc(p.nome_completo)}</b> <span class="mut">${esc(p.email || "")} · ${S.dt(p.pedido_em)}</span></span><button class="btn pq" data-pw="${p.usuario_id}">Gerar senha temporária</button></div>`).join("")}</div>` : ""}
      <div class="aviso">Use <b>Novo colaborador</b> quando alguém entrar na empresa: cadastro, equipe e, se quiser, o acesso ao site de uma vez. O <b>perfil</b> define o que a pessoa vê: <b>vendedor</b> só as próprias vendas; <b>supervisor</b> a equipe dele; <b>coordenador</b> as equipes sob a coordenação; <b>backoffice de cadastro</b> lança e edita vendas (sem apagar), responde viabilidades, faz a rota e as confirmações D-1/D-15; <b>backoffice de qualidade</b> acompanha os indicadores e o FPD; <b>gerente</b> e <b>administrador</b> tudo, inclusive apagar, gerenciar acessos e ver o Extrato da operadora. Fechamento do dia e Produtividade: backoffice de cadastro, gerente e administrador. Supervisor e coordenador são ligados às equipes no quadro no fim desta página.</div>
      <div class="filtros"><div class="campo" style="width:260px"><label>Buscar (nome, login ou e-mail)</label><input id="q" value="${esc(busca)}"></div>
        <div class="campo" style="width:140px"><label>Acesso</label><select id="ac"><option value="">Todos</option><option value="com" ${ac === "com" ? "selected" : ""}>Com acesso</option><option value="sem" ${ac === "sem" ? "selected" : ""}>Sem acesso</option></select></div><button class="btn" id="ok">Buscar</button></div>
      ${tabela([{ t: "Agente", f: (r) => `<b>${esc(r.nome_completo)}</b> <span class="mut">${esc(r.login)}</span>${r.agente_ativo ? "" : ` <span class="tag">desligado</span>`}` }, { t: "Equipe atual", f: (r) => esc(r.equipes || "–") }, { t: "Vendas", n: 1, f: (r) => nf.format(r.total_vendas) },
        { t: "E-mail de acesso", k: "email" }, { t: "Perfil", f: (r) => esc(S.rotPerfil(r.perfil_acesso)) + (r.perfil_acesso === "backoffice" ? ` <span class="tag">${r.setor === "QUALIDADE" ? "qualidade" : "cadastro"}</span>` : "") }, { t: "Acesso", f: (r) => (!r.tem_acesso ? `<span class="tag">sem acesso</span>` : r.acesso_ativo ? `<span class="tag ok">ativo</span>` : `<span class="tag ruim">desativado</span>`) },
        { t: "", c: "acoes-cel", f: (r) => `<button class="btn sec pq" data-e="${r.usuario_id}">Editar</button> ` + (!r.tem_acesso ? `<button class="btn pq" data-c="${r.usuario_id}">Criar acesso</button>` : `<button class="btn sec pq" data-p="${r.usuario_id}">Perfil</button> <button class="btn sec pq" data-r="${r.usuario_id}">Nova senha</button> <button class="btn sec pq" data-t="${r.usuario_id}" data-a="${r.acesso_ativo ? 0 : 1}">${r.acesso_ativo ? "Desativar" : "Reativar"}</button>`) }], j.itens)}
      <div class="pag"><button class="btn sec pq" id="an" ${j.pagina <= 1 ? "disabled" : ""}>‹ Anterior</button><span>${nf.format(j.total)} agentes · página ${j.pagina}/${paginas}</span><button class="btn sec pq" id="px" ${j.pagina >= paginas ? "disabled" : ""}>Próxima ›</button></div>
      <section class="painel" style="margin-top:14px"><h2><span>Equipes: supervisor e coordenador</span></h2><div class="corpo" id="eq"><p class="mut">Carregando…</p></div><div class="nota">Quem é supervisor vê as vendas da equipe; quem é coordenador vê todas as equipes sob a sua coordenação. Cada pessoa vê só o que estiver ligado a ela aqui.</div></section>`;
    const go = () => S.PAGES.usuarios(el).catch(S.erroEm(el));
    painelEquipes(el.querySelector("#eq"), go).catch(S.erroEm(el.querySelector("#eq")));
    el.querySelector("#ok").addEventListener("click", () => { busca = el.querySelector("#q").value.trim(); ac = el.querySelector("#ac").value; pg = 1; go(); });
    el.querySelector("#q").addEventListener("keydown", (e) => e.key === "Enter" && el.querySelector("#ok").click());
    el.querySelector("#an").addEventListener("click", () => { pg--; go(); });
    el.querySelector("#px").addEventListener("click", () => { pg++; go(); });
    const ag = (id) => j.itens.find((x) => x.usuario_id === +id);
    el.querySelector("#nv").addEventListener("click", () => formColaborador(null, go).catch((e) => alert(e.message)));
    el.querySelectorAll("[data-e]").forEach((b) => b.addEventListener("click", () => formColaborador(ag(b.dataset.e), go).catch((e) => alert(e.message))));
    el.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => formAcesso(ag(b.dataset.c), false, go)));
    el.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => formAcesso(ag(b.dataset.p), true, go)));
    el.querySelectorAll("[data-pw]").forEach((b) => b.addEventListener("click", async () => {
      const p = pedidos.find((x) => x.usuario_id === +b.dataset.pw);
      if (!confirm(`Gerar uma nova senha temporária para ${p.nome_completo}?`)) return;
      try { const r = await api(`/agentes/${p.usuario_id}/acesso/redefinir-senha`, { method: "POST" }); mostrarSenha({ nome_completo: p.nome_completo, email: p.email }, r.senha_temporaria, go); } catch (e) { alert(e.message); }
    }));
    el.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Gerar uma nova senha temporária para este usuário?")) return;
      try { const r = await api(`/agentes/${b.dataset.r}/acesso/redefinir-senha`, { method: "POST" }); mostrarSenha(ag(b.dataset.r), r.senha_temporaria, go); } catch (e) { alert(e.message); }
    }));
    el.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", async () => {
      const ativar = b.dataset.a === "1";
      if (!ativar && !confirm("Desativar o acesso? A pessoa não conseguirá mais entrar; o histórico de vendas é mantido.")) return;
      try { await api(`/agentes/${b.dataset.t}/acesso`, { method: "PATCH", body: { ativa: ativar } }); go(); } catch (e) { alert(e.message); }
    }));
  };

  async function painelEquipes(box, depois) {
    const [eqs, pessoas] = await Promise.all([api("/equipes"), api("/equipes/pessoas")]);
    const sel = (nome, atual) => `<select data-k="${nome}"><option value="">—</option>${pessoas.map((p) => `<option value="${p.id}" ${p.id === atual ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}</select>`;
    box.innerHTML = `<div class="tab"><table><thead><tr><th>Equipe</th><th class="num">Membros</th><th>Supervisor</th><th>Coordenador</th></tr></thead><tbody>${eqs.filter((e) => e.ativa).map((e) => `<tr data-id="${e.id}"><td><b>${esc(e.nome)}</b></td><td class="num">${e.membros}</td><td>${sel("lider_id", e.lider_id)}</td><td>${sel("coordenador_id", e.coordenador_id)}</td></tr>`).join("")}</tbody></table></div>
      <div style="margin-top:8px"><button class="btn sec pq" id="ne">Nova equipe</button> <span class="mut" id="em"></span></div>`;
    box.querySelectorAll("select").forEach((s) => s.addEventListener("change", async () => {
      const id = s.closest("tr").dataset.id;
      try { await api(`/equipes/${id}`, { method: "PATCH", body: { [s.dataset.k]: s.value || null } }); box.querySelector("#em").textContent = "Salvo."; }
      catch (e) { box.querySelector("#em").textContent = e.message; }
    }));
    box.querySelector("#ne").addEventListener("click", async () => {
      const nome = prompt("Nome da nova equipe:"); if (!nome) return;
      try { await api("/equipes", { method: "POST", body: { nome } }); depois(); } catch (e) { alert(e.message); }
    });
  }

  const FUNCOES = [["VENDEDOR", "Vendedor"], ["LIDER", "Supervisor"], ["COORDENADOR", "Coordenador"], ["BACKOFFICE", "Backoffice"], ["COBRANCA", "Cobrança"], ["POS_VENDA", "Pós-venda"], ["GESTOR", "Gerente"]];
  const PERFIS_UI = [["vendedor", "Vendedor · vê só as próprias vendas"], ["lider", "Supervisor · vê a equipe dele"], ["coordenador", "Coordenador · vê as equipes sob a coordenação"], ["backoffice:CADASTRO", "Backoffice · Cadastro · lança vendas, viabilidade, rota e confirmações"], ["backoffice:QUALIDADE", "Backoffice · Qualidade · indicadores e FPD (só consulta vendas)"], ["gestor", "Gerente · vê e administra tudo (inclui Extrato da operadora)"], ["administrador", "Administrador · mesmas permissões do gerente"]];
  const perfilDe = (fs) => (fs.includes("GESTOR") ? "gestor" : fs.includes("BACKOFFICE") ? "backoffice:CADASTRO" : fs.includes("COORDENADOR") ? "coordenador" : fs.includes("LIDER") ? "lider" : "vendedor");

  /** "backoffice:QUALIDADE" -> { perfil: "backoffice", setor: "QUALIDADE" } */
  const perfilSetor = (v) => { const [perfil, setor] = String(v).split(":"); return setor ? { perfil, setor } : { perfil }; };
  const valorPerfil = (a) => (a.perfil_acesso === "backoffice" ? `backoffice:${a.setor === "QUALIDADE" ? "QUALIDADE" : "CADASTRO"}` : a.perfil_acesso);

  /** Novo colaborador (a = null) ou edição de nome, funções, equipe e situação. */
  async function formColaborador(a, depois) {
    const equipes = await api("/equipes");
    const novo = !a, atuais = (a?.funcoes || "").split(", ").filter(Boolean);
    const hoje = new Date().toISOString().slice(0, 10);
    const m = modal(novo ? "Novo colaborador" : "Editar colaborador", `<form id="f">
      <div class="campo" style="margin-bottom:10px"><label>Nome completo</label><input name="nome" value="${esc(a?.nome_completo || "")}" required autofocus></div>
      <div class="campo" style="margin-bottom:10px"><label>Funções</label><div style="display:flex;flex-wrap:wrap;gap:4px 14px">${FUNCOES.map(([k, n]) => `<label style="display:flex;gap:5px;align-items:center"><input type="checkbox" name="fn" value="${k}" style="width:auto" ${(novo ? k === "VENDEDOR" : atuais.includes(k)) ? "checked" : ""}>${n}</label>`).join("")}</div></div>
      <div class="campo" style="margin-bottom:10px"><label>Equipe</label><select name="equipe"><option value="">Sem equipe</option>${equipes.filter((e) => e.ativa || e.id === a?.equipe_id).map((e) => `<option value="${e.id}" ${e.id === a?.equipe_id ? "selected" : ""}>${esc(e.nome)} (${e.membros})</option>`).join("")}</select></div>
      <div class="campo" style="margin-bottom:10px"><label>${novo ? "Data de entrada" : "Na equipe nova a partir de"}</label><input name="desde" type="date" value="${hoje}"></div>
      ${novo ? `<label style="display:flex;gap:6px;align-items:center;margin:4px 0 8px"><input type="checkbox" name="acesso" style="width:auto"> Criar também o acesso ao site</label>
        <div id="ac" hidden><div class="campo" style="margin-bottom:10px"><label>E-mail de login</label><input name="email" type="email"></div>
        <div class="campo"><label>Perfil</label><select name="perfil">${PERFIS_UI.map(([p, n]) => `<option value="${p}">${n}</option>`).join("")}</select></div></div>`
        : `<label style="display:flex;gap:6px;align-items:center;margin-top:4px"><input type="checkbox" name="ativo" style="width:auto" ${a.agente_ativo ? "checked" : ""}> Colaborador ativo (desmarque quando sair da empresa)</label>
        <fieldset class="ed-acesso"><legend>Acesso ao site e ao app</legend>
          ${a.tem_acesso ? `<div class="campo" style="margin-bottom:10px"><label>E-mail de login</label><input name="email" type="email" value="${esc(a.email || "")}" required></div>
            <div class="campo" style="margin-bottom:10px"><label>Perfil</label><select name="perfil">${PERFIS_UI.map(([p, n]) => `<option value="${p}" ${p === valorPerfil(a) ? "selected" : ""}>${n}</option>`).join("")}</select></div>
            <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="ativa" style="width:auto" ${a.acesso_ativo !== false ? "checked" : ""}> Acesso liberado (desmarque para bloquear a entrada)</label>`
          : `<label style="display:flex;gap:6px;align-items:center;margin-bottom:8px"><input type="checkbox" name="acesso" style="width:auto"> Vincular uma conta (e-mail de login) a este colaborador</label>
            <div id="ac" hidden><div class="campo" style="margin-bottom:10px"><label>E-mail de login</label><input name="email" type="email"></div>
            <div class="campo"><label>Perfil</label><select name="perfil">${PERFIS_UI.map(([p, n]) => `<option value="${p}" ${p === perfilDe(atuais) ? "selected" : ""}>${n}</option>`).join("")}</select></div></div>`}
        </fieldset>`}
      <div class="erro" id="e" style="margin-top:8px"></div></form>`, `<button class="btn sec" id="x">Cancelar</button><button class="btn" id="s">${novo ? "Cadastrar" : "Salvar"}</button>`);
    const f = m.querySelector("#f");
    const fns = () => [...f.querySelectorAll('input[name="fn"]:checked')].map((c) => c.value);
    if (!novo && !a.tem_acesso) f.acesso.addEventListener("change", () => { m.querySelector("#ac").hidden = !f.acesso.checked; f.email.required = f.acesso.checked; });
    if (novo) {
      f.acesso.addEventListener("change", () => (m.querySelector("#ac").hidden = !f.acesso.checked));
      f.addEventListener("change", (e) => { if (e.target.name === "fn") f.perfil.value = perfilDe(fns()); });
    }
    m.querySelector("#x").addEventListener("click", () => m.remove());
    m.querySelector("#s").addEventListener("click", async () => {
      if (!f.reportValidity()) return;
      if (!fns().length) { m.querySelector("#e").textContent = "Marque ao menos uma função."; return; }
      try {
        if (novo) {
          const r = await api("/agentes", { method: "POST", body: { nome_completo: f.nome.value, funcoes: fns(), equipe_id: f.equipe.value || null, data_entrada: f.desde.value || null,
            criar_acesso: f.acesso.checked, email: f.email.value, ...perfilSetor(f.perfil.value) } });
          m.remove();
          if (r.senha_temporaria) mostrarSenha({ nome_completo: f.nome.value.toUpperCase(), email: f.email.value.trim().toLowerCase() }, r.senha_temporaria, depois); else depois();
        } else {
          const b = { nome_completo: f.nome.value, funcoes: fns(), ativo: f.ativo.checked };
          if (String(f.equipe.value || "") !== String(a.equipe_id || "")) { b.equipe_id = f.equipe.value || null; b.equipe_desde = f.desde.value || null; }
          await api("/agentes/" + a.usuario_id, { method: "PATCH", body: b });
          if (a.tem_acesso) {   // e-mail, perfil e bloqueio do acesso
            const ac = {}, ps = perfilSetor(f.perfil.value);
            if (f.email.value.trim().toLowerCase() !== String(a.email || "").toLowerCase()) ac.email = f.email.value;
            if (f.perfil.value !== valorPerfil(a)) Object.assign(ac, ps);
            if (f.ativa.checked !== (a.acesso_ativo !== false)) ac.ativa = f.ativa.checked;
            if (Object.keys(ac).length) await api(`/agentes/${a.usuario_id}/acesso`, { method: "PATCH", body: ac });
            m.remove(); depois();
          } else if (f.acesso.checked) {   // vincular conta: cria o acesso ou transfere o de outro cadastro com o mesmo e-mail
            const corpo = { email: f.email.value, ...perfilSetor(f.perfil.value) };
            let r;
            try { r = await api(`/agentes/${a.usuario_id}/acesso`, { method: "POST", body: corpo }); }
            catch (e) {
              const c = e.dados?.conflito; if (!c) throw e;
              if (!confirm(`O e-mail ${corpo.email} já é usado por ${c.nome}.\n\n${c.tem_acesso ? "Transferir esse acesso (mesmo e-mail e senha) para " : "Usar o e-mail em "}${a.nome_completo}? ${c.tem_acesso ? "O cadastro de " + c.nome + " fica sem acesso." : ""}`)) return;
              r = await api(`/agentes/${a.usuario_id}/acesso`, { method: "POST", body: { ...corpo, transferir: true } });
            }
            m.remove();
            if (r.senha_temporaria) mostrarSenha({ ...a, email: corpo.email.trim().toLowerCase() }, r.senha_temporaria, depois);
            else { alert(`Pronto: ${a.nome_completo} agora entra com ${corpo.email} e a mesma senha de antes.`); depois(); }
          } else { m.remove(); depois(); }
        }
      } catch (e) { m.querySelector("#e").textContent = e.message; }
    });
  }
  function formAcesso(a, edicao, depois) {
    const m = modal(edicao ? "Alterar perfil" : "Criar acesso", `<p class="mut">${esc(a.nome_completo)} · ${esc(a.login)}</p><form id="f">
      <div class="campo" style="margin-bottom:10px"><label>E-mail de login</label><input name="email" type="email" value="${esc(a.email || "")}" ${edicao ? "disabled" : "required"}></div>
      <div class="campo"><label>Perfil</label><select name="perfil">${PERFIS_UI.map(([p, n]) => `<option value="${p}" ${p === valorPerfil(a) ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div class="erro" id="e" style="margin-top:8px"></div></form>`, `<button class="btn sec" id="x">Cancelar</button><button class="btn" id="s">${edicao ? "Salvar" : "Criar acesso"}</button>`);
    m.querySelector("#x").addEventListener("click", () => m.remove());
    m.querySelector("#s").addEventListener("click", async () => {
      const f = m.querySelector("#f"); if (!f.reportValidity()) return;
      try {
        if (edicao) { await api(`/agentes/${a.usuario_id}/acesso`, { method: "PATCH", body: perfilSetor(f.perfil.value) }); m.remove(); depois(); }
        else { const r = await api(`/agentes/${a.usuario_id}/acesso`, { method: "POST", body: { email: f.email.value, ...perfilSetor(f.perfil.value) } }); m.remove(); mostrarSenha({ ...a, email: f.email.value.trim().toLowerCase() }, r.senha_temporaria, depois); }
      } catch (e) { m.querySelector("#e").textContent = e.message; }
    });
  }
  function mostrarSenha(a, senha, depois) {
    const m = modal("Acesso pronto", `<p>Passe estes dados para <b>${esc(a.nome_completo)}</b>. A senha aparece <b>só agora</b> e será trocada no primeiro acesso.</p>${a.email ? `<p>Login: <b>${esc(a.email)}</b></p>` : ""}<div class="senha">${esc(senha)}</div>`, `<button class="btn" id="x">Concluir</button>`);
    m.querySelector("#x").addEventListener("click", () => { m.remove(); depois(); });
  }
})();
