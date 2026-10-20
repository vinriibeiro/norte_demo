/* Calendário de trabalho 6x1 (segunda a sábado; domingo é folga) com feriados nacionais, estaduais e municipais.
   Os nacionais são calculados aqui (inclusive a Sexta-feira Santa, que muda todo ano); estaduais, municipais e
   pontos facultativos vêm da tabela feriado (tela Administração → Feriados). Funções puras, sem banco. */

const p2 = (n) => String(n).padStart(2, "0");
const ymd = (a, m, d) => `${a}-${p2(m)}-${p2(d)}`;

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(ano, mes, dia);
}
const somaDias = (d, n) => new Date(new Date(d + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);

/** Feriados nacionais (lei federal) de um ano. */
export function nacionais(ano) {
  const f = [[1, 1, "Confraternização Universal"], [4, 21, "Tiradentes"], [5, 1, "Dia do Trabalho"], [9, 7, "Independência do Brasil"], [10, 12, "Nossa Senhora Aparecida"],
    [11, 2, "Finados"], [11, 15, "Proclamação da República"], [11, 20, "Consciência Negra"], [12, 25, "Natal"]].map(([m, d, nome]) => ({ data: ymd(ano, m, d), nome, abrangencia: "NACIONAL", considera: true }));
  f.push({ data: somaDias(pascoa(ano), -2), nome: "Sexta-feira Santa", abrangencia: "NACIONAL", considera: true });
  return f;
}

/** Região de trabalho: { uf, cidade_id } (normalmente a cidade da equipe). */
const daRegiao = (r, reg) =>
  r.abrangencia === "NACIONAL" || (r.abrangencia === "ESTADUAL" && reg?.uf && r.uf === reg.uf) || (r.abrangencia === "MUNICIPAL" && reg?.cidade_id && +r.cidade_id === +reg.cidade_id);

/** Todos os feriados (nacionais + tabela) de um ano para uma região. */
export function feriadosDoAno(ano, regras = [], regiao = null) {
  const out = new Map();
  for (const f of nacionais(ano)) out.set(f.data, f);
  for (const r of regras) {
    if (!daRegiao(r, regiao)) continue;
    const data = r.recorrente ? ymd(ano, r.mes, r.dia) : String(r.data).slice(0, 10);
    if (!data.startsWith(String(ano))) continue;
    const atual = out.get(data);
    // um feriado de verdade nunca é rebaixado por um ponto facultativo do mesmo dia
    if (!atual || (atual.considera === false && r.considera !== false)) out.set(data, { data, nome: r.nome, abrangencia: r.abrangencia, considera: r.considera !== false, id: r.id });
  }
  return [...out.values()].sort((a, b) => a.data.localeCompare(b.data));
}

/** Peso de cada dia na escala 6x1: sábado vale meio dia útil, domingo não conta. */
export const PESO_SABADO = 0.5;
const meio = (n) => Math.round(n * 2) / 2;   // mantém os números em passos de 0,5 (sem sobra de ponto flutuante)

/** Dias úteis 6x1 do mês de `dia` para a região: total no mês e quantos já passaram até `dia` (inclusive).
    Segunda a sexta valem 1 dia; sábado vale 0,5; domingo e feriado não contam. */
export function diasUteis(dia, regras = [], regiao = null) {
  const [a, m] = dia.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const fer = new Set(feriadosDoAno(a, regras, regiao).filter((f) => f.considera).map((f) => f.data));
  let total = 0, decorridos = 0, sabados = 0;
  const feriadosMes = [];
  for (let d = 1; d <= fim; d++) {
    const s = ymd(a, m, d), dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
    if (dow === 0) continue;                                   // domingo: folga da escala 6x1
    if (fer.has(s)) { feriadosMes.push(s); continue; }
    const peso = dow === 6 ? PESO_SABADO : 1;
    if (dow === 6) sabados++;
    total += peso; if (s <= dia) decorridos += peso;
  }
  total = meio(total); decorridos = meio(decorridos);
  return { total, decorridos, restantes: meio(total - decorridos), sabados, feriados: feriadosMes };
}

/** Cria uma função de dias úteis com cache por região (para não recalcular pessoa a pessoa). */
export function calendarioDe(dia, regras = []) {
  const cache = new Map();
  return (regiao) => {
    const k = `${regiao?.uf || ""}|${regiao?.cidade_id || ""}`;
    if (!cache.has(k)) cache.set(k, diasUteis(dia, regras, regiao));
    return cache.get(k);
  };
}
