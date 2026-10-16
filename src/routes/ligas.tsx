import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, Trophy } from "lucide-react";
import { useState } from "react";
import { CartolaConnect, useCartolaToken } from "../components/CartolaConnect";
import { Alert, Card, PageSkeleton, SectionTitle, Seg } from "../components/ui";
import { cs, fmt1 } from "../lib/format";
import { leagueFn, searchLeaguesFn } from "../server/fnsCartola";

type Ordem = "campeonato" | "rodada" | "mes" | "turno";

export const Route = createFileRoute("/ligas")({
  validateSearch: (s: Record<string, unknown>): { slug?: string } => ({ slug: typeof s.slug === "string" ? s.slug.slice(0, 120) : undefined }),
  component: LeaguesPage,
});

function LeaguesPage() {
  const { slug } = Route.useSearch();
  const navigate = useNavigate({ from: "/ligas" });
  const [token] = useCartolaToken();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("campeonato");
  const search = useQuery({ queryKey: ["ligas-busca", term], queryFn: () => searchLeaguesFn({ data: { q: term } }), enabled: term.length >= 2, retry: false });
  const league = useQuery({ queryKey: ["liga", slug, ordem, token.slice(-12)], queryFn: () => leagueFn({ data: { token, slug: slug!, ordem } }), enabled: Boolean(slug && token), retry: false });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold">
          <Trophy size={22} className="text-[var(--color-gold)]" /> Ligas
        </h1>
        <p className="text-sm text-[var(--color-ink-3)]">Busque ligas do Cartola e acompanhe a classificação.</p>
      </div>
      <Card className="p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(q.trim());
          }}
        >
          <div className="relative flex-1">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-3)]" aria-hidden />
            <input className="input pl-9" placeholder="Nome da liga" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar liga" />
          </div>
          <button className="btn btn-ghost" type="submit">
            Buscar
          </button>
        </form>
        {search.error && (
          <div className="mt-2">
            <Alert tone="warning">{search.error instanceof Error ? search.error.message : "Busca indisponível"}</Alert>
          </div>
        )}
        {search.data && (
          <ul className="mt-2 divide-y divide-[var(--color-line)]">
            {search.data.map((l) => (
              <li key={l.slug}>
                <button className="flex w-full items-center gap-2 py-2 text-left hover:text-[var(--color-brand)]" onClick={() => navigate({ search: { slug: l.slug } })}>
                  {l.imagem && <img src={l.imagem} alt="" width={28} height={28} className="rounded" />}
                  <span className="flex-1 truncate text-sm font-semibold">{l.nome}</span>
                  {l.totalTimes != null && <span className="text-xs text-[var(--color-ink-3)]">{l.totalTimes} times</span>}
                </button>
              </li>
            ))}
            {!search.data.length && <li className="py-2 text-sm text-[var(--color-ink-3)]">Nenhuma liga encontrada.</li>}
          </ul>
        )}
      </Card>

      {slug && !token && (
        <>
          <Alert tone="info">A classificação de uma liga exige a sua conta do Cartola conectada.</Alert>
          <CartolaConnect />
        </>
      )}
      {slug && token && league.isLoading && <PageSkeleton />}
      {league.error && <Alert tone="critical">{league.error instanceof Error ? league.error.message : "Falha ao ler a liga"}</Alert>}
      {league.data && (
        <Card className="p-3 sm:p-4">
          <SectionTitle
            title={league.data.liga.nome || slug!}
            subtitle={league.data.liga.descricao}
            right={
              <Seg
                label="Ordenar"
                value={ordem}
                onChange={setOrdem}
                options={[
                  { value: "campeonato", label: "Campeonato" },
                  { value: "rodada", label: "Rodada" },
                  { value: "mes", label: "Mês" },
                  { value: "turno", label: "Turno" },
                ]}
              />
            }
          />
          <div className="overflow-x-auto">
            <table className="data w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">#</th>
                  <th className="text-left">Time</th>
                  <th className="text-right">Rodada</th>
                  <th className="text-right">Campeonato</th>
                  <th className="text-right">Patrimônio</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {league.data.times.map((t, i) => (
                  <tr key={t.timeId || t.slug}>
                    <td className="text-[var(--color-ink-3)]">{t.posicao ?? i + 1}</td>
                    <td>
                      <span className="flex items-center gap-2">
                        {t.escudo && <img src={t.escudo} alt="" width={22} height={22} className="rounded" />}
                        <span className="min-w-0">
                          <span className="block max-w-[180px] truncate font-semibold">{t.nome}</span>
                          <span className="block max-w-[180px] truncate text-[11px] text-[var(--color-ink-3)]">{t.cartoleiro}</span>
                        </span>
                      </span>
                    </td>
                    <td className="text-right">{fmt1(t.pontosRodada)}</td>
                    <td className="text-right font-semibold">{fmt1(t.pontosCampeonato)}</td>
                    <td className="text-right text-[var(--color-ink-2)]">{cs(t.patrimonio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
