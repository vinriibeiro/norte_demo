import { Router } from "express";
import express from "express";
import { comPerfil } from "./db.js";
import { exigePerfil } from "./auth.js";

/* Anexos das vendas Sistema A / Sistema B e das viabilidades. O arquivo fica no banco (coluna conteudo), até 10 MB. */
const r = Router();
const LIMITE = 10 * 1024 * 1024;          // PDF e vídeo
const LIMITE_FOTO = 50 * 1024 * 1024;     // fotos (iPhone e Android)
const FOTOS = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const POR_EXTENSAO = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", mp4: "video/mp4", mov: "video/quicktime" };
const ENTIDADES = ["VENDA_EXTERNA", "VIABILIDADE"];
const TIPOS = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "video/mp4", "video/quicktime"];
const erro = (m, status = 400) => Object.assign(new Error(m), { status });
const intOk = (v) => { const n = parseInt(v || "", 10); return n > 0 ? n : null; };
const txt = (v, max) => { const s = String(v ?? "").trim().replace(/\s+/g, " "); return s ? s.slice(0, max) : null; };
r.use("/anexos", exigePerfil("gestor", "backoffice", "vendedor"));

// o pai (venda ou viabilidade) precisa estar visível para quem envia; a RLS já limita o vendedor às dele
async function paiDisponivel(c, entidade, id, usuario) {
  if (entidade === "VENDA_EXTERNA") {
    const v = (await c.query("SELECT status FROM venda_externa WHERE id = $1", [id])).rows[0];
    if (!v) throw erro("Venda não encontrada.", 404);
    if (usuario.perfil === "vendedor" && v.status === "FINALIZADO") throw erro("Esta venda já foi finalizada: não dá mais para anexar arquivos.", 409);
  } else if (!(await c.query("SELECT 1 FROM viabilidade WHERE id = $1", [id])).rowCount) {
    throw erro("Viabilidade não encontrada.", 404);
  }
}

// POST /api/anexos?entidade=VENDA_EXTERNA|VIABILIDADE&id=123&nome=arquivo.pdf   (corpo = o arquivo, Content-Type do arquivo)
r.post("/anexos", express.raw({ type: (req) => !req.is("application/json"), limit: LIMITE_FOTO }), async (req, res) => {
  const entidade = String(req.query.entidade || ""), id = intOk(req.query.id);
  const nome = txt(req.query.nome, 200);
  let tipo = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  // o iPhone às vezes envia HEIC sem tipo: usa a extensão do nome
  if (!tipo || tipo === "application/octet-stream") tipo = POR_EXTENSAO[(nome || "").split(".").pop().toLowerCase()] || tipo;
  if (!ENTIDADES.includes(entidade) || !id) return res.status(400).json({ erro: "Anexo sem venda ou viabilidade." });
  if (!nome) return res.status(400).json({ erro: "Informe o nome do arquivo." });
  if (!TIPOS.includes(tipo)) return res.status(400).json({ erro: "Tipo de arquivo não aceito. Use PDF, foto ou vídeo (MP4 ou MOV)." });
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!buf.length) return res.status(400).json({ erro: "Arquivo vazio." });
  const foto = FOTOS.includes(tipo);
  if (buf.length > (foto ? LIMITE_FOTO : LIMITE)) return res.status(413).json({ erro: foto ? "Foto acima de 50 MB." : "Arquivo acima de 10 MB." });
  const novo = await comPerfil(req.user, async (c) => {
    await paiDisponivel(c, entidade, id, req.user);
    return (await c.query(
      `INSERT INTO anexo (entidade, entidade_id, conteudo, nome, tipo, tamanho, enviado_por) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [entidade, id, buf, nome, tipo, buf.length, req.user.id])).rows[0].id;
  });
  res.status(201).json({ ok: true, id: novo });
});

// GET /api/anexos?entidade=&id=  -> lista (sem o conteúdo)
r.get("/anexos", async (req, res) => {
  const entidade = String(req.query.entidade || ""), id = intOk(req.query.id);
  if (!ENTIDADES.includes(entidade) || !id) return res.status(400).json({ erro: "Informe a venda ou a viabilidade." });
  const itens = await comPerfil(req.user, async (c) => (await c.query(
    `SELECT a.id, a.nome, a.tipo, a.tamanho, a.criado_em, a.enviado_por, u.nome_completo AS enviado_por_nome
       FROM anexo a JOIN usuario u ON u.id = a.enviado_por
      WHERE a.entidade = $1 AND a.entidade_id = $2 AND a.removido_em IS NULL ORDER BY a.criado_em`, [entidade, id])).rows);
  res.json({ itens });
});

// GET /api/anexos/:id/arquivo  -> baixa o arquivo
r.get("/anexos/:id/arquivo", async (req, res) => {
  const id = intOk(req.params.id);
  const a = await comPerfil(req.user, async (c) => (await c.query(
    "SELECT nome, tipo, conteudo FROM anexo WHERE id = $1 AND removido_em IS NULL", [id])).rows[0]);
  if (!a) return res.status(404).json({ erro: "Arquivo não encontrado." });
  res.set({
    "Content-Type": a.tipo,
    "Content-Length": String(a.conteudo.length),
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
    "Cache-Control": "private, no-store",
  });
  res.end(a.conteudo);
});

// DELETE /api/anexos/:id  -> só o gerente remove (remoção lógica)
r.delete("/anexos/:id", exigePerfil("gestor"), async (req, res) => {
  const id = intOk(req.params.id);
  const n = await comPerfil(req.user, async (c) => (await c.query(
    "UPDATE anexo SET removido_em = now() WHERE id = $1 AND removido_em IS NULL", [id])).rowCount);
  if (!n) return res.status(404).json({ erro: "Arquivo não encontrado." });
  res.json({ ok: true });
});

export default r;
