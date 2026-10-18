import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Ban, Crown, Lock, SlidersHorizontal, RefreshCw, Save, Shuffle, Swords, Unlock, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AskButton } from "../components/AskButton";
import { Pitch } from "../components/Pitch";
import { PlayerSearch } from "../components/PlayerSearch";
import { Alert, Card, ClubBadge, ErrorBox, PageSkeleton, PlayerPhoto, ProbBar, SectionTitle, Seg, StatTile } from "../components/ui";
import { lineupFromIds, optimizeLineup, profileValue } from "../engine/optimizer";
import { FORMATION_KEYS, type FormationKey } from "../engine/rules";
import { simulateLineup, type LineupSimResult } from "../engine/simulate";
import type { OptimizedLineup, PlayerProjection, ProfileKey, RoundAnalysis } from "../engine/types";
import { compactPlayer } from "../lib/derive";
import { cs, fmt1, fmt2, pct, signed } from "../lib/format";
import { useAuth } from "../lib/auth";
import { analysisQuery } from "../lib/queries";
import { saveLineupFn } from "../server/fnsConta";
import { saveToCartolaFn } from "../server/fnsCartola";
import { KEYS, readLocal, useLocal, writeLocal, type SavedLineup } from "../lib/storage";

export const Route = createFileRoute("/escalacao")({
  component: EscalacaoPage,
});

interface BuilderSettings {
  profile: ProfileKey;
  budget: number;
  formation: FormationKey | "auto";
  minPJogar: number;
}

const DEFAULT_SETTINGS: BuilderSettings = { profile: "equilibrada", budget: 120, formation: "auto", minPJogar: 0.5 };

const PROFILES: Array<{ value: ProfileKey; label: string; desc: string }> = [
  { value: "mitada", label: "Mitada", desc: "Prioriza teto (P85): atletas explosivos, gasta o orçamento para buscar o melhor time absoluto." },
  { value: "equilibrada", label: "Equilibrada", desc: "Pontos esperados com penalidade de risco: pune piso baixo e dúvida de escalação." },
  { value: "valorizacao", label: "Valorização", desc: "Maximiza a variação esperada de preço (C$) — patrimônio primeiro, pontos como desempate." },
];

function EscalacaoPage() {
  const { data, isLoading, error, refetch } = useQuery(analysisQuery);
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorBox error={error} retry={() => refetch()} />;
  return <Builder analysis={data.analysis} />;
}

function Builder({ analysis }: { analysis: RoundAnalysis }) {
  const [settings, setSettings] = useLocal<BuilderSettings>(KEYS.builder, DEFAULT_SETTINGS);
  const [fixed, setFixed] = useLocal<number[]>(KEYS.fixed, []);
  const [banned, setBanned] = useLocal<number[]>(KEYS.banned, []);
  const [captainLock, setCaptainLock] = useState<number | null>(null);
  const [manual, setManual] = useState<OptimizedLineup | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [sim, setSim] = useState<LineupSimResult | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const auth = useAuth();

  const byId = useMemo(() => new Map(analysis.players.map((p) => [p.atletaId, p] as const)), [analysis]);
  const validIds = (ids: number[]) => ids.filter((id) => byId.has(id));
  const req = useMemo(
    () => ({
      formation: settings.formation,
      budget: settings.budget,
      profile: settings.profile,
      fixed: validIds(fixed),
      banned: validIds(banned),
      minPJogar: settings.minPJogar,
      captainId: captainLock,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, fixed, banned, captainLock, byId],
  );

  const result = useMemo(() => {
    const t = performance.now();
    const r = optimizeLineup(analysis, req);
    return { ...r, ms: performance.now() - t };
  }, [analysis, req]);

  // qualquer mudança de parâmetro descarta edições manuais
  useEffect(() => setManual(null), [req]);

  const lineup = manual ?? result.lineup;

  useEffect(() => {
    if (!lineup) return;
    setSim(null);
    const id = setTimeout(() => {
      const r = simulateLineup(analysis.sim, {
        titulares: lineup.slots.map((s) => s.atletaId),
        captainId: lineup.captainId,
        reservas: lineup.banco.map((b) => ({ atletaId: b.atletaId, posicaoId: b.posicaoId })),
        luxoId: lineup.banco.find((b) => b.luxo)?.atletaId ?? null,
      });
      setSim(r);
    }, 30);
    writeLocal(KEYS.lastLineup, {
      rodada: analysis.rodada,
      titulares: lineup.slots.map((s) => s.atletaId),
      captainId: lineup.captainId,
      reservas: lineup.banco.map((b) => ({ atletaId: b.atletaId, posicaoId: b.posicaoId, luxo: b.luxo })),
    });
    return () => clearTimeout(id);
  }, [lineup, analysis]);

  const update = (patch: Partial<BuilderSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const toggle = (list: number[], set: (v: number[]) => void, id: number) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const fixedSet = new Set(fixed);
  const clubs = analysis.clubs;

  const swapIn = (outId: number, inId: number) => {
    if (!lineup) return;
    const ids = lineup.slots.map((s) => (s.atletaId === outId ? inId : s.atletaId));
    const cap = lineup.captainId === outId ? null : lineup.captainId;
    setManual(lineupFromIds(analysis, ids, lineup.formation, req, cap));
    setSelected(null);
  };
  const makeCaptain = (id: number) => {
    if (!lineup) return;
    setManual(lineupFromIds(analysis, lineup.slots.map((s) => s.atletaId), lineup.formation, req, id));
    setSelected(null);
  };

  const save = () => {
    if (!lineup) return;
    const list = readLocal<SavedLineup[]>(KEYS.lineups, []);
    const item: SavedLineup = {
      id: `${Date.now()}`,
      nome: `${PROFILES.find((p) => p.value === lineup.profile)?.label} · ${lineup.formation} · R${analysis.rodada}`,
      rodada: analysis.rodada,
      temporada: analysis.temporada,
      formation: lineup.formation,
      profile: lineup.profile,
      titulares: lineup.slots.map((s) => s.atletaId),
      captainId: lineup.captainId,
      reservas: lineup.banco.map((b) => ({ atletaId: b.atletaId, posicaoId: b.posicaoId, luxo: b.luxo })),
      custo: lineup.custo,
      xP: lineup.xPComCapitao,
      criadoEm: new Date().toISOString(),
    };
    const done = (m: string) => {
      setSavedMsg(m);
      setTimeout(() => setSavedMsg(null), 4000);
    };
    if (auth.user) {
      saveLineupFn({ data: item })
        .then(() => done("Tropa salva na sua conta (Minha conta → Tropas salvas)."))
        .catch((e) => done(e instanceof Error ? e.message : "Falha ao salvar"));
    } else {
      writeLocal(KEYS.lineups, [item, ...list].slice(0, 50));
      done("Tropa salva neste navegador. Entre na sua conta para guardar em qualquer aparelho.");
    }
  };

  const sendToCartola = async () => {
    if (!lineup) return;
    const token = readLocal<string>(KEYS.cartolaToken, "");
    if (!token) {
      setSavedMsg("Conecte sua conta do Cartola em Meu Time para enviar a tropa.");
      return;
    }
    setSending(true);
    try {
      const r = await saveToCartolaFn({
        data: {
          token,
          formation: lineup.formation,
          titulares: lineup.slots.map((s) => s.atletaId),
          captainId: lineup.captainId,
          reservas: lineup.banco.map((b) => ({ atletaId: b.atletaId, posicaoId: b.posicaoId, luxo: b.luxo })),
        },
      });
      setSavedMsg(`Cartola: ${r.mensagem}`);
    } catch (e) {
      setSavedMsg(e instanceof Error ? e.message : "Falha ao enviar ao Cartola");
    } finally {
      setSending(false);
    }
  };

  const auditPayload = () => ({
    titulo: "Auditoria da tropa",
    pergunta:
      "Audite esta tropa: pontos fortes, riscos (escalação, confrontos, correlação entre atletas do mesmo time), se o capitão faz sentido e se o orçamento foi bem usado. Sugira no máximo 2 trocas, justificando com os números.",
    contexto: lineupContext(analysis, lineup!, sim),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold">Montar tropa</h1>
          <p className="text-sm text-[var(--color-ink-3)]">
            Escolha o perfil e quanto você tem de cartoletas: o Tropa calcula a melhor escalação possível, já com o capitão. Toque em um atleta para trocar.
          </p>
        </div>
        {lineup && (
          <div className="flex flex-wrap gap-2">
            <AskButton label="Auditar esta tropa" payload={auditPayload} />
            <AskButton
              label="Entender capitão e orçamento"
              payload={() => ({
                titulo: "Capitão e orçamento",
                pergunta: "Explique a escolha do capitão comparando com as alternativas e diga se vale a pena usar a sobra de cartoletas de outra forma.",
                contexto: lineupContext(analysis, lineup, sim),
              })}
            />
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* ----------------------------- controles ----------------------------- */}
        <div id="ajustes" className="order-2 min-w-0 scroll-mt-32 space-y-4 lg:order-1">
          <Card className="space-y-4 p-4">
            <div>
              <div className="mb-1.5 text-xs font-semibold text-[var(--color-ink-3)] uppercase">Perfil estratégico</div>
              <Seg label="Perfil" value={settings.profile} onChange={(v) => update({ profile: v })} options={PROFILES.map((p) => ({ value: p.value, label: p.label }))} />
              <p className="mt-2 text-xs text-[var(--color-ink-3)]">{PROFILES.find((p) => p.value === settings.profile)?.desc}</p>
            </div>
            <div>
              <label htmlFor="budget" className="mb-1.5 block text-xs font-semibold text-[var(--color-ink-3)] uppercase">
                Cartoletas disponíveis
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="budget"
                  className="input tabular"
                  type="number"
                  min={60}
                  max={400}
                  step={0.01}
                  value={settings.budget}
                  onChange={(e) => update({ budget: Math.max(0, Number(e.target.value) || 0) })}
                />
                {[100, 120, 140].map((b) => (
                  <button key={b} className="btn btn-ghost px-2.5 py-2 text-xs" onClick={() => update({ budget: b })}>
                    {b}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="formation" className="mb-1.5 block text-xs font-semibold text-[var(--color-ink-3)] uppercase">
                Esquema tático
              </label>
              <select id="formation" className="input" value={settings.formation} onChange={(e) => update({ formation: e.target.value as BuilderSettings["formation"] })}>
                <option value="auto">Automático (testa os 7 e escolhe o melhor)</option>
                {FORMATION_KEYS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="minp" className="mb-1.5 flex justify-between text-xs font-semibold text-[var(--color-ink-3)] uppercase">
                <span>Chance mínima de jogar</span>
                <span className="tabular text-[var(--color-ink)]">{pct(settings.minPJogar)}</span>
              </label>
              <input id="minp" type="range" min={0.3} max={0.9} step={0.05} value={settings.minPJogar} onChange={(e) => update({ minPJogar: Number(e.target.value) })} className="w-full accent-[var(--color-brand)]" />
            </div>
          </Card>

          <Locks analysis={analysis} fixed={fixed} banned={banned} setFixed={setFixed} setBanned={setBanned} captainLock={captainLock} setCaptainLock={setCaptainLock} />
        </div>

        {/* ----------------------------- resultado ----------------------------- */}
        <div className="order-1 min-w-0 space-y-4 lg:order-2">
          {/* atalhos no celular: perfil e orçamento sem rolar até os ajustes */}
          <div className="flex flex-wrap items-center gap-2 lg:hidden">
            <Seg label="Perfil" value={settings.profile} onChange={(v) => update({ profile: v })} options={PROFILES.map((p) => ({ value: p.value, label: p.label }))} />
            <div className="seg" role="group" aria-label="Orçamento">
              {[100, 120, 140].map((b) => (
                <button key={b} aria-pressed={settings.budget === b} onClick={() => update({ budget: b })}>
                  C$ {b}
                </button>
              ))}
            </div>
            <a href="#ajustes" className="chip">
              <SlidersHorizontal size={12} aria-hidden /> Esquema e travas{fixed.length + banned.length > 0 ? ` (${fixed.length + banned.length})` : ""}
            </a>
          </div>
          {!lineup ? (
            <Alert tone="critical">{result.erro ?? "Não foi possível montar a tropa com essas condições."}</Alert>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatTile label="Pontos esperados" value={fmt1(lineup.xPComCapitao)} hint={`${fmt1(lineup.xP)} + capitão`} accent="gold" />
                <StatTile label="Custo" value={cs(lineup.custo)} hint={`sobra ${cs(lineup.sobra)}`} />
                <StatTile label="Valorização esperada" value={`${signed(lineup.valorizacaoEsperada)}`} hint="C$ na próxima rodada" accent={lineup.valorizacaoEsperada >= 0 ? "good" : undefined} />
                <StatTile
                  label="Faixa realista (P10–P90)"
                  value={sim ? `${fmt0Safe(sim.p10)}–${fmt0Safe(sim.p90)}` : "…"}
                  hint={sim ? `com banco: média ${fmt1(sim.mean)}` : "simulando 3.000 rodadas"}
                  accent="brand"
                />
              </div>

              <Card className="p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg font-bold">{lineup.formation}</span>
                    {manual && <span className="chip border-[var(--color-gold)]/40 text-[var(--color-gold)]">editada à mão</span>}
                    <span className="text-xs text-[var(--color-ink-3)]">otimizado em {result.ms.toFixed(0)} ms</span>
                  </div>
                  <div className="flex gap-2">
                    {manual && (
                      <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => setManual(null)}>
                        <RefreshCw size={14} /> Voltar ao ótimo
                      </button>
                    )}
                    <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={save}>
                      <Save size={14} /> Salvar
                    </button>
                    {analysis.source === "cartola" && (
                      <button className="btn btn-primary px-3 py-1.5 text-xs" onClick={sendToCartola} disabled={sending}>
                        <Upload size={14} /> {sending ? "Enviando…" : "Escalar no Cartola"}
                      </button>
                    )}
                  </div>
                </div>
                <Pitch slots={lineup.slots} byId={byId} clubs={clubs} captainId={lineup.captainId} fixed={fixedSet} bench={lineup.banco} onSelect={setSelected} />
                <p className="mt-2 text-xs text-[var(--color-ink-3)]">Toque em um atleta para trocar, fixar, banir ou torná-lo capitão.</p>
                {savedMsg && (
                  <div className="mt-2">
                    <Alert tone="info">{savedMsg}</Alert>
                  </div>
                )}
              </Card>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card className="p-4">
                  <SectionTitle title="Capitão justificado" subtitle="Bônus de 1,5× — a escolha muda o objetivo" icon={<Crown size={18} className="text-[var(--color-gold)]" />} />
                  <ol className="space-y-2">
                    {lineup.capitaes.map((c, i) => {
                      const p = byId.get(c.atletaId)!;
                      return (
                        <li key={c.atletaId} className={`rounded-xl border p-2.5 ${c.atletaId === lineup.captainId ? "border-[var(--color-gold)]/50 bg-[var(--color-gold)]/5" : "border-[var(--color-line)]"}`}>
                          <div className="flex items-center gap-2">
                            <span className="font-display w-5 text-center text-sm font-bold text-[var(--color-ink-3)]">{i + 1}</span>
                            <PlayerPhoto p={p} size={30} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold">{p.apelido}</div>
                              <div className="tabular text-[11px] text-[var(--color-ink-3)]">
                                xP {fmt1(c.xP)} · teto {fmt1(c.teto)} · ganho {signed(c.ganhoEsperado, 1)}
                              </div>
                            </div>
                            {c.atletaId !== lineup.captainId && (
                              <button className="btn btn-ghost px-2 py-1 text-[11px]" onClick={() => makeCaptain(c.atletaId)}>
                                Usar
                              </button>
                            )}
                          </div>
                          <p className="mt-1.5 pl-7 text-xs text-[var(--color-ink-2)]">{c.justificativa}</p>
                        </li>
                      );
                    })}
                  </ol>
                </Card>

                <Card className="p-4">
                  <SectionTitle title="Por que esta tropa" subtitle="Leitura determinística do otimizador" icon={<Swords size={18} className="text-[var(--color-brand)]" />} />
                  <ul className="space-y-2 text-sm text-[var(--color-ink-2)]">
                    {lineup.explicacao.map((e, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" aria-hidden />
                        {e}
                      </li>
                    ))}
                  </ul>
                  {sim && (
                    <div className="mt-4 space-y-1.5">
                      <div className="text-xs font-semibold text-[var(--color-ink-3)] uppercase">Chance de passar de…</div>
                      {["60", "70", "80", "90"].map((t) => (
                        <ProbBar key={t} label={`${t} pontos`} value={sim.pAcima[t] ?? 0} tone="gold" />
                      ))}
                      <p className="pt-1 text-xs text-[var(--color-ink-3)]">
                        Banco adiciona {fmt2(sim.ganhoBanco)} pts esperados cobrindo ausências; reserva de luxo +{fmt2(sim.ganhoLuxo)}.
                      </p>
                    </div>
                  )}
                </Card>
              </div>

              {!manual && result.porEsquema.length > 1 && (
                <Card className="p-4">
                  <SectionTitle title="Comparativo de esquemas" subtitle="Melhor tropa possível em cada formação, mesmo orçamento" />
                  <div className="overflow-x-auto">
                    <table className="data w-full text-sm">
                      <thead>
                        <tr>
                          <th className="text-left">Esquema</th>
                          <th className="text-right">Objetivo</th>
                          <th className="text-right">xP (sem capitão)</th>
                          <th className="text-right">Diferença</th>
                        </tr>
                      </thead>
                      <tbody className="tabular">
                        {result.porEsquema.map((e, i) => (
                          <tr key={e.formation}>
                            <td className="font-semibold">
                              {e.formation} {i === 0 && <span className="chip ml-1 text-[var(--color-gold)]">melhor</span>}
                            </td>
                            <td className="text-right">{fmt2(e.objetivo)}</td>
                            <td className="text-right">{fmt1(e.xP)}</td>
                            <td className="text-right text-[var(--color-ink-3)]">{i === 0 ? "—" : signed(e.objetivo - result.porEsquema[0].objetivo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {selected != null && lineup && (
        <SwapSheet
          analysis={analysis}
          lineup={lineup}
          selectedId={selected}
          profile={settings.profile}
          budget={settings.budget}
          onClose={() => setSelected(null)}
          onSwap={swapIn}
          onCaptain={makeCaptain}
          fixed={fixed}
          onFix={(id) => toggle(fixed, setFixed, id)}
          onBan={(id) => {
            setBanned([...new Set([...banned, id])]);
            setFixed(fixed.filter((x) => x !== id));
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function fmt0Safe(x: number) {
  return Math.round(x).toString();
}

function lineupContext(analysis: RoundAnalysis, lineup: OptimizedLineup, sim: LineupSimResult | null) {
  const byId = new Map(analysis.players.map((p) => [p.atletaId, p] as const));
  const cp = compactPlayer(analysis);
  return {
    rodada: analysis.rodada,
    perfil: lineup.profile,
    esquema: lineup.formation,
    custo: lineup.custo,
    sobra: lineup.sobra,
    xP: lineup.xP,
    xPComCapitao: lineup.xPComCapitao,
    valorizacaoEsperada: lineup.valorizacaoEsperada,
    capitao: byId.get(lineup.captainId)?.apelido,
    alternativasCapitao: lineup.capitaes.map((c) => ({ atleta: byId.get(c.atletaId)?.apelido, xP: c.xP, teto: c.teto, pAcima12: c.pAcima12, justificativa: c.justificativa })),
    titulares: lineup.slots.map((s) => cp(byId.get(s.atletaId)!)),
    banco: lineup.banco.map((b) => ({ atleta: byId.get(b.atletaId)?.apelido, posicao: b.posicaoId, luxo: Boolean(b.luxo), ganhoCobertura: b.ganhoCobertura })),
    simulacao: sim ? { p10: sim.p10, p50: sim.p50, p90: sim.p90, pAcima: sim.pAcima, ganhoBanco: sim.ganhoBanco, ganhoLuxo: sim.ganhoLuxo } : null,
    explicacaoDoOtimizador: lineup.explicacao,
  };
}

/* ------------------------------ travas ------------------------------ */

function Locks({
  analysis,
  fixed,
  banned,
  setFixed,
  setBanned,
  captainLock,
  setCaptainLock,
}: {
  analysis: RoundAnalysis;
  fixed: number[];
  banned: number[];
  setFixed: (v: number[]) => void;
  setBanned: (v: number[]) => void;
  captainLock: number | null;
  setCaptainLock: (v: number | null) => void;
}) {
  const byId = new Map(analysis.players.map((p) => [p.atletaId, p] as const));
  const chip = (id: number, kind: "fixed" | "banned") => {
    const p = byId.get(id);
    if (!p) return null;
    return (
      <span key={id} className={`chip ${kind === "fixed" ? "border-[var(--color-brand)]/40" : "border-[var(--color-critical)]/40"}`}>
        {kind === "fixed" ? <Lock size={11} aria-hidden /> : <Ban size={11} aria-hidden />}
        {p.apelido}
        <button aria-label={`Remover ${p.apelido}`} onClick={() => (kind === "fixed" ? setFixed(fixed.filter((x) => x !== id)) : setBanned(banned.filter((x) => x !== id)))}>
          <X size={12} />
        </button>
      </span>
    );
  };
  return (
    <Card className="space-y-3 p-4">
      <div className="text-xs font-semibold text-[var(--color-ink-3)] uppercase">Travas do cartoleiro</div>
      <PlayerSearch
        players={analysis.players}
        clubs={analysis.clubs}
        placeholder="Digite um atleta, clube ou posição"
        label="Buscar atleta para fixar ou banir"
        keepOpen
        onSelect={(p) => setFixed([...new Set([...fixed, p.atletaId])])}
        actions={(p) => (
          <>
            <button className={`btn px-2 py-1 text-[11px] ${fixed.includes(p.atletaId) ? "btn-primary" : "btn-ghost"}`} onClick={() => setFixed(fixed.includes(p.atletaId) ? fixed.filter((x) => x !== p.atletaId) : [...fixed, p.atletaId])} title="Fixar na tropa" aria-label={`Fixar ${p.apelido}`}>
              <Lock size={12} />
            </button>
            <button className={`btn px-2 py-1 text-[11px] ${banned.includes(p.atletaId) ? "btn-primary" : "btn-ghost"}`} onClick={() => setBanned(banned.includes(p.atletaId) ? banned.filter((x) => x !== p.atletaId) : [...banned, p.atletaId])} title="Banir da tropa" aria-label={`Banir ${p.apelido}`}>
              <Ban size={12} />
            </button>
            {p.posicaoId !== 6 && (
              <button className={`btn px-2 py-1 text-[11px] ${captainLock === p.atletaId ? "btn-primary" : "btn-ghost"}`} onClick={() => setCaptainLock(captainLock === p.atletaId ? null : p.atletaId)} title="Forçar capitão" aria-label={`Capitão: ${p.apelido}`}>
                <Crown size={12} />
              </button>
            )}
          </>
        )}
      />
      <p className="text-[11px] text-[var(--color-ink-3)]">
        <Lock size={10} className="inline" /> fixar · <Ban size={10} className="inline" /> banir · <Crown size={10} className="inline" /> capitão. Enter fixa o atleta destacado.
      </p>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {fixed.length ? fixed.map((id) => chip(id, "fixed")) : <span className="text-xs text-[var(--color-ink-3)]">Nenhum atleta fixado.</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {banned.length ? banned.map((id) => chip(id, "banned")) : <span className="text-xs text-[var(--color-ink-3)]">Nenhum atleta banido.</span>}
        </div>
        {captainLock != null && byId.get(captainLock) && (
          <span className="chip border-[var(--color-gold)]/40 text-[var(--color-gold)]">
            <Crown size={11} /> Capitão forçado: {byId.get(captainLock)!.apelido}
            <button aria-label="Liberar capitão" onClick={() => setCaptainLock(null)}>
              <X size={12} />
            </button>
          </span>
        )}
        {(fixed.length > 0 || banned.length > 0) && (
          <button
            className="text-xs font-semibold text-[var(--color-ink-3)] underline"
            onClick={() => {
              setFixed([]);
              setBanned([]);
              setCaptainLock(null);
            }}
          >
            Limpar travas
          </button>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------ troca manual ------------------------------ */

function SwapSheet({
  analysis,
  lineup,
  selectedId,
  profile,
  budget,
  onClose,
  onSwap,
  onCaptain,
  fixed,
  onFix,
  onBan,
}: {
  analysis: RoundAnalysis;
  lineup: OptimizedLineup;
  selectedId: number;
  profile: ProfileKey;
  budget: number;
  onClose: () => void;
  onSwap: (outId: number, inId: number) => void;
  onCaptain: (id: number) => void;
  fixed: number[];
  onFix: (id: number) => void;
  onBan: (id: number) => void;
}) {
  const byId = new Map(analysis.players.map((p) => [p.atletaId, p] as const));
  const cur = byId.get(selectedId)!;
  const isTitular = lineup.slots.some((s) => s.atletaId === selectedId);
  const inLineup = new Set(lineup.slots.map((s) => s.atletaId));
  const room = budget - lineup.custo + cur.preco;
  const alternatives: PlayerProjection[] = analysis.players
    .filter((p) => p.posicaoId === cur.posicaoId && !inLineup.has(p.atletaId) && p.matchId != null && p.pJogar >= 0.3)
    .sort((a, b) => profileValue(b, profile).value - profileValue(a, profile).value)
    .slice(0, 14);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Opções para ${cur.apelido}`}>
      <button className="absolute inset-0 bg-black/60" aria-label="Fechar" onClick={onClose} />
      <div className="card absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-b-none p-4 md:inset-x-auto md:top-1/2 md:left-1/2 md:bottom-auto md:w-[560px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-b-[14px]">
        <div className="flex items-center gap-3">
          <PlayerPhoto p={cur} size={48} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{cur.apelido}</div>
            <div className="tabular text-xs text-[var(--color-ink-3)]">
              xP {fmt1(cur.xP)} · piso {fmt1(cur.piso)} · teto {fmt1(cur.teto)} · {cs(cur.preco)}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-[var(--color-ink-3)]">
            <X size={20} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {isTitular && cur.posicaoId !== 6 && lineup.captainId !== cur.atletaId && (
            <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => onCaptain(cur.atletaId)}>
              <Crown size={14} /> Tornar capitão
            </button>
          )}
          <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => onFix(cur.atletaId)}>
            {fixed.includes(cur.atletaId) ? <Unlock size={14} /> : <Lock size={14} />} {fixed.includes(cur.atletaId) ? "Desafixar" : "Fixar"}
          </button>
          <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => onBan(cur.atletaId)}>
            <Ban size={14} /> Banir e re-otimizar
          </button>
          <Link to="/jogador/$id" params={{ id: String(cur.atletaId) }} className="btn btn-ghost px-3 py-1.5 text-xs">
            Ver análise completa
          </Link>
        </div>
        {isTitular && (
          <>
            <div className="mt-4 mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--color-ink-3)] uppercase">
              <Shuffle size={13} /> Trocar por (cabe até {cs(room)})
            </div>
            <ul className="divide-y divide-[var(--color-line)]">
              {alternatives.map((p) => {
                const fits = p.preco <= room + 1e-9;
                const dx = p.xP - cur.xP;
                return (
                  <li key={p.atletaId} className="flex items-center gap-2 py-2">
                    <PlayerPhoto p={p} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
                        {p.apelido} <ClubBadge club={analysis.clubs[p.clubeId]} size={14} />
                      </div>
                      <div className="tabular text-[11px] text-[var(--color-ink-3)]">
                        {cs(p.preco)} · xP {fmt1(p.xP)} ({signed(dx, 1)}) · joga {pct(p.pJogar)}
                      </div>
                    </div>
                    <button className="btn btn-primary px-3 py-1.5 text-xs" disabled={!fits} onClick={() => onSwap(cur.atletaId, p.atletaId)}>
                      {fits ? "Trocar" : "Sem C$"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
