/** Parciais ao vivo: API oficial durante a rodada, ou uma rodada simulada no Modo Demonstração. */
import { Rng } from "../engine/math";
import type { RoundAnalysis } from "../engine/types";
import { getLivePartidas, getLivePontuados } from "./cartolaApi";

export interface LiveMatch {
  matchId: number;
  casaId: number;
  foraId: number;
  placarCasa: number | null;
  placarFora: number | null;
  status: "pre" | "andamento" | "encerrado";
  data?: string;
}

export interface LiveData {
  rodada: number;
  source: "cartola" | "demo";
  atualizadoEm: string;
  partidas: LiveMatch[];
  atletas: Record<number, { pontos: number; scout: Record<string, number>; entrou: boolean }>;
}

export async function loadLive(analysis: RoundAnalysis, mercadoStatus: number): Promise<LiveData> {
  if (analysis.source === "cartola" && mercadoStatus === 2) {
    const [pont, part] = await Promise.all([getLivePontuados(), getLivePartidas()]);
    const atletas: LiveData["atletas"] = {};
    for (const [id, a] of Object.entries(pont.atletas ?? {})) {
      atletas[Number(id)] = { pontos: a.pontuacao, scout: (a.scout ?? {}) as Record<string, number>, entrou: a.entrou_em_campo !== false };
    }
    return {
      rodada: pont.rodada ?? analysis.rodada,
      source: "cartola",
      atualizadoEm: new Date().toISOString(),
      partidas: (part.partidas ?? []).map((p) => ({
        matchId: p.partida_id,
        casaId: p.clube_casa_id,
        foraId: p.clube_visitante_id,
        placarCasa: p.placar_oficial_mandante,
        placarFora: p.placar_oficial_visitante,
        status: p.status_transmissao_tr === "ENCERRADA" ? "encerrado" : p.status_transmissao_tr === "EM_ANDAMENTO" ? "andamento" : "pre",
        data: p.timestamp ? new Date(p.timestamp * 1000).toISOString() : undefined,
      })),
      atletas,
    };
  }
  return demoLive(analysis);
}

/** Uma "rodada em andamento" plausível, sorteada a partir das próprias distribuições do modelo. */
function demoLive(analysis: RoundAnalysis): LiveData {
  const slot = Math.floor(Date.now() / 120_000); // muda a cada 2 minutos
  const rng = new Rng(analysis.rodada * 1000 + (slot % 997));
  const partidas: LiveMatch[] = analysis.fixtures.map((f, i) => {
    const status: LiveMatch["status"] = i < 4 ? "encerrado" : i < 7 ? "andamento" : "pre";
    const frac = status === "encerrado" ? 1 : status === "andamento" ? 0.55 : 0;
    return {
      matchId: f.matchId,
      casaId: f.casaId,
      foraId: f.foraId,
      placarCasa: status === "pre" ? null : rng.poisson(f.lambdaCasa * frac),
      placarFora: status === "pre" ? null : rng.poisson(f.lambdaFora * frac),
      status,
      data: f.data,
    };
  });
  const byMatch = new Map(partidas.map((p) => [p.matchId, p]));
  const atletas: LiveData["atletas"] = {};
  for (const p of analysis.players) {
    if (p.matchId == null) continue;
    const m = byMatch.get(p.matchId);
    if (!m || m.status === "pre") continue;
    if (!rng.bernoulli(p.pJogar)) continue;
    const frac = m.status === "encerrado" ? 1 : 0.55;
    const pts = Math.round((p.xPJogando * frac + p.sd * Math.sqrt(frac) * rng.normal()) * 10) / 10;
    atletas[p.atletaId] = { pontos: pts, scout: {}, entrou: true };
  }
  return { rodada: analysis.rodada, source: "demo", atualizadoEm: new Date().toISOString(), partidas, atletas };
}
