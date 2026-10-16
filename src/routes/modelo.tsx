import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FlaskConical, Microscope, TriangleAlert } from "lucide-react";
import { LineChart, SERIES_A, SERIES_B } from "../components/charts";
import { Alert, Card, ErrorBox, PageSkeleton, ProbBar, SectionTitle, StatTile } from "../components/ui";
import { SCOUT_LABELS } from "../engine/rules";
import { fmt1, fmt2, pct, signed } from "../lib/format";
import { analysisQuery, backtestQuery } from "../lib/queries";

export const Route = createFileRoute("/modelo")({
  component: ModelPage,
});

const METHOD = [
  ["Modelo de times", "Regressão de Poisson bidirecional (ataque × defesa + mando) com decaimento temporal e prior ridge, à la Dixon & Coles. O alvo mistura gols reais com um xG por finalizações (FD, G, FT, FF), que é bem menos ruidoso que o placar. A correção de Dixon-Coles (ρ) ajusta placares baixos."],
  ["Odds e SG", "Cada jogo vira uma matriz de placares; dela saem vitória/empate/derrota, chance de não sofrer gol e o bônus de vitória do técnico."],
  ["Projeção scout a scout", "Cada scout tem sua taxa por jogo com peso de recência, ajuste pela força dos adversários já enfrentados e shrinkage bayesiano empírico (Gamma-Poisson): scouts raros são mais encolhidos que os frequentes."],
  ["Gols e assistências", "Participação do atleta nos gols do time × gols esperados do time no confronto. Assim G, A, SG e GS ficam coerentes com o placar."],
  ["Prior inteligente", "No começo da temporada, o preço carrega informação de qualidade; e o volume de scouts por jogo serve de proxy de minutos — reserva que sai do banco não herda o prior de titular."],
  ["Cedência posicional", "Para cada adversário e posição, quanto ele cede de cada scout (participação relativa), encolhido para a média da liga."],
  ["Chance de jogar", "Status oficial + participação recente com decaimento + prováveis escalações do Painel ADM."],
  ["Monte Carlo", "Milhares de rodadas simuladas: placar sorteado, gols distribuídos entre os atletas, demais scouts por binomial negativa. Daí saem piso, teto e probabilidades — e a distribuição da tropa inteira, com banco e reserva de luxo."],
  ["MPV e valorização", "V = CPP × (pontos − MPV), recalibrado toda rodada por regressão sobre o mercado inteiro (ou o valor oficial, quando a API fornece)."],
  ["Otimizador exato", "Programação dinâmica sobre fronteiras de Pareto por posição, com o capitão dentro da otimização. Garante o ótimo global — não é heurística."],
];

function ModelPage() {
  const an = useQuery(analysisQuery);
  const bt = useQuery(backtestQuery);
  if (an.isLoading) return <PageSkeleton />;
  if (an.error || !an.data) return <ErrorBox error={an.error} retry={() => an.refetch()} />;
  const a = an.data.analysis;
  const r = bt.data?.resumo;
  const rounds = bt.data?.rounds ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold">
          <FlaskConical size={22} className="text-[var(--color-brand)]" /> Precisão do modelo
        </h1>
        <p className="max-w-3xl text-sm text-[var(--color-ink-3)]">
          Transparência total: backtest walk-forward (para cada rodada passada o modelo só vê o que aconteceu antes dela), comparado com o jeito mais comum de escalar — pela média.
          {a.source === "demo" && " No Modo Demonstração, sobre a temporada sintética."}
        </p>
      </div>

      {bt.isLoading && (
        <Alert tone="info">Rodando o backtest das últimas rodadas (leva alguns segundos na primeira vez; depois fica em cache)…</Alert>
      )}
      {bt.error && <ErrorBox error={bt.error} retry={() => bt.refetch()} />}

      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile
              label="Pontos reais da tropa"
              value={r.tropaModelo != null ? fmt1(r.tropaModelo) : "—"}
              hint={r.tropaMedia != null && r.tropaModelo != null ? `vs ${fmt1(r.tropaMedia)} pela média (${signed(((r.tropaModelo - r.tropaMedia) / r.tropaMedia) * 100, 0)}%)` : undefined}
              accent="good"
            />
            <StatTile label="Erro quadrático (RMSE)" value={fmt2(r.rmseModelo)} hint={`média: ${fmt2(r.rmseMedia)} (${signed(((r.rmseMedia - r.rmseModelo) / r.rmseMedia) * 100, 1)}% melhor)`} accent="brand" />
            <StatTile label="Ordenação (Spearman)" value={fmt2(r.spearmanModelo)} hint={`média: ${fmt2(r.spearmanMedia)} — quem é melhor que quem`} accent="gold" />
            <StatTile label="Calibração do intervalo" value={pct(r.dentroIntervalo)} hint="dentro de piso–teto (alvo 70%)" />
          </div>

          <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
            <Card className="p-4">
              <SectionTitle title="Pontos reais por rodada" subtitle="Tropa ótima (C$ 120, perfil Equilibrada) montada sem saber quem ia jogar" />
              {rounds.length > 1 ? (
                <LineChart
                  x={rounds.map((x) => x.rodada)}
                  series={[
                    { label: "Modelo Comandante", color: SERIES_A, values: rounds.map((x) => x.tropaModelo ?? 0) },
                    { label: "Escalar pela média", color: SERIES_B, values: rounds.map((x) => x.tropaMedia ?? 0) },
                  ]}
                />
              ) : (
                <p className="text-sm text-[var(--color-ink-3)]">Rodadas insuficientes para o gráfico.</p>
              )}
            </Card>
            <Card className="p-4">
              <SectionTitle title="Calibração" subtitle={`${r.amostras.toLocaleString("pt-BR")} previsões em ${r.rodadas} rodadas`} />
              <div className="space-y-2">
                <ProbBar label="Abaixo do piso" value={r.abaixoPiso} tone="blue" />
                <ProbBar label="Dentro" value={r.dentroIntervalo} tone="good" />
                <ProbBar label="Acima do teto" value={r.acimaTeto} />
              </div>
              <p className="mt-3 text-xs text-[var(--color-ink-3)]">Alvos: 15% / 70% / 15%. Perto disso = as probabilidades exibidas no app são honestas.</p>
              <div className="mt-4 border-t border-[var(--color-line)] pt-3 text-xs text-[var(--color-ink-3)]">
                MAE: modelo {fmt2(r.maeModelo)} · média {fmt2(r.maeMedia)} · últimos 5 {fmt2(r.maeUlt5)}. O MAE favorece quem subestima gols (a distribuição é assimétrica); para pontos esperados, o critério correto é o RMSE.
              </div>
            </Card>
          </div>

          <Card className="p-3 sm:p-4">
            <SectionTitle title="Rodada a rodada" />
            <div className="overflow-x-auto">
              <table className="data w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Rodada</th>
                    <th className="text-right">Previsões</th>
                    <th className="text-right">RMSE modelo</th>
                    <th className="text-right">RMSE média</th>
                    <th className="text-right">Spearman modelo</th>
                    <th className="text-right">Spearman média</th>
                    <th className="text-right">Tropa modelo</th>
                    <th className="text-right">Tropa média</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {rounds.map((x) => (
                    <tr key={x.rodada}>
                      <td className="font-semibold">R{x.rodada}</td>
                      <td className="text-right text-[var(--color-ink-3)]">{x.n}</td>
                      <td className={`text-right ${x.rmseModelo <= x.rmseMedia ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-ink-2)]"}`}>{fmt2(x.rmseModelo)}</td>
                      <td className="text-right text-[var(--color-ink-2)]">{fmt2(x.rmseMedia)}</td>
                      <td className={`text-right ${x.spearmanModelo >= x.spearmanMedia ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-ink-2)]"}`}>{fmt2(x.spearmanModelo)}</td>
                      <td className="text-right text-[var(--color-ink-2)]">{fmt2(x.spearmanMedia)}</td>
                      <td className={`text-right ${(x.tropaModelo ?? 0) >= (x.tropaMedia ?? 0) ? "font-semibold text-[var(--color-good-ink)]" : "text-[var(--color-ink-2)]"}`}>{fmt1(x.tropaModelo)}</td>
                      <td className="text-right text-[var(--color-ink-2)]">{fmt1(x.tropaMedia)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle title="Auditoria da tabela de pontos" subtitle="Pontos recalculados a partir dos scouts vs. pontuação oficial" />
          <div className="flex items-center gap-2 text-sm">
            {a.rulesCheck.divergencias.length === 0 ? <CheckCircle2 size={18} className="text-[var(--color-good-ink)]" /> : <TriangleAlert size={18} className="text-[var(--color-warning)]" />}
            <span>
              {pct(a.rulesCheck.acerto, 1)} das {a.rulesCheck.amostras.toLocaleString("pt-BR")} linhas batem exatamente.{" "}
              {a.rulesCheck.divergencias.length === 0 ? "Nenhum peso divergente." : "Pesos divergentes detectados:"}
            </span>
          </div>
          {a.rulesCheck.divergencias.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {a.rulesCheck.divergencias.map((d) => (
                <li key={d.key}>
                  {d.key} ({SCOUT_LABELS[d.key]}): tabela {fmt2(d.oficial)} · estimado pelos dados {fmt2(d.estimado)}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <SectionTitle title="Calibração do MPV" subtitle="V = CPP × (pontos − MPV), MPV = f(preço, média)" />
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-[var(--color-surface-1)] p-2">
              <div className="text-[10px] text-[var(--color-ink-3)] uppercase">CPP</div>
              <div className="font-display tabular text-lg font-bold">{fmt2(a.pmvModel.cpp)}</div>
            </div>
            <div className="rounded-lg bg-[var(--color-surface-1)] p-2">
              <div className="text-[10px] text-[var(--color-ink-3)] uppercase">Peso do preço</div>
              <div className="font-display tabular text-lg font-bold">{fmt2(-a.pmvModel.coefPreco / a.pmvModel.cpp)}</div>
            </div>
            <div className="rounded-lg bg-[var(--color-surface-1)] p-2">
              <div className="text-[10px] text-[var(--color-ink-3)] uppercase">R²</div>
              <div className="font-display tabular text-lg font-bold">{fmt2(a.pmvModel.r2)}</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--color-ink-3)]">{a.pmvModel.amostras.toLocaleString("pt-BR")} variações de preço usadas na calibração desta rodada.</p>
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle title="Como o motor pensa" subtitle="A matemática decide os números; a IA nunca inventa métricas" icon={<Microscope size={18} className="text-[var(--color-brand)]" />} />
        <ol className="grid gap-3 md:grid-cols-2">
          {METHOD.map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-3)] text-sm font-bold text-[var(--color-brand)]">{i + 1}</span>
              <div>
                <div className="font-semibold">{t}</div>
                <p className="text-sm text-[var(--color-ink-2)]">{d}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-[var(--color-ink-3)]">
          Configuração atual: meia-vida da forma {a.config.halfLife} rodadas · contexto {Math.round(a.config.contextStrength * 100)}% · xG por finalizações {Math.round(a.config.xgBlend * 100)}% · {a.config.simulations.toLocaleString("pt-BR")} simulações · análise calculada em {a.diagnostics.tempoMs} ms com{" "}
          {a.diagnostics.rodadasHistorico} rodadas de histórico.
        </p>
      </Card>
    </div>
  );
}
