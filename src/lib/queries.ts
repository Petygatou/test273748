import { queryOptions, useQuery } from "@tanstack/react-query";
import { fetchAnalysis, fetchBacktest, fetchLive, fetchMudancas, fetchNews } from "../server/fns";

type AnalysisPayload = Awaited<ReturnType<typeof fetchAnalysis>>;

/** No navegador: JSON leve com ETag (304 quando nada mudou). No servidor: server function. */
async function fetchAnalysisJson(): Promise<AnalysisPayload> {
  if (typeof window === "undefined") return fetchAnalysis();
  const res = await fetch("/api/analise", { headers: { Accept: "application/json" } });
  const body = (await res.json()) as AnalysisPayload & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export const analysisQuery = queryOptions({
  queryKey: ["analysis"],
  queryFn: fetchAnalysisJson,
  // o servidor avisa por SSE quando algo muda (fora da Vercel); o intervalo é a rede de segurança,
  // espaçado para não gastar o limite do plano (só roda com a aba visível)
  staleTime: 2 * 60_000,
  gcTime: 60 * 60_000,
  refetchInterval: 5 * 60_000,
  refetchOnWindowFocus: true,
});

export const mudancasQuery = queryOptions({
  queryKey: ["mudancas"],
  queryFn: () => fetchMudancas(),
  staleTime: 60_000,
  refetchInterval: 3 * 60_000,
});

export const backtestQuery = queryOptions({
  queryKey: ["backtest"],
  queryFn: () => fetchBacktest(),
  staleTime: 60 * 60_000,
  refetchOnWindowFocus: false,
});

export const liveQuery = queryOptions({
  queryKey: ["live"],
  queryFn: () => fetchLive(),
  refetchInterval: 2 * 60_000,
  staleTime: 60_000,
});

export const newsQuery = queryOptions({
  queryKey: ["news"],
  queryFn: () => fetchNews({ data: {} }),
  staleTime: 5 * 60_000,
});

export function useAnalysis() {
  return useQuery(analysisQuery);
}
