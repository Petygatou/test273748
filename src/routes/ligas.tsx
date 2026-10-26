import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock, Loader2, Search, Sparkles, Star, Trophy, Users, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { CartolaConnect, useCartolaToken } from "../components/CartolaConnect";
import { Highlight } from "../components/PlayerSearch";
import { Alert, Card, PageSkeleton, SectionTitle, Seg } from "../components/ui";
import { cs, fmt1 } from "../lib/format";
import { norm, useDebounced } from "../lib/search";
import { KEYS, useLocal } from "../lib/storage";
import type { LeagueSummary } from "../server/cartolaConta";
import { leagueFn, myLeaguesFn, popularLeaguesFn, searchLeaguesFn } from "../server/fnsCartola";

type Ordem = "campeonato" | "rodada" | "mes" | "turno";

export const Route = createFileRoute("/ligas")({
  validateSearch: (s: Record<string, unknown>): { slug?: string } => ({ slug: typeof s.slug === "string" ? s.slug.slice(0, 120) : undefined }),
  component: LeaguesPage,
});

function LeaguesPage() {
  const { slug } = Route.useSearch();
  const navigate = useNavigate({ from: "/ligas" });
  const [token] = useCartolaToken();
  const [ordem, setOrdem] = useState<Ordem>("campeonato");
  const league = useQuery({ queryKey: ["liga", slug, ordem, token.slice(-12)], queryFn: () => leagueFn({ data: { token, slug: slug!, ordem } }), enabled: Boolean(slug && token), retry: false });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold">
          <Trophy size={22} className="text-[var(--color-gold)]" /> Ligas
        </h1>
        <p className="text-sm text-[var(--color-ink-3)]">Busque ligas do Cartola e acompanhe a classificação.</p>
      </div>
      <LigaBusca token={token} onEscolher={(l) => navigate({ search: { slug: l.slug } })} />

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

/**
 * Busca de ligas: já abre mostrando ligas (suas, recentes e em destaque no Cartola) e filtra
 * a cada letra digitada; a partir de 2 letras também busca no Cartola. Setas + Enter escolhem.
 */
function LigaBusca({ token, onEscolher }: { token: string; onEscolher: (l: LeagueSummary) => void }) {
  const [q, setQ] = useState("");
  const [ativo, setAtivo] = useState(0);
  const termo = useDebounced(q.trim(), 250);
  const [recentes, setRecentes] = useLocal<LeagueSummary[]>(KEYS.ligasRecentes, []);
  const minhas = useQuery({ queryKey: ["minhas-ligas", token.slice(-12)], queryFn: () => myLeaguesFn({ data: { token } }), enabled: Boolean(token), retry: false, staleTime: 5 * 60_000 });
  const destaque = useQuery({ queryKey: ["ligas-destaque"], queryFn: () => popularLeaguesFn(), retry: false, staleTime: 60 * 60_000 });
  const busca = useQuery({ queryKey: ["ligas-busca", termo], queryFn: () => searchLeaguesFn({ data: { q: termo } }), enabled: termo.length >= 2, retry: false, staleTime: 10 * 60_000 });

  const escolher = (l: LeagueSummary) => {
    setRecentes([l, ...recentes.filter((r) => r.slug !== l.slug)].slice(0, 8));
    setQ("");
    onEscolher(l);
  };

  // com texto: primeiro o que já conhecemos (filtra na hora), depois o que o Cartola devolver
  const secoes = useMemo(() => {
    const n = norm(q.trim());
    const conhecidas = [...(minhas.data ?? []), ...recentes, ...(destaque.data ?? [])];
    if (!n) {
      return [
        { titulo: "Suas ligas", Icon: Star, itens: minhas.data ?? [] },
        { titulo: "Abertas recentemente", Icon: Clock, itens: recentes },
        { titulo: "Em destaque no Cartola", Icon: Sparkles, itens: destaque.data ?? [] },
      ].filter((s) => s.itens.length);
    }
    const vistos = new Set<string>();
    const unico = (l: LeagueSummary) => (vistos.has(l.slug) ? false : (vistos.add(l.slug), true));
    const locais = conhecidas.filter((l) => norm(l.nome).includes(n) && unico(l));
    const remotas = termo.length >= 2 && termo === q.trim() ? (busca.data ?? []).filter(unico) : [];
    return [
      { titulo: "Sugestões", Icon: Star, itens: locais },
      { titulo: "No Cartola", Icon: Search, itens: remotas },
    ].filter((s) => s.itens.length);
  }, [q, termo, minhas.data, recentes, destaque.data, busca.data]);
  const lista = secoes.flatMap((s) => s.itens);
  const buscando = q.trim().length >= 2 && (termo !== q.trim() || busca.isFetching);

  let idx = -1;
  return (
    <Card className="p-4">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-3)]" aria-hidden />
        <input
          className="input h-12 pr-10 pl-9 text-base"
          placeholder="Digite o nome da liga"
          autoComplete="off"
          spellCheck={false}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAtivo(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAtivo((i) => Math.min(lista.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAtivo((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && lista[ativo]) {
              e.preventDefault();
              escolher(lista[ativo]);
            } else if (e.key === "Escape") setQ("");
          }}
          aria-label="Buscar liga"
          role="combobox"
          aria-expanded={lista.length > 0}
          aria-controls="ligas-lista"
        />
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[var(--color-ink-3)]">
          {buscando ? (
            <Loader2 size={16} className="animate-spin" aria-label="Buscando" />
          ) : q ? (
            <button type="button" onClick={() => setQ("")} aria-label="Limpar busca" className="hover:text-[var(--color-ink)]">
              <X size={16} />
            </button>
          ) : null}
        </span>
      </div>
      {busca.error && q.trim().length >= 2 && !buscando && (
        <div className="mt-2">
          {secoes.length ? (
            <p className="text-xs text-[var(--color-ink-3)]">A busca do Cartola não respondeu agora; mostrando as ligas que você já conhece.</p>
          ) : (
            <Alert tone="warning">{busca.error instanceof Error ? busca.error.message : "Busca indisponível"}</Alert>
          )}
        </div>
      )}
      <div id="ligas-lista" role="listbox" className="mt-3 space-y-3">
        {secoes.map((sec) => (
          <div key={sec.titulo}>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-[var(--color-ink-3)] uppercase">
              <sec.Icon size={12} aria-hidden /> {sec.titulo}
            </div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {sec.itens.map((l) => {
                idx++;
                const i = idx;
                return (
                  <li key={`${sec.titulo}:${l.slug}`} role="option" aria-selected={i === ativo}>
                    <LigaItem l={l} q={q} ativo={i === ativo && q.length > 0} onClick={() => escolher(l)} onHover={() => setAtivo(i)} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {!secoes.length && q.trim().length >= 2 && !buscando && <p className="text-sm text-[var(--color-ink-3)]">Nenhuma liga encontrada para “{q}”.</p>}
        {!secoes.length && !q && (destaque.isLoading || minhas.isLoading) && <div className="skeleton h-24" />}
        {!secoes.length && !q && !destaque.isLoading && !minhas.isLoading && (
          <p className="text-sm text-[var(--color-ink-3)]">Digite o nome da liga para buscar no Cartola.{!token && " Conecte sua conta em Meu Time para ver as suas ligas aqui."}</p>
        )}
      </div>
    </Card>
  );
}

function LigaItem({ l, q, ativo, onClick, onHover }: { l: LeagueSummary; q: string; ativo: boolean; onClick: () => void; onHover: () => void }): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors ${ativo ? "border-[var(--color-brand)]/50 bg-[var(--color-brand)]/10" : "border-[var(--color-line)] bg-[var(--color-surface-1)] hover:border-[var(--color-ink-3)]"}`}
    >
      {l.imagem ? (
        <img src={l.imagem} alt="" width={32} height={32} loading="lazy" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-gold)]/15 text-[var(--color-gold)]">
          <Trophy size={15} aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{q.trim() ? <Highlight text={l.nome} q={q} /> : l.nome}</span>
        {l.descricao && <span className="block truncate text-[11px] text-[var(--color-ink-3)]">{l.descricao}</span>}
      </span>
      {l.totalTimes != null && (
        <span className="tabular flex shrink-0 items-center gap-1 text-[11px] text-[var(--color-ink-3)]">
          <Users size={12} aria-hidden /> {l.totalTimes.toLocaleString("pt-BR")}
        </span>
      )}
    </button>
  );
}
