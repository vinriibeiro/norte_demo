import { pool } from "./db.js";

/* Limpeza e compressão diária dos anexos (guardados no banco).
   - Apaga de vez os anexos removidos há mais de 30 dias (a remoção pela tela é só lógica).
   - Reduz imagens grandes (acima de 1 MB): até 1600 px de largura, JPEG qualidade 78. Só fica se ficar menor.
   - Vídeos e PDFs não são comprimidos (não há conversor no servidor).
   Roda uma vez por dia, de madrugada (horário de Brasília). Desligar: LIMPEZA_ANEXOS_DESLIGADA=1. */

const MB = 1024 * 1024;
const LOTE = 30;                 // imagens por rodada, para não estourar a memória
const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"];
let ultimoDia = null;

async function sharpOuNada() {
  try { return (await import("sharp")).default; } catch { return null; }
}

/** Apaga de vez os anexos removidos há mais de 30 dias. */
async function apagarRemovidos() {
  const r = await pool.query("DELETE FROM anexo WHERE removido_em IS NOT NULL AND removido_em < now() - interval '30 days'");
  return r.rowCount;
}

/** Comprime imagens grandes. Devolve { analisadas, reduzidas, economia } . */
async function comprimirImagens(sharp) {
  const out = { analisadas: 0, reduzidas: 0, economia: 0 };
  if (!sharp) return out;
  const rows = (await pool.query(
    `SELECT id, tipo, tamanho, conteudo FROM anexo
      WHERE removido_em IS NULL AND NOT comprimido AND tamanho > $1 AND tipo = ANY($2::text[])
      ORDER BY id LIMIT ${LOTE}`, [MB, TIPOS_IMAGEM])).rows;
  for (const a of rows) {
    out.analisadas++;
    try {
      const novo = await sharp(a.conteudo, { failOn: "none" }).rotate()
        .resize({ width: 1600, withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer();
      if (novo.length < a.tamanho) {
        await pool.query("UPDATE anexo SET conteudo = $2, tamanho = $3, tipo = 'image/jpeg', comprimido = true WHERE id = $1", [a.id, novo, novo.length]);
        out.reduzidas++;
        out.economia += a.tamanho - novo.length;
      } else {
        await pool.query("UPDATE anexo SET comprimido = true WHERE id = $1", [a.id]);
      }
    } catch (e) {
      console.error(new Date().toISOString(), "compressão de anexo", a.id, e.message);
      await pool.query("UPDATE anexo SET comprimido = true WHERE id = $1", [a.id]).catch(() => {});
    }
  }
  return out;
}

export async function rodarLimpezaAnexos() {
  try {
    const apagados = await apagarRemovidos();
    const img = await comprimirImagens(await sharpOuNada());
    console.log(new Date().toISOString(), `limpeza de anexos: ${apagados} apagado(s); imagens analisadas ${img.analisadas}, reduzidas ${img.reduzidas} (${Math.round(img.economia / 1024)} KB)`);
    return { apagados, ...img };
  } catch (e) {
    console.error(new Date().toISOString(), "limpeza de anexos:", e.message);
    return null;
  }
}

/** Liga o agendador: confere a cada hora e roda uma vez por dia às 3h (Brasília). */
export function iniciarLimpezaAnexos() {
  if (process.env.LIMPEZA_ANEXOS_DESLIGADA === "1") return;
  const tique = async () => {
    const agora = new Date(Date.now() - 3 * 3600 * 1000);   // Brasília, sem horário de verão
    const dia = agora.toISOString().slice(0, 10), hora = agora.getUTCHours();
    if (hora !== 3 || ultimoDia === dia) return;
    ultimoDia = dia;
    await rodarLimpezaAnexos();
  };
  setInterval(tique, 60 * 60 * 1000).unref();
}
