import { queryOptions, useQuery } from "@tanstack/react-query";
import { fetchAnalysis, fetchBacktest, fetchLive, fetchMudancas, fetchNews } from "../server/fns";

export const analysisQuery = queryOptions({
  queryKey: ["analysis"],
  queryFn: () => fetchAnalysis(),
  // o servidor avisa por SSE quando algo muda; o intervalo é só rede de segurança
  staleTime: 30_000,
  gcTime: 60 * 60_000,
  refetchInterval: 90_000,
  refetchOnWindowFocus: true,
});

export const mudancasQuery = queryOptions({
  queryKey: ["mudancas"],
  queryFn: () => fetchMudancas(),
  staleTime: 15_000,
  refetchInterval: 60_000,
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
  refetchInterval: 60_000,
  staleTime: 30_000,
});

export const newsQuery = queryOptions({
  queryKey: ["news"],
  queryFn: () => fetchNews({ data: {} }),
  staleTime: 5 * 60_000,
});

export function useAnalysis() {
  return useQuery(analysisQuery);
}
