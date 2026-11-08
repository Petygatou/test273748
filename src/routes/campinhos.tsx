import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BarChart3, Goal, Swords, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Campinho } from "../components/Campinho";
import { Alert, Card, ClubBadge, ErrorBox, PageSkeleton, SectionTitle, Seg } from "../components/ui";
import { FORMAS_GOL, NOME_FORMA, NOME_POSICAO, montarCampinho, type FiltroCampinho, type FormaGol, type PartidaCampinho, type PosCampinho } from "../engine/campinhos";
import type { Club } from "../engine/types";
import { useAuth } from "../lib/auth";
import { useRealtime } from "../lib/realtime";
import { apagarGolFn, fetchCampinhos, importarGolsFn, lancarGolFn, type CampinhosBase } from "../server/fnsCampinhos";

type Aba = "confrontos" | "times" | "lancar" | "importar";
const ABAS: Aba[] = ["confrontos", "times", "lancar", "importar"];

export const Route = createFileRoute("/campinhos")({
  validateSearch: (s: Record<string, unknown>): { aba?: Aba } => ({ aba: ABAS.includes(s.aba as Aba) ? (s.aba as Aba) : undefined }),
  head: () => ({ meta: [{ title: "Campinhos — Tropa" }] }),
  component: CampinhosPage,
});

const CHAVE = ["campinhos"] as const;

function CampinhosPage() {
  const auth = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { aba: abaUrl } = Route.useSearch();
  const q = useQuery({ queryKey: CHAVE, queryFn: () => fetchCampinhos(), staleTime: 60_000 });
  useRealtime(["campinhos"], () => void qc.invalidateQueries({ queryKey: CHAVE }));
  const aba: Aba = abaUrl && (auth.isAdmin || abaUrl === "confrontos" || abaUrl === "times") ? abaUrl : "confrontos";
  const setAba = (a: Aba) => navigate({ to: "/campinhos", search: { aba: a }, replace: true });
  const d = q.data;
  const clubes = useMemo(() => Object.fromEntries((d?.clubes ?? []).map((c) => [c.id, c as Club])) as Record<number, Club>, [d]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Campinhos</h1>
        <p className="text-sm text-[var(--color-ink-3)]">Gols e assistências por posição: ataque de um time contra a defesa do outro, com todos os gols lançados.</p>
      </div>
      <div className="-mx-1 overflow-x-auto px-1 scrollbar-none">
        <Seg
          label="Seção"
          value={aba}
          onChange={setAba}
          options={[
            { value: "confrontos", label: <Rot icone={<Swords size={14} />} texto="Confrontos" /> },
            { value: "times", label: <Rot icone={<BarChart3 size={14} />} texto="Por time" /> },
            ...(auth.isAdmin
              ? [
                  { value: "lancar" as const, label: <Rot icone={<Goal size={14} />} texto="Lançar gols" /> },
                  { value: "importar" as const, label: <Rot icone={<Upload size={14} />} texto="Importar histórico" /> },
                ]
              : []),
          ]}
        />
      </div>
      {q.isLoading && <PageSkeleton />}
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {d && (
        <>
          {d.demo && <Alert tone="info">Modo demonstração: as partidas são fictícias. Com os dados reais do Cartola, os jogos das 38 rodadas aparecem aqui.</Alert>}
          {aba === "confrontos" && <Confrontos d={d} clubes={clubes} />}
          {aba === "times" && <PorTime d={d} clubes={clubes} />}
          {aba === "lancar" && <Lancar d={d} clubes={clubes} />}
          {aba === "importar" && <Importar />}
        </>
      )}
    </div>
  );
}

function Rot({ icone, texto }: { icone: React.ReactNode; texto: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      {icone}
      {texto}
    </span>
  );
}

/* ------------------------------- filtros ------------------------------- */

type Periodo = "todos" | "5" | "10" | "3";
function Filtros({
  periodo,
  setPeriodo,
  forma,
  setForma,
  extra,
}: {
  periodo: Periodo;
  setPeriodo: (p: Periodo) => void;
  forma: "todas" | FormaGol;
  setForma: (f: "todas" | FormaGol) => void;
  extra?: React.ReactNode;
}) {
  return (
    <>
      <label className="block min-w-0">
        <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-3)]">Período</span>
        <select className="input" value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
          <option value="todos">Todo o campeonato</option>
          <option value="10">Últimos 10 jogos</option>
          <option value="5">Últimos 5 jogos</option>
          <option value="3">Últimos 3 jogos</option>
        </select>
      </label>
      <label className="block min-w-0">
        <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-3)]">Forma do gol</span>
        <select className="input" value={forma} onChange={(e) => setForma(e.target.value as "todas" | FormaGol)}>
          <option value="todas">Todas</option>
          {FORMAS_GOL.map((f) => (
            <option key={f} value={f}>
              {NOME_FORMA[f]}
            </option>
          ))}
        </select>
      </label>
      {extra}
    </>
  );
}

const rotPartida = (p: PartidaCampinho, clubes: Record<number, Club>) =>
  `${clubes[p.casaId]?.nome ?? p.casaId} ${p.golsCasa != null && p.golsFora != null ? `${p.golsCasa}×${p.golsFora}` : "x"} ${clubes[p.foraId]?.nome ?? p.foraId}`;

function Totais({ gols, assist, sofridos }: { gols: number; assist: number; sofridos?: boolean }) {
  return (
    <div className="mt-[-6px] rounded-b-2xl bg-[#0f7f28] px-3 pt-2 pb-3 text-center font-display text-sm font-extrabold text-white uppercase sm:text-base">
      <div>
        Gols {sofridos ? "sofridos" : "feitos"}: {String(gols).padStart(2, "0")}
      </div>
      <div>
        Assistências {sofridos ? "sofridas" : "feitas"}: {String(assist).padStart(2, "0")}
      </div>
    </div>
  );
}

/* ------------------------------ confrontos ------------------------------ */

function Confrontos({ d, clubes }: { d: CampinhosBase; clubes: Record<number, Club> }) {
  const rodadas = [...new Set(d.partidas.map((p) => p.rodada))].sort((a, b) => a - b);
  const [rodada, setRodada] = useState(rodadas.includes(d.rodadaAtual) ? d.rodadaAtual : (rodadas.at(-1) ?? 1));
  const daRodada = d.partidas.filter((p) => p.rodada === rodada);
  const [matchId, setMatchId] = useState<number | null>(null);
  const partida = daRodada.find((p) => p.matchId === matchId) ?? daRodada[0];
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  const [forma, setForma] = useState<"todas" | FormaGol>("todas");
  const [mando, setMando] = useState<"jogo" | "geral">("geral");
  if (!partida) return <Card className="p-4 text-sm text-[var(--color-ink-3)]">Sem partidas cadastradas.</Card>;
  const filtro = (casa: boolean): FiltroCampinho => ({ periodo: periodo === "todos" ? "todos" : Number(periodo), forma, mando: mando === "geral" ? "geral" : casa ? "casa" : "fora", antesDe: rodada });
  const lados = [
    { atq: partida.casaId, def: partida.foraId, atqCasa: true },
    { atq: partida.foraId, def: partida.casaId, atqCasa: false },
  ];
  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-3)]">Rodada</span>
            <select
              className="input"
              value={rodada}
              onChange={(e) => {
                setRodada(Number(e.target.value));
                setMatchId(null);
              }}
            >
              {rodadas.map((r) => (
                <option key={r} value={r}>
                  Rodada {r}
                  {r === d.rodadaAtual ? " · próxima" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 lg:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-3)]">Partida</span>
            <select className="input" value={partida.matchId} onChange={(e) => setMatchId(Number(e.target.value))}>
              {daRodada.map((p) => (
                <option key={p.matchId} value={p.matchId}>
                  {rotPartida(p, clubes)}
                </option>
              ))}
            </select>
          </label>
          <Filtros periodo={periodo} setPeriodo={setPeriodo} forma={forma} setForma={setForma} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Seg
            label="Mando"
            value={mando}
            onChange={setMando}
            options={[
              { value: "geral", label: "Casa e fora" },
              { value: "jogo", label: "Respeitar o mando" },
            ]}
          />
          <span className="text-xs text-[var(--color-ink-3)]">Contam só os jogos antes da rodada {rodada}.</span>
        </div>
      </Card>
      {lados.map(({ atq, def, atqCasa }) => {
        const a = montarCampinho(d.gols, d.partidas, atq, "ataque", filtro(atqCasa));
        const b = montarCampinho(d.gols, d.partidas, def, "defesa", filtro(!atqCasa));
        return (
          <Card key={atq} className="p-3 sm:p-4">
            <SectionTitle
              title={`Ataque do ${clubes[atq]?.nome ?? atq} x defesa do ${clubes[def]?.nome ?? def}`}
              subtitle={`Gols que o ${clubes[atq]?.abreviacao} fez (${a.jogos} jogos) × gols que o ${clubes[def]?.abreviacao} sofreu (${b.jogos} jogos), por posição de quem fez.`}
            />
            <div className="grid gap-6 md:grid-cols-2">
              <Campinho modo="ver" clube={clubes[atq]} titulo={`${clubes[atq]?.nome ?? ""} · ataque`} dados={a} rodape={<Totais gols={a.totalGols} assist={a.totalAssist} />} />
              <Campinho modo="ver" clube={clubes[def]} titulo={`${clubes[def]?.nome ?? ""} · defesa`} dados={b} rodape={<Totais gols={b.totalGols} assist={b.totalAssist} sofridos />} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ------------------------------- por time ------------------------------- */

function PorTime({ d, clubes }: { d: CampinhosBase; clubes: Record<number, Club> }) {
  const lista = [...d.clubes].sort((a, b) => a.nome.localeCompare(b.nome));
  const [clube, setClube] = useState(lista[0]?.id ?? 0);
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  const [forma, setForma] = useState<"todas" | FormaGol>("todas");
  const [mando, setMando] = useState<"geral" | "casa" | "fora">("geral");
  const f: FiltroCampinho = { periodo: periodo === "todos" ? "todos" : Number(periodo), forma, mando };
  const atq = montarCampinho(d.gols, d.partidas, clube, "ataque", f);
  const def = montarCampinho(d.gols, d.partidas, clube, "defesa", f);
  const porForma = (lado: "ataque" | "defesa") => FORMAS_GOL.map((fm) => ({ fm, n: montarCampinho(d.gols, d.partidas, clube, lado, { ...f, forma: fm }).totalGols })).filter((x) => x.n);
  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-3)]">Time</span>
            <select className="input" value={clube} onChange={(e) => setClube(Number(e.target.value))}>
              {lista.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <Filtros periodo={periodo} setPeriodo={setPeriodo} forma={forma} setForma={setForma} />
          <div className="seg-cheio min-w-0">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-3)]">Mando</span>
            <Seg
              label="Mando"
              value={mando}
              onChange={setMando}
              options={[
                { value: "geral", label: "Todos" },
                { value: "casa", label: "Casa" },
                { value: "fora", label: "Fora" },
              ]}
            />
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {(["ataque", "defesa"] as const).map((lado) => {
          const x = lado === "ataque" ? atq : def;
          return (
            <Card key={lado} className="p-3 sm:p-4">
              <SectionTitle title={lado === "ataque" ? "Ataque · gols feitos" : "Defesa · gols sofridos"} subtitle={`${x.jogos} jogos no recorte · por posição de quem fez o gol`} />
              <Campinho modo="ver" clube={clubes[clube]} dados={x} rodape={<Totais gols={x.totalGols} assist={x.totalAssist} sofridos={lado === "defesa"} />} />
              {porForma(lado).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {porForma(lado).map(({ fm, n }) => (
                    <span key={fm} className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-xs">
                      {NOME_FORMA[fm]} <b className="tabular">{n}</b>
                    </span>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------- lançar --------------------------------- */

function Lancar({ d, clubes }: { d: CampinhosBase; clubes: Record<number, Club> }) {
  const qc = useQueryClient();
  const rodadas = [...new Set(d.partidas.map((p) => p.rodada))].sort((a, b) => a - b);
  const jogadas = d.partidas.filter((p) => p.golsCasa != null);
  const [rodada, setRodada] = useState(jogadas.at(-1)?.rodada ?? rodadas[0] ?? 1);
  const [matchId, setMatchId] = useState<number | null>(null);
  const [clubeId, setClubeId] = useState<number | null>(null);
  const [forma, setForma] = useState<FormaGol | "">("");
  const [gol, setGol] = useState<PosCampinho | null>(null);
  const [assist, setAssist] = useState<PosCampinho | null>(null);
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const daRodada = d.partidas.filter((p) => p.rodada === rodada);
  const partida = daRodada.find((p) => p.matchId === matchId) ?? null;
  const lancadosNoJogo = (c: number) => d.gols.filter((g) => g.matchId === partida?.matchId && g.clubeId === c).length;
  const placar = (c: number) => (partida ? (c === partida.casaId ? partida.golsCasa : partida.golsFora) : null);

  const lancar = async () => {
    setMsg(null);
    if (!partida) return setMsg({ tom: "erro", texto: "Selecione a partida." });
    if (!clubeId) return setMsg({ tom: "erro", texto: "Selecione o time que fez o gol." });
    if (!forma) return setMsg({ tom: "erro", texto: "Selecione a forma do gol." });
    if (forma !== "contra" && !gol) return setMsg({ tom: "erro", texto: "Toque no G da posição de quem fez o gol." });
    setSalvando(true);
    try {
      await lancarGolFn({ data: { matchId: partida.matchId, clubeId, forma, gol, assist } });
      setMsg({ tom: "ok", texto: `Gol do ${clubes[clubeId]?.nome} lançado.` });
      setGol(null);
      setAssist(null);
      await qc.invalidateQueries({ queryKey: CHAVE });
    } catch (e) {
      setMsg({ tom: "erro", texto: e instanceof Error ? e.message : "Falha ao lançar" });
    } finally {
      setSalvando(false);
    }
  };
  const apagar = async (id: string) => {
    try {
      await apagarGolFn({ data: { id } });
      await qc.invalidateQueries({ queryKey: CHAVE });
    } catch (e) {
      setMsg({ tom: "erro", texto: e instanceof Error ? e.message : "Falha ao apagar" });
    }
  };
  const ultimos = (partida ? d.gols.filter((g) => g.matchId === partida.matchId) : d.gols).slice(0, 40);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-3 sm:p-4">
          <h2 className="mb-3 font-semibold">1. Partida</h2>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-3)]">Rodada</span>
              <select
                className="input"
                value={rodada}
                onChange={(e) => {
                  setRodada(Number(e.target.value));
                  setMatchId(null);
                  setClubeId(null);
                }}
              >
                {rodadas.map((r) => (
                  <option key={r} value={r}>
                    Rodada {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-3)]">Partida da rodada</span>
              <select
                className="input"
                value={matchId ?? ""}
                onChange={(e) => {
                  setMatchId(e.target.value ? Number(e.target.value) : null);
                  setClubeId(null);
                }}
              >
                <option value="">Selecione a partida</option>
                {daRodada.map((p) => (
                  <option key={p.matchId} value={p.matchId}>
                    {rotPartida(p, clubes)}
                  </option>
                ))}
              </select>
            </label>
            <p className="border-t border-[var(--color-line)] pt-3 text-xs text-[var(--color-ink-3)]">Os jogos das 38 rodadas vêm direto do Cartola. Você só classifica os gols dentro de cada jogo.</p>
            {partida && (
              <div className="grid grid-cols-2 gap-2">
                {[partida.casaId, partida.foraId].map((c) => (
                  <div key={c} className="rounded-xl bg-[var(--color-surface-1)] p-2 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <ClubBadge club={clubes[c]} size={16} /> {clubes[c]?.abreviacao}
                    </div>
                    <div
                      className={`mt-0.5 ${placar(c) != null && lancadosNoJogo(c) > placar(c)! ? "font-semibold text-[var(--color-warning)]" : lancadosNoJogo(c) === placar(c) ? "text-[var(--color-good-ink)]" : "text-[var(--color-ink-3)]"}`}
                    >
                      {lancadosNoJogo(c)} de {placar(c) ?? "?"} gols lançados
                      {placar(c) != null && lancadosNoJogo(c) > placar(c)! ? " · mais que o placar" : lancadosNoJogo(c) === placar(c) ? " ✓" : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
        <Card className="p-3 sm:p-4">
          <h2 className="mb-3 font-semibold">2. Gol</h2>
          <div className="space-y-3">
            <div>
              <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-3)]">Time que fez o gol</span>
              {partida ? (
                <div className="grid grid-cols-2 gap-2">
                  {[partida.casaId, partida.foraId].map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={clubeId === c}
                      onClick={() => setClubeId(c)}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${clubeId === c ? "border-[var(--color-brand)] bg-[var(--color-brand)]/15" : "border-[var(--color-line)]"}`}
                    >
                      <ClubBadge club={clubes[c]} size={18} /> {clubes[c]?.nome}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--color-ink-3)]">Selecione a partida primeiro.</p>
              )}
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-3)]">Forma do gol</span>
              <select className="input" value={forma} onChange={(e) => setForma(e.target.value as FormaGol | "")}>
                <option value="">Selecione a forma</option>
                {FORMAS_GOL.map((f) => (
                  <option key={f} value={f}>
                    {NOME_FORMA[f]}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-[var(--color-ink-3)]">
              {forma === "contra"
                ? "Gol contra: conta no placar do time, sem posição de quem fez nem assistência."
                : "Em cada posição, o G é o gol e o A é a assistência. Toque na assistência de novo para tirar."}
            </p>
            {forma !== "contra" && <Campinho modo="escolher" gol={gol} assist={assist} onGol={setGol} onAssist={setAssist} />}
            <p className="text-sm text-[var(--color-ink-2)]">
              Gol: <b>{forma === "contra" ? "gol contra" : gol ? NOME_POSICAO[gol] : "escolha no campinho"}</b> · Assistência: <b>{assist ? NOME_POSICAO[assist] : "sem assistência"}</b>
            </p>
            {msg && <Alert tone={msg.tom === "ok" ? "info" : "critical"}>{msg.texto}</Alert>}
            <button type="button" className="btn btn-primary w-full justify-center" onClick={lancar} disabled={salvando}>
              {salvando ? "Lançando…" : "Lançar gol"}
            </button>
          </div>
        </Card>
      </div>
      <Card className="p-3 sm:p-4">
        <SectionTitle title={partida ? "Gols lançados nesta partida" : "Últimos gols lançados"} subtitle={`${d.gols.length} gols lançados na temporada ${d.temporada}`} />
        {!ultimos.length ? (
          <p className="text-sm text-[var(--color-ink-3)]">Nenhum gol lançado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Rodada</th>
                  <th className="text-left">Time</th>
                  <th className="text-left">Contra</th>
                  <th className="text-left">Forma</th>
                  <th className="text-left">Gol</th>
                  <th className="text-left">Assist.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ultimos.map((g) => (
                  <tr key={g.id}>
                    <td className="tabular">{g.rodada}</td>
                    <td className="whitespace-nowrap">{clubes[g.clubeId]?.nome}</td>
                    <td className="whitespace-nowrap">{clubes[g.adversarioId]?.nome}</td>
                    <td>
                      <span className="rounded-full border border-[var(--color-good)]/40 px-2 py-0.5 text-xs whitespace-nowrap text-[var(--color-good-ink)]">{NOME_FORMA[g.forma]}</span>
                    </td>
                    <td>{g.gol ?? "—"}</td>
                    <td>{g.assist ?? "—"}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-[var(--color-ink-3)] hover:text-[var(--color-critical-ink)]"
                        onClick={() => apagar(g.id)}
                        aria-label="Apagar gol"
                        title="Apagar gol"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------- importar -------------------------------- */

function Importar() {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [res, setRes] = useState<Awaited<ReturnType<typeof importarGolsFn>> | null>(null);
  const [conferido, setConferido] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const rodar = async (simular: boolean) => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await importarGolsFn({ data: { texto, simular } });
      setRes(r);
      setConferido(simular);
      if (!simular) {
        setTexto("");
        await qc.invalidateQueries({ queryKey: CHAVE });
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao importar");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Card className="p-3 sm:p-4">
      <SectionTitle title="Importar histórico" subtitle="Cole uma planilha (CSV) com um gol por linha, ou escolha o arquivo." />
      <p className="mb-2 text-xs text-[var(--color-ink-3)]">
        Colunas, nesta ordem: <b>rodada, time que fez, adversário, forma, posição do gol, posição da assistência</b>. Times pelo nome ou pela sigla (ex.: BOT). Forma: dentro da área, fora da área,
        pênalti, cabeça, falta ou gol contra. Posições: CENTRO, PONTE, PONTD, MEI, VOL, LATE, LATD, ZAG (assistência vazia = sem assistência).
      </p>
      <pre className="mb-3 overflow-x-auto rounded-lg bg-[var(--color-surface-1)] p-2 text-xs">
        rodada,time,contra,forma,gol,assistencia{"\n"}32,Internacional,Botafogo,Dentro da área,CENTRO,PONTD{"\n"}33,COR,MIR,Fora da área,MEI,
      </pre>
      <input
        type="file"
        accept=".csv,.txt"
        className="mb-2 block text-sm"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            setTexto(await f.text());
            setRes(null);
          }
        }}
      />
      <textarea className="input min-h-40 font-mono text-xs" value={texto} onChange={(e) => (setTexto(e.target.value), setRes(null))} placeholder="Cole aqui as linhas da planilha" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => rodar(true)} disabled={ocupado || !texto.trim()}>
          Conferir
        </button>
        <button type="button" className="btn btn-primary" onClick={() => rodar(false)} disabled={ocupado || !texto.trim() || !conferido || !res?.validos}>
          Importar {conferido && res?.validos ? `${res.validos} gols` : ""}
        </button>
      </div>
      {erro && (
        <div className="mt-3">
          <Alert tone="critical">{erro}</Alert>
        </div>
      )}
      {res && (
        <div className="mt-3 space-y-2 text-sm">
          {conferido ? (
            <p>
              <b>{res.validos}</b> linhas certas{res.erros.length ? ` e ${res.erros.length} com problema` : ""}. Confira e toque em Importar.
            </p>
          ) : (
            <Alert tone="info">{res.importados} gols importados.</Alert>
          )}
          {res.erros.length > 0 && (
            <ul className="max-h-60 space-y-1 overflow-y-auto text-xs text-[var(--color-ink-3)]">
              {res.erros.map((e) => (
                <li key={e.linha}>
                  Linha {e.linha}: <b className="text-[var(--color-critical-ink)]">{e.motivo}</b> — {e.texto}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
