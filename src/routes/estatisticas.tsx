import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDownUp, BookOpen, Columns3, Crosshair, Grid3x3, Scale, Search, Shield, Swords, Table } from "lucide-react";
import { useMemo, useState } from "react";
import { SERIES_A, SERIES_B, divergingColor } from "../components/charts";
import { OutcomeBar } from "../components/FixtureCard";
import { Sheet } from "../components/Sheet";
import { VsAdversario } from "../components/VsAdversario";
import { Cruzamento } from "../components/Cruzamento";
import { X1 } from "../components/X1";
import { Card, ClubBadge, ErrorBox, PageSkeleton, PlayerPhoto, PosBadge, SectionTitle, Seg, StatusPill } from "../components/ui";
import { ALL_POSITIONS, POSITIONS, SCORING, SCOUT_LABELS, type PositionId, type ScoutKey } from "../engine/rules";
import { LATERAL_DIR, LATERAL_ESQ, type CedenciaCell, type CedenciaScouts, type CedPos, type PlayerProjection, type RoundAnalysis } from "../engine/types";
import { confrontoFor, golsTime, type GolsTime } from "../lib/derive";
import { cs, fmt1, fmt2, pct, posAbbr, posName, signed } from "../lib/format";
import { analysisQuery } from "../lib/queries";
import { COLUNAS, COLUNAS_PADRAO, GRUPOS, timesNoJogo } from "../lib/mercadoColunas";
import { searchPlayers } from "../lib/search";
import { KEYS, useLocal } from "../lib/storage";

type Tab = "mercado" | "cruzamento" | "x1" | "confrontos" | "cedencia" | "times" | "glossario";
const TABS: Array<{ value: Tab; label: string; Icon: typeof Table }> = [
  { value: "mercado", label: "Mercado", Icon: Table },
  { value: "cruzamento", label: "Cruzamento de Scout", Icon: Crosshair },
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
          Tudo sobre a rodada {a.rodada}: mercado completo, cruzamento de scout, duelo entre atletas, confrontos e o que cada time cede por posição.{" "}
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
      {tab === "cruzamento" && <Cruzamento />}
      {tab === "x1" && <X1 a={a} ida={search.a} idb={search.b} onChange={(ida, idb) => navigate({ search: (s) => ({ ...s, a: ida, b: idb }), replace: true })} />}
      {tab === "confrontos" && <Confrontos a={a} />}
      {tab === "cedencia" && <Cedencia a={a} />}
      {tab === "times" && <Times a={a} />}
      {tab === "glossario" && <Glossario />}
    </div>
  );
}

/* ================================ MERCADO ================================ */

function Mercado({ a }: { a: RoundAnalysis }) {
  const [pos, setPos] = useState<"all" | `${PositionId}` | "LE" | "LD">("all");
  const temLados = a.players.some((p) => p.lado);
  const [onlyLikely, setOnlyLikely] = useState(true);
  const [club, setClub] = useState<number | "all">("all");
  const [maxPrice, setMaxPrice] = useState(30);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("xP");
  const [limit, setLimit] = useState(40);
  const [visiveis, setVisiveis] = useLocal<string[]>(KEYS.mercadoCols, COLUNAS_PADRAO);
  const [painel, setPainel] = useState(false);
  const ctx = useMemo(() => ({ a, times: timesNoJogo(a.fixtures) }), [a]);
  const cols = COLUNAS.filter((c) => visiveis.includes(c.id));
  const sortCol = COLUNAS.find((c) => c.id === sort) ?? COLUNAS[0];
  const rows = useMemo(() => {
    const hits = q.trim() ? new Set(searchPlayers(a.players, a.clubs, q, { limit: 5000 }).map((p) => p.atletaId)) : null;
    const v = (p: PlayerProjection) => sortCol.valor(p, ctx) ?? (sortCol.asc ? Infinity : -Infinity);
    return a.players
      .filter((p) => (pos === "all" ? true : pos === "LE" ? p.posicaoId === 2 && p.lado === "E" : pos === "LD" ? p.posicaoId === 2 && p.lado === "D" : p.posicaoId === Number(pos)))
      .filter((p) => (onlyLikely ? p.pJogar >= 0.5 && p.matchId != null : true))
      .filter((p) => (club === "all" ? true : p.clubeId === club))
      .filter((p) => p.preco <= maxPrice)
      .filter((p) => (hits ? hits.has(p.atletaId) : true))
      .sort((x, y) => (sortCol.asc ? v(x) - v(y) : v(y) - v(x)));
  }, [a, pos, onlyLikely, club, maxPrice, q, sortCol, ctx]);
  const clubs = Object.values(a.clubs).sort((x, y) => x.nome.localeCompare(y.nome));
  const alterna = (id: string) => setVisiveis(visiveis.includes(id) ? visiveis.filter((x) => x !== id) : [...visiveis, id]);

  return (
    <Card className="p-3 sm:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Seg
            label="Posição"
            value={pos}
            onChange={setPos}
            options={[
              { value: "all", label: "Todas" },
              ...ALL_POSITIONS.flatMap((p) => [
                { value: `${p}` as const, label: POSITIONS[p].abbr as string },
                // laterais separados por lado (lido nas escalações)
                ...(p === 2 && temLados ? [{ value: "LE" as const, label: "LE" }, { value: "LD" as const, label: "LD" }] : []),
              ]),
            ]}
          />
          <label className="chip cursor-pointer">
            <input type="checkbox" checked={onlyLikely} onChange={(e) => setOnlyLikely(e.target.checked)} className="accent-[var(--color-brand)]" /> Só quem deve jogar
          </label>
          <button type="button" className={`chip ${painel ? "border-[var(--color-brand)]/50 text-[var(--color-brand)]" : ""}`} aria-expanded={painel} onClick={() => setPainel((v) => !v)}>
            <Columns3 size={13} aria-hidden /> Colunas ({cols.length})
          </button>
        </div>
        {painel && (
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-[var(--color-ink-2)]">Escolha as colunas:</span>
              <button type="button" className="chip py-0.5" onClick={() => setVisiveis(COLUNAS_PADRAO)}>
                Padrão
              </button>
              <button type="button" className="chip py-0.5" onClick={() => setVisiveis(COLUNAS.map((c) => c.id))}>
                Todas ({COLUNAS.length})
              </button>
              <button type="button" className="chip py-0.5" onClick={() => setVisiveis(["xP", "jogo", "preco"])}>
                Mínimo
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {GRUPOS.map((g) => (
                <fieldset key={g}>
                  <legend className="mb-1 text-[10px] font-bold tracking-wider text-[var(--color-ink-3)] uppercase">{g}</legend>
                  <div className="flex flex-wrap gap-1">
                    {COLUNAS.filter((c) => c.grupo === g).map((c) => (
                      <label key={c.id} title={c.titulo} className={`chip cursor-pointer py-0.5 text-[11px] ${visiveis.includes(c.id) ? "border-[var(--color-brand)]/50 text-[var(--color-ink)]" : "text-[var(--color-ink-3)]"}`}>
                        <input type="checkbox" className="accent-[var(--color-brand)]" checked={visiveis.includes(c.id)} onChange={() => alterna(c.id)} /> {c.rotulo}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
        )}
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
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar por">
              {COLUNAS.filter((c) => c.id !== "jogo").map((c) => (
                <option key={c.id} value={c.id}>
                  Ordenar: {c.rotulo === "Piso · Média · Teto" ? "Teto" : c.rotulo} — {c.titulo.split(" (")[0]}
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
              {cols.map((c) => (
                <th key={c.id} title={c.titulo} className={c.className?.includes("text-left") ? "text-left" : "text-right"}>
                  {c.id === "jogo" ? (
                    c.rotulo
                  ) : (
                    <button type="button" onClick={() => setSort(c.id)} aria-pressed={sort === c.id} className={`whitespace-nowrap ${sort === c.id ? "text-[var(--color-brand)]" : ""}`}>
                      {c.rotulo}
                      {sort === c.id ? (c.asc ? " ↑" : " ↓") : ""}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.slice(0, limit).map((p) => (
              <tr key={p.atletaId}>
                <td className="sticky left-0 z-10 bg-[var(--color-surface-2)]">
                  <Link to="/jogador/$id" params={{ id: String(p.atletaId) }} className="flex items-center gap-2">
                    <PlayerPhoto p={p} size={28} />
                    <div className="min-w-0">
                      <div className="max-w-[130px] truncate font-semibold">{p.apelido}</div>
                      <div className="flex items-center gap-1">
                        <PosBadge pos={p.posicaoId} lado={p.lado} />
                        <ClubBadge club={a.clubs[p.clubeId]} size={14} />
                        {p.statusId !== 7 && <StatusPill status={p.statusId} compact />}
                      </div>
                    </div>
                  </Link>
                </td>
                {cols.map((c) => (
                  <td key={c.id} className={`${c.className?.includes("text-left") ? "" : "text-right"} ${c.className ?? ""} ${sort === c.id ? "bg-[var(--color-brand)]/5" : ""}`}>
                    {c.render(p, ctx)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-ink-3)]">
        <span>
          {Math.min(limit, rows.length)} de {rows.length} atletas · toque no título da coluna para ordenar · passe o dedo/mouse no título para ver o que é
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

type ConfSort = "pVitoria" | "marca1" | "marca2" | "marca3" | "xgPro" | "xgContra" | "sg" | "sofre2" | "venceDe2";
const CONF_COLS: Array<{ k: ConfSort; label: string; title: string; asc?: boolean }> = [
  { k: "pVitoria", label: "Vitória", title: "Chance de vencer o jogo" },
  { k: "marca1", label: "Marca 1+", title: "Chance de marcar pelo menos 1 gol" },
  { k: "marca2", label: "Marca 2+", title: "Chance de marcar mais de um gol (2 ou mais)" },
  { k: "marca3", label: "Marca 3+", title: "Chance de marcar 3 ou mais gols" },
  { k: "xgPro", label: "xG pró", title: "Gols esperados a favor" },
  { k: "xgContra", label: "xG contra", title: "Gols esperados contra", asc: true },
  { k: "sg", label: "SG", title: "Chance de não sofrer gol (saldo de gols no Cartola)" },
  { k: "sofre2", label: "Sofre 2+", title: "Chance de sofrer 2 ou mais gols", asc: true },
  { k: "venceDe2", label: "Vence por 2+", title: "Chance de vencer com 2 ou mais gols de diferença" },
];

function Confrontos({ a }: { a: RoundAnalysis }) {
  const [sort, setSort] = useState<ConfSort>("pVitoria");
  const col = CONF_COLS.find((c) => c.k === sort)!;
  const valor = (t: { c: ReturnType<typeof confrontoFor>; g: GolsTime }, k: ConfSort) => (k in t.c ? (t.c as unknown as Record<string, number>)[k] : (t.g as unknown as Record<string, number>)[k]);
  const teams = a.fixtures
    .flatMap((f) => [
      { club: f.casaId, opp: f.foraId, home: true, f },
      { club: f.foraId, opp: f.casaId, home: false, f },
    ])
    .map((t) => ({ ...t, c: confrontoFor(t.f, t.home), g: golsTime(t.f, t.home) }))
    .sort((x, y) => (col.asc ? valor(x, sort) - valor(y, sort) : valor(y, sort) - valor(x, sort)));
  const cls = { Fácil: "text-[var(--color-good-ink)] border-[var(--color-good)]/40", Neutro: "", "Alto risco": "text-[var(--color-critical-ink)] border-[var(--color-critical)]/40" } as const;
  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <SectionTitle title="Matriz de confrontos" subtitle="Cada time na rodada: vitória, chance de marcar 1, 2 ou 3+ gols, gols esperados, SG e mais. Toque no título de uma coluna para ordenar." />
        <div className="overflow-x-auto">
          <table className="data w-full text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-[var(--color-surface-2)] text-left">Time</th>
                <th className="text-left">Adversário</th>
                {CONF_COLS.map((c) => (
                  <th key={c.k} className="text-right" title={c.title}>
                    <button type="button" onClick={() => setSort(c.k)} aria-pressed={sort === c.k} className={`whitespace-nowrap ${sort === c.k ? "text-[var(--color-brand)]" : ""}`}>
                      {c.label}
                      {sort === c.k ? (c.asc ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
                <th className="text-left">Classificação</th>
                <th className="text-left">Próximos 4 (vitória %)</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {teams.map((t) => (
                <tr key={t.club}>
                  <td className="sticky left-0 z-10 bg-[var(--color-surface-2)]">
                    <span className="flex items-center gap-2 font-semibold whitespace-nowrap">
                      <ClubBadge club={a.clubs[t.club]} size={20} /> {a.clubs[t.club]?.nome}
                    </span>
                  </td>
                  <td className="text-[var(--color-ink-2)]">
                    <span className="flex items-center gap-1.5">
                      {t.home ? "vs" : "@"} <ClubBadge club={a.clubs[t.opp]} size={16} /> {a.clubs[t.opp]?.abreviacao}
                    </span>
                  </td>
                  {CONF_COLS.map((c) => {
                    const v = valor(t, c.k);
                    const isXg = c.k === "xgPro" || c.k === "xgContra";
                    return (
                      <td key={c.k} className={`text-right ${sort === c.k ? "font-bold text-[var(--color-ink)]" : c.k === "pVitoria" || c.k === "marca2" ? "font-semibold" : ""}`}>
                        {isXg ? fmt2(v) : pct(v)}
                      </td>
                    );
                  })}
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
          Marca 2+ = chance de o time fazer mais de um gol no jogo. Fácil: vitória ≥ 50% e xG contra ≤ 1,15. Alto risco: vitória &lt; 25% ou xG contra ≥ 1,6. Próximos jogos: laranja = sequência favorável, azul = difícil.
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
            {(() => {
              const gc = golsTime(f, true);
              const gf = golsTime(f, false);
              const itens = [
                { r: "Ambos marcam", v: gc.ambos },
                { r: "+1,5 gols", v: gc.over15 },
                { r: "+2,5 gols", v: gc.over25 },
                { r: `${a.clubs[f.casaId]?.abreviacao} 2+`, v: gc.marca2 },
                { r: `${a.clubs[f.foraId]?.abreviacao} 2+`, v: gf.marca2 },
                { r: "Placar provável", t: `${f.placarProvavel[0]} x ${f.placarProvavel[1]}` },
              ];
              return (
                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  {itens.map((it) => (
                    <div key={it.r} className="rounded-md bg-[var(--color-surface-1)] px-1 py-1">
                      <div className="truncate text-[9px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">{it.r}</div>
                      <div className="tabular text-xs font-bold">{"t" in it ? it.t : pct(it.v)}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
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

type MetricaCed = "pontos" | keyof CedenciaScouts;
const METRICAS_CED: Array<{ value: MetricaCed; label: string; desc: string }> = [
  { value: "pontos", label: "Pontos", desc: "pontos médios cedidos por atleta da posição" },
  { value: "DS", label: "Desarmes", desc: "desarmes médios que os atletas da posição conquistaram contra o time" },
  { value: "FIN", label: "Finalizações", desc: "finalizações médias (no gol, para fora e na trave) contra o time" },
  { value: "GA", label: "G+A", desc: "gols + assistências médios contra o time" },
  { value: "FS", label: "Faltas sofridas", desc: "faltas sofridas médias contra o time" },
  { value: "DE", label: "Defesas", desc: "defesas médias dos goleiros contra o time" },
];

function Cedencia({ a }: { a: RoundAnalysis }) {
  const [mando, setMando] = useState<"geral" | "casa" | "fora">("geral");
  const [janela, setJanela] = useState<"temporada" | "3" | "5" | "10">("temporada");
  const [metrica, setMetrica] = useState<MetricaCed>("pontos");
  const [sortPos, setSortPos] = useState<CedPos>(5);
  const [aberta, setAberta] = useState<{ clubeId: number; pos: CedPos } | null>(null);
  // laterais por lado: aparecem assim que as escalações (ou o Painel ADM) dizem o lado de algum lateral
  const temLados = a.players.some((p) => p.lado);
  const colunas: CedPos[] = (temLados ? [1, 2, LATERAL_ESQ, LATERAL_DIR, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6]).filter((p) => (metrica === "pontos" ? true : p !== 6 && (metrica !== "DE" || p === 1))) as CedPos[];
  const metricaInfo = METRICAS_CED.find((m) => m.value === metrica)!;
  const oppOf = new Map<number, { opp: number; home: boolean }>();
  for (const f of a.fixtures) {
    oppOf.set(f.casaId, { opp: f.foraId, home: true });
    oppOf.set(f.foraId, { opp: f.casaId, home: false });
  }
  // recorte escolhido: temporada (com peso de recência) ou últimos N jogos, no mando escolhido
  const cellOf = (r: (typeof a.cedencia)[number], p: CedPos): CedenciaCell | undefined =>
    janela === "temporada" ? r[mando][p] : (r.janelas?.[Number(janela) as 3 | 5 | 10]?.[mando][p] ?? r[mando][p]);
  const valorDe = (c: CedenciaCell | undefined) => (!c ? 0 : metrica === "pontos" ? c.pontos : (c.scouts?.[metrica] ?? 0));
  // para scouts, a cor compara com a média da coluna (times com amostra)
  const mediaCol = new Map<CedPos, number>();
  for (const p of colunas) {
    const vs = a.cedencia.map((r) => cellOf(r, p)).filter((c): c is CedenciaCell => Boolean(c && c.jogos > 0)).map(valorDe);
    mediaCol.set(p, vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : 0);
  }
  const fatorDe = (c: CedenciaCell | undefined, p: CedPos) => {
    if (!c) return 1;
    if (metrica === "pontos") return c.fator;
    const m = mediaCol.get(p) ?? 0;
    // encolhe amostras pequenas para a média, como nos pontos
    const k = 10;
    return m > 0 ? (valorDe(c) * c.jogos + m * k) / (c.jogos + k) / m : 1;
  };
  const sortCol = colunas.includes(sortPos) ? sortPos : colunas[0];
  const rows = [...a.cedencia].sort((x, y) => fatorDe(cellOf(y, sortCol), sortCol) - fatorDe(cellOf(x, sortCol), sortCol));
  return (
    <Card className="p-3 sm:p-4">
      <SectionTitle
        title="Matriz de cedência posicional"
        subtitle="Quanto cada time CEDE por atleta de cada posição (pontos ou scouts), comparado à média. Toque num número para ver quem fez."
      />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Seg label="Métrica" value={metrica} onChange={setMetrica} options={METRICAS_CED.map((m) => ({ value: m.value, label: m.label }))} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Seg
          label="Mando de quem cede"
          value={mando}
          onChange={setMando}
          options={[
            { value: "geral", label: "Geral" },
            { value: "casa", label: "Em casa" },
            { value: "fora", label: "Fora" },
          ]}
        />
        <Seg
          label="Período"
          value={janela}
          onChange={setJanela}
          options={[
            { value: "temporada", label: "Temporada" },
            { value: "3", label: "Últ. 3" },
            { value: "5", label: "Últ. 5" },
            { value: "10", label: "Últ. 10" },
          ]}
        />
        <span className="text-xs text-[var(--color-ink-3)]">
          {metricaInfo.desc[0].toUpperCase() + metricaInfo.desc.slice(1)} · {janela === "temporada" ? "temporada inteira, com peso maior para os jogos recentes" : `últimos ${janela} jogos de cada time`}
          {mando === "geral" ? "" : mando === "casa" ? ", só jogando em casa" : ", só jogando fora"}.
          {temLados ? " LE/LD: cada jogo conta o lado em que o lateral jogou (lido nas escalações)." : " LE/LD aparecem assim que as escalações dos jogos forem lidas."}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[2px] text-sm">
          <thead>
            <tr className="text-[11px] text-[var(--color-ink-3)] uppercase">
              <th className="px-2 py-1 text-left font-semibold">Time (cede)</th>
              <th className="px-2 py-1 text-left font-semibold">Quem enfrenta</th>
              {colunas.map((p) => (
                <th key={p} className="px-1 py-1 font-semibold">
                  <button
                    className={`rounded px-1.5 py-0.5 ${sortCol === p ? "bg-[var(--color-surface-4)] text-[var(--color-ink)]" : ""}`}
                    onClick={() => setSortPos(p)}
                    aria-pressed={sortCol === p}
                    title={p === LATERAL_ESQ ? "Laterais esquerdos" : p === LATERAL_DIR ? "Laterais direitos" : undefined}
                  >
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
                  {colunas.map((p) => {
                    const cell = cellOf(r, p);
                    if (!cell || (cell.jogos === 0 && p > 6)) return <td key={p} className="text-center text-xs text-[var(--color-ink-3)]">—</td>;
                    const f = fatorDe(cell, p);
                    const col = divergingColor(f);
                    const v = valorDe(cell);
                    const nome = posName(p).toLowerCase();
                    return (
                      <td key={p} className="rounded-[4px] p-0" style={{ background: col.bg, color: col.fg }}>
                        <button
                          type="button"
                          onClick={() => setAberta({ clubeId: r.clubeId, pos: p })}
                          className="tabular block w-full min-w-[54px] rounded-[4px] px-1 py-1.5 text-center text-xs font-semibold hover:ring-2 hover:ring-white/40 focus-visible:ring-2"
                          title={`${a.clubs[r.clubeId]?.nome} cede ${fmt2(v)} ${metrica === "pontos" ? "pts" : metricaInfo.label.toLowerCase()} por ${nome} (${cell.jogos} atuações) — ${signed((f - 1) * 100, 0)}% vs média. Toque para ver quem fez.`}
                        >
                          {metrica === "pontos" ? fmt1(v) : fmt2(v)}
                          {(janela !== "temporada" || p > 6) && <span className="block text-[9px] font-normal opacity-70">{cell.jogos} at.</span>}
                        </button>
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
        <span>Números = pontos médios cedidos por atleta da posição. Toque na posição para ordenar e no número para ver jogo a jogo quem pontuou.</span>
      </div>
      {aberta && (
        <Sheet
          title={`Adversários que enfrentaram o ${a.clubs[aberta.clubeId]?.nome ?? "time"}`}
          subtitle={`${aberta.pos === LATERAL_ESQ ? "Laterais esquerdos" : aberta.pos === LATERAL_DIR ? "Laterais direitos" : POSITIONS[aberta.pos as PositionId].plural} que jogaram contra o ${a.clubs[aberta.clubeId]?.nome}, jogo a jogo`}
          icon={<ClubBadge club={a.clubs[aberta.clubeId]} size={26} />}
          onClose={() => setAberta(null)}
        >
          <VsAdversario
            a={a}
            adversarioId={aberta.clubeId}
            posicaoId={aberta.pos > 6 ? 2 : (aberta.pos as PositionId)}
            ladoInicial={aberta.pos === LATERAL_ESQ ? "E" : aberta.pos === LATERAL_DIR ? "D" : undefined}
            // quem cede em casa = quem enfrentou estava fora
            mandoInicial={mando === "casa" ? "fora" : mando === "fora" ? "casa" : "todos"}
            periodoInicial={janela === "temporada" ? "todos" : janela}
          />
        </Sheet>
      )}
    </Card>
  );
}

/* ================================ TIMES ================================ */

function Times({ a }: { a: RoundAnalysis }) {
  const [ordem, setOrdem] = useState<"saldo" | "dsConquistados" | "dsCedidos" | "finFeitas" | "finCedidas">("saldo");
  const sc = new Map(a.cedencia.map((r) => [r.clubeId, r.time] as const));
  const v = (t: (typeof a.teams)[number]) => (ordem === "saldo" ? t.xgFor - t.xgAgainst : (sc.get(t.clubeId)?.[ordem] ?? 0));
  const rows = [...a.teams].sort((x, y) => v(y) - v(x));
  const maxG = Math.max(...rows.map((r) => Math.max(r.xgFor, r.xgAgainst)));
  const media = (k: "dsConquistados" | "dsCedidos" | "finFeitas" | "finCedidas") => {
    const vs = a.cedencia.map((r) => r.time?.[k] ?? 0).filter((x) => x > 0);
    return vs.length ? vs.reduce((s, x) => s + x, 0) / vs.length : 1;
  };
  const medias = { dsConquistados: media("dsConquistados"), dsCedidos: media("dsCedidos"), finFeitas: media("finFeitas"), finCedidas: media("finCedidas") };
  const Th = ({ k, children, title }: { k: typeof ordem; children: React.ReactNode; title: string }) => (
    <th className="text-right" title={title}>
      <button type="button" onClick={() => setOrdem(k)} aria-pressed={ordem === k} className={`whitespace-nowrap ${ordem === k ? "text-[var(--color-brand)]" : ""}`}>
        {children}
        {ordem === k ? " ↓" : ""}
      </button>
    </th>
  );
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
              <Th k="saldo" title="xG pró − xG contra">
                Saldo
              </Th>
              <Th k="dsConquistados" title="Desarmes por jogo feitos pelos jogadores do time (conquistados)">
                DS conquist.
              </Th>
              <Th k="dsCedidos" title="Desarmes por jogo que os adversários fizeram contra o time (cedidos)">
                DS cedidos
              </Th>
              <Th k="finFeitas" title="Finalizações por jogo do time (no gol, para fora e na trave)">
                Finaliz.
              </Th>
              <Th k="finCedidas" title="Finalizações por jogo que o time permite aos adversários">
                Finaliz. cedidas
              </Th>
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
                {(["dsConquistados", "dsCedidos", "finFeitas", "finCedidas"] as const).map((k) => {
                  const x = sc.get(t.clubeId)?.[k] ?? 0;
                  const col = divergingColor(x / medias[k], 0.25);
                  return (
                    <td key={k} className="p-0.5 text-right">
                      <span className="inline-block min-w-[3.2rem] rounded-md px-1.5 py-0.5 font-semibold" style={{ background: col.bg, color: col.fg }}>
                        {fmt1(x)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[var(--color-ink-3)]">
        Vantagem de mando estimada: {((a.homeAdvantage - 1) * 100).toFixed(0)}% mais gols para o mandante. DS conquistados = desarmes feitos pelo time por jogo; DS cedidos = desarmes que os adversários fizeram contra ele (bom para escalar defensores contra esse time). Toque no título para ordenar.
      </p>
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
        <h3 className="font-display font-bold">Siglas das colunas do Mercado</h3>
        <div className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {GRUPOS.map((g) => (
            <div key={g}>
              <div className="mb-1 text-[10px] font-bold tracking-wider text-[var(--color-ink-3)] uppercase">{g}</div>
              <dl className="space-y-1 text-sm">
                {COLUNAS.filter((c) => c.grupo === g).map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <dt className="w-24 shrink-0 font-semibold text-[var(--color-ink)]">{c.rotulo}</dt>
                    <dd className="text-[var(--color-ink-2)]">{c.titulo}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </Card>
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
