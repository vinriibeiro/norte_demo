import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import authRoutes from "./routes_auth.js";
import contasRoutes from "./routes_contas.js";
import dadosRoutes from "./routes_dados.js";
import vendasRoutes from "./routes_vendas.js";
import rotaRoutes from "./routes_rota.js";
import comissaoRoutes from "./routes_comissao.js";
import perfilRoutes from "./routes_perfil.js";
import relatoriosRoutes from "./routes_relatorios.js";
import extratoRoutes from "./routes_extrato.js";
import viabilidadeRoutes from "./routes_viabilidade.js";
import vendaExternaRoutes from "./routes_vendaexterna.js";
import anexosRoutes from "./routes_anexos.js";
import operacaoRoutes from "./routes_operacao.js";
import qualidadeRoutes from "./routes_qualidade.js";
import importacaoRoutes from "./routes_importacao.js";
import notificacoesRoutes from "./routes_notificacoes.js";
import crmRoutes from "./routes_crm.js";
import { iniciarCrm } from "./crm.js";
import { iniciarAgendador } from "./notificacoes.js";
import { iniciarLimpezaAnexos } from "./limpeza_anexos.js";
import { exigeLogin } from "./auth.js";
import { VERSAO } from "./versao.js";
import { servirPublico, apiRapida, esquecerTudo } from "./rapido.js";
import { pool } from "./db.js";

/* ---------- Camada 0: o servidor não sobe com configuração insegura ---------- */
const faltando = [];
if (!process.env.DATABASE_URL) faltando.push("DATABASE_URL não definido");
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) faltando.push("JWT_SECRET ausente ou curto (mínimo 32 caracteres aleatórios)");
if (/^(troque|mude|change|secret|segredo|\.\.\.)/i.test(process.env.JWT_SECRET || "")) faltando.push("JWT_SECRET parece ser o valor de exemplo");
if (faltando.length) { console.error("Configuração insegura, servidor não iniciado:\n - " + faltando.join("\n - ")); process.exit(1); }

const app = express();
app.disable("x-powered-by");
// Render/Heroku ficam atrás de 1 proxy: assim o limite por IP enxerga o IP real de quem acessa
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

/* ---------- Camada 1: HTTPS obrigatório ---------- */
app.use((req, res, next) => {
  if (req.headers["x-forwarded-proto"] === "http") {
    if (req.method === "GET" || req.method === "HEAD") return res.redirect(301, "https://" + req.headers.host + req.originalUrl);
    return res.status(403).json({ erro: "Use https." });
  }
  next();
});

/* ---------- Camada 1b: endereço oficial (ex.: quem abrir o *.herokuapp.com vai para o seu domínio) ---------- */
const DOMINIO = (process.env.DOMINIO_PRINCIPAL || "").trim().toLowerCase();
if (DOMINIO) app.use((req, res, next) => {
  const host = String(req.headers.host || "").toLowerCase();
  if (host && host !== DOMINIO && !host.startsWith("localhost") && !host.startsWith("127.0.0.1") && (req.method === "GET" || req.method === "HEAD"))
    return res.redirect(301, "https://" + DOMINIO + req.originalUrl);
  next();
});

/* ---------- Camada 2: cabeçalhos de proteção do navegador ---------- */
const csp = (https) => helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      ...(https ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
  referrerPolicy: { policy: "no-referrer" },
  crossOriginEmbedderPolicy: false,
});
const cabHttps = csp(true), cabHttp = csp(false);
app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  (req.secure ? cabHttps : cabHttp)(req, res, next);
});

/* ---------- Camada 3: CORS fechado (o site e a API estão no mesmo endereço) ---------- */
const origens = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter((s) => s && s !== "*");
if (origens.length) app.use("/api", cors({ origin: origens }));

/* ---------- Camada 4: limite geral de pedidos por IP (contra robôs e abuso) ---------- */
app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: Number(process.env.LIMITE_POR_MINUTO || 300), standardHeaders: true, legacyHeaders: false,
  message: { erro: "Muitos pedidos em pouco tempo. Aguarde 1 minuto." } }));

/* ---------- Camada 5: só aceita JSON e de tamanho pequeno ---------- */
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH"].includes(req.method) && !req.path.startsWith("/anexos") && Number(req.headers["content-length"] || 0) > 0 && !req.is("application/json"))
    return res.status(415).json({ erro: "Formato não aceito." });
  next();
});
app.use("/api/extrato", express.json({ limit: "15mb", strict: true }));   // o extrato da operadora chega como texto do CSV
app.use("/api/qualidade", express.json({ limit: "15mb", strict: true }));
app.use("/api/importacao-vendas", express.json({ limit: "15mb", strict: true }));   // exportação de vendas da operadora (até 20 mil linhas)   // linhas da planilha de qualidade (FPD)
app.use(express.json({ limit: "100kb", strict: true }));

// Express 4 não captura erros de funções async sozinho
const wrap = (router) => {
  router.stack.forEach((l) => {
    if (l.route) l.route.stack.forEach((s) => {
      const f = s.handle;
      if (f.length < 4) s.handle = (rq, rs, nx) => Promise.resolve(f(rq, rs, nx)).catch(nx);
    });
  });
  return router;
};

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
// no-cache: o navegador sempre confere se há arquivo novo (evita ficar com o site antigo depois de atualizar)
app.use(servirPublico(pub));
app.get("/api/saude", (_q, r) => r.json({ ok: true, versao: VERSAO }));

/* Limpeza diária: o banco guarda a função expurgo_logs_antigos(), que apaga os registros de acesso
   com mais de 90 dias. Chamamos uma vez ao subir e depois a cada 24h (se a função não existir, ignora). */
const limpar = () => pool.query("SELECT seven.expurgo_logs_antigos()").catch(() => {});
setTimeout(limpar, 30000);
setInterval(limpar, 24 * 60 * 60 * 1000).unref?.();
iniciarLimpezaAnexos();   // limpeza e compressão diária dos anexos (3h, Brasília)
iniciarCrm();   // CRM do vendedor: avisos dos retornos e limpeza após 12 meses
iniciarAgendador();   // resumo "quem ainda não vendeu" no celular do Gerente/Administrador
app.use("/api/auth", (req, res, next) => { if (req.method !== "GET" && req.path !== "/login") res.on("finish", () => { if (res.statusCode < 400) esquecerTudo(); }); next(); });
app.use("/api", wrap(authRoutes));
app.use("/api", exigeLogin, apiRapida, wrap(contasRoutes), wrap(vendasRoutes), wrap(rotaRoutes), wrap(perfilRoutes), wrap(comissaoRoutes), wrap(dadosRoutes), wrap(relatoriosRoutes), wrap(extratoRoutes), wrap(viabilidadeRoutes), wrap(vendaExternaRoutes), wrap(anexosRoutes), wrap(operacaoRoutes), wrap(qualidadeRoutes), wrap(importacaoRoutes), wrap(notificacoesRoutes), wrap(crmRoutes));
app.use("/api", (_q, res) => res.status(404).json({ erro: "Não encontrado." }));

app.use((e, _q, res, _n) => {
  if (e.type === "entity.too.large" || e.status === 413) return res.status(413).json({ erro: "Arquivo grande demais para enviar. Use uma imagem menor." });
  if (e.type === "entity.parse.failed") return res.status(400).json({ erro: "Requisição inválida." });
  if (e.status) return res.status(e.status).json({ erro: e.message, ...(e.extra || {}) });
  if (e.code === "42501") return res.status(403).json({ erro: "O banco recusou: sem permissão para esta operação." });
  // tabela ou coluna que ainda não existe no banco: faltou rodar algum arquivo da pasta db
  if (e.code === "42P01" || e.code === "42703" || e.code === "42883") {
    console.error(new Date().toISOString(), e.code, e.message);
    return res.status(500).json({ erro: "O banco está desatualizado para esta tela. Rode os arquivos db/13_melhorias_out2026.sql e db/14_feriados_fpd.sql no banco (SQL Editor do Supabase) e tente de novo." });
  }
  // registra o erro no log do servidor, mas nunca devolve detalhes técnicos para o navegador
  console.error(new Date().toISOString(), e.code || "", e.message);
  res.status(500).json({ erro: "Erro interno." });
});

app.listen(process.env.PORT || 3001, () => console.log(`API Norte Link (versão ${VERSAO}) na porta`, process.env.PORT || 3001));
