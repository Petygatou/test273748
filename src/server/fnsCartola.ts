/**
 * Server functions da API do Cartola (times, ligas, conta do cartoleiro).
 * O token do Cartola chega no corpo da requisição POST e não é gravado.
 */
import { createServerFn } from "@tanstack/react-start";
import { FORMATION_KEYS, type FormationKey } from "../engine/rules";

type Obj = Record<string, unknown>;
const obj = (d: unknown): Obj => (d && typeof d === "object" && !Array.isArray(d) ? (d as Obj) : {});
const s = (x: unknown, max = 200) => (typeof x === "string" ? x.slice(0, max) : "");
const token = (d: unknown) => s(obj(d).token, 4000);

function friendly(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|aborted|HTTP 403/i.test(msg) && !/auth/i.test(msg)) {
    throw new Error("A API do Cartola não respondeu (fora do ar ou bloqueada na rede do servidor).");
  }
  if (/HTTP 401|não autorizado|nao autorizado/i.test(msg)) throw new Error("Token do Cartola recusado: gere um novo e conecte de novo.");
  throw err instanceof Error ? err : new Error(msg);
}

export const searchTeamsFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => ({ q: s(obj(d).q, 60) }))
  .handler(async ({ data }) => {
    const { searchTeams } = await import("./cartolaConta");
    return searchTeams(data.q).catch(friendly);
  });

export const searchLeaguesFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => ({ q: s(obj(d).q, 60) }))
  .handler(async ({ data }) => {
    const { searchLeagues } = await import("./cartolaConta");
    return searchLeagues(data.q).catch(friendly);
  });

export const fetchTeamFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => ({ id: Number(obj(d).id) || undefined, slug: s(obj(d).slug, 120) || undefined, rodada: Number(obj(d).rodada) || undefined }))
  .handler(async ({ data }) => {
    const { getTeam } = await import("./cartolaConta");
    if (!data.id && !data.slug) throw new Error("Informe o time.");
    return getTeam({ id: data.id, slug: data.slug }, data.rodada).catch(friendly);
  });

/** Parciais de qualquer time: escalação do time + pontuados ao vivo. */
export const fetchTeamLiveFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => ({ id: Number(obj(d).id) || 0 }))
  .handler(async ({ data }) => {
    const { getTeam } = await import("./cartolaConta");
    const { getLivePontuados } = await import("./cartolaApi");
    const { CAPTAIN_MULTIPLIER } = await import("../engine/rules");
    try {
      const [time, live] = await Promise.all([getTeam({ id: data.id }), getLivePontuados().catch(() => null)]);
      const pts = live?.atletas ?? {};
      let parcial = 0;
      const atletas = time.atletas.map((a) => {
        const p = pts[String(a.atletaId)];
        const pontos = p && p.entrou_em_campo !== false ? p.pontuacao : null;
        if (pontos != null) parcial += pontos * (a.atletaId === time.capitaoId ? CAPTAIN_MULTIPLIER : 1);
        return { ...a, parcial: pontos };
      });
      return { time, atletas, parcial: Math.round(parcial * 100) / 100, aoVivo: Boolean(live) };
    } catch (e) {
      friendly(e);
    }
  });

export const posRodadaFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getPosRodada } = await import("./cartolaConta");
  try {
    return await getPosRodada();
  } catch {
    return null;
  }
});

export const esquemasFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getEsquemas } = await import("./cartolaConta");
  return getEsquemas();
});

/* ------------------------------ com token do cartoleiro ------------------------------ */

export const myTeamFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => ({ token: token(d) }))
  .handler(async ({ data }) => {
    const { getMyTeam } = await import("./cartolaConta");
    return getMyTeam(data.token).catch(friendly);
  });

export const myLeaguesFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => ({ token: token(d) }))
  .handler(async ({ data }) => {
    const { getMyLeagues } = await import("./cartolaConta");
    return getMyLeagues(data.token).catch(friendly);
  });

export const leagueFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const ordem = s(obj(d).ordem, 20);
    return { token: token(d), slug: s(obj(d).slug, 120), ordem: (["campeonato", "rodada", "mes", "turno"].includes(ordem) ? ordem : undefined) as "campeonato" | "rodada" | "mes" | "turno" | undefined };
  })
  .handler(async ({ data }) => {
    const { getLeague } = await import("./cartolaConta");
    if (!data.slug) throw new Error("Informe a liga.");
    return getLeague(data.token, data.slug, data.ordem).catch(friendly);
  });

export const saveToCartolaFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = obj(d);
    const formation = s(o.formation, 8) as FormationKey;
    if (!FORMATION_KEYS.includes(formation)) throw new Error("Esquema inválido.");
    const ids = Array.isArray(o.titulares) ? o.titulares.map(Number).filter(Number.isInteger) : [];
    return {
      token: token(d),
      formation,
      titulares: ids.slice(0, 12),
      captainId: Number(o.captainId) || 0,
      reservas: (Array.isArray(o.reservas) ? o.reservas : []).slice(0, 5).map((r) => ({ atletaId: Number(obj(r).atletaId) || 0, posicaoId: Number(obj(r).posicaoId) || 0, luxo: Boolean(obj(r).luxo) })),
    };
  })
  .handler(async ({ data }) => {
    const { saveMyLineup } = await import("./cartolaConta");
    const { token: t, ...input } = data;
    return saveMyLineup(t, input).catch(friendly);
  });
