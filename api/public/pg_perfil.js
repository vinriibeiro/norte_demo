"use strict";
/* Meu perfil: foto, dados da conta e histórico de alterações (quem editou o quê) */
(() => {
  const { esc, nf, tabela, api } = S;
  const gestor = () => S.sessao.usuario.perfil === "gestor";
  const est = { aba: "perfil", pagina: 1, usuario: "", tabela: "", acao: "", de: "", ate: "" };
  const hora = (s) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const ACAO = { INSERT: "criou", UPDATE: "alterou", DELETE: "apagou" };
  const EVENTO = { CRIADA: "Acesso criado", PERFIL_ALTERADO: "Perfil alterado", DESATIVADA: "Acesso desativado", REATIVADA: "Acesso reativado", SENHA_REDEFINIDA: "Senha redefinida", SENHA_TROCADA: "Senha trocada", LOGIN_OK: "Entrou", LOGIN_FALHOU: "Senha errada", BLOQUEADA: "Conta bloqueada" };
  const TABELAS = { contrato: "Vendas", cliente: "Clientes", contrato_item: "Produtos da venda", agenda_instalacao: "Rota", usuario: "Usuários", equipe_membro: "Equipes" };

  S.PAGES.perfil = async (el) => {
    const p = S.perfil || (S.perfil = await api("/perfil"));
    const abas = [["perfil", "Meu perfil"], ["atividade", gestor() ? "Quem alterou o quê" : "Minhas alterações"], ...(gestor() ? [["acessos", "Acessos ao sistema"]] : [])];
    el.innerHTML = `<div class="cab"><div><div class="migalha">Conta</div><h1>${esc(p.nome_completo)}</h1></div></div>
      <div class="abas">${abas.map(([k, n]) => `<button data-a="${k}" class="${est.aba === k ? "on" : ""}">${esc(n)}</button>`).join("")}</div><div id="ab"></div>`;
    el.querySelector(".abas").addEventListener("click", (e) => { const a = e.target.dataset.a; if (a) { est.aba = a; S.PAGES.perfil(el).catch(S.erroEm(el)); } });
    const ab = el.querySelector("#ab");
    if (est.aba === "perfil") aba_perfil(ab, p);
    else if (est.aba === "atividade") await aba_atividade(ab);
    else await aba_acessos(ab);
  };

  let msgFoto = null;
  const TIPOS_OK = ["image/jpeg", "image/png", "image/webp"], MAX_MB = 8, MIN_PX = 100;
  function aba_perfil(ab, p) {
    ab.innerHTML = `<section class="painel"><h2><span>Dados da conta</span></h2><div class="corpo"><div class="perfil">
      <div class="foto-box"><span class="avatar gd" id="avg">${p.foto ? `<img src="${esc(p.foto)}" alt="">` : esc(S.iniciais(p.nome_completo))}</span>
        <div class="foto-acoes"><label class="btn sec pq" style="cursor:pointer" id="lf">${p.foto ? "Trocar foto" : "Enviar foto"}<input type="file" id="fi" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden></label>
        ${p.foto ? `<button class="btn sec pq" id="rf">Remover foto</button>` : ""}</div>
        <div class="foto-msg ${msgFoto?.ok ? "ok" : msgFoto ? "ruim" : ""}" id="e" role="status">${msgFoto ? esc(msgFoto.t) : ""}</div>
        <ul class="foto-regras"><li>Formatos: <b>JPG, PNG ou WebP</b></li><li>Tamanho: até <b>8 MB</b></li><li>Ideal: <b>quadrada, 400 × 400 px</b> ou mais</li><li>Rosto centralizado: cortamos o centro e reduzimos sozinhos</li><li>Não aceitamos HEIC (iPhone), GIF, PDF ou vídeo</li></ul></div>
      <div><dl><dt>Nome</dt><dd>${esc(p.nome_completo)}</dd><dt>E-mail de acesso</dt><dd>${esc(p.email || "–")}</dd><dt>Perfil</dt><dd>${esc(S.rotPerfil(p.perfil_acesso))}</dd>
        <dt>Equipe</dt><dd>${esc(p.equipe || "–")}</dd><dt>Funções</dt><dd>${esc(p.funcoes || "–")}</dd><dt>Entrada</dt><dd>${S.dt(p.data_entrada)}</dd>
        <dt>Último acesso</dt><dd>${p.ultimo_login ? esc(hora(p.ultimo_login)) : "–"}</dd></dl>
        <p style="margin-top:14px"><button class="btn sec" id="ts">Trocar senha</button></p></div></div></div></section><div id="pushbox"></div>`;
    ab.querySelector("#ts").addEventListener("click", () => S.telaTrocarSenha(false));
    S.push?.painel(ab.querySelector("#pushbox")).catch(() => {});   // notificações no celular (Gerente/Adm)
    const erro = (m, ok) => { msgFoto = m ? { t: m, ok: !!ok } : null; const e = ab.querySelector("#e"); e.textContent = m || ""; e.className = "foto-msg " + (m ? (ok ? "ok" : "ruim") : ""); };
    const atualizar = (foto, m) => { msgFoto = m ? { t: m, ok: true } : null; S.perfil = { ...S.perfil, foto }; S.pintarAvatar(foto, p.nome_completo); S.PAGES.perfil(document.getElementById("ct")).catch(() => {}); };
    ab.querySelector("#rf")?.addEventListener("click", async () => { try { await api("/perfil/foto", { method: "DELETE" }); atualizar(null, "Foto removida."); } catch (e) { erro(e.message); } });
    ab.querySelector("#fi").addEventListener("change", async (e) => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      erro("Enviando…", true);
      try { const foto = await reduzir(f); await api("/perfil/foto", { method: "POST", body: { foto } }); atualizar(foto, "Foto atualizada."); }
      catch (err) { erro(err.message || "Não consegui usar essa imagem."); }
    });
  }

  /** Recorta o centro em quadrado, reduz para 256 px e comprime (o arquivo original nunca sai do navegador). */
  function reduzir(arq) {
    return new Promise((ok, falha) => {
      const ext = (arq.name.split(".").pop() || "").toLowerCase();
      if (/heic|heif/.test(arq.type) || ["heic", "heif"].includes(ext)) return falha(new Error("Não foi possível: fotos HEIC (iPhone) não são aceitas. Envie em JPG ou PNG (no iPhone: Ajustes > Câmera > Formatos > Mais compatível)."));
      if (!TIPOS_OK.includes(arq.type)) return falha(new Error(`Não foi possível: o formato ${arq.type ? arq.type.replace("image/", "").toUpperCase() : ext.toUpperCase() || "desconhecido"} não é aceito. Use JPG, PNG ou WebP.`));
      if (arq.size > MAX_MB * 1048576) return falha(new Error(`Não foi possível: o arquivo tem ${(arq.size / 1048576).toFixed(1).replace(".", ",")} MB e o limite é ${MAX_MB} MB. Escolha uma foto menor.`));
      const url = URL.createObjectURL(arq), img = new Image();
      img.onerror = () => { URL.revokeObjectURL(url); falha(new Error("Não foi possível abrir a imagem: o arquivo parece corrompido ou não é uma foto válida. Tente outra.")); };
      img.onload = () => {
        URL.revokeObjectURL(url);
        if (Math.min(img.width, img.height) < MIN_PX) return falha(new Error(`Não foi possível: a imagem é muito pequena (${img.width}×${img.height}). O mínimo é ${MIN_PX}×${MIN_PX} px; o ideal é 400×400.`));
        const lado = Math.min(img.width, img.height), c = document.createElement("canvas"); c.width = c.height = 256;
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 256, 256);
        g.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256);
        for (const q of [0.85, 0.7, 0.55]) { const d = c.toDataURL("image/jpeg", q); if (d.length < 85000) return ok(d); }
        falha(new Error("Não foi possível: mesmo reduzida, a imagem ficou pesada demais. Escolha uma foto com menos detalhes."));
      };
      img.src = url;
    });
  }

  S.itemAtividade = (i) => {
      const alvo = i.contrato_id ? `<a href="#/venda/${i.contrato_id}">${esc(i.alvo)}</a>` : esc(i.alvo);
      const campos = i.campos.length ? `<div class="campos">${i.campos.map((c) => `<div>${esc(c.campo)}: ${c.de !== undefined ? `<span class="de">${esc(c.de)}</span> → ` : ""}<span class="para">${esc(c.para)}</span></div>`).join("")}</div>` : "";
      return `<div class="it"><div class="quando"><b>${esc(hora(i.em).slice(11))}</b>${esc(hora(i.em).slice(0, 10))}</div>
        <div><b>${esc(i.quem)}</b> ${ACAO[i.acao]} · ${esc(i.tabela)} ${alvo}${campos}</div></div>`;
  };

  async function aba_atividade(ab) {
    const pessoas = gestor() ? await api("/atividade/pessoas") : [];
    const qs = Object.entries({ pagina: est.pagina, usuario: est.usuario, tabela: est.tabela, acao: est.acao, de: est.de, ate: est.ate }).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    const j = await api("/atividade?" + qs);
    const paginas = Math.max(1, Math.ceil(j.total / j.tam));
    const item = S.itemAtividade;
    ab.innerHTML = `<div class="aviso">${gestor() ? "Tudo o que foi criado, alterado ou apagado em vendas, clientes, rota e cadastros, com quem fez e o valor antes e depois." : "Suas criações e alterações no sistema."} Registros da carga inicial aparecem como “Sistema / carga”.</div>
      <div class="filtros">${gestor() ? `<div class="campo" style="width:190px"><label>Pessoa</label><select id="fu"><option value="">Todas</option>${pessoas.map((x) => `<option value="${x.id}" ${String(x.id) === String(est.usuario) ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></div>` : ""}
        <div class="campo" style="width:160px"><label>O quê</label><select id="ft"><option value="">Tudo</option>${Object.entries(TABELAS).map(([k, v]) => `<option value="${k}" ${est.tabela === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="campo" style="width:130px"><label>Ação</label><select id="fc"><option value="">Todas</option>${Object.entries(ACAO).map(([k, v]) => `<option value="${k}" ${est.acao === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="campo" style="width:140px"><label>De</label><input type="date" id="fd" value="${est.de}"></div><div class="campo" style="width:140px"><label>Até</label><input type="date" id="fa" value="${est.ate}"></div>
        <button class="btn" id="ok">Filtrar</button><button class="btn sec" id="lp">Limpar</button><button class="btn sec" id="ex">Exportar CSV</button></div>
      <div class="ativ">${j.itens.map(item).join("") || `<div class="it"><div class="mut">Nenhuma alteração encontrada.</div></div>`}</div>
      <div class="pag"><button class="btn sec pq" id="an" ${j.pagina <= 1 ? "disabled" : ""}>‹ Anterior</button><span>${nf.format(j.total)} registro(s) · página ${j.pagina}/${paginas}</span><button class="btn sec pq" id="px" ${j.pagina >= paginas ? "disabled" : ""}>Próxima ›</button></div>`;
    const go = () => S.PAGES.perfil(document.getElementById("ct")).catch(S.erroEm(document.getElementById("ct")));
    ab.querySelector("#ok").addEventListener("click", () => { est.usuario = ab.querySelector("#fu")?.value || ""; est.tabela = ab.querySelector("#ft").value; est.acao = ab.querySelector("#fc").value; est.de = ab.querySelector("#fd").value; est.ate = ab.querySelector("#fa").value; est.pagina = 1; go(); });
    ab.querySelector("#lp").addEventListener("click", () => { Object.assign(est, { usuario: "", tabela: "", acao: "", de: "", ate: "", pagina: 1 }); go(); });
    ab.querySelector("#ex").addEventListener("click", () => S.baixar("/atividade/exportar?" + qs, "historico-alteracoes.csv").catch((e) => alert(e.message)));
    ab.querySelector("#an").addEventListener("click", () => { est.pagina--; go(); });
    ab.querySelector("#px").addEventListener("click", () => { est.pagina++; go(); });
  }

  async function aba_acessos(ab) {
    const rows = await api("/acessos");
    ab.innerHTML = `<div class="aviso">Últimos 100 eventos de conta: entradas, tentativas erradas, criação de acessos e trocas de senha.</div>` +
      tabela([{ t: "Quando", f: (r) => esc(hora(r.em)) }, { t: "Pessoa", k: "pessoa" }, { t: "Evento", f: (r) => esc(EVENTO[r.acao] || r.acao) }, { t: "Feito por", f: (r) => esc(r.feito_por || "a própria pessoa") }, { t: "Detalhe", k: "detalhe" }], rows);
  }
})();
