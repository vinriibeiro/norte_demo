/* Web Push sem dependências (só node:crypto + fetch do Node 20).
   - Autenticação do servidor: VAPID (RFC 8292), JWT ES256.
   - Criptografia da mensagem: aes128gcm (RFC 8188 + RFC 8291).
   Mesma interface usada da biblioteca "web-push": generateVAPIDKeys, setVapidDetails, sendNotification. */
import crypto from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const deB64u = (s) => Buffer.from(String(s), "base64url");

export function generateVAPIDKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

let vapid = null;
export function setVapidDetails(subject, publicKey, privateKey) {
  const pub = deB64u(publicKey), priv = deB64u(privateKey);
  if (pub.length !== 65 || priv.length !== 32) throw new Error("Chaves VAPID inválidas");
  const key = crypto.createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", d: b64u(priv), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  vapid = { subject, publicKey, key, jwts: new Map() };
}

/** JWT do VAPID para a origem do serviço de push (guardado por 1h; vale 12h). */
function jwtPara(aud) {
  const agora = Math.floor(Date.now() / 1000), m = vapid.jwts.get(aud);
  if (m && m.ate > agora + 3600 * 11) return m.t;
  const cab = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const corpo = b64u(JSON.stringify({ aud, exp: agora + 12 * 3600, sub: vapid.subject }));
  const ass = crypto.sign("sha256", Buffer.from(`${cab}.${corpo}`), { key: vapid.key, dsaEncoding: "ieee-p1363" });
  const t = `${cab}.${corpo}.${b64u(ass)}`;
  vapid.jwts.set(aud, { t, ate: agora + 12 * 3600 });
  return t;
}

/** Criptografa a mensagem para a inscrição (aes128gcm, um registro só). */
export function criptografar(sub, texto, _teste = null) {
  const uaPub = deB64u(sub.keys.p256dh), auth = deB64u(sub.keys.auth);
  if (uaPub.length !== 65 || auth.length < 16) throw Object.assign(new Error("Inscrição com chaves inválidas"), { statusCode: 410 });
  const ecdh = crypto.createECDH("prime256v1");
  if (_teste) ecdh.setPrivateKey(deB64u(_teste.priv)); else ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const segredo = ecdh.computeSecret(uaPub);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", segredo, auth, Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]), 32));
  const sal = _teste ? deB64u(_teste.sal) : crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, sal, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, sal, Buffer.from("Content-Encoding: nonce\0"), 12));
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const cifrado = Buffer.concat([c.update(Buffer.concat([Buffer.from(texto, "utf8"), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([sal, rs, Buffer.from([asPub.length]), asPub, cifrado]);
}

/** Envia. Lança erro com statusCode (404/410 = inscrição não existe mais). */
export async function sendNotification(sub, texto, { TTL = 3600, urgency = "normal", topic } = {}) {
  if (!vapid) throw new Error("VAPID não configurado");
  const corpo = criptografar(sub, texto || "");
  if (corpo.length > 4096) throw Object.assign(new Error("Mensagem grande demais"), { statusCode: 413 });
  const url = new URL(sub.endpoint);
  const cab = {
    "Content-Type": "application/octet-stream", "Content-Encoding": "aes128gcm", TTL: String(TTL), Urgency: urgency,
    Authorization: `vapid t=${jwtPara(url.origin)}, k=${vapid.publicKey}`,
  };
  if (topic) cab.Topic = String(topic).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(sub.endpoint, { method: "POST", headers: cab, body: corpo, signal: ctl.signal });
    if (r.status >= 200 && r.status < 300) return { statusCode: r.status };
    throw Object.assign(new Error(`Serviço de push respondeu ${r.status}`), { statusCode: r.status, body: await r.text().catch(() => "") });
  } finally { clearTimeout(t); }
}

export default { generateVAPIDKeys, setVapidDetails, sendNotification };
