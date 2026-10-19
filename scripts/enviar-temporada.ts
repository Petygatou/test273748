/**
 * Baixa a temporada REAL da API do Cartola neste computador e envia para o site.
 *
 *   SITE_URL=https://seu-site.vercel.app IMPORT_KEY=sua-chave npm run enviar
 *
 * Use quando o servidor do site não alcança a API (IP de nuvem barrado pela
 * Globo). Rode de novo a cada rodada ou deixe agendado (cron / Agendador de
 * Tarefas) a cada 30 minutos em dias de jogo. Os dados são sempre reais;
 * o site recusa qualquer arquivo que não seja da API do Cartola.
 */
import { fetchCartolaSeason } from "../src/server/cartolaApi";

const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
const key = process.env.IMPORT_KEY ?? "";
if (!site || !key) {
  console.error("Defina SITE_URL e IMPORT_KEY. Exemplo:\n  SITE_URL=https://seu-site.vercel.app IMPORT_KEY=segredo npm run enviar");
  process.exit(1);
}

console.log("Baixando a temporada real do Cartola…");
const t0 = Date.now();
const data = await fetchCartolaSeason();
console.log(`OK: rodada ${data.rodadaAtual}, ${data.athletes.length} atletas, ${data.history.length} linhas de histórico (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

console.log(`Enviando para ${site}…`);
const res = await fetch(`${site}/api/importar`, { method: "POST", headers: { "content-type": "application/json", "x-import-key": key }, body: JSON.stringify(data) });
const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
if (!res.ok) {
  console.error(`Falhou (${res.status}): ${body.error ?? "sem detalhes"}`);
  process.exit(1);
}
console.log("Enviado. O site já está com os dados reais desta rodada.");
