/**
 * Backtest walk-forward e auto-ajuste dos hiperparâmetros.
 *   npm run backtest            → temporada de demonstração
 *   npm run backtest -- --live  → temporada real (API do Cartola)
 *   npm run tune [-- --live]    → busca em grade (meia-vida, shrinkage, contexto)
 */
import { generateDemoSeason } from "../src/data/demoSeason";
import { runBacktest, tuneModel } from "../src/engine/backtest";
import type { SeasonData } from "../src/engine/types";
import { fetchCartolaSeason } from "../src/server/cartolaApi";

const live = process.argv.includes("--live");
const data: SeasonData = live ? await fetchCartolaSeason() : generateDemoSeason();
console.log(`fonte: ${data.source} · rodada atual ${data.rodadaAtual} · ${data.history.length} linhas de histórico`);

const last = data.rodadaAtual - 1;
const t = Date.now();
const res = runBacktest(data, { fromRound: Math.max(5, last - 14), toRound: last, config: JSON.parse(process.env.CFG ?? "{}") });
console.log(`backtest em ${((Date.now() - t) / 1000).toFixed(1)}s`);
for (const r of res.rounds)
  console.log(
    `R${r.rodada}`.padEnd(4),
    `n ${r.n}`.padEnd(6),
    `RMSE ${r.rmseModelo.toFixed(2)} vs ${r.rmseMedia.toFixed(2)}`,
    `· rho ${r.spearmanModelo.toFixed(3)} vs ${r.spearmanMedia.toFixed(3)}`,
    `· intervalo ${(r.dentroIntervalo * 100).toFixed(0)}%`,
    `· tropa ${r.tropaModelo?.toFixed(1)} vs ${r.tropaMedia?.toFixed(1)}`,
  );
console.log(res.resumo);

if (process.argv.includes("--tune")) {
  const t2 = Date.now();
  const grid = tuneModel(data);
  console.log(`grade em ${((Date.now() - t2) / 1000).toFixed(1)}s — melhores (RMSE):`);
  for (const g of grid.slice(0, 8)) console.log(JSON.stringify(g.config), "rmse", g.rmse.toFixed(4), "mae", g.mae.toFixed(4), "rho", g.spearman.toFixed(4));
}
