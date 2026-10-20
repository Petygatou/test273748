import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDownUp, BookOpen, Grid3x3, Scale, Search, Shield, Swords, Table } from "lucide-react";
import { useMemo, useState } from "react";
import { SERIES_A, SERIES_B, divergingColor } from "../components/charts";
import { OutcomeBar } from "../components/FixtureCard";
import { X1 } from "../components/X1";
import { Card, ClubBadge, ErrorBox, PageSkeleton, PlayerPhoto, PosBadge, RangeBar, SectionTitle, Seg, StatusPill } from "../components/ui";
import { ALL_POSITIONS, POSITIONS, SCORING, SCOUT_LABELS, type PositionId, type ScoutKey } from "../engine/rules";
import type { CedenciaCell, PlayerProjection, RoundAnalysis } from "../engine/types";
import { confrontoFor } from "../lib/derive";
import { cs, fmt1, fmt2, pct, posAbbr, signed } from "../lib/format";
import { analysisQuery } from "../lib/queries";
import { searchPlayers } from "../lib/search";

type Tab = "mercado" | "x1" | "confrontos" | "cedencia" | "times" | "glossario";
const TABS: Array<{ value: Tab; label: string; Icon: typeof Table }> = [
  { value: "mercado", label: "Mercado", Icon: Table },
  { value: "x1", label: "Duelo X1", Icon: Scale },
  { value: "confrontos", label: "Confrontos", Icon: Swords },
  { value: "cedencia", label: "Cedência", Icon: Grid3x3 },
  { value: "times", label: "Força dos times", Icon: Shield },
  { value: "glossario", label: "Glossário", Icon: BookOpen },
];

export const Route = createFileRoute("/estatisticas")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab; a?: number; b?: number } => ({
    tab: TABS.some((t) => t.value === s.tab) ? (s.tab as Tab) : undefined,
    a: s.a != null && !Number.isNaN(Number(s.a)) ? Number(s.a) : undefined,
    b: s.b != null && !Number.isNaN(Number(s.b)) ? Number(s.b) : undefined,
  }),
  component: StatsPage,
});

function StatsPage() {
  const { data, isLoading, error, refetch } = useQuery(analysisQuery);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/estatisticas" });
  const tab = search.tab ?? "mercado";
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorBox error={error} retry={() => refetch()} />;
  const a = data.analysis;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold">Estatísticas</h1>
        <p className="text-sm text-[var(--color-ink-3)]">
          Tudo sobre a rodada {a.rodada}: mercado completo, duelo entre atletas, confrontos e o que cada time cede por posição.{" "}
          <Link to="/modelo" className="font-semibold text-[var(--color-brand)] underline">
            Veja a precisão do modelo
          </Link>
        </p>
      </div>
      <div data-tour="stats-abas" className="seg max-w-full overflow-x-auto scrollbar-none" role="tablist" aria-label="Seções">
        {TABS.map(({ value, label, Icon }) => (
          <button key={value} role="tab" aria-selected={tab === value} aria-pressed={tab === value} onClick={() => navigate({ search: (s) => ({ ...s, tab: value }) })} className="flex items-center gap-1.5">
            <Icon size={14} aria-hidden /> {label}
          </button>
        ))}
      </div>
      {tab === "mercado" && <Mercado a={a} />}
      {tab === "x1" && <X1 a={a} ida={search.a} idb={search.b} onChange={(ida, idb) => navigate({ search: (s) => ({ ...s, a: ida, b: idb }), replace: true })} />}
      {tab === "confrontos" && <Confrontos a={a} />}
      {tab === "cedencia" && <Cedencia a={a} />}
      {tab === "times" && <Times a={a} />}
      {tab === "glossario" && <Glossario />}
    </div>
  );
}

/* ================================ MERCADO ================================ */

type SortKey = "xP" | "cb" | "teto" | "piso" | "pAcima12" | "valorizacaoEsperada" | "mpv" | "regularidade" | "preco" | "media" | "posse";
const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: "xP", label: "Pontos previstos" },
  { value: "cb", label: "Custo-benefício" },
  { value: "teto", label: "Teto" },
  { value: "piso", label: "Piso" },
  { value: "pAcima12", label: "Chance 12+" },
  { value: "valorizacaoEsperada", label: "Valorização" },
  { value: "mpv", label: "Menor MPV" },
  { value: "regularidade", label: "Regularidade" },
  { value: "media", label: "Média" },
  { value: "preco", label: "Preço" },
  { value: "posse", label: "% escalado" },
];

function sortValue(p: PlayerProjection, k: SortKey) {
  if (k === "cb") return p.preco > 0 ? p.xP / p.preco : 0;
  if (k === "mpv") return -p.mpv;
  if (k === "posse") return p.posse ?? -1;
  return p[k] as number;
}

function Mercado({ a }: { a: RoundAnalysis }) {
  const [pos, setPos] = useState<"all" | `${PositionId}`>("all");
  const [onlyLikely, setOnlyLikely] = useState(true);
  const [club, setClub] = useState<number | "all">("all");
  const [maxPrice, setMaxPrice] = useState(30);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("xP");
  const [limit, setLimit] = useState(40);
  const rows = useMemo(() => {
    const hits = q.trim() ? new Set(searchPlayers(a.players, a.clubs, q, { limit: 5000 }).map((p) => p.atletaId)) : null;
    return a.players
      .filter((p) => (pos === "all" ? true : p.posicaoId === Number(pos)))
      .filter((p) => (onlyLikely ? p.pJogar >= 0.5 && p.matchId != null : true))
      .filter((p) => (club === "all" ? true : p.clubeId === club))
      .filter((p) => p.preco <= maxPrice)
      .filter((p) => (hits ? hits.has(p.atletaId) : true))
      .sort((x, y) => sortValue(y, sort) - sortValue(x, sort));
  }, [a, pos, onlyLikely, club, maxPrice, q, sort]);
  const clubs = Object.values(a.clubs).sort((x, y) => x.nome.localeCompare(y.nome));

  return (
    <Card className="p-3 sm:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Seg
            label="Posição"
            value={pos}
            onChange={setPos}
            options={[{ value: "all", label: "Todas" }, ...ALL_POSITIONS.map((p) => ({ value: `${p}` as const, label: POSITIONS[p].abbr }))]}
          />
          <label className="chip cursor-pointer">
            <input type="checkbox" checked={onlyLikely} onChange={(e) => setOnlyLikely(e.target.checked)} className="accent-[var(--color-brand)]" /> Só quem deve jogar
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="relative sm:col-span-1">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-3)]" aria-hidden />
            <input className="input pl-9" placeholder="Atleta, clube ou posição (ex.: ata fla)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar atleta" />
          </div>
          <select className="input" value={club} onChange={(e) => setClub(e.target.value === "all" ? "all" : Number(e.target.value))} aria-label="Clube">
            <option value="all">Todos os clubes</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-[var(--color-ink-3)]">
            <span className="whitespace-nowrap">Até {cs(maxPrice)}</span>
            <input type="range" min={2} max={30} step={0.5} value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} className="w-full accent-[var(--color-brand)]" aria-label="Preço máximo" />
          </label>
          <label className="flex items-center gap-2">
            <ArrowDownUp size={15} className="shrink-0 text-[var(--color-ink-3)]" aria-hidden />
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar por">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  Ordenar: {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="data w-full text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--color-surface-2)] text-left">Atleta</th>
              <th className="text-right" title="Pontos previstos (já descontada a chance de não jogar)">Pts</th>
              <th className="text-left">Jogo</th>
              <th className="text-right">C$</th>
              <th className="text-right">Joga</th>
              <th className="min-w-[150px] text-left">Piso · Média · Teto</th>
              <th className="text-right">12+</th>
              <th className="text-right" title="Mínimo para valorizar">MPV</th>
              <th className="text-right" title="Variação esperada de preço">Val.</th>
              <th className="text-right">Média</th>
              <th className="text-right" title="% de jogos com 3+ pontos">Reg.</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.slice(0, limit).map((p) => {
              const opp = p.adversarioId != null ? a.clubs[p.adversarioId] : undefined;
              return (
                <tr key={p.atletaId}>
                  <td className="sticky left-0 z-10 bg-[var(--color-surface-2)]">
                    <Link to="/jogador/$id" params={{ id: String(p.atletaId) }} className="flex items-center gap-2">
                      <PlayerPhoto p={p} size={28} />
                      <div className="min-w-0">
                        <div className="max-w-[130px] truncate font-semibold">{p.apelido}</div>
                        <div className="flex items-center gap-1">
                          <PosBadge pos={p.posicaoId} />
                          <ClubBadge club={a.clubs[p.clubeId]} size={14} />
                          {p.statusId !== 7 && <StatusPill status={p.statusId} compact />}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="text-right font-display font-bold text-[var(--color-gold)]">{fmt1(p.xP)}</td>
                  <td className="text-xs text-[var(--color-ink-2)]">{opp ? `${p.mando === "casa" ? "vs" : "@"} ${opp.abreviacao}` : "—"}</td>
                  <td className="text-right">{fmt2(p.preco)}</td>
                  <td className="text-right text-[var(--color-ink-2)]">{pct(p.pJogar)}</td>
                  <td>
                    <RangeBar p={p} showLabels={false} />
                  </td>
                  <td className="text-right">{pct(p.pAcima12)}</td>
                  <td className="text-right">{fmt1(p.mpv)}</td>
                  <td className={`text-right ${p.valorizacaoEsperada >= 0 ? "text-[var(--color-good-ink)]" : "text-[var(--color-critical-ink)]"}`}>{signed(p.valorizacaoEsperada)}</td>
                  <td className="text-right text-[var(--color-ink-2)]">{fmt2(p.media)}</td>
                  <td className="text-right text-[var(--color-ink-2)]">{p.regularidade}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-ink-3)]">
        <span>
          {Math.min(limit, rows.length)} de {rows.length} atletas · faixa: piso P15, mediana, teto P85 (simulação)
        </span>
        {rows.length > limit && (
          <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => setLimit((l) => l + 40)}>
            Mostrar mais
          </button>
        )}
      </div>
    </Card>
  );
}

/* ================================ CONFRONTOS ================================ */

function Confrontos({ a }: { a: RoundAnalysis }) {
  const teams = a.fixtures
    .flatMap((f) => [
      { club: f.casaId, opp: f.foraId, home: true, f },
      { club: f.foraId, opp: f.casaId, home: false, f },
    ])
    .map((t) => ({ ...t, c: confrontoFor(t.f, t.home) }))
    .sort((x, y) => y.c.pVitoria - x.c.pVitoria);
  const cls = { Fácil: "text-[var(--color-good-ink)] border-[var(--color-good)]/40", Neutro: "", "Alto risco": "text-[var(--color-critical-ink)] border-[var(--color-critical)]/40" } as const;
  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <SectionTitle title="Matriz de confrontos" subtitle="Cada time na rodada: chance de vitória, gols esperados a favor e contra, chance de SG e classificação" />
        <div className="overflow-x-auto">
          <table className="data w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Time</th>
                <th className="text-left">Adversário</th>
                <th className="text-right">Vitória</th>
                <th className="text-right">xG pró</th>
                <th className="text-right">xG contra</th>
                <th className="text-right">SG</th>
                <th className="text-left">Classificação</th>
                <th className="text-left">Próximos 4 (vitória %)</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {teams.map((t) => (
                <tr key={t.club}>
                  <td>
                    <span className="flex items-center gap-2 font-semibold">
                      <ClubBadge club={a.clubs[t.club]} size={20} /> {a.clubs[t.club]?.nome}
                    </span>
                  </td>
                  <td className="text-[var(--color-ink-2)]">
                    <span className="flex items-center gap-1.5">
                      {t.home ? "vs" : "@"} <ClubBadge club={a.clubs[t.opp]} size={16} /> {a.clubs[t.opp]?.abreviacao}
                    </span>
                  </td>
                  <td className="text-right font-semibold">{pct(t.c.pVitoria)}</td>
                  <td className="text-right">{fmt2(t.c.xgPro)}</td>
                  <td className="text-right">{fmt2(t.c.xgContra)}</td>
                  <td className="text-right">{pct(t.c.sg)}</td>
                  <td>
                    <span className={`chip ${cls[t.c.label]}`}>{t.c.label}</span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {(a.proximos[t.club] ?? []).slice(1, 5).map((u) => {
                        const col = divergingColor(1 + (u.pVitoria - 0.38) * 1.1, 0.35);
                        return (
                          <span
                            key={u.rodada}
                            className="inline-flex h-6 min-w-[42px] items-center justify-center rounded-md px-1 text-[10px] font-bold"
                            style={{ background: col.bg, color: col.fg }}
                            title={`R${u.rodada}: ${u.mando === "casa" ? "vs" : "@"} ${a.clubs[u.adversarioId]?.nome} — vitória ${pct(u.pVitoria)}, SG ${pct(u.pSG)}`}
                          >
                            {a.clubs[u.adversarioId]?.abreviacao} {Math.round(u.pVitoria * 100)}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[var(--color-ink-3)]">
          Fácil: vitória ≥ 50% e xG contra ≤ 1,15. Alto risco: vitória &lt; 25% ou xG contra ≥ 1,6. Próximos jogos: laranja = sequência favorável, azul = difícil.
        </p>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {a.fixtures.map((f) => (
          <Card key={f.matchId} className="p-3">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-1.5">
                <ClubBadge club={a.clubs[f.casaId]} size={18} /> {a.clubs[f.casaId]?.abreviacao}
              </span>
              <span className="text-xs text-[var(--color-ink-3)]">placares mais prováveis</span>
              <span className="flex items-center gap-1.5">
                {a.clubs[f.foraId]?.abreviacao} <ClubBadge club={a.clubs[f.foraId]} size={18} />
              </span>
            </div>
            <ScoreGrid m={f.scoreMatrix} />
            <div className="mt-2">
              <OutcomeBar f={f} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Matriz de placares (sequencial, um tom: laranja). */
function ScoreGrid({ m }: { m: number[][] }) {
  const max = Math.max(...m.flat());
  return (
    <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-[2px] text-[10px]" role="table" aria-label="Probabilidade de cada placar">
      <div />
      {[0, 1, 2, 3, 4].map((y) => (
        <div key={y} className="text-center text-[var(--color-ink-3)]" role="columnheader">
          {y}
        </div>
      ))}
      {[0, 1, 2, 3, 4].map((x) => (
        <div key={x} className="contents" role="row">
          <div className="pr-1 text-right text-[var(--color-ink-3)]" role="rowheader">
            {x}
          </div>
          {[0, 1, 2, 3, 4].map((y) => {
            const v = m[x]?.[y] ?? 0;
            const t = v / max;
            return (
              <div
                key={y}
                role="cell"
                className="tabular flex h-6 items-center justify-center rounded-[4px] font-semibold"
                style={{ background: `rgb(232 100 31 / ${0.08 + 0.85 * t})`, color: t > 0.6 ? "#140700" : "#c3c2b7" }}
                title={`${x}–${y}: ${pct(v, 1)}`}
              >
                {Math.round(v * 100)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ================================ CEDÊNCIA ================================ */

function Cedencia({ a }: { a: RoundAnalysis }) {
  const [view, setView] = useState<"geral" | "casa" | "fora" | "ultimos5">("geral");
  const [sortPos, setSortPos] = useState<PositionId>(5);
  const oppOf = new Map<number, { opp: number; home: boolean }>();
  for (const f of a.fixtures) {
    oppOf.set(f.casaId, { opp: f.foraId, home: true });
    oppOf.set(f.foraId, { opp: f.casaId, home: false });
  }
  const rows = [...a.cedencia].sort((x, y) => y[view][sortPos].fator - x[view][sortPos].fator);
  return (
    <Card className="p-3 sm:p-4">
      <SectionTitle
        title="Matriz de cedência posicional"
        subtitle="Quanto cada time CEDE de pontos por atleta de cada posição, relativo à média da liga (com shrinkage bayesiano)"
        right={
          <Seg
            label="Recorte"
            value={view}
            onChange={setView}
            options={[
              { value: "geral", label: "Geral" },
              { value: "casa", label: "Em casa" },
              { value: "fora", label: "Fora" },
              { value: "ultimos5", label: "Últ. 5" },
            ]}
          />
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[2px] text-sm">
          <thead>
            <tr className="text-[11px] text-[var(--color-ink-3)] uppercase">
              <th className="px-2 py-1 text-left font-semibold">Time (cede)</th>
              <th className="px-2 py-1 text-left font-semibold">Quem enfrenta</th>
              {ALL_POSITIONS.map((p) => (
                <th key={p} className="px-1 py-1 font-semibold">
                  <button className={`rounded px-1.5 py-0.5 ${sortPos === p ? "bg-[var(--color-surface-4)] text-[var(--color-ink)]" : ""}`} onClick={() => setSortPos(p)} aria-pressed={sortPos === p}>
                    {posAbbr(p)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const o = oppOf.get(r.clubeId);
              return (
                <tr key={r.clubeId}>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <span className="flex items-center gap-2 font-semibold">
                      <ClubBadge club={a.clubs[r.clubeId]} size={18} /> {a.clubs[r.clubeId]?.nome}
                    </span>
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs text-[var(--color-ink-2)]">
                    {o ? (
                      <span className="flex items-center gap-1">
                        <ClubBadge club={a.clubs[o.opp]} size={14} /> {a.clubs[o.opp]?.abreviacao} {o.home ? "(fora)" : "(em casa)"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {ALL_POSITIONS.map((p) => {
                    const cell: CedenciaCell = r[view][p];
                    const col = divergingColor(cell.fator);
                    return (
                      <td
                        key={p}
                        className="tabular min-w-[54px] rounded-[4px] px-1 py-1.5 text-center text-xs font-semibold"
                        style={{ background: col.bg, color: col.fg }}
                        title={`${a.clubs[r.clubeId]?.nome} cede ${fmt2(cell.pontos)} pts por ${POSITIONS[p].name.toLowerCase()} (${cell.jogos} amostras) — fator ${fmt2(cell.fator)}`}
                      >
                        {fmt1(cell.pontos)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-3)]">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ background: divergingColor(0.7).bg }} aria-hidden /> cede menos que a média
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ background: divergingColor(1).bg }} aria-hidden /> na média
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ background: divergingColor(1.3).bg }} aria-hidden /> cede mais (bom para quem enfrenta)
        </span>
        <span>Números = pontos médios cedidos por atleta da posição. Clique na posição para ordenar.</span>
      </div>
    </Card>
  );
}

/* ================================ TIMES ================================ */

function Times({ a }: { a: RoundAnalysis }) {
  const rows = [...a.teams].sort((x, y) => y.xgFor - y.xgAgainst - (x.xgFor - x.xgAgainst));
  const maxG = Math.max(...rows.map((r) => Math.max(r.xgFor, r.xgAgainst)));
  return (
    <Card className="p-3 sm:p-4">
      <SectionTitle title="Força dos times" subtitle="Modelo de Poisson bidirecional com decaimento temporal: gols esperados contra um adversário médio em campo neutro" />
      <div className="overflow-x-auto">
        <table className="data w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">#</th>
              <th className="text-left">Time</th>
              <th className="min-w-[160px] text-left">Ataque (xG pró/jogo)</th>
              <th className="min-w-[160px] text-left">Defesa (xG contra/jogo)</th>
              <th className="text-right">Saldo</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((t, i) => (
              <tr key={t.clubeId}>
                <td className="text-[var(--color-ink-3)]">{i + 1}</td>
                <td>
                  <span className="flex items-center gap-2 font-semibold">
                    <ClubBadge club={a.clubs[t.clubeId]} size={20} /> {a.clubs[t.clubeId]?.nome}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-[var(--color-surface-1)]">
                      <div className="h-2 rounded-full" style={{ width: `${(t.xgFor / maxG) * 100}%`, background: SERIES_A }} />
                    </div>
                    <span className="w-9 text-right">{fmt2(t.xgFor)}</span>
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-[var(--color-surface-1)]">
                      <div className="h-2 rounded-full" style={{ width: `${(t.xgAgainst / maxG) * 100}%`, background: SERIES_B }} />
                    </div>
                    <span className="w-9 text-right">{fmt2(t.xgAgainst)}</span>
                  </div>
                </td>
                <td className={`text-right font-semibold ${t.xgFor - t.xgAgainst >= 0 ? "text-[var(--color-good-ink)]" : "text-[var(--color-critical-ink)]"}`}>{signed(t.xgFor - t.xgAgainst)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[var(--color-ink-3)]">Vantagem de mando estimada: {((a.homeAdvantage - 1) * 100).toFixed(0)}% mais gols para o mandante.</p>
    </Card>
  );
}

/* ================================ GLOSSÁRIO ================================ */

const GLOSSARY: Array<{ term: string; def: string }> = [
  { term: "Pontos previstos (xP)", def: "Média de pontos que o atleta deve fazer na rodada, já multiplicada pela chance de entrar em campo. É o número que o otimizador soma." },
  { term: "Pontos se jogar", def: "Pontos esperados caso o atleta entre em campo. Útil para comparar quem certamente joga." },
  { term: "Piso (P15) e Teto (P85)", def: "Resultado da simulação de Monte Carlo: em 15% das rodadas simuladas o atleta faz menos que o piso; em 15% faz mais que o teto. A faixa entre eles contém 70% dos cenários — e o backtest confere se isso acontece de verdade." },
  { term: "Base x Explosão", def: "Base = scouts de volume que se repetem (desarmes, faltas sofridas, finalizações, defesas). Explosão = eventos raros e decisivos (gol, assistência, SG, defesa de pênalti, vitória do técnico)." },
  { term: "Chance de jogar", def: "Combina o status oficial (provável, dúvida...), a participação recente nos jogos do clube (com peso maior para os últimos) e as prováveis escalações publicadas no Painel ADM." },
  { term: "Fator Ataque", def: "Gols esperados do time neste confronto divididos pelos gols esperados contra um adversário médio. +20% = jogo 20% mais favorável para marcar." },
  { term: "Fator Cedência", def: "Quanto o adversário cede do scout principal da posição (desarmes para defensores, finalizações para meias e atacantes, defesas para goleiros) em relação à média." },
  { term: "Matriz de cedência", def: "Pontos médios que os atletas de cada posição fazem contra cada time, encolhidos em direção à média da liga para não exagerar amostras pequenas." },
  { term: "SG (saldo de gol)", def: "Probabilidade do time não sofrer gol, calculada pela matriz de placares do modelo Dixon-Coles, multiplicada pela taxa histórica do atleta de receber o SG quando o time não sofre gol." },
  { term: "MPV (mínimo para valorizar)", def: "Pontuação a partir da qual o atleta ganha cartoletas. Usa o valor oficial quando a API fornece; senão, a fórmula V = CPP × (pontos − MPV) é recalibrada a cada rodada com o mercado inteiro." },
  { term: "Valorização esperada", def: "Chance de jogar × CPP × (pontos se jogar − MPV). Positiva = deve valorizar." },
  { term: "Regularidade", def: "Porcentagem dos jogos da temporada com 3 pontos ou mais (com leve ajuste para poucas amostras)." },
  { term: "Diferencial", def: "Atleta com boa projeção e pouca gente escalando: se ele mitar, você ganha posições na liga." },
  { term: "Capitão justificado", def: "O capitão recebe 1,5× os pontos. O otimizador escolhe o capitão junto com a tropa, e a justificativa compara as alternativas em pontos esperados." },
  { term: "Reserva de luxo", def: "O reserva designado substitui o titular da mesma posição que pontuar menos que ele. O motor estima o ganho esperado comparando as distribuições de pontos." },
  { term: "Backtest walk-forward", def: "Teste honesto: para cada rodada passada, o modelo só vê o que aconteceu antes dela, projeta, e comparamos com o resultado real e com escalar pela média." },
];

function Glossario() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {GLOSSARY.map((g) => (
        <Card key={g.term} className="p-4">
          <h3 className="font-display font-bold text-[var(--color-ink)]">{g.term}</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-2)]">{g.def}</p>
        </Card>
      ))}
      <Card className="p-4 md:col-span-2">
        <h3 className="font-display font-bold">Tabela de pontuação usada pelo motor</h3>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-4">
          {(Object.keys(SCORING) as ScoutKey[]).map((k) => (
            <div key={k} className="flex justify-between border-b border-[var(--color-line)] py-1">
              <span className="text-[var(--color-ink-2)]">
                <b className="text-[var(--color-ink)]">{k}</b> {SCOUT_LABELS[k]}
              </span>
              <span className={`tabular font-semibold ${SCORING[k] >= 0 ? "text-[var(--color-good-ink)]" : "text-[var(--color-critical-ink)]"}`}>{signed(SCORING[k], 1)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--color-ink-3)]">Capitão: 1,5×. A cada rodada o motor confere esta tabela contra as pontuações oficiais e aponta divergências na página Precisão do modelo.</p>
      </Card>
    </div>
  );
}
