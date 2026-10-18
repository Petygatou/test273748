import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, ChevronDown, Crown, Pencil, ShieldCheck, Trophy, Wallet, Zap } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { PlayerProjection, RoundAnalysis } from "../engine/types";
import { cs, fmt1, fmt2, pct, posName, signed } from "../lib/format";
import { Radar, SERIES_A, SERIES_B } from "./charts";
import { PlayerSearch } from "./PlayerSearch";
import { Card, ClubBadge, PlayerPhoto, PosBadge } from "./ui";

function percentile(values: number[], v: number) {
  if (!values.length) return 50;
  let below = 0;
  for (const x of values) if (x < v) below++;
  return Math.round((below / values.length) * 100);
}

const opp = (a: RoundAnalysis, p: PlayerProjection) => (p.adversarioId != null ? `${p.mando === "casa" ? "vs" : "@"} ${a.clubs[p.adversarioId]?.abreviacao ?? "?"}` : "sem jogo");

/** Cartão de um lado do duelo: toque para trocar o atleta. */
function Side({ a, p, color, editing, onEdit }: { a: RoundAnalysis; p: PlayerProjection; color: string; editing: boolean; onEdit: () => void }) {
  return (
    <button
      type="button"
      className={`group min-w-0 flex-1 rounded-2xl border-2 bg-[var(--color-surface-1)] p-3 text-center transition-shadow ${editing ? "shadow-[0_0_0_4px_rgba(255,255,255,0.08)]" : ""}`}
      style={{ borderColor: color }}
      onClick={onEdit}
      aria-label={`Trocar ${p.apelido}`}
      aria-pressed={editing}
    >
      <div className="relative mx-auto w-fit">
        <PlayerPhoto p={p} size={76} />
        <span className="absolute -right-1 -bottom-1">
          <ClubBadge club={a.clubs[p.clubeId]} size={24} />
        </span>
      </div>
      <div className="font-display mt-2 truncate text-base font-bold sm:text-lg">{p.apelido}</div>
      <div className="mt-0.5 flex flex-wrap items-center justify-center gap-x-1.5 text-[11px] text-[var(--color-ink-3)]">
        <PosBadge pos={p.posicaoId} /> <span>{opp(a, p)}</span> <span>{cs(p.preco)}</span>
      </div>
      <div className="font-display tabular mt-2 text-3xl font-extrabold" style={{ color }}>
        {fmt1(p.xP)}
      </div>
      <div className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-3)] uppercase">pontos esperados</div>
      <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-ink-2)] group-hover:border-[var(--color-ink-3)] group-hover:text-[var(--color-ink)]">
        <Pencil size={11} /> trocar
      </span>
    </button>
  );
}

/** Barra "cabo de guerra": quem leva cada quesito. */
function Tug({ label, va, vb, show, lowerBetter }: { label: string; va: number; vb: number; show: (x: number) => string; lowerBetter?: boolean }) {
  // largura proporcional ao valor (preço: inverso), deslocada se houver negativos
  const x = lowerBetter ? 1 / Math.max(va, 0.01) : va;
  const y = lowerBetter ? 1 / Math.max(vb, 0.01) : vb;
  const off = Math.min(x, y, 0);
  const m = Math.max(Math.abs(x), Math.abs(y), 1e-6) * 0.25;
  const share = (x - off + m) / (x - off + m + (y - off + m));
  const sa = x;
  const sb = y;
  const win = Math.abs(sa - sb) < 1e-9 ? 0 : sa > sb ? -1 : 1;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={`tabular ${win === -1 ? "font-bold text-[var(--color-ink)]" : "text-[var(--color-ink-3)]"}`}>{show(va)}</span>
        <span className="font-semibold text-[var(--color-ink-2)]">{label}</span>
        <span className={`tabular ${win === 1 ? "font-bold text-[var(--color-ink)]" : "text-[var(--color-ink-3)]"}`}>{show(vb)}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--color-surface-1)]">
        <div style={{ width: `${share * 100}%`, background: SERIES_A, opacity: win === 1 ? 0.35 : 1 }} />
        <div style={{ width: `${(1 - share) * 100}%`, background: SERIES_B, opacity: win === -1 ? 0.35 : 1 }} />
      </div>
    </div>
  );
}

function Verdict({ icon, label, winner, detail }: { icon: ReactNode; label: string; winner: PlayerProjection | null; detail: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-[var(--color-surface-1)] px-3 py-2.5">
      <span className="mt-0.5 text-[var(--color-gold)]">{icon}</span>
      <div className="min-w-0 text-sm">
        <div className="text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">{label}</div>
        <div className="font-semibold">{winner ? winner.apelido : "Empate técnico"}</div>
        <div className="text-xs text-[var(--color-ink-3)]">{detail}</div>
      </div>
    </div>
  );
}

/** Duelos prontos: os dois melhores de cada posição e os dois melhores capitães. */
function quickDuels(a: RoundAnalysis) {
  const likely = a.players.filter((p) => p.matchId != null && p.pJogar >= 0.5);
  const top = (f: (p: PlayerProjection) => boolean) => likely.filter(f).sort((x, y) => y.xP - x.xP);
  const out: Array<{ label: string; a: PlayerProjection; b: PlayerProjection }> = [];
  const cap = top((p) => p.posicaoId !== 6);
  if (cap.length >= 2) out.push({ label: "Capitão", a: cap[0], b: cap[1] });
  for (const pos of [5, 4, 3, 2, 1] as const) {
    const t = top((p) => p.posicaoId === pos);
    if (t.length >= 2) out.push({ label: posName(pos), a: t[0], b: t[1] });
  }
  const cheap = top((p) => p.posicaoId === 5 && p.preco <= 8);
  if (cheap.length >= 2) out.push({ label: "Atacante barato", a: cheap[0], b: cheap[1] });
  return out;
}

export function X1({ a, ida, idb, onChange }: { a: RoundAnalysis; ida?: number; idb?: number; onChange: (a?: number, b?: number) => void }) {
  const duels = useMemo(() => quickDuels(a), [a]);
  const [details, setDetails] = useState(false);
  const [editing, setEditing] = useState<"a" | "b" | null>(null);
  const pa = a.players.find((p) => p.atletaId === ida) ?? duels[0]?.a;
  const pb = a.players.find((p) => p.atletaId === idb) ?? duels[0]?.b;
  if (!pa || !pb) return null;

  const diff = pa.xP - pb.xP;
  const fav = Math.abs(diff) < 0.3 ? null : diff > 0 ? pa : pb;
  const safer = Math.abs(pa.piso - pb.piso) < 0.3 ? null : pa.piso > pb.piso ? pa : pb;
  const boom = Math.abs(pa.pAcima12 - pb.pAcima12) < 0.02 ? null : pa.pAcima12 > pb.pAcima12 ? pa : pb;
  const cbA = pa.preco > 0 ? pa.xP / pa.preco : 0;
  const cbB = pb.preco > 0 ? pb.xP / pb.preco : 0;
  const value = Math.abs(cbA - cbB) < 0.02 ? null : cbA > cbB ? pa : pb;

  const tec = pa.posicaoId === 6 && pb.posicaoId === 6;
  const pool = a.players.filter((p) => p.matchId != null && p.pJogar >= 0.3 && (tec ? p.posicaoId === 6 : p.posicaoId !== 6));
  const metrics: Array<{ axis: string; get: (p: PlayerProjection) => number; show: (p: PlayerProjection) => string }> = [
    { axis: "xP", get: (p) => p.xP, show: (p) => fmt1(p.xP) },
    { axis: "Teto", get: (p) => p.teto, show: (p) => fmt1(p.teto) },
    { axis: "Piso", get: (p) => p.piso, show: (p) => fmt1(p.piso) },
    { axis: "Regularidade", get: (p) => p.regularidade, show: (p) => `${p.regularidade}%` },
    { axis: "Confronto", get: (p) => p.fatores.ataque * p.fatores.cedencia, show: (p) => `${((p.fatores.ataque * p.fatores.cedencia - 1) * 100).toFixed(0)}%` },
    { axis: "Custo-benefício", get: (p) => (p.preco > 0 ? p.xP / p.preco : 0), show: (p) => fmt2(p.preco > 0 ? (p.xP / p.preco) * 10 : 0) },
  ];
  const series = [pa, pb].map((p, i) => ({
    label: p.apelido,
    color: i === 0 ? SERIES_A : SERIES_B,
    values: metrics.map((m) => percentile(pool.map(m.get), m.get(p))),
    raw: metrics.map((m) => m.show(p)),
  }));
  const isActive = (d: { a: PlayerProjection; b: PlayerProjection }) => (d.a.atletaId === pa.atletaId && d.b.atletaId === pb.atletaId) || (d.a.atletaId === pb.atletaId && d.b.atletaId === pa.atletaId);

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none" aria-label="Duelos prontos">
        <span className="shrink-0 self-center text-xs font-semibold text-[var(--color-ink-3)]">Duelos prontos:</span>
        {duels.map((d) => (
          <button key={d.label} className={`chip shrink-0 ${isActive(d) ? "border-[var(--color-brand)] text-[var(--color-ink)]" : ""}`} onClick={() => onChange(d.a.atletaId, d.b.atletaId)}>
            {d.label}
          </button>
        ))}
      </div>

      <Card className="p-3 sm:p-5">
        {editing && (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[var(--color-ink-3)]">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: editing === "a" ? SERIES_A : SERIES_B }} /> Trocar {(editing === "a" ? pa : pb).apelido} por…
              </span>
              <button className="underline" onClick={() => setEditing(null)}>
                cancelar
              </button>
            </div>
            <PlayerSearch
              players={a.players}
              clubs={a.clubs}
              autoFocus
              inputClassName="h-12 text-base"
              suggestions={a.players
                .filter((x) => x.posicaoId === (editing === "a" ? pb : pa).posicaoId && x.atletaId !== pa.atletaId && x.atletaId !== pb.atletaId && x.matchId != null)
                .sort((x, y) => y.xP - x.xP)
                .slice(0, 6)}
              suggestionsLabel={`Melhores da posição (${posName((editing === "a" ? pb : pa).posicaoId).toLowerCase()})`}
              onSelect={(x) => {
                if (editing === "a") onChange(x.atletaId, pb.atletaId);
                else onChange(pa.atletaId, x.atletaId);
                setEditing(null);
              }}
            />
          </div>
        )}
        <div className="flex items-stretch gap-2 sm:gap-4">
          <Side a={a} p={pa} color={SERIES_A} editing={editing === "a"} onEdit={() => setEditing(editing === "a" ? null : "a")} />
          <div className="flex flex-col items-center justify-center gap-2">
            <span className="font-display text-sm font-extrabold text-[var(--color-ink-3)]">X1</span>
            <button className="btn btn-ghost h-9 w-9 justify-center rounded-full p-0" onClick={() => onChange(pb.atletaId, pa.atletaId)} aria-label="Inverter lados" title="Inverter lados">
              <ArrowLeftRight size={15} />
            </button>
          </div>
          <Side a={a} p={pb} color={SERIES_B} editing={editing === "b"} onEdit={() => setEditing(editing === "b" ? null : "b")} />
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/5 p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-widest text-[var(--color-gold)] uppercase">
            <Trophy size={13} /> Veredito
          </div>
          <div className="font-display mt-1 text-xl font-extrabold sm:text-2xl">{fav ? `Escale ${fav.apelido}` : "Praticamente empatados"}</div>
          <p className="mt-1 text-sm text-[var(--color-ink-2)]">
            {fav
              ? `${signed(Math.abs(diff), 1)} pontos esperados a mais${fav.pJogar < 0.75 ? `, mas atenção: ${pct(fav.pJogar)} de chance de jogar` : ""}.`
              : "Diferença menor que 0,3 ponto: decida pelo perfil abaixo (segurança, explosão ou preço)."}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Verdict icon={<Crown size={16} />} label="Para pontuar" winner={fav} detail={`xP ${fmt1(pa.xP)} x ${fmt1(pb.xP)}`} />
          <Verdict icon={<ShieldCheck size={16} />} label="Mais seguro" winner={safer} detail={`piso ${fmt1(pa.piso)} x ${fmt1(pb.piso)}`} />
          <Verdict icon={<Zap size={16} />} label="Mais explosivo" winner={boom} detail={`chance de 12+ ${pct(pa.pAcima12)} x ${pct(pb.pAcima12)}`} />
          <Verdict icon={<Wallet size={16} />} label="Melhor custo" winner={value} detail={`${fmt2(cbA * 10)} x ${fmt2(cbB * 10)} pts por C$ 10`} />
        </div>

        <div className="mt-5 space-y-3">
          <Tug label="Pontos esperados" va={pa.xP} vb={pb.xP} show={fmt1} />
          <Tug label="Chance de jogar" va={pa.pJogar} vb={pb.pJogar} show={(x) => pct(x)} />
          <Tug label="Piso (pior cenário provável)" va={pa.piso} vb={pb.piso} show={fmt1} />
          <Tug label="Teto (melhor cenário provável)" va={pa.teto} vb={pb.teto} show={fmt1} />
          <Tug label="Preço" va={pa.preco} vb={pb.preco} show={(x) => cs(x)} lowerBetter />
          <Tug label="Valorização esperada" va={pa.valorizacaoEsperada} vb={pb.valorizacaoEsperada} show={(x) => signed(x)} />
        </div>

        <button className="mx-auto mt-5 flex items-center gap-1 text-sm font-semibold text-[var(--color-ink-3)] hover:text-[var(--color-ink)]" onClick={() => setDetails((v) => !v)} aria-expanded={details}>
          {details ? "Esconder" : "Ver"} comparação completa <ChevronDown size={15} className={details ? "rotate-180" : ""} />
        </button>
        {details && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <Radar axes={metrics.map((m) => m.axis)} series={series} />
              <p className="mt-2 text-center text-xs text-[var(--color-ink-3)]">Percentil entre {tec ? "os técnicos" : "os atletas de linha"} que devem jogar (100 = melhor da rodada).</p>
            </div>
            <table className="data w-full text-sm">
              <tbody className="tabular">
                {(
                  [
                    ["Média na temporada", fmt2(pa.media), fmt2(pb.media)],
                    ["Média em casa", fmt2(pa.mediaCasa), fmt2(pb.mediaCasa)],
                    ["Média fora", fmt2(pa.mediaFora), fmt2(pb.mediaFora)],
                    ["Regularidade (3+ pts)", `${pa.regularidade}%`, `${pb.regularidade}%`],
                    ["Chance de negativar", pct(pa.pNegativo), pct(pb.pNegativo)],
                    ["Mínimo p/ valorizar", fmt1(pa.mpv), fmt1(pb.mpv)],
                    ["xP se jogar", fmt1(pa.xPJogando), fmt1(pb.xPJogando)],
                  ] as const
                ).map(([l, x, y]) => (
                  <tr key={l}>
                    <td className="text-[var(--color-ink-3)]">{l}</td>
                    <td className="text-right" style={{ color: SERIES_A }}>
                      {x}
                    </td>
                    <td className="text-right" style={{ color: SERIES_B }}>
                      {y}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-center gap-3 text-xs lg:col-span-2">
              {[pa, pb].map((p) => (
                <Link key={p.atletaId} to="/jogador/$id" params={{ id: String(p.atletaId) }} className="font-semibold text-[var(--color-brand)] underline">
                  Ficha de {p.apelido}
                </Link>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
