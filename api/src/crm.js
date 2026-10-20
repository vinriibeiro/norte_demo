import { pool } from "./db.js";
import { avisarPessoas } from "./notificacoes.js";

/* Avisos do CRM no celular (1 a 10 min antes) e limpeza: clientes encerrados há mais de 12 meses saem do sistema.
   Roda a cada minuto. Retornos que se repetem avançam para a próxima data depois de avisar. */
const ROTULO = { TRATANDO: "Tratando", RETORNAR: "Retornar contato", PROPOSTA: "Enviar proposta" };
const HORA = (d) => new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

async function tique() {
  try {
    const avisos = (await pool.query(
      `SELECT r.id, r.tipo, r.data_hora, r.repetir_dias, c.nome, c.vendedor_id
         FROM crm_retorno r JOIN crm_cliente c ON c.id = r.cliente_id
        WHERE c.status = 'ATIVO' AND r.avisado_em IS NULL
          AND r.data_hora - (r.aviso_minutos * interval '1 minute') <= now()
        ORDER BY r.data_hora LIMIT 200`)).rows;
    for (const a of avisos) {
      await avisarPessoas([a.vendedor_id], {
        titulo: `${ROTULO[a.tipo]} · ${a.nome}`,
        corpo: `Combinado para as ${HORA(a.data_hora)}`,
        url: "/#/crm",
        tag: `crm-${a.id}`,
      });
      if (a.repetir_dias) {
        // avança para a próxima data que ainda não passou (se o servidor ficou parado, não manda aviso atrasado em cascata)
        let prox = new Date(a.data_hora).getTime();
        const passo = a.repetir_dias * 864e5;
        while (prox <= Date.now() + 60000) prox += passo;
        await pool.query("UPDATE crm_retorno SET data_hora = $2, avisado_em = NULL WHERE id = $1", [a.id, new Date(prox).toISOString()]);
      } else {
        await pool.query("UPDATE crm_retorno SET avisado_em = now() WHERE id = $1", [a.id]);
      }
    }
    await pool.query("DELETE FROM crm_cliente WHERE status <> 'ATIVO' AND encerrado_em < now() - interval '12 months'");
  } catch (e) {
    console.error(new Date().toISOString(), "crm:", e.code || "", e.message);
  }
}

export function iniciarCrm() {
  setTimeout(tique, 20000);
  setInterval(tique, 60000).unref?.();
}
