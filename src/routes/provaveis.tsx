import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, Info } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { OutcomeBar } from "../components/FixtureCard";
import { Card, ClubBadge, ErrorBox, PageSkeleton, PlayerPhoto, Seg } from "../components/ui";
import type { FixtureOdds, PlayerProjection, RoundAnalysis } from "../engine/types";
import type { LiveData, LiveMatch } from "../server/live";
import type { Mudanca } from "../server/watcher";
import { dateTime, fmt1, pct } from "../lib/format";
import { probTag, probableXI, type ProbTag, type ProbableXI } from "../lib/provaveis";
import { analysisQuery, backtestQuery, liveQuery, mudancasQuery } from "../lib/queries";

export const Route = createFileRoute("/provaveis")({
  component: ProvaveisPage,
});

const TAG_RING: Record<ProbTag, string> = {
  provavel: "ring-[#2fd27a]",
  duvida: "ring-[#f5c518]",
  improvavel: "ring-white/30",
};

type Live = LiveData["atletas"][number] | undefined;

function PointsChip({ v }: { v: number }) {
  const cls = v > 0 ? "bg-[#1f9d55] text-white" : v < 0 ? "bg-[#c0392b] text-white" : "bg-white/85 text-[#1b1b1b]";
  return <span className={`tabular rounded-full px-1.5 py-px text-[10px] leading-tight font-bold ${cls}`}>{fmt1(v)}</span>;
}

function PlayerLink({ p, className, label, children }: { p: PlayerProjection; className: string; label?: string; children: ReactNode }) {
  return (
    <Link to="/jogador/$id" params={{ id: String(p.atletaId) }} className={className} aria-label={label}>
      {children}
    </Link>
  );
}

function Token({ p, live, started }: { p: PlayerProjection; live: Live; started: boolean }) {
  const tag = probTag(p);
  const ca = live?.scout?.CA ?? 0;
  const cv = live?.scout?.CV ?? 0;
  const gols = live?.scout?.G ?? 0;
  return (
    <PlayerLink p={p} className="group flex max-w-[84px] min-w-0 flex-1 flex-col items-center" label={`${p.apelido}: ${tag === "provavel" ? "provável" : tag === "duvida" ? "dúvida" : "improvável"}, ${pct(p.pJogar)} de chance de jogar`}>
      <span className="relative">
        <span className={`block rounded-full ring-2 ${TAG_RING[tag]} transition-transform group-hover:-translate-y-0.5`}>
          <PlayerPhoto p={p} size={44} />
        </span>
        {p.override && (
          <span className="absolute -bottom-0.5 -left-1 rounded-full bg-[var(--color-brand)] px-1 text-[8px] font-extrabold text-[#1a0a00]" title="Confirmado pela equipe Tropa">
            ✓
          </span>
        )}
        {(ca > 0 || cv > 0) && <span className={`absolute -top-0.5 -left-1 h-3.5 w-2.5 rounded-[2px] ring-1 ring-black/40 ${cv > 0 ? "bg-[#e23b2e]" : "bg-[#f5c518]"}`} aria-label={cv > 0 ? "cartão vermelho" : "cartão amarelo"} />}
        {gols > 0 && (
          <span className="absolute -top-1 -right-1.5 rounded-full bg-white px-1 text-[9px] font-extrabold text-[#111]" aria-label={`${gols} gol(s)`}>
            ⚽{gols > 1 ? gols : ""}
          </span>
        )}
      </span>
      <span className="mt-1">{started ? live?.entrou ? <PointsChip v={live.pontos} /> : <span className="rounded-full bg-black/55 px-1.5 py-px text-[10px] font-bold text-white/60" title="não entrou em campo">—</span> : <span className="tabular rounded-full bg-black/55 px-1.5 py-px text-[10px] font-bold text-white">{pct(p.pJogar)}</span>}</span>
      <span className="mt-0.5 w-full truncate text-center text-[10px] leading-tight font-semibold text-white drop-shadow sm:text-[11px]">{p.apelido}</span>
      {p.override && <span className="sr-only">ajustado pela equipe</span>}
    </PlayerLink>
  );
}

function PitchLines() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x="0" y={i * 20} width="100" height="10" fill="#ffffff" opacity="0.025" />
      ))}
      <g fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="0.5">
        <rect x="3" y="3" width="94" height="134" rx="1" />
        <line x1="3" y1="70" x2="97" y2="70" />
        <circle cx="50" cy="70" r="11" />
        <rect x="24" y="3" width="52" height="18" />
        <rect x="37" y="3" width="26" height="7" />
        <rect x="24" y="119" width="52" height="18" />
        <rect x="37" y="130" width="26" height="7" />
      </g>
    </svg>
  );
}

function TeamPitch({ a, xi, live, started, total }: { a: RoundAnalysis; xi: ProbableXI; live?: LiveData; started: boolean; total?: number }) {
  const row = (ps: PlayerProjection[]) => (
    <div className="flex items-start justify-around gap-0.5 px-1">
      {ps.map((p) => (
        <Token key={p.atletaId} p={p} live={live?.atletas[p.atletaId]} started={started} />
      ))}
    </div>
  );
  const club = a.clubs[xi.clubeId];
  return (
    <div className="min-w-0">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#1d5a33] to-[#123d22] shadow-inner ring-1 ring-black/30">
        <PitchLines />
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-full bg-black/45 py-0.5 pr-2 pl-0.5 text-[11px] font-bold text-white">
          <ClubBadge club={club} size={20} /> {xi.formation}
        </div>
        {started && total != null && (
          <div className="absolute top-2 right-2 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white">
            <span className="text-white/60">parcial </span>
            <span className="tabular">{fmt1(total)}</span>
          </div>
        )}
        <div className="relative flex min-h-[380px] flex-col justify-around gap-3 pt-11 pb-10">
          {row(xi.lines.ata)}
          {row(xi.lines.mei)}
          {row(xi.lines.def)}
          {row(xi.lines.gol)}
        </div>
        {xi.tecnico && (
          <div className="absolute bottom-1.5 left-1.5 z-10 flex items-center gap-1 rounded-full bg-black/45 py-0.5 pr-2 pl-0.5">
            <PlayerPhoto p={xi.tecnico} size={22} />
            <span className="max-w-[80px] truncate text-[10px] font-semibold text-white">{xi.tecnico.apelido}</span>
          </div>
        )}
      </div>
      {xi.banco.length > 0 && (
        <div className="mt-2 rounded-xl bg-[var(--color-surface-1)] p-2">
          <div className="mb-1.5 text-[10px] font-bold tracking-wider text-[var(--color-ink-3)] uppercase">{started ? "Banco" : "Opções no banco"}</div>
          <div className="flex flex-wrap gap-1.5">
            {xi.banco.map((p) => {
              const l = live?.atletas[p.atletaId];
              return (
                <PlayerLink key={p.atletaId} p={p} className="flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] py-0.5 pr-1 pl-0.5 text-[11px] hover:border-[var(--color-brand)]">
                  <PlayerPhoto p={p} size={20} />
                  <span className="max-w-[90px] truncate font-semibold">{p.apelido}</span>
                  {started && l?.entrou ? <PointsChip v={l.pontos} /> : <span className="tabular text-[10px] text-[var(--color-ink-3)]">{pct(p.pJogar)}</span>}
                </PlayerLink>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function teamTotal(xi: ProbableXI, live?: LiveData) {
  if (!live) return undefined;
  const ids = [...xi.lines.gol, ...xi.lines.def, ...xi.lines.mei, ...xi.lines.ata, ...xi.banco].map((p) => p.atletaId);
  return ids.reduce((s, id) => s + (live.atletas[id]?.entrou ? live.atletas[id].pontos : 0), 0);
}

function MatchBlock({ a, f, live, match }: { a: RoundAnalysis; f: FixtureOdds; live?: LiveData; match?: LiveMatch }) {
  const home = useMemo(() => probableXI(a.players, f.casaId), [a, f.casaId]);
  const away = useMemo(() => probableXI(a.players, f.foraId), [a, f.foraId]);
  const started = match?.status === "andamento" || match?.status === "encerrado";
  const [ch, cf] = [a.clubs[f.casaId], a.clubs[f.foraId]];
  return (
    <Card as="section" className="scroll-mt-28 p-3 sm:p-4">
      <div id={`jogo-${f.matchId}`} className="flex items-center gap-2">
        <ClubBadge club={ch} size={30} />
        <span className="font-display min-w-0 flex-1 truncate text-base font-bold">{ch?.nome}</span>
        <div className="text-center">
          {started ? (
            <div className="font-display tabular text-2xl font-extrabold text-[var(--color-brand)]">
              {match?.placarCasa ?? 0} <span className="text-sm text-[var(--color-ink-3)]">x</span> {match?.placarFora ?? 0}
            </div>
          ) : (
            <div className="font-display text-lg font-bold text-[var(--color-ink-3)]">x</div>
          )}
          {match?.status === "andamento" && <div className="text-[10px] font-bold text-[var(--color-critical-ink)]">● AO VIVO</div>}
          {match?.status === "encerrado" && <div className="text-[10px] font-bold text-[var(--color-ink-3)]">ENCERRADO</div>}
        </div>
        <span className="font-display min-w-0 flex-1 truncate text-right text-base font-bold">{cf?.nome}</span>
        <ClubBadge club={cf} size={30} />
      </div>
      <div className="mt-1 text-center text-[11px] text-[var(--color-ink-3)]">
        {[dateTime(f.data ?? match?.data), f.local].filter(Boolean).join(" · ") || `Rodada ${f.rodada}`}
      </div>
      <div className="mx-auto mt-2 max-w-md">
        <OutcomeBar f={f} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-3">
        <TeamPitch a={a} xi={home} live={live} started={started} total={teamTotal(home, live)} />
        <TeamPitch a={a} xi={away} live={live} started={started} total={teamTotal(away, live)} />
      </div>
    </Card>
  );
}

/** Mudanças detectadas pelo servidor em tempo real: status do Cartola, mercado e notícias de desfalque. */
function Novidades({ items, a }: { items: Mudanca[]; a: RoundAnalysis }) {
  const [open, setOpen] = useState(true);
  if (!items.length)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-ink-3)]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-good)]" aria-hidden /> Acompanhando o Cartola e as notícias ao vivo. Qualquer mudança aparece aqui e nas escalações sozinha.
      </div>
    );
  return (
    <Card className="p-3">
      <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-good)]" aria-hidden />
        <span className="flex-1 text-sm font-bold">Últimas mudanças · ao vivo</span>
        <span className="text-xs text-[var(--color-ink-3)]">{items.length}</span>
      </button>
      {open && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm">
          {items.slice(0, 12).map((m) => {
            const p = m.atletaId != null ? a.players.find((x) => x.atletaId === m.atletaId) : undefined;
            return (
              <li key={m.id} className="flex items-start gap-2">
                <span className="tabular mt-0.5 w-12 shrink-0 text-[11px] text-[var(--color-ink-3)]">{new Date(m.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="chip shrink-0 text-[10px]">{m.tipo === "status" ? "Cartola" : m.tipo === "noticia" ? "Notícia" : "Mercado"}</span>
                <span className="min-w-0 flex-1">
                  {m.link ? (
                    <a href={m.link} target="_blank" rel="noopener noreferrer" className="underline decoration-[var(--color-ink-3)]/50">
                      {m.texto}
                    </a>
                  ) : (
                    m.texto
                  )}
                  {p && <span className="ml-1 text-[11px] text-[var(--color-ink-3)]">(joga {pct(p.pJogar)})</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ProvaveisPage() {
  const an = useQuery(analysisQuery);
  const lv = useQuery(liveQuery);
  const bt = useQuery({ ...backtestQuery, enabled: Boolean(an.data) });
  const [filtro, setFiltro] = useState<"todos" | "aovivo">("todos");
  const mud = useQuery(mudancasQuery);
  if (an.isLoading) return <PageSkeleton />;
  if (an.error || !an.data) return <ErrorBox error={an.error} retry={() => an.refetch()} />;
  const a = an.data.analysis;
  const live = lv.data && lv.data.rodada === a.rodada ? lv.data : undefined;
  const matches = new Map((live?.partidas ?? []).map((m) => [m.matchId, m] as const));
  const fixtures = [...a.fixtures]
    .sort((x, y) => String(x.data ?? "").localeCompare(String(y.data ?? "")))
    .filter((f) => filtro === "todos" || matches.get(f.matchId)?.status === "andamento");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold">
            <ClipboardList size={22} className="text-[var(--color-brand)]" /> Prováveis escalações
          </h1>
          <p className="text-sm text-[var(--color-ink-3)]">Rodada {a.rodada}: os 11 mais prováveis de cada time, com a chance de jogar. Durante os jogos, as parciais aparecem no lugar da porcentagem.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {bt.data?.provaveis && (
            <Link to="/modelo" className="chip border-[var(--color-good)]/40 text-[var(--color-good-ink)]" title="Dos 11 apontados, quantos entraram em campo (teste sem olhar o futuro)">
              <CheckCircle2 size={13} aria-hidden /> {pct(bt.data.provaveis.acerto, 1)} de acerto nas últimas {bt.data.provaveis.rodadas.length} rodadas
            </Link>
          )}
                <Seg label="Filtro" value={filtro} onChange={setFiltro} options={[{ value: "todos", label: "Todos os jogos" }, { value: "aovivo", label: "Ao vivo" }]} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-ink-3)]">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full ring-2 ring-[#2fd27a]" /> Provável</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full ring-2 ring-[#f5c518]" /> Dúvida</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full ring-2 ring-white/30" /> Improvável</span>
        <span className="flex items-center gap-1"><Info size={12} /> Status oficial do Cartola + ajustes da equipe Tropa + minutos recentes</span>
      </div>

      <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none" aria-label="Ir para o jogo">
        {a.fixtures.map((f) => (
          <a key={f.matchId} href={`#jogo-${f.matchId}`} className="chip shrink-0 gap-1">
            <ClubBadge club={a.clubs[f.casaId]} size={14} /> {a.clubs[f.casaId]?.abreviacao} x {a.clubs[f.foraId]?.abreviacao} <ClubBadge club={a.clubs[f.foraId]} size={14} />
          </a>
        ))}
      </nav>

      <Novidades items={mud.data?.mudancas ?? []} a={a} />

      <div className="grid gap-4 xl:grid-cols-2">
        {fixtures.map((f) => (
          <MatchBlock key={f.matchId} a={a} f={f} live={live} match={matches.get(f.matchId)} />
        ))}
      </div>
      {!fixtures.length && <Card className="p-6 text-center text-sm text-[var(--color-ink-3)]">Nenhum jogo em andamento agora.</Card>}
    </div>
  );
}
