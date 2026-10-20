import { Router } from "express";
import { pool } from "./db.js";

const r = Router();

// GET /api/perfil -> dados da própria conta
r.get("/perfil", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.nome_completo, u.login, u.email, u.perfil_acesso, u.foto, u.data_entrada,
            c.ultimo_login, c.criada_em,
            (SELECT string_agg(f.funcao, ', ' ORDER BY f.funcao) FROM usuario_funcao f WHERE f.usuario_id = u.id) AS funcoes,
            coalesce((SELECT e.nome FROM equipe_membro m JOIN equipe e ON e.id = m.equipe_id WHERE m.usuario_id = u.id AND m.fim IS NULL ORDER BY m.inicio DESC LIMIT 1),
                     (SELECT e.nome FROM contrato k JOIN equipe e ON e.id = k.equipe_id WHERE k.vendedor_id = u.id ORDER BY k.data_venda DESC LIMIT 1)) AS equipe
       FROM usuario u LEFT JOIN conta_acesso c ON c.usuario_id = u.id WHERE u.id = $1`, [req.user.id]);
  if (!rows[0]) return res.status(404).json({ erro: "Usuário não encontrado." });
  res.json(rows[0]);
});

// POST /api/perfil/foto { foto: "data:image/jpeg;base64,..." }  (o navegador já reduz a imagem)
r.post("/perfil/foto", async (req, res) => {
  const foto = String(req.body.foto || "");
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(foto)) return res.status(400).json({ erro: "Imagem inválida: use JPG, PNG ou WebP." });
  if (foto.length > 90000) return res.status(413).json({ erro: "Imagem grande demais depois de reduzida. Escolha uma menor." });
  await pool.query("UPDATE usuario SET foto = $2 WHERE id = $1", [req.user.id, foto]);
  res.json({ ok: true });
});
r.delete("/perfil/foto", async (req, res) => {
  await pool.query("UPDATE usuario SET foto = NULL WHERE id = $1", [req.user.id]);
  res.json({ ok: true });
});

const ACAO_TXT = { INSERT: "criou", UPDATE: "alterou", DELETE: "apagou" };
const ROTULO_TABELA = { cliente: "Cliente", contrato: "Venda", contrato_item: "Produto da venda", agenda_instalacao: "Rota", usuario: "Usuário", equipe_membro: "Equipe do colaborador", equipe: "Equipe (supervisor/coordenador)", comissao_plano: "Plano de premiação", comissao_tabela: "Tabela de premiação", comissao_pessoa: "Ajuste de premiação", viabilidade: "Viabilidade", confirmacao_venda: "Confirmação D-1/D-15", cliente_observacao: "Observação do cliente" };
const ROTULO_CAMPO = {
  nome: "Nome", contato: "Telefone", contato_2: "Telefone 2", data_nascimento: "Nascimento", documento: "CPF/CNPJ", status_venda: "Situação da venda",
  status_contrato: "Status do contrato", motivo_id: "Motivo", data_agendamento: "Agendamento", turno: "Turno", pacote_valor: "Valor do pacote",
  forma_pagamento: "Forma de pagamento", dia_vencimento: "Vencimento", cidade_id: "Cidade", bairro: "Bairro", endereco: "Endereço", observacao: "Observação",
  origem: "Origem", canal: "Canal", auditoria: "Auditoria", equipe_id: "Equipe", data_venda: "Data da venda", numero_contrato: "Nº do contrato",
  tipo_imovel: "Tipo do imóvel", vendedor_id: "Vendedor", backoffice_id: "Backoffice", tipo_contrato: "Tipo", quantidade: "Quantidade", tipo_adesao: "Adesão",
  produto_id: "Produto", situacao: "Situação da rota", confirmada: "Confirmação", obs_agenda: "Observação da rota", data_rota: "Data da rota",
  perfil_acesso: "Perfil", ativo: "Ativo", email: "E-mail", login: "Login", inicio: "Início", fim: "Fim", data_entrada: "Entrada", data_saida: "Saída",
  codigo_chip: "Chip", chip_ativo: "Chip ativo", lider_id: "Supervisor", coordenador_id: "Coordenador", ativa: "Ativa",
  meta_bl: "Meta de banda larga", meta_chip: "Meta de chips", pap_ok: "PAP Tools ok", ajuste: "Ajuste (R$)", motivo: "Motivo", fpd_faixa: "FPD da Faixa 2", fpd_inelegivel: "FPD inelegível", fpd_bonus_a: "FPD bônus A", fpd_bonus_b: "FPD bônus B", dcc_pct_lider: "% DCC do supervisor", bl_bonus_vendedor: "BL p/ bônus do supervisor", min_contratos_fpd: "Mín. contratos FPD", meses_so_faixa1: "Meses só Faixa 1", fechado: "Plano fechado", faixa1: "Faixa 1 (R$)", faixa2: "Faixa 2 (R$)", item: "Item", papel: "Papel", mes: "Mês",
};
const IGNORAR = new Set(["id", "criado_em", "atualizado_em", "atualizada_em", "atualizada_por", "bko_confirmacao_id", "bko_tratativa_id", "sistema_origem", "auth_id", "cliente_id", "contrato_id", "usuario_id", "nivel_vendedor"]);

/** Traduz códigos (cidade_id, vendedor_id...) em nomes, em lote, para o histórico ficar legível. */
async function resolvedor(linhas) {
  const ids = { cidade: new Set(), usuario: new Set(), equipe: new Set(), motivo: new Set(), produto: new Set() };
  const alvo = { cidade_id: "cidade", vendedor_id: "usuario", backoffice_id: "usuario", lider_id: "usuario", coordenador_id: "usuario", equipe_id: "equipe", motivo_id: "motivo", produto_id: "produto" };
  for (const l of linhas) for (const o of [l.antes, l.depois]) if (o) for (const [k, t] of Object.entries(alvo)) if (o[k] != null) ids[t].add(+o[k]);
  const mapa = { cidade: {}, usuario: {}, equipe: {}, motivo: {}, produto: {} };
  const q = async (t, sql) => { if (ids[t].size) for (const x of (await pool.query(sql, [[...ids[t]]])).rows) mapa[t][x.id] = x.nome; };
  await q("cidade", "SELECT id, nome FROM cidade WHERE id = ANY($1::int[])");
  await q("usuario", "SELECT id, nome_completo AS nome FROM usuario WHERE id = ANY($1::bigint[])");
  await q("equipe", "SELECT id, nome FROM equipe WHERE id = ANY($1::int[])");
  await q("motivo", "SELECT id, descricao AS nome FROM motivo WHERE id = ANY($1::smallint[])");
  await q("produto", "SELECT id, nome FROM produto WHERE id = ANY($1::int[])");
  return (campo, v) => {
    if (v == null) return "vazio";
    if (campo === "status_venda" && { ATIVO: 1, PENDENTE: 1, CANCELADO: 1 }[v]) return { ATIVO: "INSTALADA", PENDENTE: "PENDENTE", CANCELADO: "CANCELADA" }[v];
    if (campo === "pacote_valor") return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (typeof v === "boolean") return campo === "confirmada" ? (v ? "sim" : "não") : v ? "sim" : "não";
    const t = alvo[campo];
    if (t) return mapa[t][+v] || `#${v}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) return String(v).slice(0, 10).split("-").reverse().join("/");
    return String(v);
  };
}

/** Frase curta do que mudou: "Situação da venda: PENDENTE → INSTALADA" */
function descrever(l, nome) {
  if (l.acao !== "UPDATE") {
    const o = l.depois || l.antes || {}, chaves = { agenda_instalacao: ["data_rota", "turno"], contrato_item: ["produto_id", "quantidade"], equipe_membro: ["equipe_id", "inicio"], equipe: ["nome"], comissao_pessoa: ["papel", "ajuste"], comissao_tabela: ["item"] }[l.tabela] || [];
    return { resumo: l.acao === "INSERT" ? "criou" : "apagou", campos: chaves.filter((k) => o[k] != null).map((k) => ({ campo: ROTULO_CAMPO[k] || k, para: nome(k, o[k]) })) };
  }
  const campos = [];
  for (const k of Object.keys(l.depois || {})) {
    if (IGNORAR.has(k)) continue;
    campos.push({ campo: ROTULO_CAMPO[k] || k, de: nome(k, l.antes?.[k]), para: nome(k, l.depois[k]) });
  }
  return { resumo: "alterou", campos };
}

/** Monta o WHERE do histórico a partir dos filtros. Gestor vê tudo (e pode filtrar por pessoa); os demais só as próprias alterações. */
function filtroLog(req) {
  const gestor = req.user.perfil === "gestor";
  const w = [], p = [];
  const add = (cond, v) => { p.push(v); w.push(cond.replace(/\?/g, "$" + p.length)); };
  if (gestor) { const u = parseInt(req.query.usuario || "", 10); if (u) add("a.usuario_id = ?", u); }
  else add("a.usuario_id = ?", req.user.id);
  if (!req.user.master) w.push("(a.usuario_id IS NULL OR a.usuario_id NOT IN (SELECT id FROM usuario WHERE perfil_acesso = 'master')) AND NOT (a.tabela = 'usuario' AND a.registro_id IN (SELECT id FROM usuario WHERE perfil_acesso = 'master'))");
  if (ROTULO_TABELA[req.query.tabela]) add("a.tabela = ?", req.query.tabela);
  if (["INSERT", "UPDATE", "DELETE"].includes(req.query.acao)) add("a.acao = ?", req.query.acao);
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.de || "")) add("(a.em AT TIME ZONE 'America/Sao_Paulo')::date >= ?::date", req.query.de);
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.ate || "")) add("(a.em AT TIME ZONE 'America/Sao_Paulo')::date <= ?::date", req.query.ate);
  const q = String(req.query.q || "").trim().slice(0, 60);
  if (q) {   // nº do contrato ou nome do cliente: acha o contrato e traz tudo que mexeu nele (venda, produtos, rota, cliente)
    p.push(`%${q}%`); const n = "$" + p.length; const dig = q.replace(/\D/g, "");
    let doc = ""; if (dig.length >= 6) { p.push(dig + "%"); doc = ` OR c.documento LIKE $${p.length}`; }
    const ct = `SELECT k.id FROM contrato k JOIN cliente c ON c.id = k.cliente_id WHERE k.numero_contrato ILIKE ${n} OR c.nome ILIKE ${n}${doc}`;
    w.push(`((a.tabela = 'contrato' AND a.registro_id IN (${ct}))
      OR (a.tabela = 'contrato_item' AND a.registro_id IN (SELECT i.id FROM contrato_item i WHERE i.contrato_id IN (${ct})))
      OR (a.tabela = 'agenda_instalacao' AND a.registro_id IN (SELECT g.id FROM agenda_instalacao g WHERE g.contrato_id IN (${ct})))
      OR (a.tabela = 'cliente' AND a.registro_id IN (SELECT c.id FROM cliente c WHERE c.nome ILIKE ${n}${doc})))`);
  }
  return { gestor, p, where: w.length ? "WHERE " + w.join(" AND ") : "" };
}

async function carregarAtividade(where, p, limite, deslocamento) {
  const { rows } = await pool.query(
    `SELECT x.*, coalesce(x.alvo_direto, (SELECT k.numero_contrato FROM contrato k WHERE k.id = x.contrato_id)) AS alvo
       FROM (
         SELECT a.id, a.tabela, a.registro_id, a.acao, a.antes, a.depois, a.em, a.usuario_id, u.nome_completo AS quem,
                CASE a.tabela
                  WHEN 'contrato' THEN a.registro_id
                  WHEN 'contrato_item' THEN coalesce((a.depois->>'contrato_id')::bigint, (a.antes->>'contrato_id')::bigint, (SELECT i.contrato_id FROM contrato_item i WHERE i.id = a.registro_id))
                  WHEN 'agenda_instalacao' THEN coalesce((a.depois->>'contrato_id')::bigint, (a.antes->>'contrato_id')::bigint, (SELECT g.contrato_id FROM agenda_instalacao g WHERE g.id = a.registro_id))
                END AS contrato_id,
                CASE a.tabela
                  WHEN 'cliente' THEN (SELECT c.nome FROM cliente c WHERE c.id = a.registro_id)
                  WHEN 'usuario' THEN (SELECT x.nome_completo FROM usuario x WHERE x.id = a.registro_id)
                  WHEN 'equipe' THEN (SELECT x.nome FROM equipe x WHERE x.id = a.registro_id)
                  WHEN 'comissao_pessoa' THEN (SELECT x.nome_completo FROM usuario x WHERE x.id = coalesce((a.depois->>'usuario_id')::bigint, (a.antes->>'usuario_id')::bigint))
                  WHEN 'comissao_plano' THEN 'Plano ' || to_char(coalesce((a.depois->>'mes')::date, (a.antes->>'mes')::date), 'MM/YYYY')
                  WHEN 'comissao_tabela' THEN coalesce(a.depois->>'papel', a.antes->>'papel') || ' · ' || coalesce(a.depois->>'item', a.antes->>'item')
                  WHEN 'equipe_membro' THEN (SELECT x.nome_completo FROM usuario x WHERE x.id = coalesce((a.depois->>'usuario_id')::bigint, (a.antes->>'usuario_id')::bigint, (SELECT m.usuario_id FROM equipe_membro m WHERE m.id = a.registro_id)))
                END AS alvo_direto
           FROM alteracao_log a LEFT JOIN usuario u ON u.id = a.usuario_id ${where}
          ORDER BY a.em DESC, a.id DESC LIMIT ${limite} OFFSET ${deslocamento}
       ) x ORDER BY x.em DESC, x.id DESC`, p);
  const nome = await resolvedor(rows);
  return rows.map((l) => {
    const d = descrever(l, nome);
    return { id: l.id, em: l.em, quem: l.quem || "Sistema / carga", usuario_id: l.usuario_id, tabela: ROTULO_TABELA[l.tabela] || l.tabela, tabela_cod: l.tabela,
             acao: l.acao, resumo: d.resumo, campos: d.campos, contrato_id: l.contrato_id, alvo: l.alvo || `#${l.registro_id}` };
  });
}

// GET /api/atividade?usuario=&tabela=&acao=&de=&ate=&q=&pagina=
r.get("/atividade", async (req, res) => {
  const { gestor, p, where } = filtroLog(req);
  const pagina = Math.max(1, parseInt(req.query.pagina || "1", 10)), tam = 40;
  const total = (await pool.query(`SELECT count(*)::int n FROM alteracao_log a ${where}`, p)).rows[0].n;
  const itens = await carregarAtividade(where, p, tam, (pagina - 1) * tam);
  res.json({ total, pagina, tam, escopo: gestor ? "todos" : "proprio", itens });
});

// GET /api/atividade/resumo (gestor) -> números e gráficos da Central de alterações (mesmos filtros)
r.get("/atividade/resumo", async (req, res) => {
  if (req.user.perfil !== "gestor") return res.status(403).json({ erro: "Sem permissão para esta ação." });
  const { p, where } = filtroLog(req);
  const dia = "(a.em AT TIME ZONE 'America/Sao_Paulo')::date";
  const q = (sql, params = p) => pool.query(sql, params).then((x) => x.rows);
  const [tot] = await q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE a.acao='INSERT')::int AS criou, count(*) FILTER (WHERE a.acao='UPDATE')::int AS alterou,
      count(*) FILTER (WHERE a.acao='DELETE')::int AS apagou, count(DISTINCT a.usuario_id)::int AS pessoas, min(a.em) AS primeira, max(a.em) AS ultima FROM alteracao_log a ${where}`);
  // gráfico por dia: período filtrado (máx. 90 dias) ou os últimos 30 dias
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), soma = (iso, n) => new Date(new Date(iso + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
  const okData = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null);
  const fim = okData(req.query.ate) || hoje;
  let ini = okData(req.query.de) || soma(fim, -29);
  if (ini < soma(fim, -89)) ini = soma(fim, -89);
  const por_dia = await q(`WITH d AS (SELECT generate_series($${p.length + 1}::date, $${p.length + 2}::date, '1 day')::date AS dia)
      SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia, coalesce(t.criou,0)::int AS criou, coalesce(t.alterou,0)::int AS alterou, coalesce(t.apagou,0)::int AS apagou
        FROM d LEFT JOIN (SELECT ${dia} AS dia, count(*) FILTER (WHERE a.acao='INSERT') AS criou, count(*) FILTER (WHERE a.acao='UPDATE') AS alterou, count(*) FILTER (WHERE a.acao='DELETE') AS apagou
                            FROM alteracao_log a ${where} GROUP BY 1) t ON t.dia = d.dia ORDER BY d.dia`, [...p, ini, fim]);
  const por_pessoa = await q(`SELECT coalesce(u.nome_completo, 'Sistema / carga') AS quem, a.usuario_id, count(*)::int AS n, count(*) FILTER (WHERE a.acao='DELETE')::int AS apagou
      FROM alteracao_log a LEFT JOIN usuario u ON u.id = a.usuario_id ${where} GROUP BY 1, 2 ORDER BY n DESC LIMIT 10`);
  const por_tabela = await q(`SELECT a.tabela, count(*)::int AS n FROM alteracao_log a ${where} GROUP BY 1 ORDER BY n DESC`);
  por_tabela.forEach((x) => (x.rotulo = ROTULO_TABELA[x.tabela] || x.tabela));
  let pessoa = null;
  const uid = parseInt(req.query.usuario || "", 10);
  if (uid) {
    pessoa = (await pool.query(
      `SELECT u.id, u.nome_completo, u.login, u.email, u.perfil_acesso, u.ativo, c.ultimo_login, u.foto,
              coalesce((SELECT e.nome FROM equipe_membro m JOIN equipe e ON e.id = m.equipe_id WHERE m.usuario_id = u.id AND m.fim IS NULL ORDER BY m.inicio DESC LIMIT 1),
                       (SELECT e.nome FROM contrato k JOIN equipe e ON e.id = k.equipe_id WHERE k.vendedor_id = u.id ORDER BY k.data_venda DESC LIMIT 1)) AS equipe,
              (SELECT count(*)::int FROM conta_acesso_evento ev WHERE ev.usuario_id = u.id AND ev.acao = 'LOGIN_OK') AS logins
         FROM usuario u LEFT JOIN conta_acesso c ON c.usuario_id = u.id WHERE u.id = $1 ${req.user.master ? "" : "AND u.perfil_acesso <> 'master'"}`, [uid])).rows[0] || null;
  }
  res.json({ totais: tot, por_dia, por_pessoa, por_tabela, pessoa });
});

// GET /api/atividade/exportar (gestor: tudo com os filtros | demais: só o próprio) -> CSV, uma linha por campo alterado
r.get("/atividade/exportar", async (req, res) => {
  const { p, where } = filtroLog(req);
  const itens = await carregarAtividade(where, p, 20000, 0);
  const cel = (v) => { const t = v == null ? "" : String(v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const hora = (s) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const linhas = [["Data/hora", "Pessoa", "Ação", "O quê", "Registro", "Campo", "De", "Para"]];
  for (const i of itens) {
    const base = [hora(i.em), i.quem, ACAO_TXT[i.acao] || i.acao, i.tabela, i.alvo];
    if (i.campos.length) i.campos.forEach((c) => linhas.push([...base, c.campo, c.de ?? "", c.para ?? ""]));
    else linhas.push([...base, "", "", ""]);
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="historico-de-alteracoes.csv"');
  res.send("\uFEFF" + linhas.map((l) => l.map(cel).join(";")).join("\r\n"));
});

// GET /api/atividade/pessoas  (gestor) -> quem já alterou algo, para o filtro
r.get("/atividade/pessoas", async (req, res) => {
  if (req.user.perfil !== "gestor") return res.json([]);
  const { rows } = await pool.query(
    `SELECT u.id, u.nome_completo AS nome FROM usuario u WHERE u.id IN (SELECT DISTINCT usuario_id FROM alteracao_log WHERE usuario_id IS NOT NULL) ${req.user.master ? "" : "AND u.perfil_acesso <> 'master'"} ORDER BY 2`);
  res.json(rows);
});

// GET /api/acessos (gestor) -> últimos logins e eventos de conta
r.get("/acessos", async (req, res) => {
  if (req.user.perfil !== "gestor") return res.status(403).json({ erro: "Sem permissão para esta ação." });
  const { rows } = await pool.query(
    `SELECT e.em, e.acao, e.detalhe, u.nome_completo AS pessoa, f.nome_completo AS feito_por
       FROM conta_acesso_evento e JOIN usuario u ON u.id = e.usuario_id LEFT JOIN usuario f ON f.id = e.feito_por
      ${req.user.master ? "" : "WHERE u.perfil_acesso <> 'master' AND coalesce(f.perfil_acesso,'') <> 'master'"}
      ORDER BY e.em DESC LIMIT 100`);
  res.json(rows);
});

export default r;
