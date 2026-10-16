import { generateDemoSeason } from "../src/data/demoSeason";
import { buildRoundAnalysis } from "../src/engine/analysis";

const t = Date.now();
const data = generateDemoSeason();
console.log("demo gen ms", Date.now() - t, "athletes", data.athletes.length, "history", data.history.length);
const a = buildRoundAnalysis(data);
console.log("analysis ms", a.diagnostics.tempoMs, "home adv", a.homeAdvantage.toFixed(3));
console.log("rules", a.rulesCheck.acerto, a.rulesCheck.divergencias);
console.log("pmv", a.pmvModel);
const lat = new Map(data.latent.clubs.map((c) => [c.id, c]));
for (const t of a.teams.slice(0, 6)) console.log(data.clubs[t.clubeId].abreviacao, "att", t.attack.toFixed(2), "true", lat.get(t.clubeId)!.attack.toFixed(2), "def", t.defense.toFixed(2), "true", lat.get(t.clubeId)!.defense.toFixed(2));
for (const f of a.fixtures.slice(0, 4)) console.log(data.clubs[f.casaId].abreviacao, "x", data.clubs[f.foraId].abreviacao, f.lambdaCasa.toFixed(2), f.lambdaFora.toFixed(2), (f.pCasa*100).toFixed(0), (f.pEmpate*100).toFixed(0), (f.pFora*100).toFixed(0), "SG", f.sgCasa.toFixed(2), f.sgFora.toFixed(2));
for (const p of a.players.slice(0, 15)) console.log(p.posicaoId, p.apelido.padEnd(18), "C$", p.preco.toFixed(2), "xP", p.xP, "xPJ", p.xPJogando, "pJ", p.pJogar, "piso", p.piso, "teto", p.teto, "p12", p.pAcima12, "mpv", p.mpv, "val", p.valorizacaoEsperada);
const tec = a.players.filter(p => p.posicaoId === 6).slice(0, 3);
for (const p of tec) console.log("TEC", p.apelido, p.xP, p.piso, p.teto, p.scouts.map(s=>s.key+":"+s.esperado).join(","));
console.log("json KB", (JSON.stringify(a).length / 1024).toFixed(0));
