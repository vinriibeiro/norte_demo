import pg from "pg";
import "dotenv/config";

// Converte 'numeric'/'bigint' para número em JS
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "1" ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DB_MAX || 10),   // conexões abertas ao mesmo tempo (padrão 10)
  statement_timeout: 20000,       // consulta acima de 20s é cancelada (não deixa travar o banco)
  idle_in_transaction_session_timeout: 30000,
  connectionTimeoutMillis: 10000,
});
pool.on("connect", (c) => c.query("SET search_path TO seven, public"));

const PAPEL = { gestor: "seven_gestor", backoffice: "seven_backoffice", vendedor: "seven_vendedor", lider: "seven_lider", coordenador: "seven_coordenador" };

/**
 * Roda fn dentro de uma transação com o perfil do usuário logado.
 * O banco recusa o que o perfil não pode, mesmo se a API tiver um erro.
 */
export async function comPerfil(user, fn) {
  const papel = PAPEL[user.perfil];
  if (!papel) throw Object.assign(new Error("Perfil inválido"), { status: 403 });
  const c = await pool.connect();
  try {
    // uma ida só ao banco para abrir a transação, assumir o perfil e marcar o usuário (cada ida custa a distância Render → Supabase)
    const uid = Number.parseInt(user.id, 10);
    if (!Number.isSafeInteger(uid)) throw Object.assign(new Error("Usuário inválido"), { status: 403 });
    await c.query(`BEGIN; SET LOCAL ROLE ${papel}; SELECT set_config('app.usuario_id', '${uid}', true)`);
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
