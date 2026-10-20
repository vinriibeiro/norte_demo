/* Notificações no celular (Web Push) para Gerente e Administrador.
   - Cada venda lançada no sistema gera um aviso na hora ("Nova venda · vendedor · equipe").
   - Duas vezes por dia (padrão 12:00 e 17:00, horário de Brasília) vai o resumo de quem ainda não vendeu, por equipe.
   Funciona no Android (Chrome) e no iPhone (iOS 16.4+, com o app instalado na Tela de Início pelo Safari).
   As chaves VAPID são criadas sozinhas no primeiro uso e ficam no banco (tabela push_config, sem acesso dos perfis). */
import webpush from "./webpush.js";
import { pool } from "./db.js";
import { nacionais } from "./calendario.js";

const DDL = `
CREATE TABLE IF NOT EXISTS seven.push_config (
  id smallint PRIMARY KEY CHECK (id = 1), publica text NOT NULL, privada text NOT NULL, criado_em timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS seven.push_inscricao (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES seven.usuario(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth text NOT NULL, aparelho text,
  criado_em timestamptz NOT NULL DEFAULT now(), ultimo_envio timestamptz, falhas int NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_push_inscricao_usuario ON seven.push_inscricao (usuario_id);
CREATE TABLE IF NOT EXISTS seven.push_preferencia (
  usuario_id bigint PRIMARY KEY REFERENCES seven.usuario(id) ON DELETE CASCADE,
  nova_venda boolean NOT NULL DEFAULT true, relatorio boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS seven.notificacao_envio (
  tipo text NOT NULL, chave text NOT NULL, enviado_em timestamptz NOT NULL DEFAULT now(), destinatarios int, resumo text,
  PRIMARY KEY (tipo, chave));
ALTER TABLE seven.push_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE seven.push_inscricao ENABLE ROW LEVEL SECURITY;
ALTER TABLE seven.push_preferencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE seven.notificacao_envio ENABLE ROW LEVEL SECURITY;`;

/** Quem recebe: Gerente, Administrador e o master (desenvolvedor), ativos. */
const PERFIS_AVISO = ["gestor", "administrador", "master"];
export const recebeAvisos = (u) => u && !u.verComo && (u.perfil === "gestor" || u.master);

let pronto = null;
function garantir() {
  if (!pronto) pronto = (async () => {
    await pool.query(DDL);
    let k = (await pool.query("SELECT publica, privada FROM seven.push_config WHERE id = 1")).rows[0];
    if (!k) {
      const v = webpush.generateVAPIDKeys();
      await pool.query("INSERT INTO seven.push_config (id, publica, privada) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING", [v.publicKey, v.privateKey]);
      k = (await pool.query("SELECT publica, privada FROM seven.push_config WHERE id = 1")).rows[0];
    }
    const dominio = (process.env.DOMINIO_PRINCIPAL || "controleseven.com.br").trim();
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || `https://${dominio}`, k.publica, k.privada);
    return k;
  })().catch((e) => { pronto = null; throw e; });
  return pronto;
}

export const chavePublica = async () => (await garantir()).publica;

export async function inscrever(usuarioId, sub, aparelho) {
  await garantir();
  const ep = String(sub?.endpoint || ""), p = sub?.keys?.p256dh, a = sub?.keys?.auth;
  if (!/^https:\/\/[^\s]{10,2000}$/.test(ep) || !p || !a || String(p).length > 200 || String(a).length > 100)
    throw Object.assign(new Error("Inscrição inválida."), { status: 400 });
  await pool.query(
    `INSERT INTO seven.push_inscricao (usuario_id, endpoint, p256dh, auth, aparelho) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       aparelho = EXCLUDED.aparelho, falhas = 0`, [usuarioId, ep, p, a, String(aparelho || "").slice(0, 120) || null]);
  await pool.query("INSERT INTO seven.push_preferencia (usuario_id) VALUES ($1) ON CONFLICT DO NOTHING", [usuarioId]);
}

export async function cancelar(usuarioId, endpoint) {
  await garantir();
  await pool.query("DELETE FROM seven.push_inscricao WHERE usuario_id = $1 AND endpoint = $2", [usuarioId, String(endpoint || "")]);
}

export async function estado(usuarioId, endpoint) {
  await garantir();
  const pref = (await pool.query("SELECT nova_venda, relatorio FROM seven.push_preferencia WHERE usuario_id = $1", [usuarioId])).rows[0] || { nova_venda: true, relatorio: true };
  const ap = (await pool.query("SELECT count(*)::int AS n FROM seven.push_inscricao WHERE usuario_id = $1", [usuarioId])).rows[0].n;
  const este = endpoint ? (await pool.query("SELECT 1 FROM seven.push_inscricao WHERE usuario_id = $1 AND endpoint = $2", [usuarioId, endpoint])).rowCount > 0 : false;
  return { ...pref, aparelhos: ap, este_aparelho: este, horarios: horarios() };
}

export async function preferencias(usuarioId, b) {
  await garantir();
  const nv = typeof b?.nova_venda === "boolean" ? b.nova_venda : null, rl = typeof b?.relatorio === "boolean" ? b.relatorio : null;
  await pool.query(
    `INSERT INTO seven.push_preferencia (usuario_id, nova_venda, relatorio) VALUES ($1, coalesce($2, true), coalesce($3, true))
     ON CONFLICT (usuario_id) DO UPDATE SET nova_venda = coalesce($2, push_preferencia.nova_venda), relatorio = coalesce($3, push_preferencia.relatorio)`,
    [usuarioId, nv, rl]);
}

/** Envia para os aparelhos inscritos. `filtro` = coluna de preferência (nova_venda | relatorio) ou null (teste). */
async function enviar({ usuarios = null, filtro = null, excluir = null, todos = false }, payload) {
  await garantir();
  const w = ["u.ativo"], v = [];
  if (!todos) { v.push(PERFIS_AVISO); w.push(`u.perfil_acesso = ANY($${v.length})`); }
  if (usuarios) { v.push(usuarios); w.push(`u.id = ANY($${v.length})`); }
  if (excluir) { v.push(excluir); w.push(`u.id <> $${v.length}`); }
  if (filtro) w.push(`coalesce(p.${filtro === "relatorio" ? "relatorio" : "nova_venda"}, true)`);
  const subs = (await pool.query(
    `SELECT s.id, s.endpoint, s.p256dh, s.auth FROM seven.push_inscricao s JOIN seven.usuario u ON u.id = s.usuario_id
       LEFT JOIN seven.push_preferencia p ON p.usuario_id = u.id WHERE ${w.join(" AND ")}`, v)).rows;
  const corpo = JSON.stringify(payload);
  let ok = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, corpo, { TTL: 6 * 3600, urgency: "high", topic: payload.topico });
      ok++;
      await pool.query("UPDATE seven.push_inscricao SET ultimo_envio = now(), falhas = 0 WHERE id = $1", [s.id]);
    } catch (e) {
      // 404/410: o aparelho cancelou ou o app foi removido -> apaga a inscrição; outros erros: conta falha e apaga após 10
      if (e.statusCode === 404 || e.statusCode === 410) await pool.query("DELETE FROM seven.push_inscricao WHERE id = $1", [s.id]).catch(() => {});
      else {
        console.error(new Date().toISOString(), "push", e.statusCode || "", String(e.body || e.message).slice(0, 200));
        await pool.query("UPDATE seven.push_inscricao SET falhas = falhas + 1 WHERE id = $1; ", [s.id]).catch(() => {});
        await pool.query("DELETE FROM seven.push_inscricao WHERE id = $1 AND falhas >= 10", [s.id]).catch(() => {});
      }
    }
  }));
  return { aparelhos: subs.length, enviados: ok };
}

export const testar = (usuarioId) =>
  enviar({ usuarios: [usuarioId] }, { titulo: "Notificações ativadas ✓", corpo: "Você vai receber aqui as vendas lançadas e o resumo de quem ainda não vendeu.", url: "/#/dashboard", tag: "teste" });

/* ------------------------------------------------------------------ nova venda */
const brl = (v) => (v == null ? "" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const nomeCurto = (n) => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0] || ""; };
const titulo = (s) => String(s || "").toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());

/** Chamado depois que a venda foi gravada (não atrasa a resposta; erro aqui nunca afeta a venda). */
export function avisarNovasVendas(contratoIds, autorId) {
  if (!contratoIds?.length) return;
  setImmediate(async () => {
    try {
      const rows = (await pool.query(
        `SELECT k.id, k.numero_contrato, k.pacote_valor, k.origem, u.nome_completo AS vendedor, e.nome AS equipe, ci.nome AS cidade, ci.uf,
                (SELECT string_agg(CASE p.categoria WHEN 'FIBRA' THEN 'BL ' || p.nome WHEN 'MOVEL' THEN 'Chip' WHEN 'TV' THEN CASE WHEN p.nome LIKE 'ACESSO%' THEN NULL ELSE 'TV' END WHEN 'FONE' THEN 'Fone' ELSE NULL END, ' + ' ORDER BY p.categoria DESC)
                   FROM seven.contrato_item i JOIN seven.produto p ON p.id = i.produto_id WHERE i.contrato_id = k.id) AS produtos,
                (SELECT count(*) FROM seven.contrato x WHERE x.vendedor_id = k.vendedor_id AND x.data_venda = k.data_venda) AS do_dia
           FROM seven.contrato k JOIN seven.usuario u ON u.id = k.vendedor_id
           LEFT JOIN seven.equipe e ON e.id = k.equipe_id LEFT JOIN seven.cidade ci ON ci.id = k.cidade_id
          WHERE k.id = ANY($1) ORDER BY k.id`, [contratoIds])).rows;
      if (!rows.length) return;
      if (rows.length > 3) {   // lançamento em lote: um aviso só
        const porEq = new Map(); rows.forEach((r) => porEq.set(r.equipe || "Sem equipe", (porEq.get(r.equipe || "Sem equipe") || 0) + 1));
        await enviar({ filtro: "nova_venda", excluir: autorId }, {
          titulo: `${rows.length} vendas lançadas`, corpo: [...porEq].sort((a, b) => b[1] - a[1]).map(([e, n]) => `${titulo(e)}: ${n}`).join(" · "),
          url: "/#/vendas", tag: "lote-" + Date.now() });
        return;
      }
      for (const r of rows) {
        const linha2 = [r.produtos, r.cidade ? `${titulo(r.cidade)}/${r.uf}` : null, r.pacote_valor ? brl(r.pacote_valor) : null].filter(Boolean).join(" · ");
        await enviar({ filtro: "nova_venda", excluir: autorId }, {
          titulo: `Nova venda · ${titulo(nomeCurto(r.vendedor))}`,
          corpo: `${r.equipe ? "Equipe " + titulo(r.equipe) + "\n" : ""}${linha2}${r.do_dia > 1 ? `\n${r.do_dia}ª venda dele(a) hoje` : ""}`,
          url: `/#/venda/${r.id}`, tag: "venda-" + r.id });
      }
    } catch (e) { console.error(new Date().toISOString(), "aviso de venda:", e.message); }
  });
}

/* ------------------------------------------------------------------ quem ainda não vendeu */
const TZ = "America/Sao_Paulo";
/** Data e hora atuais em Brasília: { dia: "AAAA-MM-DD", hm: "HH:MM", dow: 0-6 } */
export function agoraBR(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const dia = `${p.year}-${p.month}-${p.day}`;
  return { dia, hm: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`, dow: new Date(dia + "T12:00:00Z").getUTCDay() };
}
export function horarios() {
  const h = String(process.env.NOTIF_HORARIOS || "12:00,17:00").split(",").map((s) => s.trim()).filter((s) => /^\d{2}:\d{2}$/.test(s));
  return h.length ? h.sort() : ["12:00", "17:00"];
}

/** Vendedores ativos (com equipe) e as vendas de hoje, por equipe. */
export async function semVendaHoje(dia = agoraBR().dia) {
  const rows = (await pool.query(
    `SELECT u.id, u.nome_completo AS nome, e.nome AS equipe, li.nome_completo AS supervisor,
            (SELECT count(*)::int FROM seven.contrato k WHERE k.vendedor_id = u.id AND k.data_venda = $1::date) AS vendas_hoje,
            (SELECT max(k.data_venda) FROM seven.contrato k WHERE k.vendedor_id = u.id AND k.data_venda <= $1::date) AS ultima_venda
       FROM seven.usuario u
       JOIN seven.equipe_membro m ON m.usuario_id = u.id AND m.fim IS NULL
       JOIN seven.equipe e ON e.id = m.equipe_id AND e.ativa
       LEFT JOIN seven.usuario li ON li.id = e.lider_id
      WHERE u.ativo AND u.perfil_acesso <> 'master'
        AND (u.perfil_acesso = 'vendedor' OR EXISTS (SELECT 1 FROM seven.usuario_funcao f WHERE f.usuario_id = u.id AND f.funcao = 'VENDEDOR'))
        -- em operação: vendeu nos últimos 30 dias ou entrou há menos de 30 dias (cadastro antigo esquecido ativo não entra)
        AND (EXISTS (SELECT 1 FROM seven.contrato k WHERE k.vendedor_id = u.id AND k.data_venda > $1::date - 30 AND k.data_venda <= $1::date)
             OR m.inicio > $1::date - 30 OR u.data_entrada > $1::date - 30)
      ORDER BY e.nome, u.nome_completo`, [dia])).rows;
  const vistos = new Set(), grupos = new Map();
  for (const r of rows) {
    if (vistos.has(r.id)) continue; vistos.add(r.id);
    const g = grupos.get(r.equipe) || { equipe: r.equipe, supervisor: r.supervisor, total: 0, com_venda: 0, vendas: 0, sem: [] };
    g.total++; g.vendas += r.vendas_hoje;
    if (r.vendas_hoje) g.com_venda++;
    else g.sem.push({ id: r.id, nome: r.nome, ultima_venda: r.ultima_venda ? String(r.ultima_venda instanceof Date ? r.ultima_venda.toISOString() : r.ultima_venda).slice(0, 10) : null });
    grupos.set(r.equipe, g);
  }
  const lista = [...grupos.values()].sort((a, b) => b.sem.length - a.sem.length || a.equipe.localeCompare(b.equipe));
  const total = lista.reduce((s, g) => s + g.total, 0), sem = lista.reduce((s, g) => s + g.sem.length, 0);
  return { dia, total, sem_venda: sem, com_venda: total - sem, vendas: lista.reduce((s, g) => s + g.vendas, 0), equipes: lista };
}

async function enviarRelatorio(hm, r) {
  const linhas = r.equipes.filter((g) => g.sem.length).map((g) => `${titulo(g.equipe)} (${g.sem.length}/${g.total}): ${g.sem.map((p) => titulo(p.nome.split(/\s+/)[0])).join(", ")}`);
  const corpo = r.sem_venda ? linhas.join("\n") : "Todos os vendedores já lançaram venda hoje. 👏";
  return enviar({ filtro: "relatorio" }, {
    titulo: r.sem_venda ? `${hm.slice(0, 2)}h · ${r.sem_venda} de ${r.total} vendedores ainda sem venda` : `${hm.slice(0, 2)}h · todos já venderam hoje`,
    corpo: corpo.length > 1500 ? corpo.slice(0, 1490) + "…" : corpo, url: "/#/semvenda", tag: "sem-venda", topico: "sem-venda" });
}

/** Confere a cada minuto se chegou um dos horários. A tabela notificacao_envio garante 1 envio por horário,
    mesmo se o servidor reiniciar ou houver mais de um dyno. Domingo e feriado nacional: não envia. */
export function iniciarAgendador() {
  if (process.env.NOTIF_DESLIGADO === "1") return;
  const tique = async () => {
    try {
      const { dia, hm, dow } = agoraBR();
      if (dow === 0 || nacionais(+dia.slice(0, 4)).some((f) => f.data === dia)) return;
      for (const h of horarios()) {
        const [a, b] = [h, hm].map((x) => +x.slice(0, 2) * 60 + +x.slice(3));
        if (b < a || b > a + 45) continue;          // só dentro de 45 min depois do horário (servidor que subiu atrasado ainda manda)
        await garantir();
        const novo = (await pool.query("INSERT INTO seven.notificacao_envio (tipo, chave) VALUES ('sem_venda', $1) ON CONFLICT DO NOTHING RETURNING 1", [`${dia} ${h}`])).rowCount;
        if (!novo) continue;
        const r = await semVendaHoje(dia);
        const e = await enviarRelatorio(h, r);
        await pool.query("UPDATE seven.notificacao_envio SET destinatarios = $2, resumo = $3 WHERE tipo = 'sem_venda' AND chave = $1",
          [`${dia} ${h}`, e.enviados, `${r.sem_venda} de ${r.total} sem venda`]);
        console.log(new Date().toISOString(), `resumo sem venda ${dia} ${h}: ${r.sem_venda}/${r.total} -> ${e.enviados} aparelho(s)`);
      }
    } catch (e) { console.error(new Date().toISOString(), "agendador de avisos:", e.message); }
  };
  setTimeout(tique, 20000);
  setInterval(tique, 60000).unref?.();
}

/** Aviso direcionado (mensagem numa venda, viabilidade contestada): só para as pessoas indicadas, qualquer perfil. */
export const avisarPessoas = (usuarios, payload) =>
  enviar({ usuarios: [...new Set(usuarios.filter(Boolean))], todos: true }, payload).catch((e) => console.error(new Date().toISOString(), "aviso:", e.message));

/** Backoffice de Cadastro ativo: quem recebe as mensagens da venda e as contestações. */
export async function backofficeCadastro() {
  return (await pool.query("SELECT id FROM seven.usuario WHERE ativo AND perfil_acesso = 'backoffice' AND setor = 'CADASTRO'")).rows.map((r) => r.id);
}
