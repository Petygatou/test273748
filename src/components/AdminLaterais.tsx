import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { LadoLateral, RoundAnalysis } from "../engine/types";
import { pct } from "../lib/format";
import { analysisQuery } from "../lib/queries";
import { norm } from "../lib/search";
import { saveLadoLateral } from "../server/fns";
import { Alert, Card, ClubBadge, PlayerPhoto, SectionTitle, Seg, StatusPill } from "./ui";

type Filtro = "todos" | "sem" | "E" | "D";

/**
 * Painel ADM → Laterais: o Cartola só diz "lateral". Aqui a equipe marca quem joga pela
 * esquerda e quem joga pela direita; a cedência, o vs Adversário e o Mercado passam a separar.
 */
export function AdminLaterais({ a }: { a: RoundAnalysis }) {
  const qc = useQueryClient();
  // marcações feitas nesta tela (aparecem na hora, antes da análise ser refeita)
  const [local, setLocal] = useState<Record<number, LadoLateral | null>>({});
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const laterais = a.players.filter((p) => p.posicaoId === 2);
  const ladoDe = (id: number, base?: LadoLateral) => (id in local ? (local[id] ?? undefined) : base);
  const marcados = laterais.filter((p) => ladoDe(p.atletaId, p.lado)).length;

  const grupos = useMemo(() => {
    const n = norm(busca);
    const porClube = new Map<number, typeof laterais>();
    for (const p of laterais) {
      const lado = ladoDe(p.atletaId, p.lado);
      if (filtro === "sem" && lado) continue;
      if ((filtro === "E" || filtro === "D") && lado !== filtro) continue;
      if (n && !norm(p.apelido).includes(n) && !norm(a.clubs[p.clubeId]?.nome ?? "").includes(n)) continue;
      porClube.set(p.clubeId, [...(porClube.get(p.clubeId) ?? []), p]);
    }
    return [...porClube.entries()]
      .map(([clubeId, ps]) => ({ clubeId, ps: ps.sort((x, y) => y.pJogar - x.pJogar) }))
      .sort((x, y) => (a.clubs[x.clubeId]?.nome ?? "").localeCompare(a.clubs[y.clubeId]?.nome ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laterais, filtro, busca, local]);

  const marcar = async (atletaId: number, atual: LadoLateral | undefined, lado: LadoLateral) => {
    const novo = atual === lado ? null : lado; // tocar de novo desmarca
    setLocal((l) => ({ ...l, [atletaId]: novo }));
    setErro(null);
    try {
      await saveLadoLateral({ data: { atletaId, lado: novo } });
    } catch (e) {
      setLocal((l) => ({ ...l, [atletaId]: atual ?? null }));
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
      return;
    }
    // a análise é refeita no servidor; busca a nova versão daqui a pouco
    setTimeout(() => void qc.invalidateQueries({ queryKey: analysisQuery.queryKey }), 7000);
  };

  return (
    <Card className="p-3 sm:p-4">
      <SectionTitle
        title="Lado dos laterais"
        subtitle="O Cartola não diz se o lateral é esquerdo ou direito. Marque aqui: a cedência ganha as colunas LE e LD, o vs Adversário filtra pelo lado e o Mercado separa LE/LD."
        icon={<ArrowLeftRight size={18} className="text-[var(--color-brand)]" />}
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-3)]" aria-hidden />
          <input className="input pl-9" placeholder="Buscar lateral ou clube" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar lateral" />
        </div>
        <Seg
          label="Filtro"
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: "todos", label: "Todos" },
            { value: "sem", label: `Sem lado (${laterais.length - marcados})` },
            { value: "E", label: "Esquerdos" },
            { value: "D", label: "Direitos" },
          ]}
        />
      </div>
      <div className="mb-3">
        <div className="flex justify-between text-xs text-[var(--color-ink-3)]">
          <span>
            {marcados} de {laterais.length} laterais marcados
          </span>
          <span className="tabular">{laterais.length ? Math.round((marcados / laterais.length) * 100) : 0}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-1)]">
          <div className="h-full rounded-full bg-[var(--color-brand)] transition-[width]" style={{ width: `${laterais.length ? (marcados / laterais.length) * 100 : 0}%` }} />
        </div>
      </div>
      {erro && (
        <div className="mb-2">
          <Alert tone="critical">{erro}</Alert>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {grupos.map(({ clubeId, ps }) => (
          <div key={clubeId} className="rounded-xl border border-[var(--color-line)]">
            <div className="flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm font-semibold">
              <ClubBadge club={a.clubs[clubeId]} size={18} /> {a.clubs[clubeId]?.nome}
            </div>
            <ul className="divide-y divide-[var(--color-line)]">
              {ps.map((p) => {
                const lado = ladoDe(p.atletaId, p.lado);
                return (
                  <li key={p.atletaId} className="flex items-center gap-2 px-3 py-2">
                    <PlayerPhoto p={p} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{p.apelido}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]">
                        <StatusPill status={p.statusId} compact /> joga {pct(p.pJogar)}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1" role="group" aria-label={`Lado de ${p.apelido}`}>
                      {(["E", "D"] as const).map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => marcar(p.atletaId, lado, l)}
                          aria-pressed={lado === l}
                          title={l === "E" ? "Lateral esquerdo" : "Lateral direito"}
                          className={`h-8 w-11 rounded-lg border text-xs font-bold transition-colors ${lado === l ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[#1a0a00]" : "border-[var(--color-line)] text-[var(--color-ink-3)] hover:border-[var(--color-ink-3)] hover:text-[var(--color-ink)]"}`}
                        >
                          {l === "E" ? "LE" : "LD"}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {!grupos.length && <p className="py-6 text-center text-sm text-[var(--color-ink-3)]">Nenhum lateral nesse filtro.</p>}
      <p className="mt-3 text-xs text-[var(--color-ink-3)]">Toque de novo no lado marcado para desmarcar. A análise do site é refeita alguns segundos depois da última marcação.</p>
    </Card>
  );
}
