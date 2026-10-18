/** npm run lineup  (ou: npm run lineup -- --live [--sem-status]) — acerto das prováveis, walk-forward. */
import { generateDemoSeason } from "../src/data/demoSeason";
import { runLineupBacktest } from "../src/engine/backtest";

const live = process.argv.includes("--live");
const data = live ? await (await import("../src/server/cartolaApi")).fetchCartolaSeason() : generateDemoSeason();
if (process.argv.includes("--sem-status")) data.statusHistory = undefined; // situação real enquanto os snapshots ainda não existem
const t0 = Date.now();
const r = runLineupBacktest(data);
console.log(`Fonte: ${data.source} · rodadas ${r.rodadas[0]?.rodada}–${r.rodadas.at(-1)?.rodada} · ${r.timesAvaliados} escalações`);
console.log(`Acerto do modelo: ${(r.acerto * 100).toFixed(1)}%   baseline (repetir último jogo): ${(r.acertoBaseline * 100).toFixed(1)}%   Brier ${r.brier.toFixed(4)}`);
for (const x of r.rodadas) console.log(`  R${x.rodada}: ${(x.acerto * 100).toFixed(1)}%  (${x.timesQuaseCertos}/${x.times} times com 10+ acertos)`);
console.log("Calibração da chance de jogar:");
for (const b of r.calibracao) console.log(`  ${b.faixa.padEnd(9)} previsto ${(b.previsto * 100).toFixed(0).padStart(3)}%  observado ${(b.observado * 100).toFixed(0).padStart(3)}%  n=${b.n}`);
console.log(`(${Date.now() - t0} ms)`);
