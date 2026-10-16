import { generateDemoSeason } from "../src/data/demoSeason";
import { runBacktest, tuneModel } from "../src/engine/backtest";

const data = generateDemoSeason();
const t = Date.now();
const res = runBacktest(data, { fromRound: 8, toRound: 30, config: JSON.parse(process.env.CFG ?? "{}") });
console.log("ms", Date.now() - t);
for (const r of res.rounds) console.log(r.rodada, "n", r.n, "MAE", r.maeModelo.toFixed(2), "vs média", r.maeMedia.toFixed(2), "ult5", r.maeUlt5.toFixed(2), "rho", r.spearmanModelo.toFixed(3), "vs", r.spearmanMedia.toFixed(3), "int", r.dentroIntervalo.toFixed(2), "tropa", r.tropaModelo?.toFixed(1), "vs", r.tropaMedia?.toFixed(1));
console.log(res.resumo);
if (process.argv.includes("--tune")) {
  const t2 = Date.now();
  const grid = tuneModel(data);
  console.log("tune ms", Date.now() - t2);
  for (const g of grid.slice(0, 8)) console.log(JSON.stringify(g.config), "rmse", g.rmse.toFixed(4), "mae", g.mae.toFixed(4), "rho", g.spearman.toFixed(4));
  console.log("worst", JSON.stringify(grid[grid.length - 1]));
}
