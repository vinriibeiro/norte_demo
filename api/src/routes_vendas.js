import { Router } from "express";
import { comPerfil } from "./db.js";
import { exigePerfil, exigeSetor } from "./auth.js";
import { carregarCatalogos, validar, gravar, sincronizarAgenda } from "./vendas.js";
import { avisarNovasVendas } from "./notificacoes.js";

const r = Router();
const equipeOp = exigePerfil("gestor", "backoffice");
const cadastro = [equipeOp, exigeSetor("CADASTRO")];   // criar e editar: só o backoffice de Cadastro (e o gerente)

r.get("/catalogos", equipeOp, async (req, res) => {
  res.json(await comPerfil(req.user, (c) => carregarCatalogos(c)));
});

// Busca de cliente já cadastrado (por nome, CPF/CNPJ ou contato) para reaproveitar no cadastro
r.get("/clientes", equipeOp, async (req, res) => {
  const b = String(req.query.busca || "").trim();
  if (b.length < 3) return res.json([]);
  const dig = b.replace(/\D/g, "");
  const rows = await comPerfil(req.user, async (c) =>
    (await c.query(
      `SELECT id, tipo_pessoa, documento, nome, contato, contato_2, data_nascimento,
              (SELECT count(*) FROM contrato k WHERE k.cliente_id = cliente.id) AS contratos,
              (SELECT max(k.data_venda) FROM contrato k WHERE k.cliente_id = cliente.id) AS ultima_venda,
              (SELECT string_agg(DISTINCT k.status_venda, ', ') FROM contrato k WHERE k.cliente_id = cliente.id) AS situacoes
         FROM cliente WHERE nome ILIKE $1 OR ($2 <> '' AND documento LIKE $2 || '%') OR ($2 <> '' AND regexp_replace(coalesce(contato,''),'\\D','','g') LIKE '%' || $2 || '%')
        ORDER BY nome LIMIT 15`, [`%${b}%`, dig.length >= 3 ? dig : ""])).rows);
  res.json(rows);
});

/**
 * POST /api/vendas  { linhas: [...], gravar: true|false }
 * gravar=false  -> só valida e devolve o resultado por linha
 * gravar=true   -> grava as linhas válidas (cada linha isolada por SAVEPOINT); as inválidas voltam com o motivo
 */
r.post("/vendas", ...cadastro, async (req, res) => {
  const linhas = Array.isArray(req.body.linhas) ? req.body.linhas : [];
  if (!linhas.length) return res.status(400).json({ erro: "Nenhuma linha enviada." });
  if (linhas.length > 500) return res.status(400).json({ erro: "Máximo de 500 linhas por envio." });
  const gravarAgora = req.body.gravar === true;
  const resultado = await comPerfil(req.user, async (c) => {
    const cat = await carregarCatalogos(c);
    const out = [], vistosContrato = new Set();
    for (let i = 0; i < linhas.length; i++) {
      const { erros, d } = validar(linhas[i], cat);
      if (d.numero_contrato) {
        if (vistosContrato.has(d.numero_contrato)) erros.push(`Contrato ${d.numero_contrato} repetido nesta lista`);
        vistosContrato.add(d.numero_contrato);
        if (!erros.length && (await c.query("SELECT 1 FROM contrato WHERE sistema_origem='NORTE' AND numero_contrato=$1", [d.numero_contrato])).rowCount)
          erros.push(`Contrato ${d.numero_contrato} já cadastrado`);
      }
      if (erros.length) { out.push({ linha: i, ok: false, erros }); continue; }
      if (!gravarAgora) { out.push({ linha: i, ok: true }); continue; }
      await c.query("SAVEPOINT l");
      try {
        const g = await gravar(c, d, req.user.id);
        await c.query("RELEASE SAVEPOINT l");
        out.push({ linha: i, ok: true, ...g });
      } catch (e) {
        await c.query("ROLLBACK TO SAVEPOINT l");
        if (e.negocio) out.push({ linha: i, ok: false, erros: [e.message] });
        else if (e.code === "23505") out.push({ linha: i, ok: false, erros: ["Registro duplicado (contrato ou item já existe)"] });
        else if (e.code === "23514" || e.code === "23503") out.push({ linha: i, ok: false, erros: ["Dados rejeitados pelo banco: " + (e.detail || e.message)] });
        else throw e;
      }
    }
    return out;
  });
  const ok = resultado.filter((x) => x.ok).length;
  if (gravarAgora) avisarNovasVendas(resultado.filter((x) => x.ok && x.contrato_id).map((x) => x.contrato_id), req.user.id);   // aviso no celular do Gerente/Adm
  res.status(gravarAgora && ok ? 201 : 200).json({ gravado: gravarAgora, total: linhas.length, validas: ok, invalidas: linhas.length - ok, resultado });
});

const CAMPOS_CONTRATO = ["status_venda", "status_contrato", "motivo_id", "data_agendamento", "turno", "pacote_valor", "forma_pagamento",
  "dia_vencimento", "cidade_id", "bairro", "endereco", "observacao", "origem", "canal", "auditoria", "equipe_id", "data_venda", "numero_contrato", "tipo_imovel"];
const CAMPOS_CLIENTE = ["nome", "contato", "contato_2", "data_nascimento"];

// Detalhe completo de um contrato
r.get("/contratos/:id", equipeOp, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const dados = await comPerfil(req.user, async (c) => {
    const ct = (await c.query(
      `SELECT k.*, cl.nome AS cliente_nome, cl.tipo_pessoa, cl.documento, cl.contato, cl.contato_2, cl.data_nascimento,
              u.nome_completo AS vendedor_nome, u.login AS vendedor_login, e.nome AS equipe_nome, ci.nome AS cidade_nome, ci.uf
         FROM contrato k JOIN cliente cl ON cl.id = k.cliente_id JOIN usuario u ON u.id = k.vendedor_id
         LEFT JOIN equipe e ON e.id = k.equipe_id LEFT JOIN cidade ci ON ci.id = k.cidade_id WHERE k.id = $1`, [id])).rows[0];
    if (!ct) return null;
    const itens = (await c.query("SELECT i.id, i.produto_id, i.quantidade, i.tipo_adesao, p.categoria, p.nome FROM contrato_item i JOIN produto p ON p.id=i.produto_id WHERE i.contrato_id=$1 ORDER BY p.categoria", [id])).rows;
    const historico = (await c.query("SELECT status_venda, status_contrato, motivo_id, usuario_id, ocorrido_em FROM contrato_status_evento WHERE contrato_id=$1 ORDER BY ocorrido_em DESC LIMIT 30", [id])).rows;
    const faturas = (await c.query("SELECT numero, vencimento, prazo_limite, valor, data_pagamento, situacao FROM fatura WHERE contrato_id=$1 ORDER BY numero", [id])).rows;
    let alteracoes = [];
    if (req.user.perfil === "gestor")
      alteracoes = (await c.query(
        "SELECT a.tabela, a.acao, a.antes, a.depois, a.em, u.nome_completo AS quem FROM alteracao_log a LEFT JOIN usuario u ON u.id=a.usuario_id WHERE (a.tabela='contrato' AND a.registro_id=$1) ORDER BY a.em DESC LIMIT 40", [id])).rows;
    return { contrato: ct, itens, historico, faturas, alteracoes };
  });
  if (!dados) return res.status(404).json({ erro: "Contrato não encontrado." });
  res.json(dados);
});

// Edição (backoffice e gestor). Nunca apaga.
r.patch("/contratos/:id", ...cadastro, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  await comPerfil(req.user, async (c) => {
    const atual = (await c.query("SELECT cliente_id, status_venda, motivo_id FROM contrato WHERE id=$1", [id])).rows[0];
    if (!atual) throw Object.assign(new Error("Contrato não encontrado."), { status: 404 });
    const sets = [], vals = [];
    for (const k of CAMPOS_CONTRATO) if (k in b) { vals.push(b[k] === "" ? null : b[k]); sets.push(`${k} = $${vals.length}`); }
    const novoStatus = b.status_venda ?? atual.status_venda;
    const motivo = "motivo_id" in b ? (b.motivo_id || null) : atual.motivo_id;
    if (["CANCELADO"].includes(novoStatus) && !motivo)
      throw Object.assign(new Error("Informe o motivo do cancelamento."), { status: 400 });
    if (novoStatus === "ATIVO" && !("status_contrato" in b)) { vals.push("CONECTADO"); sets.push(`status_contrato = COALESCE(status_contrato, $${vals.length})`); }
    if (sets.length) { vals.push(id); await c.query(`UPDATE contrato SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals); }
    if ("data_agendamento" in b || "turno" in b) await sincronizarAgenda(c, id);
    const cs = [], cv = [];
    for (const k of CAMPOS_CLIENTE) if (b.cliente && k in b.cliente) { cv.push(b.cliente[k] === "" ? null : b.cliente[k]); cs.push(`${k} = $${cv.length}`); }
    if (cs.length) { cv.push(atual.cliente_id); await c.query(`UPDATE cliente SET ${cs.join(", ")} WHERE id = $${cv.length}`, cv); }
    if (Array.isArray(b.itens)) {   // troca a lista de produtos
      const ids = b.itens.map((i) => +i.produto_id);
      if (!ids.length) throw Object.assign(new Error("O contrato precisa ter ao menos 1 produto."), { status: 400 });
      const remover = (await c.query("SELECT id FROM contrato_item WHERE contrato_id=$1 AND NOT (produto_id = ANY($2::int[]))", [id, ids])).rows;
      if (remover.length) {
        if (req.user.perfil !== "gestor") throw Object.assign(new Error("Só o gerente ou o administrador pode remover produtos de uma venda."), { status: 403 });
        await c.query("DELETE FROM contrato_item WHERE id = ANY($1::bigint[])", [remover.map((x) => x.id)]);
      }
      for (const i of b.itens)
        await c.query(`INSERT INTO contrato_item (contrato_id, produto_id, quantidade, tipo_adesao) VALUES ($1,$2,$3,$4)
                       ON CONFLICT (contrato_id, produto_id) DO UPDATE SET quantidade=EXCLUDED.quantidade, tipo_adesao=EXCLUDED.tipo_adesao`,
          [id, +i.produto_id, +i.quantidade || 1, i.tipo_adesao || null]);
    }
  }).catch((e) => {
    if (e.code === "23514" || e.code === "23503" || e.code === "23505") throw Object.assign(new Error("Dados rejeitados: " + (e.detail || e.message)), { status: 400 });
    throw e;
  });
  res.json({ ok: true });
});

// Exclusão: SOMENTE o administrador (gestor). O banco também recusa para os outros perfis.
r.delete("/contratos/:id", exigePerfil("gestor"), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const n = await comPerfil(req.user, async (c) => {
    await c.query("DELETE FROM pendencia WHERE contrato_id=$1", [id]);
    await c.query("DELETE FROM auditoria_evento WHERE contrato_id=$1", [id]);
    return (await c.query("DELETE FROM contrato WHERE id=$1", [id])).rowCount;
  });
  if (!n) return res.status(404).json({ erro: "Contrato não encontrado." });
  res.json({ ok: true, aviso: "Apagado. O registro anterior ficou guardado no histórico de alterações." });
});

export default r;
