import { Router } from "express";
import { pool } from "./db.js";
import { exigePerfil } from "./auth.js";
import { calcular, calcularPadrao, somar, mesesDeCasa, ITENS } from "./comissao.js";

const r = Router();
const TODOS = ["gestor", "coordenador", "lider", "vendedor"];
const erro = (status, msg) => Object.assign(new Error(msg), { status });

const mesDe = (s) => {
  if (s == null || s === "") { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; }
  if (!/^\d{4}-\d{2}(-01)?$/.test(String(s))) throw erro(400, "Mês inválido (use AAAA-MM).");
  return String(s).slice(0, 7) + "-01";
};

const PARAMS = ["meta_bl", "meta_chip", "fpd_faixa", "fpd_inelegivel", "fpd_bonus_a", "fpd_bonus_b", "dcc_pct_lider", "bl_bonus_vendedor", "min_contratos_fpd", "meses_so_faixa1", "observacao"];
const PARAM_NUM = PARAMS.filter((p) => p !== "observacao");

async function carregarPlano(cx, mes) {
  const p = (await cx.query("SELECT *, to_char(mes,'YYYY-MM') AS mes_ref FROM comissao_plano WHERE mes = $1", [mes])).rows[0];
  if (!p) return null;
  const t = (await cx.query("SELECT papel, item, faixa1, faixa2 FROM comissao_tabela WHERE plano_id = $1 ORDER BY id", [p.id])).rows;
  const tab = { VENDEDOR: {}, LIDER: {} };
  for (const x of t) tab[x.papel][x.item] = { faixa1: x.faixa1, faixa2: x.faixa2 };
  return { plano: p, tab };
}

/** Equipes que o usuário enxerga (null = todas). */
async function equipesDoUsuario(u) {
  if (u.perfil === "gestor") return null;
  if (u.perfil === "vendedor") return [];
  const col = u.perfil === "coordenador" ? "coordenador_id" : "lider_id";
  return (await pool.query(`SELECT id FROM equipe WHERE ${col} = $1`, [u.id])).rows.map((x) => x.id);
}

const SQL_AGG = `
SELECT b.vendedor_id, b.equipe_id,
  count(*) FILTER (WHERE b.conectado AND b.tem_bl)                                                         AS bl,
  count(*) FILTER (WHERE b.status_venda = 'PENDENTE' AND b.tem_bl)                                         AS bl_pend,
  count(*) FILTER (WHERE b.conectado AND b.tem_bl AND EXISTS (SELECT 1 FROM contrato_item i JOIN produto p ON p.id = i.produto_id WHERE i.contrato_id = b.contrato_id AND p.categoria = 'STREAMING')) AS mplay,
  count(*) FILTER (WHERE b.conectado AND b.tem_bl AND b.tipo_imovel = 'APT')                               AS mdu,
  count(*) FILTER (WHERE b.conectado AND b.tem_tv AND NOT (b.tem_bl OR b.tipo_contrato = 'BASE'))          AS tv,
  count(*) FILTER (WHERE b.conectado AND b.tem_tv AND (b.tem_bl OR b.tipo_contrato = 'BASE'))              AS tv_plus,
  coalesce(sum(ch.nova) FILTER (WHERE b.conectado), 0)                                                     AS chip_nova,
  coalesce(sum(ch.mig)  FILTER (WHERE b.conectado), 0)                                                     AS chip_mig,
  coalesce(sum(ch.port) FILTER (WHERE b.conectado), 0)                                                     AS chip_port,
  count(*) FILTER (WHERE b.conectado AND b.tem_bl AND b.forma_pagamento = 'DCC')                           AS dcc,
  count(*) FILTER (WHERE b.conectado AND (SELECT count(*) FROM contrato_item mi WHERE mi.contrato_id = b.contrato_id) > 1) AS multi,
  count(*) FILTER (WHERE b.conectado AND b.tem_bl AND f.fpd = 'OK')                                        AS fpd_ok,
  count(*) FILTER (WHERE b.conectado AND b.tem_bl AND f.fpd = 'NAO_OK')                                    AS fpd_nao_ok
FROM v_contrato_base b
LEFT JOIN LATERAL (
  SELECT sum(i.quantidade) FILTER (WHERE i.tipo_adesao = 'LINHA_NOVA')    AS nova,
         sum(i.quantidade) FILTER (WHERE i.tipo_adesao = 'MIGRACAO')      AS mig,
         sum(i.quantidade) FILTER (WHERE i.tipo_adesao = 'PORTABILIDADE') AS port
    FROM contrato_item i JOIN produto p ON p.id = i.produto_id
   WHERE i.contrato_id = b.contrato_id AND p.categoria = 'MOVEL') ch ON true
LEFT JOIN LATERAL (SELECT x.fpd FROM v_fatura_fpd x WHERE x.contrato_id = b.contrato_id LIMIT 1) f ON true
WHERE b.mes_venda = $1 AND b.origem IS DISTINCT FROM 'CARROSSEL'   -- venda Carrossel não conta na premiação
GROUP BY b.vendedor_id, b.equipe_id`;

/** Calcula todas as linhas do mês (sem filtrar por quem está olhando). */
async function calcularMes(mes) {
  const cp = await carregarPlano(pool, mes);
  if (!cp) return null;
  const { plano, tab } = cp;
  const [agg, eq, mem, us, aj] = await Promise.all([
    pool.query(SQL_AGG, [mes]),
    pool.query("SELECT id, nome, lider_id, coordenador_id FROM equipe"),
    pool.query(`SELECT DISTINCT m.usuario_id, m.equipe_id FROM equipe_membro m
                 WHERE m.inicio < ($1::date + interval '1 month') AND (m.fim IS NULL OR m.fim >= $1::date)`, [mes]),
    pool.query("SELECT id, nome_completo, data_entrada, ativo, perfil_acesso, premiacao_tabela FROM usuario WHERE perfil_acesso <> 'master'"),
    pool.query("SELECT * FROM comissao_pessoa WHERE mes = $1", [mes]),
  ]);
  const equipes = Object.fromEntries(eq.rows.map((e) => [e.id, e]));
  const usuarios = Object.fromEntries(us.rows.map((u) => [u.id, u]));
  const ajuste = {}; for (const a of aj.rows) ajuste[`${a.papel}:${a.usuario_id}`] = a;
  const lideres = new Set(eq.rows.map((e) => e.lider_id).filter(Boolean));

  // vendedor -> equipes e totais
  const porVend = {}, equipeDoVend = {};
  for (const a of agg.rows) {
    porVend[a.vendedor_id] = somar(porVend[a.vendedor_id] || {}, a);
    (equipeDoVend[a.vendedor_id] ||= new Set()).add(a.equipe_id);
  }
  for (const m of mem.rows) {
    const u = usuarios[m.usuario_id]; if (!u || !u.ativo) continue;
    (equipeDoVend[m.usuario_id] ||= new Set()).add(m.equipe_id);
    porVend[m.usuario_id] ||= {};
  }
  const nomeEq = (s) => [...s].filter(Boolean).map((i) => equipes[i]?.nome).filter(Boolean).join(", ");
  const linhas = [];

  const cfgDe = (papel, uid, extra) => {
    const a = ajuste[`${papel}:${uid}`] || {};
    return { plano, papel, meses_casa: mesesDeCasa(usuarios[uid]?.data_entrada, mes), pap_ok: a.pap_ok ?? true, ajuste: a.ajuste ?? 0,
             meta_bl: a.meta_bl ?? plano.meta_bl * (extra?.hc ?? 1), meta_chip: a.meta_chip ?? plano.meta_chip,
             meta_bl_personalizada: a.meta_bl != null, meta_chip_personalizada: a.meta_chip != null, motivo: a.motivo || null, ...extra };
  };

  for (const [vid, a] of Object.entries(porVend)) {
    const uid = +vid, u = usuarios[uid]; if (!u || lideres.has(uid)) continue;
    const cfg = cfgDe("VENDEDOR", uid);
    const c = usuarios[uid].premiacao_tabela === "PROPRIA" ? calcular(a, tab.VENDEDOR, cfg) : calcularPadrao(a, cfg);
    linhas.push({ usuario_id: uid, nome: u.nome_completo, papel: "VENDEDOR", equipes: [...equipeDoVend[uid]].filter(Boolean), equipe: nomeEq(equipeDoVend[uid]),
      bl_pend: +a.bl_pend || 0, contagem: pegar(a), pap_ok: cfg.pap_ok, motivo: cfg.motivo, meta_bl_personalizada: cfg.meta_bl_personalizada, meta_chip_personalizada: cfg.meta_chip_personalizada,
      data_entrada: u.data_entrada, meses_casa: cfg.meses_casa, ...c });
  }
  // supervisores: tudo que a(s) equipe(s) dele produziu
  for (const lid of lideres) {
    const u = usuarios[lid]; if (!u) continue;
    const minhas = eq.rows.filter((e) => e.lider_id === lid).map((e) => e.id);
    let tot = {}, blPend = 0; const vend = new Set(), bl20 = new Set(), blPorVend = {};
    for (const a of agg.rows) if (minhas.includes(a.equipe_id)) {
      tot = somar(tot, a); blPend += +a.bl_pend || 0;
      blPorVend[a.vendedor_id] = (blPorVend[a.vendedor_id] || 0) + (+a.bl || 0);
      if (a.vendedor_id !== lid) vend.add(a.vendedor_id);
    }
    for (const m of mem.rows) if (minhas.includes(m.equipe_id) && m.usuario_id !== lid && usuarios[m.usuario_id]?.ativo) vend.add(m.usuario_id);
    for (const v of vend) if ((blPorVend[v] || 0) >= plano.bl_bonus_vendedor) bl20.add(v);
    const hc = Math.max(vend.size, 1);
    const cfg = cfgDe("LIDER", lid, { hc, vendedores_bl20: bl20.size });
    const c = calcular(tot, tab.LIDER, cfg);
    linhas.push({ usuario_id: lid, nome: u.nome_completo, papel: "LIDER", equipes: minhas, equipe: nomeEq(new Set(minhas)), hc: vend.size, bl_pend: blPend, contagem: pegar(tot),
      pap_ok: cfg.pap_ok, motivo: cfg.motivo, meta_bl_personalizada: cfg.meta_bl_personalizada, data_entrada: u.data_entrada, meses_casa: cfg.meses_casa, ...c });
  }
  return { plano, tab, linhas, equipes };
}
const pegar = (a) => Object.fromEntries(ITENS.map(([, , k]) => [k, +a[k] || 0]));

/** Filtra as linhas pelo que o usuário pode ver e marca o que ele pode ajustar. */
function visiveis(u, calc, minhasEquipes) {
  const meu = new Set(minhasEquipes || []);
  const dono = (l) => l.equipes.some((e) => meu.has(e));
  let out;
  if (u.perfil === "gestor") out = calc.linhas;
  else if (u.perfil === "vendedor") out = calc.linhas.filter((l) => l.papel === "VENDEDOR" && l.usuario_id === u.id);
  else out = calc.linhas.filter((l) => dono(l) && (u.perfil === "coordenador" || l.papel === "VENDEDOR" || l.usuario_id === u.id));
  const fechado = calc.plano.fechado;
  return out.map((l) => ({ ...l, editavel: !fechado && podeAjustar(u, l, meu, dono(l)) }));
}
function podeAjustar(u, l, meu, dono) {
  if (l.usuario_id === u.id) return false;
  if (u.perfil === "gestor") return true;
  if (u.perfil === "coordenador") return dono;
  if (u.perfil === "lider") return l.papel === "VENDEDOR" && dono;
  return false;
}

// GET /api/comissao?mes=AAAA-MM
r.get("/comissao", exigePerfil(...TODOS), async (req, res) => {
  const mes = mesDe(req.query.mes);
  const calc = await calcularMes(mes);
  const meses = (await pool.query("SELECT to_char(mes,'YYYY-MM') AS mes, fechado FROM comissao_plano ORDER BY mes DESC")).rows;
  if (!calc) return res.json({ mes: mes.slice(0, 7), plano: null, meses, linhas: [] });
  const minhas = await equipesDoUsuario(req.user);
  const linhas = visiveis(req.user, calc, minhas);
  const papel = req.user.perfil === "vendedor" ? "VENDEDOR" : null;
  const { id: _i, ...plano } = calc.plano;
  const tabela = papel ? { VENDEDOR: calc.tab.VENDEDOR } : req.user.perfil === "lider" ? calc.tab : calc.tab;
  res.json({ mes: mes.slice(0, 7), plano, tabela, meses, linhas, parcial: mes >= new Date().toISOString().slice(0, 7) + "-01" });
});

// GET /api/comissao/plano?mes=  (o gestor edita; os demais só leem os valores)
r.get("/comissao/plano", exigePerfil(...TODOS), async (req, res) => {
  const mes = mesDe(req.query.mes);
  const cp = await carregarPlano(pool, mes);
  const meses = (await pool.query("SELECT to_char(mes,'YYYY-MM') AS mes, fechado FROM comissao_plano ORDER BY mes DESC")).rows;
  const sugerido = (() => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1)).toISOString().slice(0, 7); })();
  if (!cp) return res.json({ mes: mes.slice(0, 7), existe: false, meses, sugerido });
  const { id: _i, ...plano } = cp.plano;
  res.json({ mes: mes.slice(0, 7), existe: true, plano, tabela: cp.tab, meses, sugerido, editavel: req.user.perfil === "gestor" && !plano.fechado });
});

async function transacao(req, fn) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.usuario_id', $1, true)", [String(req.user.id)]);
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}

// POST /api/comissao/plano {mes, copiar_de?}: cria o plano do mês (copia o anterior, se houver)
r.post("/comissao/plano", exigePerfil("gestor"), async (req, res) => {
  const mes = mesDe(req.body.mes);
  await transacao(req, async (c) => {
    if ((await c.query("SELECT 1 FROM comissao_plano WHERE mes = $1", [mes])).rowCount) throw erro(409, "Esse mês já tem plano.");
    const orig = req.body.copiar_de ? mesDe(req.body.copiar_de)
      : (await c.query("SELECT mes FROM comissao_plano WHERE mes < $1 ORDER BY mes DESC LIMIT 1", [mes])).rows[0]?.mes;
    const novo = (await c.query("INSERT INTO comissao_plano (mes) VALUES ($1) RETURNING id", [mes])).rows[0].id;
    if (orig) {
      const o = (await c.query("SELECT * FROM comissao_plano WHERE mes = $1", [orig])).rows[0];
      if (o) {
        await c.query(`UPDATE comissao_plano SET ${PARAMS.map((p, i) => `${p} = $${i + 2}`).join(", ")} WHERE id = $1`, [novo, ...PARAMS.map((p) => o[p])]);
        await c.query("INSERT INTO comissao_tabela (plano_id, papel, item, faixa1, faixa2) SELECT $1, papel, item, faixa1, faixa2 FROM comissao_tabela WHERE plano_id = $2", [novo, o.id]);
      }
    }
  });
  res.status(201).json({ ok: true, mes: mes.slice(0, 7) });
});

// PUT /api/comissao/plano/:mes {parametros:{}, tabela:{VENDEDOR:{BL:{faixa1,faixa2}}}}
r.put("/comissao/plano/:mes", exigePerfil("gestor"), async (req, res) => {
  const mes = mesDe(req.params.mes), b = req.body || {};
  await transacao(req, async (c) => {
    const p = (await c.query("SELECT id, fechado FROM comissao_plano WHERE mes = $1 FOR UPDATE", [mes])).rows[0];
    if (!p) throw erro(404, "Plano não encontrado.");
    if (p.fechado) throw erro(409, "Plano fechado. Reabra para editar.");
    const par = b.parametros || {}, sets = [], vals = [p.id];
    for (const k of PARAMS) if (k in par) {
      let v = par[k];
      if (PARAM_NUM.includes(k)) { v = Number(v); if (!Number.isFinite(v) || v < 0) throw erro(400, `Valor inválido em ${k}.`); }
      else v = v == null ? null : String(v).slice(0, 300);
      vals.push(v); sets.push(`${k} = $${vals.length}`);
    }
    if (sets.length) await c.query(`UPDATE comissao_plano SET ${sets.join(", ")} WHERE id = $1`, vals);
    for (const [papel, itens] of Object.entries(b.tabela || {})) {
      if (!["VENDEDOR", "LIDER"].includes(papel)) throw erro(400, "Papel inválido.");
      for (const [item, v] of Object.entries(itens)) {
        const f1 = Number(v.faixa1), f2 = Number(v.faixa2);
        if (!Number.isFinite(f1) || !Number.isFinite(f2) || f1 < 0 || f2 < 0 || f1 > 100000 || f2 > 100000) throw erro(400, `Valor inválido em ${item}.`);
        const x = await c.query("UPDATE comissao_tabela SET faixa1 = $4, faixa2 = $5 WHERE plano_id = $1 AND papel = $2 AND item = $3", [p.id, papel, item, f1, f2]);
        if (!x.rowCount) throw erro(400, `Item desconhecido: ${item}.`);
      }
    }
  });
  res.json({ ok: true });
});

// POST /api/comissao/plano/:mes/fechar | reabrir
for (const [acao, val] of [["fechar", true], ["reabrir", false]]) {
  r.post(`/comissao/plano/:mes/${acao}`, exigePerfil("gestor"), async (req, res) => {
    const mes = mesDe(req.params.mes);
    const n = await transacao(req, async (c) => (await c.query("UPDATE comissao_plano SET fechado = $2 WHERE mes = $1", [mes, val])).rowCount);
    if (!n) return res.status(404).json({ erro: "Plano não encontrado." });
    res.json({ ok: true });
  });
}

// PUT /api/comissao/pessoa {mes, usuario_id, papel, meta_bl, meta_chip, pap_ok, ajuste, motivo}
r.put("/comissao/pessoa", exigePerfil("gestor", "coordenador", "lider"), async (req, res) => {
  const b = req.body || {}, mes = mesDe(b.mes), uid = parseInt(b.usuario_id, 10), papel = b.papel;
  if (!uid || !["VENDEDOR", "LIDER"].includes(papel)) throw erro(400, "Pessoa ou papel inválido.");
  const calc = await calcularMes(mes);
  if (!calc) throw erro(404, "Esse mês não tem plano de premiação.");
  const minhas = await equipesDoUsuario(req.user);
  const linha = visiveis(req.user, calc, minhas).find((l) => l.usuario_id === uid && l.papel === papel);
  if (!linha) throw erro(403, "Você não enxerga essa pessoa.");
  if (calc.plano.fechado) throw erro(409, "Mês fechado. Peça ao gerente para reabrir.");
  if (!linha.editavel) throw erro(403, "Você não pode ajustar a premiação desta pessoa.");
  const inteiro = (x) => (x === "" || x == null ? null : Number.isInteger(+x) && +x >= 0 && +x <= 10000 ? +x : (() => { throw erro(400, "Meta inválida."); })());
  const aj = b.ajuste === "" || b.ajuste == null ? 0 : Number(b.ajuste);
  if (!Number.isFinite(aj) || Math.abs(aj) > 100000) throw erro(400, "Ajuste inválido.");
  const motivo = b.motivo ? String(b.motivo).slice(0, 300) : null;
  if (aj !== 0 && !motivo) throw erro(400, "Informe o motivo do ajuste.");
  await transacao(req, (c) => c.query(
    `INSERT INTO comissao_pessoa (mes, usuario_id, papel, meta_bl, meta_chip, pap_ok, ajuste, motivo, atualizado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (mes, usuario_id, papel) DO UPDATE SET meta_bl = EXCLUDED.meta_bl, meta_chip = EXCLUDED.meta_chip, pap_ok = EXCLUDED.pap_ok,
       ajuste = EXCLUDED.ajuste, motivo = EXCLUDED.motivo, atualizado_por = EXCLUDED.atualizado_por`,
    [mes, uid, papel, inteiro(b.meta_bl), papel === "LIDER" ? null : inteiro(b.meta_chip), b.pap_ok !== false, aj, motivo, req.user.id]));
  res.json({ ok: true });
});

// GET /api/exportar/comissao?mes=  (CSV do que o usuário enxerga)
r.get("/exportar/comissao", exigePerfil(...TODOS), async (req, res) => {
  const mes = mesDe(req.query.mes);
  const calc = await calcularMes(mes);
  if (!calc) throw erro(404, "Esse mês não tem plano de premiação.");
  const linhas = visiveis(req.user, calc, await equipesDoUsuario(req.user));
  const cel = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const n = (v) => String(v ?? "").replace(".", ",");
  const cab = ["Pessoa", "Papel", "Equipe", "BL", "Meta BL", "Chips migr./port.", "FPD %", "Faixa", "Base R$", "Bônus R$", "Ajuste R$", "Total R$", "Observação"];
  const rows = linhas.map((l) => [l.nome, l.papel === "LIDER" ? "Supervisor" : "Vendedor", l.equipe, l.bl, l.meta_bl, l.chips_mp, l.fpd == null ? "" : (l.fpd * 100).toFixed(1), l.faixa,
    l.base.toFixed(2), l.bonus_total.toFixed(2), l.ajuste.toFixed(2), l.total.toFixed(2), [...l.bloqueio, l.motivo].filter(Boolean).join(" | ")]);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="premiacao-${mes.slice(0, 7)}.csv"`);
  res.send("﻿" + [cab, ...rows].map((x) => x.map((v) => cel(typeof v === "number" ? n(v) : v)).join(";")).join("\r\n"));
});

export default r;
