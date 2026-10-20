// Regras de validação e gravação de vendas (cadastro unitário e em lote)
import { chave } from "./util.js";

export async function carregarCatalogos(c) {
  const q = async (sql) => (await c.query(sql)).rows;
  const [origens, canais, formas, turnos, cidades, produtos, motivos, equipes, vendedores, tipos] = await Promise.all([
    q("SELECT codigo, descricao FROM origem_venda ORDER BY codigo"),
    q("SELECT codigo, descricao FROM canal_finalizacao ORDER BY codigo"),
    q("SELECT codigo, descricao FROM forma_pagamento ORDER BY codigo"),
    q("SELECT codigo FROM turno_agenda ORDER BY codigo"),
    q("SELECT id, uf, nome FROM cidade ORDER BY uf, nome"),
    q("SELECT id, categoria, nome, velocidade_mb FROM produto WHERE ativo ORDER BY categoria, nome"),
    q("SELECT id, codigo, descricao, categoria FROM motivo ORDER BY descricao"),
    q("SELECT id, nome FROM equipe ORDER BY nome"),
    q(`SELECT u.id, u.login, u.nome_completo AS nome FROM usuario u
        WHERE u.ativo AND EXISTS (SELECT 1 FROM usuario_funcao f WHERE f.usuario_id = u.id AND f.funcao = 'VENDEDOR')
        ORDER BY u.nome_completo`),
    q("SELECT codigo FROM tipo_contrato ORDER BY codigo"),
  ]);
  return { origens, canais, formas, turnos, cidades, produtos, motivos, equipes, vendedores, tipos };
}

const vazio = (x) => x === undefined || x === null || String(x).trim() === "";
const txt = (x) => (vazio(x) ? null : String(x).replace(/\s+/g, " ").trim());

function dataISO(x) {
  if (vazio(x)) return null;
  const s = String(x).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) { m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); if (m) m = [null, m[3].length === 2 ? "20" + m[3] : m[3], m[2], m[1]]; }
  if (!m) return undefined;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return undefined;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function dinheiro(x) {
  if (vazio(x)) return null;
  let s = String(x).replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}

function documento(x) {
  const d = String(x ?? "").replace(/\D/g, "");
  if (!d) return { erro: "CPF/CNPJ obrigatório" };
  if (d.length >= 9 && d.length <= 11) return { tipo: "CPF", doc: d.padStart(11, "0") };
  if (d.length >= 13 && d.length <= 14) return { tipo: "CNPJ", doc: d.padStart(14, "0") };
  return { erro: `CPF/CNPJ inválido (${d.length} dígitos)` };
}

function foneFmt(x) {
  const d = String(x ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (!d) return null;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return undefined;
}

function acharCidade(x, cat) {
  const t = chave(x);
  const m = t.match(/^([A-Z]{2}) ?- ?(.+)$/);
  const uf = m ? m[1] : null, nome = m ? m[2] : t;
  const r = cat.cidades.filter((c) => chave(c.nome) === nome && (!uf || c.uf === uf));
  return r.length === 1 ? r[0] : r.length > 1 ? "ambigua" : null;
}

function acharProdutos(x, cat) {
  const itens = Array.isArray(x) ? x : String(x ?? "").split(/[;\n+]/).map((s) => s.trim()).filter(Boolean);
  const out = [], erros = [];
  for (const it of itens) {
    if (typeof it === "object") { out.push({ produto_id: +it.produto_id, quantidade: +it.quantidade || 1, tipo_adesao: it.tipo_adesao || null }); continue; }
    if (typeof it === "number") { out.push({ produto_id: it, quantidade: 1 }); continue; }
    let qtd = 1, t = it;
    const mq = t.match(/^(\d+)\s*[xX]\s*(.+)$/); if (mq) { qtd = +mq[1]; t = mq[2]; }
    const k = chave(t);
    let r = cat.produtos.filter((p) => chave(p.nome) === k || chave(`${p.categoria} ${p.nome}`) === k);
    if (!r.length) { // "500", "500 MB", "1 GIGA"
      const n = k.replace(/[^0-9]/g, "");
      if (n) {
        r = cat.produtos.filter((p) => p.categoria === "FIBRA" && String(p.velocidade_mb) === n);
        if (r.length > 1) { const ex = r.filter((p) => chave(p.nome) === `${n} MB`); if (ex.length === 1) r = ex; }
      }
    }
    if (r.length === 1) out.push({ produto_id: r[0].id, quantidade: qtd });
    else erros.push(r.length ? `Produto ambíguo: "${it}"` : `Produto não encontrado: "${it}"`);
  }
  return { itens: out, erros };
}

/** Converte uma linha (formulário ou colada do Excel) em dados validados. Retorna {erros, d}. */
export function validar(l, cat) {
  const e = [], d = {};
  d.data_venda = dataISO(l.data_venda) ?? new Date().toISOString().slice(0, 10);
  if (dataISO(l.data_venda) === undefined) e.push("Data da venda inválida (use dd/mm/aaaa)");
  else if (d.data_venda > new Date(Date.now() + 864e5).toISOString().slice(0, 10)) e.push("Data da venda no futuro");

  d.nome = txt(l.nome)?.toUpperCase();
  if (!d.nome) e.push("Nome do cliente obrigatório");
  const doc = documento(l.documento);
  if (doc.erro) e.push(doc.erro); else { d.tipo_pessoa = doc.tipo; d.documento = doc.doc; }
  for (const k of ["contato", "contato_2"]) {
    const f = foneFmt(l[k]); if (f === undefined) e.push(`Telefone inválido (${k})`); else d[k] = f;
  }
  d.data_nascimento = dataISO(l.data_nascimento) ?? null;
  if (dataISO(l.data_nascimento) === undefined) e.push("Data de nascimento inválida");

  // vendedor: id, login ou nome
  const vk = chave(l.vendedor ?? l.vendedor_id ?? "");
  const v = cat.vendedores.filter((x) => String(x.id) === String(l.vendedor_id ?? l.vendedor) || chave(x.login) === vk || chave(x.nome) === vk);
  if (!vk) e.push("Vendedor obrigatório"); else if (v.length !== 1) e.push(v.length ? `Vendedor ambíguo: "${l.vendedor}"` : `Vendedor não encontrado: "${l.vendedor}"`); else d.vendedor_id = v[0].id;

  if (!vazio(l.equipe) || !vazio(l.equipe_id)) {
    const q = cat.equipes.find((x) => String(x.id) === String(l.equipe_id ?? l.equipe) || chave(x.nome) === chave(l.equipe));
    if (!q) e.push(`Equipe não encontrada: "${l.equipe ?? l.equipe_id}"`); else d.equipe_id = q.id;
  }
  const lista = (campo, arr, rotulo, obrig, fem) => {
    if (vazio(l[campo])) { if (obrig) e.push(`${rotulo} ${fem ? "obrigatória" : "obrigatório"}`); d[campo] = null; return; }
    const r = arr.find((x) => chave(x.codigo) === chave(l[campo]));
    if (!r) e.push(`${rotulo} ${fem ? "inválida" : "inválido"}: "${l[campo]}"`); else d[campo] = r.codigo;
  };
  lista("origem", cat.origens, "Origem", true, true);
  lista("canal", cat.canais, "Canal", false);
  lista("forma_pagamento", cat.formas, "Forma de pagamento", false, true);
  lista("turno", cat.turnos, "Turno", false);
  if (vazio(l.tipo_contrato)) d.tipo_contrato = "PROSPECT"; else lista("tipo_contrato", cat.tipos, "Tipo de contrato", true);

  d.dia_vencimento = vazio(l.dia_vencimento) ? null : parseInt(l.dia_vencimento, 10);
  if (d.dia_vencimento !== null && !(d.dia_vencimento >= 1 && d.dia_vencimento <= 31)) e.push("Dia de vencimento deve ser de 1 a 31");
  if (vazio(l.cidade) && vazio(l.cidade_id)) e.push("Cidade obrigatória");
  else {
    const c = !vazio(l.cidade_id) ? cat.cidades.find((x) => String(x.id) === String(l.cidade_id)) : acharCidade(l.cidade, cat);
    if (c === "ambigua") e.push(`Cidade ambígua: "${l.cidade}" (use "UF - NOME")`); else if (!c) e.push(`Cidade não encontrada: "${l.cidade ?? l.cidade_id}"`); else d.cidade_id = c.id;
  }
  d.bairro = txt(l.bairro)?.toUpperCase() ?? null;
  d.endereco = txt(l.endereco)?.toUpperCase() ?? null;
  d.data_agendamento = dataISO(l.data_agendamento) ?? null;
  if (dataISO(l.data_agendamento) === undefined) e.push("Data de agendamento inválida");
  const pv = dinheiro(l.pacote_valor); if (pv === undefined) e.push("Valor do pacote inválido"); else d.pacote_valor = pv;
  if (!vazio(l.numero_contrato) && /\D/.test(String(l.numero_contrato).trim())) e.push("Número do contrato deve ter só dígitos");
  d.numero_contrato = vazio(l.numero_contrato) ? null : String(l.numero_contrato).replace(/\D/g, "") || null;
  d.observacao = txt(l.observacao);

  const pr = acharProdutos(l.produtos, cat);
  e.push(...pr.erros);
  if (!pr.itens.length && !pr.erros.length) e.push("Informe ao menos 1 produto");
  const vistos = new Set(); d.itens = pr.itens.filter((i) => !vistos.has(i.produto_id) && vistos.add(i.produto_id));
  return { erros: e, d };
}

/** Grava uma venda já validada. Reaproveita o cliente pelo CPF/CNPJ. */
export async function gravar(c, d, uid) {
  if (d.numero_contrato && (await c.query("SELECT 1 FROM contrato WHERE sistema_origem='NORTE' AND numero_contrato=$1", [d.numero_contrato])).rowCount)
    throw Object.assign(new Error(`Contrato ${d.numero_contrato} já cadastrado`), { negocio: true });
  let cli = (await c.query("SELECT id FROM cliente WHERE tipo_pessoa=$1 AND documento=$2", [d.tipo_pessoa, d.documento])).rows[0];
  const novoCliente = !cli;
  if (!cli) cli = (await c.query(
    "INSERT INTO cliente (tipo_pessoa, documento, nome, data_nascimento, contato, contato_2) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [d.tipo_pessoa, d.documento, d.nome, d.data_nascimento, d.contato, d.contato_2])).rows[0];
  // equipe: a informada > o vínculo atual do vendedor > a da última venda dele
  const equipe = d.equipe_id
    ?? (await c.query("SELECT equipe_id FROM equipe_membro WHERE usuario_id=$1 AND fim IS NULL ORDER BY inicio DESC LIMIT 1", [d.vendedor_id])).rows[0]?.equipe_id
    ?? (await c.query("SELECT equipe_id FROM contrato WHERE vendedor_id=$1 AND equipe_id IS NOT NULL ORDER BY data_venda DESC LIMIT 1", [d.vendedor_id])).rows[0]?.equipe_id
    ?? null;
  const ct = (await c.query(
    `INSERT INTO contrato (numero_contrato, cliente_id, vendedor_id, equipe_id, backoffice_id, data_venda, origem, canal, tipo_contrato,
        forma_pagamento, dia_vencimento, status_venda, cidade_id, bairro, endereco, data_agendamento, turno, pacote_valor, observacao)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PENDENTE',$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
    [d.numero_contrato, cli.id, d.vendedor_id, equipe, uid, d.data_venda, d.origem, d.canal, d.tipo_contrato, d.forma_pagamento,
     d.dia_vencimento, d.cidade_id, d.bairro, d.endereco, d.data_agendamento, d.turno, d.pacote_valor, d.observacao])).rows[0];
  for (const it of d.itens)
    await c.query("INSERT INTO contrato_item (contrato_id, produto_id, quantidade, tipo_adesao) VALUES ($1,$2,$3,$4)", [ct.id, it.produto_id, it.quantidade || 1, it.tipo_adesao || null]);
  await sincronizarAgenda(c, ct.id);
  return { contrato_id: ct.id, cliente_id: cli.id, cliente_novo: novoCliente };
}

/** Mantém a rota em dia com o agendamento do contrato: cria a linha do dia e marca a data antiga como reagendada. */
export async function sincronizarAgenda(c, contratoId) {
  const k = (await c.query("SELECT data_agendamento, turno FROM contrato WHERE id=$1", [contratoId])).rows[0];
  if (!k?.data_agendamento) return;
  await c.query(
    "UPDATE agenda_instalacao SET situacao='REAGENDADO' WHERE contrato_id=$1 AND data_rota <> $2 AND situacao='PENDENTE_INSTALACAO'",
    [contratoId, k.data_agendamento]);
  await c.query(
    `INSERT INTO agenda_instalacao (contrato_id, data_rota, turno) VALUES ($1,$2,$3)
     ON CONFLICT (contrato_id, data_rota) DO UPDATE SET turno = EXCLUDED.turno,
       situacao = CASE WHEN agenda_instalacao.situacao = 'REAGENDADO' THEN 'PENDENTE_INSTALACAO' ELSE agenda_instalacao.situacao END`,
    [contratoId, k.data_agendamento, k.turno]);
}
