/** Funções de servidor do Campinhos: leitura pública; lançar, apagar e importar só para o ADM. */
import { createServerFn } from "@tanstack/react-start";
import { FORMAS_GOL, POSICOES_CAMPINHO, type FormaGol, type PosCampinho } from "../engine/campinhos";

const pos = (v: unknown): PosCampinho | null => ((POSICOES_CAMPINHO as readonly string[]).includes(String(v)) ? (v as PosCampinho) : null);

/** Partidas da temporada, clubes e todos os gols lançados. */
export const fetchCampinhos = createServerFn({ method: "GET" }).handler(async () => (await import("./campinhos")).base());

export const lancarGolFn = createServerFn({ method: "POST" })
  .validator((d: Record<string, unknown> | undefined) => {
    const matchId = Number(d?.matchId);
    const clubeId = Number(d?.clubeId);
    if (!Number.isInteger(matchId) || matchId <= 0) throw new Error("Selecione a partida.");
    if (!Number.isInteger(clubeId) || clubeId <= 0) throw new Error("Selecione o time que fez o gol.");
    const forma = String(d?.forma ?? "");
    if (!(FORMAS_GOL as readonly string[]).includes(forma)) throw new Error("Selecione a forma do gol.");
    return { matchId, clubeId, forma: forma as FormaGol, gol: pos(d?.gol), assist: pos(d?.assist) };
  })
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth");
    const admin = requireAdmin();
    return (await import("./campinhos")).lancar(data, admin.id);
  });

export const apagarGolFn = createServerFn({ method: "POST" })
  .validator((d: { id?: unknown } | undefined) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth");
    requireAdmin();
    (await import("./campinhos")).apagar(data.id);
    return { ok: true };
  });

export const importarGolsFn = createServerFn({ method: "POST" })
  .validator((d: { texto?: unknown; simular?: unknown } | undefined) => {
    const texto = String(d?.texto ?? "");
    if (texto.length > 500_000) throw new Error("Arquivo grande demais (máx. 500 KB).");
    return { texto, simular: d?.simular === true };
  })
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth");
    const admin = requireAdmin();
    return (await import("./campinhos")).importar(data.texto, admin.id, data.simular);
  });

export type CampinhosBase = Awaited<ReturnType<typeof fetchCampinhos>>;
