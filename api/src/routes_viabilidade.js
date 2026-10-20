import { Router } from "express";
import { comPerfil } from "./db.js";
import { avisarPessoas, backofficeCadastro } from "./notificacoes.js";
import { exigePerfil, exigeSetor } from "./auth.js";

/* Viabilidade: o vendedor pede pelo sistema (endereço + CEP) e o backoffice de Cadastro responde se atende.
   Tudo fica registrado (pedido, quem analisou, resposta e observações). O vendedor só enxerga os próprios pedidos (RLS no banco). */
const r = Router();
const STATUS = ["PENDENTE", "EM_ANALISE", "ATENDE", "NAO_ATENDE", "NAO_PEDIDO"];
// "aberto" = o endereço (se pedido) ainda sem resposta OU alguma checagem pedida ainda sem resposta
const ABERTO = "((v.checa_endereco AND v.status IN ('PENDENTE','EM_ANALISE')) OR (v.checa_credito AND v.credito_status = 'PENDENTE') OR (v.checa_linha AND v.linha_status = 'PENDENTE'))";
const staff = (u) => ["gestor", "backoffice"].includes(u.perfil);
const podeResponder = [exigePerfil("gestor", "backoffice"), exigeSetor("CADASTRO")];
const erro = (m, status = 400) => Object.assign(new Error(m), { status });
const txt = (v, max) => { const s = String(v ?? "").trim().replace(/\s+/g, " "); return s ? s.slice(0, max) : null; };
const so11 = (v) => { const d = String(v ?? "").replace(/\D/g, ""); return d.length === 11 ? d : null; };
const dataIso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !isNaN(new Date(v)) ? String(v) : null);
const intOk = (v) => { const n = parseInt(v || "", 10); return n > 0 ? n : null; };
const dataOk = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : null);
r.use(["/viabilidade", "/cep"], exigePerfil("gestor", "backoffice", "vendedor"));

// GET /api/cep/:cep  -> endereço pelo CEP (ViaCEP). Se a consulta falhar, o vendedor digita o endereço.
r.get("/cep/:cep", async (req, res) => {
  const cep = String(req.params.cep || "").replace(/\D/g, "");
  if (cep.length !== 8) return res.status(400).json({ erro: "CEP precisa ter 8 números." });
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
    const rr = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: ctl.signal });
    clearTimeout(t);
    const j = await rr.json();
    if (j.erro) return res.status(404).json({ erro: "CEP não encontrado. Confira ou preencha o endereço." });
    res.json({ cep, logradouro: j.logradouro || "", bairro: j.bairro || "", cidade: j.localidade || "", uf: j.uf || "" });
  } catch {
    res.status(503).json({ erro: "Consulta de CEP indisponível agora. Preencha o endereço." });
  }
});

const SELECT = `
  SELECT v.*, u.nome_completo AS vendedor_nome, ra.nome_completo AS respondido_por_nome, an.nome_completo AS em_analise_por_nome,
         (SELECT count(*)::int FROM viabilidade_obs o WHERE o.viabilidade_id = v.id) AS n_obs,
         (SELECT o.texto FROM viabilidade_obs o WHERE o.viabilidade_id = v.id ORDER BY o.em DESC, o.id DESC LIMIT 1) AS ultima_obs
    FROM viabilidade v
    JOIN usuario u ON u.id = v.vendedor_id
    LEFT JOIN usuario ra ON ra.id = v.respondido_por
    LEFT JOIN usuario an ON an.id = v.em_analise_por`;

// GET /api/viabilidade?status=&busca=&de=&ate=&vendedor=&pagina=
r.get("/viabilidade", async (req, res) => {
  const w = [], p = [];
  const add = (cond, v) => { p.push(v); w.push(cond.replaceAll("?", "$" + p.length)); };
  const st = String(req.query.status || "");
  if (st === "ABERTAS") w.push(ABERTO);
  else if (STATUS.includes(st)) add("v.status = ?", st);
  if (dataOk(req.query.de)) add("v.criado_em >= ?::date", req.query.de);
  if (dataOk(req.query.ate)) add("v.criado_em < ?::date + 1", req.query.ate);
  if (intOk(req.query.vendedor) && staff(req.user)) add("v.vendedor_id = ?", intOk(req.query.vendedor));
  const busca = txt(req.query.busca, 80);
  if (busca) add("(v.logradouro ILIKE ? OR v.bairro ILIKE ? OR v.cidade ILIKE ? OR v.cep LIKE ? OR coalesce(v.cliente_nome,'') ILIKE ? OR u.nome_completo ILIKE ?)", `%${busca}%`);
  const pagina = Math.max(1, intOk(req.query.pagina) || 1);
  const out = await comPerfil(req.user, async (c) => {
    const where = w.length ? "WHERE " + w.join(" AND ") : "";
    const total = (await c.query(`SELECT count(*)::int n FROM viabilidade v JOIN usuario u ON u.id = v.vendedor_id ${where}`, p)).rows[0].n;
    // abertas primeiro (a mais antiga no topo, quem espera há mais tempo); depois as respondidas, mais recentes primeiro
    const itens = (await c.query(`${SELECT} ${where}
      ORDER BY (${ABERTO}) DESC,
               CASE WHEN ${ABERTO} THEN extract(epoch FROM v.criado_em) ELSE -extract(epoch FROM coalesce(v.respondido_em, v.criado_em)) END
      LIMIT 50 OFFSET ${(pagina - 1) * 50}`, p)).rows;
    // indicadores por pedido (inclui os pedidos só de checagem: crédito e linha)
    const r0 = (await c.query(`SELECT
        count(*) FILTER (WHERE ${ABERTO} AND v.status IS DISTINCT FROM 'EM_ANALISE')::int AS pendente,
        count(*) FILTER (WHERE v.status = 'EM_ANALISE')::int AS em_analise,
        count(*) FILTER (WHERE (v.checa_endereco OR v.checa_credito OR v.checa_linha)
          AND (NOT v.checa_endereco OR v.status = 'ATENDE') AND (NOT v.checa_credito OR v.credito_status = 'ATENDE') AND (NOT v.checa_linha OR v.linha_status = 'ATENDE'))::int AS atende,
        count(*) FILTER (WHERE (v.checa_endereco AND v.status = 'NAO_ATENDE') OR (v.checa_credito AND v.credito_status = 'NAO_ATENDE') OR (v.checa_linha AND v.linha_status = 'NAO_ATENDE'))::int AS nao_atende
      FROM viabilidade v`)).rows[0];
    const contagem = { PENDENTE: r0.pendente, EM_ANALISE: r0.em_analise, ATENDE: r0.atende, NAO_ATENDE: r0.nao_atende };
    const vendedores = staff(req.user) ? (await c.query("SELECT DISTINCT u.id, u.nome_completo AS nome FROM viabilidade v JOIN usuario u ON u.id = v.vendedor_id ORDER BY 2")).rows : [];
    const sem = itens.map(({ cred_nome, cred_cpf, cred_nascimento, linha_cpf, ...r }) => r);
    return { total, pagina, itens: sem, contagem, vendedores };
  });
  res.json(out);
});

// GET /api/viabilidade/:id  (com as observações)
r.get("/viabilidade/:id", async (req, res) => {
  const id = intOk(req.params.id);
  const out = await comPerfil(req.user, async (c) => {
    const v = (await c.query(`${SELECT} WHERE v.id = $1`, [id])).rows[0];
    if (!v) return null;
    const obs = (await c.query(`SELECT o.id, o.texto, o.em, o.autor_id, u.nome_completo AS autor FROM viabilidade_obs o JOIN usuario u ON u.id = o.autor_id
                                 WHERE o.viabilidade_id = $1 ORDER BY o.em, o.id`, [id])).rows;
    return { ...v, obs };
  });
  if (!out) return res.status(404).json({ erro: "Viabilidade não encontrada." });
  res.json(out);
});

// POST /api/viabilidade  { checa_endereco?, checa_credito?, checa_linha?, cep, logradouro, numero, complemento, bairro, cidade, uf, referencia, cliente_nome, cliente_contato, observacao, ... }
// O vendedor escolhe as checagens; ao menos uma. Endereço só é exigido quando marcado.
r.post("/viabilidade", async (req, res) => {
  const b = req.body || {};
  const ligado = (x) => x === "on" || x === true || x === "true";
  const checaEnd = ligado(b.checa_endereco), checaCred = ligado(b.checa_credito), checaLinha = ligado(b.checa_linha);
  if (!checaEnd && !checaCred && !checaLinha) return res.status(400).json({ erro: "Escolha ao menos uma checagem: endereço, crédito ou linha móvel." });
  let cep = null, d = { logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null, referencia: null };
  if (checaEnd) {
    cep = String(b.cep || "").replace(/\D/g, "");
    if (cep.length !== 8) return res.status(400).json({ erro: "Informe o CEP com 8 números." });
    d = { logradouro: txt(b.logradouro, 200), numero: txt(b.numero, 20), complemento: txt(b.complemento, 100), bairro: txt(b.bairro, 100), cidade: txt(b.cidade, 100),
      uf: (txt(b.uf, 2) || "").toUpperCase() || null, referencia: txt(b.referencia, 200) };
    if (!d.logradouro || d.logradouro.length < 2) return res.status(400).json({ erro: "Informe a rua (logradouro)." });
    if (!d.numero) return res.status(400).json({ erro: "Informe o número (use S/N se não houver)." });
    if (d.uf && !/^[A-Z]{2}$/.test(d.uf)) return res.status(400).json({ erro: "UF inválida." });
  }
  const cliente_nome = txt(b.cliente_nome, 150), cliente_contato = txt(b.cliente_contato, 40);
  const obs = txt(b.observacao, 1000);
  const cred = { nome: txt(b.cred_nome, 150), cpf: so11(b.cred_cpf), nasc: dataIso(b.cred_nascimento), cidade: txt(b.cred_cidade, 100) };
  const linhaCpf = so11(b.linha_cpf);
  if (checaCred && !cred.nome) return res.status(400).json({ erro: "Informe o nome para a checagem de crédito." });
  if (checaCred && !cred.cpf) return res.status(400).json({ erro: "CPF da checagem de crédito inválido (11 números)." });
  if (checaCred && !cred.nasc) return res.status(400).json({ erro: "Informe a data de nascimento para a checagem de crédito." });
  if (checaCred && !cred.cidade) return res.status(400).json({ erro: "Informe a cidade para a checagem de crédito." });
  if (checaLinha && !linhaCpf) return res.status(400).json({ erro: "CPF inválido para a checagem de linha móvel (11 números)." });
  const id = await comPerfil(req.user, async (c) => {
    if (checaEnd) {
      // evita pedido repetido sem querer (mesmo vendedor, mesmo CEP e número, ainda em aberto)
      const dup = (await c.query(`SELECT id FROM viabilidade WHERE vendedor_id = $1 AND checa_endereco AND cep = $2 AND coalesce(numero,'') = coalesce($3,'') AND status IN ('PENDENTE','EM_ANALISE')`,
        [req.user.id, cep, d.numero])).rows[0];
      if (dup) throw erro(`Você já tem um pedido aberto para este endereço (nº ${dup.id}). Aguarde a resposta ou escreva nas observações dele.`, 409);
    }
    const novo = (await c.query(`INSERT INTO viabilidade (vendedor_id, status, cep, logradouro, numero, complemento, bairro, cidade, uf, referencia, cliente_nome, cliente_contato,
                                    checa_endereco, checa_credito, checa_linha, cred_nome, cred_cpf, cred_nascimento, cred_cidade, linha_cpf)
                                  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
      [req.user.id, checaEnd ? "PENDENTE" : "NAO_PEDIDO", cep, d.logradouro, d.numero, d.complemento, d.bairro, d.cidade, d.uf, d.referencia, cliente_nome, cliente_contato,
       checaEnd, checaCred, checaLinha, checaCred ? cred.nome : null, checaCred ? cred.cpf : null, checaCred ? cred.nasc : null, checaCred ? cred.cidade : null, checaLinha ? linhaCpf : null])).rows[0].id;
    if (obs) await c.query("INSERT INTO viabilidade_obs (viabilidade_id, autor_id, texto) VALUES ($1,$2,$3)", [novo, req.user.id, obs]);
    return novo;
  });
  res.status(201).json({ ok: true, id });
});

// POST /api/viabilidade/:id/obs  { texto }
r.post("/viabilidade/:id/obs", async (req, res) => {
  const id = intOk(req.params.id), texto = txt(req.body?.texto, 1000);
  if (!texto) return res.status(400).json({ erro: "Escreva a observação." });
  await comPerfil(req.user, async (c) => {
    if (!(await c.query("SELECT 1 FROM viabilidade WHERE id = $1", [id])).rowCount) throw erro("Viabilidade não encontrada.", 404);
    await c.query("INSERT INTO viabilidade_obs (viabilidade_id, autor_id, texto) VALUES ($1,$2,$3)", [id, req.user.id, texto]);
    // se o vendedor escreve depois da resposta, o backoffice volta a ver o pedido como novo para o vendedor (nada muda no status)
  });
  res.status(201).json({ ok: true });
});

// PATCH /api/viabilidade/:id  { status: EM_ANALISE | ATENDE | NAO_ATENDE | PENDENTE, resposta? }  (backoffice de Cadastro e gerente)
r.patch("/viabilidade/:id", ...podeResponder, async (req, res) => {
  const id = intOk(req.params.id), status = String(req.body?.status || ""), resposta = txt(req.body?.resposta, 1000);
  const hp = String(req.body?.hp ?? "").trim();
  if (!STATUS.includes(status)) return res.status(400).json({ erro: "Situação inválida." });
  if (status === "NAO_ATENDE" && !resposta) return res.status(400).json({ erro: "Explique por que não atende (o vendedor vai ler)." });
  if (status === "ATENDE" && !/^[0-9]{1,20}$/.test(hp)) return res.status(400).json({ erro: "Preencha o HP (só números) para atender." });
  await comPerfil(req.user, async (c) => {
    const v = (await c.query("SELECT status, em_analise_por, checa_endereco FROM viabilidade WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!v) throw erro("Viabilidade não encontrada.", 404);
    if (!v.checa_endereco) throw erro("Este pedido não tem checagem de endereço. Responda as checagens pedidas.", 409);
    if (status === "EM_ANALISE") {
      if (v.status === "EM_ANALISE" && v.em_analise_por && v.em_analise_por !== req.user.id) throw erro("Outra pessoa já está analisando este pedido.", 409);
      await c.query("UPDATE viabilidade SET status = 'EM_ANALISE', em_analise_por = $2 WHERE id = $1", [id, req.user.id]);
    } else if (status === "PENDENTE") {
      await c.query("UPDATE viabilidade SET status = 'PENDENTE', em_analise_por = NULL, respondido_por = NULL, respondido_em = NULL WHERE id = $1", [id]);
    } else {
      await c.query(`UPDATE viabilidade SET status = $2, respondido_por = $3, respondido_em = now(), em_analise_por = coalesce(em_analise_por, $3), visto_vendedor_em = NULL
                      WHERE id = $1`, [id, status, req.user.id]);
    }
    if (status === "ATENDE") await c.query("UPDATE viabilidade SET hp = $2 WHERE id = $1", [id, hp]);
    if (resposta) await c.query("INSERT INTO viabilidade_obs (viabilidade_id, autor_id, texto) VALUES ($1,$2,$3)", [id, req.user.id, resposta]);
  });
  res.json({ ok: true });
});

// POST /api/viabilidade/:id/hp  { hp }  -> número HP gerado pela operadora (só depois de "Atende"; só dígitos)
r.post("/viabilidade/:id/hp", ...podeResponder, async (req, res) => {
  const id = intOk(req.params.id), hp = String(req.body?.hp ?? "").trim();
  if (!/^[0-9]{1,20}$/.test(hp)) return res.status(400).json({ erro: "O HP é só número (até 20 dígitos)." });
  await comPerfil(req.user, async (c) => {
    const v = (await c.query("SELECT status FROM viabilidade WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!v) throw erro("Viabilidade não encontrada.", 404);
    if (v.status !== "ATENDE") throw erro("O HP só é preenchido depois do Atende.", 409);
    await c.query("UPDATE viabilidade SET hp = $2 WHERE id = $1", [id, hp]);
  });
  res.json({ ok: true });
});

// POST /api/viabilidade/:id/contestar  { texto }  -> o vendedor contesta um "Não atende" (até 7 dias); volta para a fila do backoffice
r.post("/viabilidade/:id/contestar", exigePerfil("vendedor"), async (req, res) => {
  const id = intOk(req.params.id), texto = txt(req.body?.texto, 1000);
  if (!texto || texto.length < 3) return res.status(400).json({ erro: "Explique por que a viabilidade está correta." });
  try {
    await comPerfil(req.user, (c) => c.query("SELECT viabilidade_contestar($1, $2)", [id, texto]));
    avisarPessoas(await backofficeCadastro(), { titulo: "Viabilidade contestada", corpo: `Pedido nº ${id} voltou para a fila`, url: "/#/viabilidade", tag: `viab-${id}` });
  } catch (e) {
    if (e.code === "P0002") return res.status(404).json({ erro: e.message });
    if (e.code === "42501") return res.status(403).json({ erro: "Sem permissão para este pedido." });
    if (e.code === "P0001") return res.status(409).json({ erro: e.message });
    throw e;
  }
  res.status(201).json({ ok: true });
});

// POST /api/viabilidade/:id/encaminhar  { destino: SISTEMA_A | SISTEMA_B }  -> o vendedor encaminha a venda depois do Atende
r.post("/viabilidade/:id/encaminhar", exigePerfil("vendedor"), async (req, res) => {
  const id = intOk(req.params.id), destino = String(req.body?.destino || "");
  const nomes = { SISTEMA_A: "Sistema A", SISTEMA_B: "Sistema B" };
  if (!nomes[destino]) return res.status(400).json({ erro: "Escolha Sistema A ou Sistema B." });
  await comPerfil(req.user, async (c) => {
    const v = (await c.query("SELECT status, encaminhado_para, checa_endereco, checa_credito, credito_status, checa_linha, linha_status FROM viabilidade WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!v) throw erro("Viabilidade não encontrada.", 404);
    if (v.checa_endereco && v.status !== "ATENDE") throw erro("Só dá para encaminhar a venda depois do Atende do endereço.", 409);
    if (v.encaminhado_para) throw erro(`Esta venda já foi encaminhada para ${nomes[v.encaminhado_para]}.`, 409);
    if (v.checa_credito && v.credito_status !== "ATENDE") throw erro("Falta o Atende da checagem de crédito.", 409);
    if (v.checa_linha && v.linha_status !== "ATENDE") throw erro("Falta o Atende da checagem de linha móvel.", 409);
    await c.query("UPDATE viabilidade SET encaminhado_para = $2, encaminhado_em = now() WHERE id = $1", [id, destino]);
  });
  res.json({ ok: true });
});

// PATCH /api/viabilidade/:id/checagem/:tipo  { status: ATENDE | NAO_ATENDE | PENDENTE, resposta?, limite?, oferta_single? }  (CREDITO | LINHA)
// Crédito: Aprovado / Reprovado / Aprovado (Oferta Single), sem limite. Linha móvel: Atende / Não atende com limite liberado.
r.patch("/viabilidade/:id/checagem/:tipo", ...podeResponder, async (req, res) => {
  const id = intOk(req.params.id), tipo = String(req.params.tipo || "").toUpperCase();
  if (!["CREDITO", "LINHA"].includes(tipo)) return res.status(400).json({ erro: "Checagem inválida." });
  const status = String(req.body?.status || ""), resposta = txt(req.body?.resposta, 1000);
  if (!["ATENDE", "NAO_ATENDE", "PENDENTE"].includes(status)) return res.status(400).json({ erro: "Situação inválida." });
  if (status === "NAO_ATENDE" && !resposta) return res.status(400).json({ erro: "Explique por que não atende (o vendedor vai ler)." });
  const oferta = tipo === "CREDITO" && status === "ATENDE" && req.body?.oferta_single === true;
  let limite = null;
  if (tipo === "LINHA" && status === "ATENDE") {
    limite = Number(String(req.body?.limite ?? "").replace(/\./g, "").replace(",", "."));
    if (!(limite > 0)) return res.status(400).json({ erro: "Informe o limite liberado em R$." });
  }
  await comPerfil(req.user, async (c) => {
    const v = (await c.query("SELECT checa_credito, checa_linha FROM viabilidade WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!v) throw erro("Viabilidade não encontrada.", 404);
    if (!(tipo === "CREDITO" ? v.checa_credito : v.checa_linha)) throw erro("Esta checagem não foi pedida neste pedido.", 409);
    const quando = status === "PENDENTE" ? null : new Date();
    if (tipo === "CREDITO") await c.query("UPDATE viabilidade SET credito_status = $2, credito_oferta_single = $3, credito_limite = NULL, credito_respondido_em = $4 WHERE id = $1", [id, status, oferta, quando]);
    else await c.query("UPDATE viabilidade SET linha_status = $2, linha_limite = $3, linha_respondido_em = $4 WHERE id = $1", [id, status, status === "ATENDE" ? limite : null, quando]);
    if (quando) await c.query("UPDATE viabilidade SET respondido_por = $2, respondido_em = now(), visto_vendedor_em = NULL WHERE id = $1", [id, req.user.id]);
    const nome = tipo === "CREDITO" ? "Crédito" : "Linha móvel";
    const texto = [tipo === "LINHA" && status === "ATENDE" ? `${nome}: limite liberado R$ ${limite.toFixed(2).replace(".", ",")}` : oferta ? `${nome}: aprovado (Oferta Single)` : null, resposta ? `${nome}: ${resposta}` : null].filter(Boolean).join(" · ");
    if (texto) await c.query("INSERT INTO viabilidade_obs (viabilidade_id, autor_id, texto) VALUES ($1,$2,$3)", [id, req.user.id, texto]);
  });
  res.json({ ok: true });
});

// POST /api/viabilidade/:id/visto  -> o vendedor leu a resposta (some o aviso)
r.post("/viabilidade/:id/visto", exigePerfil("vendedor"), async (req, res) => {
  const id = intOk(req.params.id);
  await comPerfil(req.user, (c) => c.query("UPDATE viabilidade SET visto_vendedor_em = now() WHERE id = $1 AND respondido_em IS NOT NULL AND visto_vendedor_em IS NULL", [id]));
  res.json({ ok: true });
});

// GET /api/avisos -> consulta leve (a cada ~20 s): o que tem de novo para tocar o som e mostrar o número no menu
r.get("/avisos", async (req, res) => {
  const u = req.user;
  if (u.perfil === "vendedor") {
    const x = await comPerfil(u, async (c) => (await c.query(
      `SELECT count(*) FILTER (WHERE respondido_em IS NOT NULL AND visto_vendedor_em IS NULL)::int AS respondidas,
              coalesce(max(extract(epoch FROM respondido_em)) FILTER (WHERE visto_vendedor_em IS NULL), 0)::bigint AS marca
         FROM viabilidade`)).rows[0]).catch(() => ({ respondidas: 0, marca: 0 }));
    // Sistema A / Sistema B: retorno do backoffice ainda não lido + mensagens novas do chat de vendas dele
    const cx = await comPerfil(u, async (c) => (await c.query(
      `WITH retorno AS (SELECT id, respondido_em AS em FROM venda_externa WHERE respondido_em IS NOT NULL AND visto_vendedor_em IS NULL),
            chat AS (SELECT o.venda_id AS id, max(o.em) AS em FROM venda_externa_obs o JOIN venda_externa v ON v.id = o.venda_id
                      WHERE o.autor_id <> $1::bigint AND o.em > coalesce(v.visto_chat_vendedor_em, v.criado_em) GROUP BY o.venda_id),
            prazo AS (SELECT id, prazo_em AS em FROM venda_externa WHERE status = 'CRIACAO_HP' AND prazo_em IS NOT NULL AND prazo_em <= now() + interval '12 hours'),
            todas AS (SELECT id, em FROM retorno UNION ALL SELECT id, em FROM chat UNION ALL SELECT id, em FROM prazo)
       SELECT count(DISTINCT id)::int AS avisos, coalesce(max(extract(epoch FROM em)), 0)::bigint AS marca FROM todas`, [Number(u.id)])).rows[0])
      .catch(() => ({ avisos: 0, marca: 0 }));
    return res.json({ viabilidade: { respondidas: x.respondidas, marca: String(x.marca) }, conexao: { avisos: cx.avisos, marca: String(cx.marca) } });
  }
  if (u.perfil === "gestor" || (u.perfil === "backoffice" && u.setor === "CADASTRO")) {
    const x = await comPerfil(u, async (c) => (await c.query(
      `SELECT count(*) FILTER (WHERE ${ABERTO})::int AS pendentes, count(*) FILTER (WHERE v.status = 'EM_ANALISE')::int AS em_analise,
              coalesce(max(v.id) FILTER (WHERE ${ABERTO}), 0)::bigint AS marca FROM viabilidade v`)).rows[0]).catch(() => ({ pendentes: 0, em_analise: 0, marca: 0 }));
    const cx = await comPerfil(u, async (c) => (await c.query(
      `SELECT count(*) FILTER (WHERE status = 'PENDENTE_TRATAMENTO')::int AS pendentes,
              coalesce(max(extract(epoch FROM criado_em)) FILTER (WHERE status = 'PENDENTE_TRATAMENTO'), 0)::bigint AS marca FROM venda_externa`)).rows[0])
      .catch(() => ({ pendentes: 0, marca: 0 }));
    return res.json({ viabilidade: { pendentes: x.pendentes, em_analise: x.em_analise, marca: String(x.marca) }, conexao: { pendentes: cx.pendentes, marca: String(cx.marca) } });
  }
  res.json({});
});

export default r;
