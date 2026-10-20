/* Velocidade: arquivos do site comprimidos e guardados no navegador, respostas da API comprimidas
   e uma memória curta das consultas (apagada a cada alteração feita pelo sistema). */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};
const TEXTO = /\.(html|js|css|json|webmanifest|svg|txt)$/;
const SEMPRE_NOVO = new Set(["/index.html", "/sw.js", "/manifest.webmanifest", "/config.js"]);
const aceitaGzip = (req) => /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));

/** Serve a pasta public da memória: gzip pronto, ETag, e cache longo para os arquivos com ?v= (mudam de nome a cada versão). */
export function servirPublico(dir) {
  const mem = new Map();
  const carregar = (rel) => {
    const abs = path.join(dir, rel);
    let st; try { st = fs.statSync(abs); } catch { return null; }
    if (!st.isFile()) return null;
    const atual = mem.get(rel);
    if (atual && atual.mtime === st.mtimeMs) return atual;
    const buf = fs.readFileSync(abs), ext = path.extname(rel).toLowerCase();
    const item = { mtime: st.mtimeMs, buf, tipo: TIPOS[ext] || "application/octet-stream",
      etag: '"' + crypto.createHash("sha1").update(buf).digest("base64url").slice(0, 22) + '"',
      gz: TEXTO.test(rel) && buf.length > 600 ? zlib.gzipSync(buf, { level: 9 }) : null };
    mem.set(rel, item);
    return item;
  };
  for (const f of fs.readdirSync(dir)) carregar("/" + f);   // aquece a memória ao subir

  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    let rel; try { rel = decodeURIComponent(req.path); } catch { return next(); }
    if (rel === "/") rel = "/index.html";
    if (rel.includes("..") || rel.includes("\0") || rel.startsWith("/api/")) return next();
    const f = carregar(rel);
    if (!f) return next();
    const versionado = "v" in req.query;
    res.setHeader("Content-Type", f.tipo);
    res.setHeader("ETag", f.etag);
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("Cache-Control", SEMPRE_NOVO.has(rel) ? "no-cache" : versionado ? "public, max-age=31536000, immutable" : "public, max-age=86400");
    if (req.headers["if-none-match"] === f.etag) return res.status(304).end();
    const corpo = f.gz && aceitaGzip(req) ? (res.setHeader("Content-Encoding", "gzip"), f.gz) : f.buf;
    res.setHeader("Content-Length", corpo.length);
    return req.method === "HEAD" ? res.end() : res.end(corpo);
  };
}

/* ---------- memória curta das consultas ---------- */
const memoria = new Map();
const TTL = 60 * 1000, MAX = 400, MAX_BYTES = 1.5 * 1024 * 1024;
import { esquecerContas } from "./auth.js";
export const esquecerTudo = () => { memoria.clear(); esquecerContas(); };

/** Comprime o JSON da API e guarda as respostas de GET por até 60 s. Qualquer alteração (POST/PATCH/PUT/DELETE) apaga a memória. */
export function apiRapida(req, res, next) {
  const leitura = req.method === "GET";
  if (!leitura) res.on("finish", () => { if (res.statusCode < 400) esquecerTudo(); });
  const u = req.user || {};
  const chave = leitura && u.id && !/^\/auth|exportar/.test(req.path) && !req.query.nocache
    ? [u.id, u.perfil, u.setor || "", u.master ? 1 : 0, u.verComo ? u.masterId : 0, req.originalUrl].join("|") : null;
  const gz = aceitaGzip(req);
  const enviar = (c) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (c.gz && gz) { res.setHeader("Content-Encoding", "gzip"); res.setHeader("Vary", "Accept-Encoding, Authorization"); res.setHeader("Content-Length", c.gz.length); return res.end(c.gz); }
    res.setHeader("Content-Length", c.buf.length); return res.end(c.buf);
  };
  if (chave) {
    const c = memoria.get(chave);
    if (c && c.ate > Date.now()) { res.setHeader("X-Memoria", "1"); return enviar(c); }
  }
  const json0 = res.json.bind(res);
  res.json = (obj) => {
    if (res.statusCode >= 300 || res.getHeader("Content-Type")) return json0(obj);
    const buf = Buffer.from(JSON.stringify(obj));
    const c = { buf, gz: buf.length > 1400 ? zlib.gzipSync(buf, { level: 5 }) : null, ate: Date.now() + TTL };
    if (chave && buf.length < MAX_BYTES) {
      if (memoria.size >= MAX) memoria.delete(memoria.keys().next().value);
      memoria.set(chave, c);
    }
    return enviar(c);
  };
  next();
}
