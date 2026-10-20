"use strict";
/* Premiação: apuração do mês (todos os perfis, cada um no seu alcance) e Plano do mês (gestor: metas e valores) */
(() => {
  const { esc, nf, api, painel, brl, modal } = S;
  const est = { mes: "" };
  const ROT = { BL: "Banda larga", STREAMING: "Bônus STREAMING marcado", MDU: "Bônus MDU (apartamento)", TV: "TV (single ou c/ linha nova)", TV_PLUS: "TV+ (base ou c/ banda larga)", CHIP_NOVA: "Chip linha nova", CHIP_MIGRACAO: "Chip migração", CHIP_PORT: "Chip portabilidade", DCC: "Bônus DCC (débito em conta)",
    BONUS_FPD_A: "Bônus FPD (faixa melhor)", BONUS_FPD_B: "Bônus FPD (faixa intermediária)", BONUS_DCC: "Bônus DCC da equipe", BONUS_VENDEDOR: "Bônus por vendedor com meta de BL" };
  const ORDEM = Object.keys(ROT);
  const mesRot = (m) => { const [a, n] = m.split("-"); return ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][+n - 1] + "/" + a; };
  const p1 = (x) => (x == null ? "–" : (x * 100).toFixed(1).replace(".", ",") + "%");
  const kpi = S.kpi;
  const seletorMes = (meses, atual, extra) => {
    const lista = new Set([...meses.map((m) => m.mes), atual, ...(extra || [])]);
    return `<div class="campo" style="width:190px"><label>Mês</label><select id="sm">${[...lista].sort().reverse().map((m) => `<option value="${m}" ${m === atual ? "selected" : ""}>${esc(mesRot(m))}${meses.find((x) => x.mes === m)?.fechado ? " (fechado)" : ""}</option>`).join("")}</select></div>`;
  };

  S.PAGES.comissao = async (el) => {
    const u = S.sessao.usuario, gestor = u.perfil === "gestor";
    const j = await api("/comissao" + (est.mes ? "?mes=" + est.mes : ""));
    est.mes = j.mes;
    const go = () => S.PAGES.comissao(el).catch(S.erroEm(el));
    const cab = `<div class="cab"><div><div class="migalha">Premiação</div><h1>Premiação de ${esc(mesRot(j.mes))}</h1></div><div class="acoes">${j.plano ? `<button class="btn sec" id="ex">Exportar CSV</button>` : ""}</div></div>`;
    if (!j.plano) {
      el.innerHTML = `${cab}<div class="filtros">${seletorMes(j.meses, j.mes)}</div><div class="aviso">Este mês ainda não tem plano de premiação. ${gestor ? `Crie em <a href="#/plano">Plano do mês</a>.` : "Fale com o gerente."}</div>`;
      el.querySelector("#sm").addEventListener("change", (e) => { est.mes = e.target.value; go(); });
      return;
    }
    if (document.body.classList.contains("app-vendedor") && u.perfil === "vendedor" && j.linhas.length === 1) return appPremio(el, j, go);
    const L = j.linhas, tot = L.reduce((s, l) => s + l.total, 0), bl = L.filter((l) => l.papel === "VENDEDOR").reduce((s, l) => s + l.bl, 0);
    const ok = L.filter((l) => l.meta_ok).length;
    const fp = L.filter((l) => l.fpd != null);
    const lider = L.some((l) => l.papel === "LIDER");
    el.innerHTML = `${cab}
      <div class="filtros">${seletorMes(j.meses, j.mes)}<div class="mut" style="padding-bottom:8px">${j.plano.fechado ? "Mês fechado: valores travados." : j.parcial ? "Mês em andamento: valores parciais. O FPD só existe depois que as primeiras faturas vencem." : "Valores calculados com as vendas instaladas do mês."}</div></div>
      <div class="kpis">${kpi(u.perfil === "vendedor" ? "Minha premiação" : "Total a pagar", brl(tot), u.perfil === "vendedor" ? "" : `${L.length} pessoa(s)`)}${u.perfil === "vendedor" ? "" : kpi("Banda larga (vendedores)", nf.format(bl), "instaladas no mês")}${kpi("Bateram a meta", `${ok}/${L.length}`, "meta mínima do plano")}${u.perfil === "vendedor" ? "" : kpi("FPD médio", fp.length ? p1(fp.reduce((s, l) => s + l.fpd, 0) / fp.length) : "–", fp.length ? `${fp.length} com FPD apurado` : "sem faturas apuradas")}</div>
      ${L.length > 1 ? `<div class="grade g2">${painel("Premiação por pessoa", CH.barrasH({ dados: [...L].sort((a, b) => b.total - a.total).slice(0, 15).map((l) => ({ rot: l.nome, y: l.total })), rotuloX: "R$", titulo: "Premiação por pessoa", fmt: (v) => "R$ " + nf.format(Math.round(v)) }), "Até 15 maiores valores do mês.")}
        ${painel("Faixa 1 × Faixa 2", (() => { const f2 = L.filter((l) => l.faixa === 2).length, f1 = L.length - f2; return CH.rosca({ centro: "pessoas", titulo: "Faixa 1 e Faixa 2", altura: 210, partes: [{ rot: `Faixa 2 (FPD ≤ ${(j.plano.fpd_faixa * 100).toFixed(0)}%)`, y: f2, cor: CH.COR.ok }, { rot: "Faixa 1", y: f1, cor: CH.COR.azul }] }); })(), "Sem FPD apurado a pessoa fica na Faixa 1.")}</div>` : ""}
      ${painel("Apuração", S.tabela([
        { t: "Pessoa", f: (l) => `<b>${esc(l.nome)}</b>${l.papel === "LIDER" ? ` <span class="tag">supervisor</span>` : ""}<div class="mut">${esc(l.equipe || "sem equipe")}</div>` },
        { t: "BL/meta", n: true, f: (l) => `${l.bl} / ${l.meta_bl}` },
        ...(L.some((l) => l.papel === "VENDEDOR") ? [{ t: "Chips", n: true, f: (l) => (l.papel === "LIDER" ? "–" : `${l.chips_mp} / ${l.meta_chip}`) }] : []),
        ...(u.perfil === "vendedor" ? [] : [{ t: "FPD", n: true, f: (l) => p1(l.fpd) }]),
        { t: "Faixa", f: (l) => `<span class="tag ${l.faixa === 2 ? "ok" : ""}" title="${esc(l.faixa_motivo)}">Faixa ${l.faixa}</span>${l.inelegivel ? ` <span class="tag ruim">inelegível</span>` : l.bloqueio.length ? ` <span class="tag alerta" title="${esc(l.bloqueio.join("; "))}">restrição</span>` : ""}` },
        { t: "Base", n: true, f: (l) => brl(l.base) }, { t: "Bônus", n: true, f: (l) => brl(l.bonus_total) },
        { t: "Ajuste", n: true, f: (l) => (l.ajuste ? brl(l.ajuste) : "–") }, { t: "Total", n: true, f: (l) => `<b>${brl(l.total)}</b>` },
      ], [...L].sort((a, b) => b.total - a.total), { clic: true }) + (lider ? `<div class="nota">Supervisor: premiação sobre tudo que a equipe conectou no mês.</div>` : ""))}`;
    el.querySelector("#sm").addEventListener("change", (e) => { est.mes = e.target.value; go(); });
    el.querySelector("#ex").addEventListener("click", () => S.baixar("/exportar/comissao?mes=" + j.mes, `premiacao-${j.mes}.csv`).catch((e) => alert(e.message)));
    const ordenada = [...L].sort((a, b) => b.total - a.total);
    el.querySelectorAll("tr.clic").forEach((tr) => tr.addEventListener("click", () => detalhe(ordenada[+tr.dataset.i], j, go)));
  };

  /* app do vendedor: a premiação em um cartão grande, fácil de ler no celular */
  function appPremio(el, j, go) {
    const l = j.linhas[0], pc = (a, b) => (b ? Math.min(100, (a / b) * 100) : 0);
    const st = l.inelegivel ? "ruim" : l.meta_ok ? "ok" : "";
    const tile = (r, v, d) => `<div class="ap-tile"><div class="r">${r}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    el.innerHTML = `<div class="ap-cab"><h1>Minha premiação</h1><span>${esc(mesRot(j.mes))}</span></div>
      <div class="ap-mes-sel">${seletorMes(j.meses, j.mes)}</div>
      <section class="ap-hero ${st}"><div class="ap-rot" style="margin-top:0">${j.plano.fechado ? "Premiação do mês" : "Premiação até agora"}</div>
        <div class="ap-big"><b class="ap-rs">${brl(l.total)}</b></div>
        <div class="ap-msg">${l.inelegivel ? "Neste mês você ficou inelegível. Toque em “Ver detalhes” para entender." : l.meta_ok ? "Meta mínima batida. Continue vendendo para aumentar a premiação!" : `Faltam ${nf.format(Math.max(0, l.meta_bl - l.bl))} BL para a meta mínima.`}${j.plano.fechado ? "" : " Valores parciais, o mês ainda está em andamento."}</div>
        <div class="ap-metas"><div><span>Banda larga</span><b>${nf.format(l.bl)} <small>de ${nf.format(l.meta_bl)}</small></b><div class="ap-barra fina"><i class="r" style="width:${pc(l.bl, l.meta_bl)}%"></i></div></div>
          <div><span>Chips</span><b>${nf.format(l.chips_mp)} <small>de ${nf.format(l.meta_chip)}</small></b><div class="ap-barra fina"><i class="r" style="width:${pc(l.chips_mp, l.meta_chip)}%"></i></div></div></div></section>
      <div class="ap-tiles">${tile("Base", brl(l.base), "pelas vendas instaladas")}${tile("Bônus", brl(l.bonus_total), "DCC e metas")}${tile("Meta mínima", l.meta_ok ? "Batida" : nf.format(Math.max(0, l.meta_bl - l.bl)), l.meta_ok ? "parabéns!" : "BL para bater")}${tile("Ajuste", l.ajuste ? brl(l.ajuste) : "–", "lançado pelo gerente")}</div>
      <button class="btn ap-cta" id="dt">Ver detalhes da premiação</button>`;
    el.querySelector("#sm").addEventListener("change", (e) => { est.mes = e.target.value; go(); });
    el.querySelector("#dt").addEventListener("click", () => detalhe(l, j, go));
  }

  function detalhe(l, j, recarregar) {
    const semVer = S.sessao.vercomo;
    const itens = l.itens.length ? S.tabela([{ t: "Item", f: (x) => esc(x.nome) }, { t: "Qtd", n: true, f: (x) => x.qtd }, { t: "Valor unit.", n: true, f: (x) => brl(x.unit) }, { t: "Valor", n: true, f: (x) => brl(x.valor) }], l.itens) : `<p class="mut">Nenhuma venda conectada no mês.</p>`;
    const bonus = l.bonus.length ? S.tabela([{ t: "Bônus", f: (x) => esc(x.nome) }, { t: "Situação", f: (x) => `<span class="tag ${x.ok ? "ok" : ""}">${x.ok ? "ganhou" : "não"}</span>` }, { t: "Regra", f: (x) => `<span class="mut">${esc(x.obs)}</span>` }, { t: "Valor", n: true, f: (x) => brl(x.valor) }], l.bonus) : "";
    const form = l.editavel && !semVer ? `<h3 style="margin:14px 0 6px">Ajustar</h3>
      <div class="filtros" style="border:0;padding:0">
        <div class="campo" style="width:110px"><label>Meta BL</label><input type="number" min="0" id="mb" value="${l.meta_bl_personalizada ? l.meta_bl : ""}" placeholder="${l.meta_bl}"></div>
        ${l.papel === "VENDEDOR" ? `<div class="campo" style="width:110px"><label>Meta chips</label><input type="number" min="0" id="mc" value="${l.meta_chip_personalizada ? l.meta_chip : ""}" placeholder="${l.meta_chip}"></div>` : ""}
        <div class="campo" style="width:120px"><label>Ajuste (R$)</label><input type="number" step="0.01" id="aj" value="${l.ajuste || ""}"></div>
        <div class="campo" style="flex:1;min-width:180px"><label>Motivo do ajuste</label><input id="mo" maxlength="300" value="${esc(l.motivo || "")}"></div>
        <label class="mut" style="display:flex;gap:6px;align-items:center;padding-bottom:9px;white-space:nowrap"><input type="checkbox" id="pp" ${l.pap_ok ? "checked" : ""}> PAP Tools ok</label></div>
      <div class="mut">Meta vazia usa a do plano. Sem PAP Tools ok, a pessoa não recebe bônus. Tudo fica na Central de alterações.</div>` : "";
    const m = modal(l.nome + (l.papel === "LIDER" ? " (supervisor)" : ""), `<div class="mut" style="margin-bottom:8px">${esc(l.equipe || "sem equipe")} · ${esc(l.faixa_motivo)}${l.meses_casa == null ? "" : ` · ${l.meses_casa + 1}º mês de casa`}</div>
      ${l.bloqueio.length ? `<div class="aviso">${l.bloqueio.map(esc).join("<br>")}</div>` : ""}${itens}<div style="height:8px"></div>${bonus}
      <p style="text-align:right;margin:10px 0 0">Base ${brl(l.base)} + bônus ${brl(l.bonus_total)} ${l.ajuste ? `+ ajuste ${brl(l.ajuste)}` : ""} = <b style="font-size:16px">${brl(l.total)}</b></p>${form}`,
      `<button class="btn sec" id="fx">Fechar</button>${form ? `<button class="btn" id="sv">Salvar ajuste</button>` : ""}`);
    Object.assign(m.querySelector(".caixa").style, { width: "min(760px, 94vw)", maxWidth: "94vw" });
    m.querySelector("#fx").addEventListener("click", () => m.remove());
    m.querySelector("#sv")?.addEventListener("click", async () => {
      try {
        await api("/comissao/pessoa", { method: "PUT", body: { mes: j.mes, usuario_id: l.usuario_id, papel: l.papel, meta_bl: m.querySelector("#mb").value, meta_chip: m.querySelector("#mc")?.value ?? null, ajuste: m.querySelector("#aj").value, motivo: m.querySelector("#mo").value.trim(), pap_ok: m.querySelector("#pp").checked } });
        m.remove(); recarregar();
      } catch (e) { alert(e.message); }
    });
  }

  /* ---------- Plano do mês (gestor) ---------- */
  const PARAMS = [
    ["meta_bl", "Meta mínima de BL (por vendedor; supervisor = × HC)", "n"], ["meta_chip", "Meta de chips (migração ou portabilidade)", "n"],
    ["fpd_faixa", "FPD máximo para Faixa 2 (%)", "p"], ["fpd_inelegivel", "FPD a partir do qual não é elegível (%)", "p"],
    ["fpd_bonus_a", "FPD para o bônus (vendedor e supervisor) (%)", "p"], ["fpd_bonus_b", "FPD para o bônus menor do supervisor (%)", "p"],
    ["dcc_pct_lider", "% de DCC da equipe para o bônus do supervisor", "p"], ["bl_bonus_vendedor", "BL do vendedor que rende bônus ao supervisor", "n"],
    ["min_contratos_fpd", "Mínimo de BL com FPD apurado (bônus do vendedor)", "n"], ["meses_so_faixa1", "Meses de casa que só recebem Faixa 1", "n"],
  ];
  S.PAGES.plano = async (el) => {
    if (S.sessao.usuario.perfil !== "gestor") { el.innerHTML = `<div class="aviso erro">Somente o gerente ou o administrador edita o plano de premiação.</div>`; return; }
    const j = await api("/comissao/plano" + (est.mesPlano ? "?mes=" + est.mesPlano : ""));
    if (!est.mesPlano) { est.mesPlano = j.sugerido; return S.PAGES.plano(el); }
    est.mesPlano = j.mes;
    const go = () => S.PAGES.plano(el).catch(S.erroEm(el));
    const cab = `<div class="cab"><div><div class="migalha">Premiação</div><h1>Plano de ${esc(mesRot(j.mes))}</h1></div></div>`;
    const sel = `<div class="filtros">${seletorMes(j.meses, j.mes, [j.sugerido])}<div class="mut" style="padding-bottom:8px">O mês seguinte já vem sugerido. Metas e valores valem só para o mês escolhido.</div></div>`;
    const ligar = () => el.querySelector("#sm").addEventListener("change", (e) => { est.mesPlano = e.target.value; go(); });
    if (!j.existe) {
      const ant = j.meses.filter((m) => m.mes < j.mes)[0];
      el.innerHTML = `${cab}${sel}<div class="aviso">Este mês ainda não tem plano. ${ant ? `Vou copiar metas e valores de <b>${esc(mesRot(ant.mes))}</b>; depois é só ajustar.` : "Começa com os valores padrão vazios."}</div><button class="btn" id="cr">Criar plano de ${esc(mesRot(j.mes))}</button>`;
      ligar();
      el.querySelector("#cr").addEventListener("click", async () => { try { await api("/comissao/plano", { method: "POST", body: { mes: j.mes } }); go(); } catch (e) { alert(e.message); } });
      return;
    }
    const ed = j.editavel, p = j.plano, dis = ed ? "" : "disabled";
    const tabela = (papel, titulo, nota) => {
      const t = j.tabela[papel], itens = ORDEM.filter((i) => t[i]);
      const norm = itens.filter((i) => !i.startsWith("BONUS_")), bon = itens.filter((i) => i.startsWith("BONUS_"));
      const lin = (i, bonus) => `<tr><td>${esc(ROT[i])}</td>${bonus ? `<td class="mut num">–</td>` : `<td class="num"><input class="mini" type="number" step="0.01" min="0" data-p="${papel}" data-i="${i}" data-f="faixa1" value="${t[i].faixa1}" ${dis}></td>`}<td class="num"><input class="mini" type="number" step="0.01" min="0" data-p="${papel}" data-i="${i}" data-f="faixa2" value="${t[i].faixa2}" ${dis}></td></tr>`;
      return painel(titulo, `<div class="tab"><table><thead><tr><th>Item</th><th class="num">Faixa 1 (R$)</th><th class="num">Faixa 2 (R$)</th></tr></thead><tbody>${norm.map((i) => lin(i)).join("")}${bon.length ? `<tr><td colspan="3" class="mut"><b>Bônus</b> (valor único, na coluna Faixa 2)</td></tr>${bon.map((i) => lin(i, true)).join("")}` : ""}</tbody></table></div>`, nota);
    };
    el.innerHTML = `${cab}${sel}
      ${p.fechado ? `<div class="aviso">Plano fechado: nada pode ser alterado. <button class="btn sec pq" id="ro">Reabrir</button></div>` : ""}
      ${painel("Metas e regras do mês", `<div class="grade-form">${PARAMS.map(([k, n, t]) => `<div class="campo"><label>${esc(n)}</label><input type="number" step="${t === "p" ? "0.1" : "1"}" min="0" data-par="${k}" data-t="${t}" value="${t === "p" ? +(p[k] * 100).toFixed(2) : p[k]}" ${dis}></div>`).join("")}</div>
        <div class="campo" style="margin-top:8px"><label>Observação</label><input data-par="observacao" data-t="s" maxlength="300" value="${esc(p.observacao || "")}" ${dis}></div>`, "Faixa 2 quando FPD ≤ limite; Faixa 1 acima disso.")}
      <div class="grade g2">${tabela("VENDEDOR", "Tabela do vendedor", "PLUS Bônus DCC vale por venda de banda larga com débito em conta.")}${tabela("LIDER", "Tabela do supervisor", "Bônus de FPD não somam: vale o maior que a equipe alcançar.")}</div>
      ${ed ? `<div style="display:flex;gap:8px;margin-top:6px"><button class="btn" id="sv">Salvar plano</button><button class="btn sec" id="fc">Fechar o mês</button></div>` : ""}`;
    ligar();
    el.querySelector("#ro")?.addEventListener("click", async () => { await api(`/comissao/plano/${j.mes}/reabrir`, { method: "POST" }); go(); });
    el.querySelector("#fc")?.addEventListener("click", async () => { if (confirm("Fechar o mês? Ninguém consegue ajustar até você reabrir.")) { await api(`/comissao/plano/${j.mes}/fechar`, { method: "POST" }); go(); } });
    el.querySelector("#sv")?.addEventListener("click", async () => {
      const parametros = {}, tabela = { VENDEDOR: {}, LIDER: {} };
      el.querySelectorAll("[data-par]").forEach((i) => { parametros[i.dataset.par] = i.dataset.t === "s" ? i.value : i.dataset.t === "p" ? Number(i.value) / 100 : Number(i.value); });
      el.querySelectorAll("[data-i]").forEach((i) => { (tabela[i.dataset.p][i.dataset.i] ||= { faixa1: 0, faixa2: 0 })[i.dataset.f] = Number(i.value); });
      try { await api("/comissao/plano/" + j.mes, { method: "PUT", body: { parametros, tabela } }); go(); el.insertAdjacentHTML("afterbegin", `<div class="aviso">Plano salvo.</div>`); } catch (e) { alert(e.message); }
    });
  };
})();
