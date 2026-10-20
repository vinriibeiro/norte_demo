import { Router } from "express";
import { comPerfil } from "./db.js";
import { avisarPessoas, backofficeCadastro } from "./notificacoes.js";
import { exigePerfil, exigeSetor } from "./auth.js";

/* Sistema A / Sistema B: o vendedor preenche o formulário; o backoffice de Cadastro responde com o retorno.
   Prazo (temporizador) só existe em "Criação de HP". */
const r = Router();
const STATUS = ["PENDENTE_TRATAMENTO", "ATIVO_SEM_SUCESSO", "CRIACAO_HP", "PENDENCIA", "FINALIZADO"];
const SISTEMAS = ["SISTEMA_A", "SISTEMA_B"];
const CORRECAO = "Correção de venda";
const podeResponder = [exigePerfil("gestor", "backoffice"), exigeSetor("CADASTRO")];
const erro = (m, status = 400) => Object.assign(new Error(m), { status });
const txt = (v, max) => { const s = String(v ?? "").trim().replace(/\s+/g, " "); return s ? s.slice(0, max) : null; };
const so11 = (v) => { const d = String(v ?? "").replace(/\D/g, ""); return d.length === 11 ? d : null; };
const intOk = (v) => { const n = parseInt(v || "", 10); return n > 0 ? n : null; };
const ligado = (x) => x === true || x === "true" || x === "on" || x === 1 || x === "1";
r.use("/venda-externa", exigePerfil("gestor", "backoffice", "vendedor"));

// valida o formulário do vendedor (Sistema A ou Sistema B)
function dadosDoFormulario(b, sistema) {
  const d = { observacao: txt(b.observacao, 1000) };
  if (sistema === "SISTEMA_A") {
    d.cliente_nome = txt(b.cliente_nome, 150);
    d.codigo_conexao = txt(b.codigo_conexao, 60);
    d.biometria = b.biometria === true || b.biometria === "true" ? true : b.biometria === false || b.biometria === "false" ? false : null;
    if (!d.cliente_nome) throw erro("Informe o nome do cliente.");
    if (!d.codigo_conexao) throw erro("Informe o código Sistema A.");
    if (d.biometria === null) throw erro("Diga se a biometria foi feita (sim ou não).");
    d.possui_chip = b.possui_chip === true || b.possui_chip === "true" ? true : b.possui_chip === false || b.possui_chip === "false" ? false : null;
    if (d.possui_chip === null) throw erro("Diga se a venda possui chip (sim ou não).");
  } else {
    d.cpf = so11(b.cpf);
    d.cidade = txt(b.cidade, 100);
    d.contrato = txt(b.contrato, 60);
    d.produto = txt(b.produto, 100);
    const valor = Number(String(b.valor ?? "").replace(/\./g, "").replace(",", "."));
    d.valor = valor > 0 ? valor : null;
    if (!d.cpf) throw erro("CPF inválido (11 números).");
    if (!d.cidade) throw erro("Informe a cidade.");
    if (!d.contrato) throw erro("Informe o contrato.");
    if (!d.produto) throw erro("Informe o produto.");
    if (!d.valor) throw erro("Informe o valor.");
  }
  return d;
}

const SELECT = `
  SELECT x.*, u.nome_completo AS vendedor_nome, ra.nome_completo AS respondido_por_nome
    FROM venda_externa x
    JOIN usuario u ON u.id = x.vendedor_id
    LEFT JOIN usuario ra ON ra.id = x.respondido_por`;

// GET /api/venda-externa?sistema=&status=&busca=&pagina=
r.get("/venda-externa", async (req, res) => {
  const w = [], p = [];
  const sis = SISTEMAS.includes(req.query.sistema) ? req.query.sistema : null;
  if (sis) { p.push(sis); w.push(`x.sistema = $${p.length}`); }
  const st = String(req.query.status || "");
  if (st === "ABERTAS") w.push("x.status <> 'FINALIZADO'");
  else if (STATUS.includes(st)) { p.push(st); w.push(`x.status = $${p.length}`); }
  const busca = txt(req.query.busca, 60);
  if (busca) { p.push(`%${busca}%`); w.push(`(x.cliente_nome ILIKE $${p.length} OR x.codigo_conexao ILIKE $${p.length} OR x.cpf LIKE $${p.length} OR x.contrato ILIKE $${p.length} OR u.nome_completo ILIKE $${p.length})`); }
  const pagina = Math.max(1, intOk(req.query.pagina) || 1);
  const out = await comPerfil(req.user, async (c) => {
    const where = w.length ? "WHERE " + w.join(" AND ") : "";
    const total = (await c.query(`SELECT count(*)::int n FROM venda_externa x JOIN usuario u ON u.id = x.vendedor_id ${where}`, p)).rows[0].n;
    const itens = (await c.query(`${SELECT} ${where} ORDER BY (x.status <> 'FINALIZADO') DESC, (x.possui_chip IS TRUE) DESC, x.criado_em DESC LIMIT 50 OFFSET ${(pagina - 1) * 50}`, p)).rows;
    const contagem = Object.fromEntries((await c.query("SELECT status, count(*)::int n FROM venda_externa GROUP BY status")).rows.map((x) => [x.status, x.n]));
    return { total, pagina, itens, contagem };
  });
  res.json(out);
});

// GET /api/venda-externa/:id
r.get("/venda-externa/:id", async (req, res) => {
  const id = intOk(req.params.id);
  const out = await comPerfil(req.user, async (c) => {
    const v = (await c.query(`${SELECT} WHERE x.id = $1`, [id])).rows[0];
    if (!v) return null;
    const obs = (await c.query(`SELECT o.id, o.texto, o.em, o.autor_id, u.nome_completo AS autor FROM venda_externa_obs o JOIN usuario u ON u.id = o.autor_id
                                 WHERE o.venda_id = $1 ORDER BY o.em, o.id`, [id])).rows;
    return { ...v, obs };
  });
  if (!out) return res.status(404).json({ erro: "Venda não encontrada." });
  res.json(out);
});

// POST /api/venda-externa  { sistema: SISTEMA_A | SISTEMA_B, ...campos }  -> vendedor cria
r.post("/venda-externa", exigePerfil("vendedor"), async (req, res) => {
  const b = req.body || {};
  if (!SISTEMAS.includes(b.sistema)) return res.status(400).json({ erro: "Escolha Sistema A ou Sistema B." });
  const d = dadosDoFormulario(b, b.sistema);
  const viab = intOk(b.viabilidade_id);
  const id = await comPerfil(req.user, async (c) => (await c.query(
    `INSERT INTO venda_externa (sistema, vendedor_id, viabilidade_id, cliente_nome, codigo_conexao, biometria, cpf, cidade, contrato, produto, valor, observacao, possui_chip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [b.sistema, req.user.id, viab, d.cliente_nome ?? null, d.codigo_conexao ?? null, d.biometria ?? null, d.cpf ?? null, d.cidade ?? null,
     d.contrato ?? null, d.produto ?? null, d.valor ?? null, d.observacao, d.possui_chip ?? null])).rows[0].id);
  res.status(201).json({ ok: true, id });
});

// PUT /api/venda-externa/:id  -> vendedor edita o próprio formulário enquanto não estiver finalizada
r.put("/venda-externa/:id", exigePerfil("vendedor"), async (req, res) => {
  const id = intOk(req.params.id), b = req.body || {};
  await comPerfil(req.user, async (c) => {
    const v = (await c.query("SELECT sistema, status FROM venda_externa WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!v) throw erro("Venda não encontrada.", 404);
    if (v.status === "FINALIZADO") throw erro("Esta venda já foi finalizada e não pode mais ser editada.", 409);
    const d = dadosDoFormulario(b, v.sistema);
    await c.query(
      `UPDATE venda_externa SET cliente_nome=$2, codigo_conexao=$3, biometria=$4, cpf=$5, cidade=$6, contrato=$7, produto=$8, valor=$9, observacao=$10, possui_chip=$11 WHERE id=$1`,
      [id, d.cliente_nome ?? null, d.codigo_conexao ?? null, d.biometria ?? null, d.cpf ?? null, d.cidade ?? null, d.contrato ?? null, d.produto ?? null, d.valor ?? null, d.observacao, d.possui_chip ?? null]);
  });
  res.json({ ok: true });
});

// PATCH /api/venda-externa/:id/retorno  { status, mensagem?, prazo_horas? }  -> backoffice de Cadastro responde
r.patch("/venda-externa/:id/retorno", ...podeResponder, async (req, res) => {
  const id = intOk(req.params.id), b = req.body || {};
  const status = String(b.status || "");
  if (!STATUS.includes(status)) return res.status(400).json({ erro: "Situação inválida." });
  const msg = txt(b.mensagem, 1000);
  let prazoH = null;
  if (status === "CRIACAO_HP") {
    prazoH = intOk(b.prazo_horas);
    if (!prazoH || prazoH > 720) return res.status(400).json({ erro: "Informe o prazo em horas (de 1 a 720)." });
  }
  if (status === "PENDENCIA" && !msg) return res.status(400).json({ erro: "Escreva o que falta para o vendedor." });
  const texto = status === "ATIVO_SEM_SUCESSO" ? (msg ? `${CORRECAO}: ${msg}` : CORRECAO) : msg;
  await comPerfil(req.user, async (c) => {
    if (status === "FINALIZADO") {
      const v = (await c.query("SELECT possui_chip FROM venda_externa WHERE id = $1", [id])).rows[0];
      if (v?.possui_chip) {
        const fotos = (await c.query("SELECT count(*)::int n FROM anexo WHERE entidade = 'VENDA_EXTERNA' AND entidade_id = $1 AND removido_em IS NULL AND tipo LIKE 'image/%'", [id])).rows[0].n;
        if (!fotos) throw erro("Esta venda tem chip: anexe a foto do chip antes de finalizar.", 409);
      }
    }
    const n = (await c.query(
      `UPDATE venda_externa SET status = $2, retorno_msg = $3,
              prazo_em = CASE WHEN $4::int IS NULL THEN NULL ELSE now() + ($4::int * interval '1 hour') END,
              respondido_por = $5, respondido_em = now(), visto_vendedor_em = NULL
        WHERE id = $1`,
      [id, status, texto, prazoH, req.user.id])).rowCount;
    if (!n) throw erro("Venda não encontrada.", 404);
  });
  res.json({ ok: true });
});

// POST /api/venda-externa/:id/obs  { texto }  -> mensagem no chat da venda (o vendedor não escreve depois de finalizada)
r.post("/venda-externa/:id/obs", async (req, res) => {
  const id = intOk(req.params.id), texto = txt(req.body?.texto, 1000);
  if (!texto) return res.status(400).json({ erro: "Escreva a mensagem." });
  const dono = await comPerfil(req.user, async (c) => {
    const v = (await c.query("SELECT status, vendedor_id FROM venda_externa WHERE id = $1", [id])).rows[0];
    if (!v) throw erro("Venda não encontrada.", 404);
    if (req.user.perfil === "vendedor" && v.status === "FINALIZADO") throw erro("Esta venda já foi finalizada: a conversa está fechada.", 409);
    await c.query("INSERT INTO venda_externa_obs (venda_id, autor_id, texto) VALUES ($1,$2,$3)", [id, req.user.id, texto]);
    return v.vendedor_id;
  });
  // aviso sem o texto: vendedor -> backoffice de Cadastro; backoffice/gerente -> vendedor
  const destinos = req.user.perfil === "vendedor" ? await backofficeCadastro() : [dono];
  avisarPessoas(destinos, { titulo: `Sistema A / Sistema B · venda nº ${id}`, corpo: "Nova mensagem na conversa", url: "/#/vendaexterna", tag: `venda-${id}` });
  res.status(201).json({ ok: true });
});

// POST /api/venda-externa/:id/visto  -> vendedor leu o retorno
// POST /api/venda-externa/:id/chat-visto -> o vendedor abriu a venda (zera os avisos do chat dela)
r.post("/venda-externa/:id/chat-visto", exigePerfil("vendedor"), async (req, res) => {
  const id = intOk(req.params.id);
  await comPerfil(req.user, (c) => c.query("UPDATE venda_externa SET visto_chat_vendedor_em = now() WHERE id = $1", [id]));
  res.json({ ok: true });
});

r.post("/venda-externa/:id/visto", exigePerfil("vendedor"), async (req, res) => {
  const id = intOk(req.params.id);
  await comPerfil(req.user, (c) => c.query("UPDATE venda_externa SET visto_vendedor_em = now() WHERE id = $1 AND respondido_em IS NOT NULL AND visto_vendedor_em IS NULL", [id]));
  res.json({ ok: true });
});

export default r;
