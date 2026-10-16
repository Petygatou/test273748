import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Newspaper, RefreshCw } from "lucide-react";
import { useState } from "react";
import { AskButton } from "../components/AskButton";
import { Alert, Card, ClubBadge, ErrorBox, PageSkeleton, Seg } from "../components/ui";
import type { Club } from "../engine/types";
import type { NewsCategory, NewsItem } from "../server/news";
import { compactPlayer } from "../lib/derive";
import { timeAgo } from "../lib/format";
import { analysisQuery, newsQuery } from "../lib/queries";
import { fetchNews } from "../server/fns";

export const Route = createFileRoute("/noticias")({
  component: NewsPage,
});

const CATS: Array<NewsCategory | "Todas"> = ["Todas", "Desfalques", "Escalações", "Mercado", "Cartola", "Geral"];
const CAT_CLS: Record<NewsCategory, string> = {
  Desfalques: "text-[var(--color-critical-ink)] border-[var(--color-critical)]/40",
  Escalações: "text-[var(--color-good-ink)] border-[var(--color-good)]/40",
  Mercado: "text-[#9cc6f5] border-[var(--color-series-b)]/40",
  Cartola: "text-[var(--color-gold)] border-[var(--color-gold)]/40",
  Geral: "",
};

function NewsPage() {
  const qc = useQueryClient();
  const news = useQuery(newsQuery);
  const an = useQuery(analysisQuery);
  const [cat, setCat] = useState<NewsCategory | "Todas">("Todas");
  const [refreshing, setRefreshing] = useState(false);
  if (news.isLoading) return <PageSkeleton />;
  if (news.error || !news.data) return <ErrorBox error={news.error} retry={() => news.refetch()} />;
  const items = news.data.items.filter((n) => cat === "Todas" || n.categoria === cat);
  const [destaque, ...resto] = items;
  const a = an.data?.analysis;

  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await fetchNews({ data: { force: true } });
      qc.setQueryData(newsQuery.queryKey, fresh);
    } finally {
      setRefreshing(false);
    }
  };

  const impactPayload = (n: NewsItem) => () => {
    const players = a ? n.atletas.map((x) => a.players.find((p) => p.atletaId === x.id)).filter((p): p is NonNullable<typeof p> => Boolean(p)) : [];
    return {
      titulo: "Impacto da manchete",
      pergunta: `Qual o impacto desta notícia na escalação desta rodada? "${n.titulo}"`,
      contexto: { manchete: n.titulo, resumo: n.resumo, categoria: n.categoria, fonte: n.fonte, atletasCitados: a ? players.map(compactPlayer(a)) : n.atletas },
    };
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold">
            <Newspaper size={22} className="text-[var(--color-brand)]" /> Jornal do Futebol
          </h1>
          <p className="text-sm text-[var(--color-ink-3)]">
            Feeds RSS processados no servidor, classificados por regra e cruzados com o mercado. Cache de 5 minutos · atualizado {timeAgo(news.data.atualizadoEm)}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={refresh} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /> Atualizar agora
        </button>
      </div>
      {news.data.source === "demo" && <Alert tone="info">Os feeds não responderam ({news.data.erro}). Exibindo manchetes de demonstração geradas a partir dos dados.</Alert>}
      <Seg label="Categoria" value={cat} onChange={setCat} options={CATS.map((c) => ({ value: c, label: c }))} />

      {destaque && (
        <Card className="p-5">
          <NewsBody n={destaque} big clubs={a?.clubs} />
          <div className="mt-3">
            <AskButton label="Entender impacto da manchete" payload={impactPayload(destaque)} />
          </div>
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {resto.map((n) => (
          <Card key={n.id} className="flex flex-col p-4">
            <NewsBody n={n} clubs={a?.clubs} />
            <div className="mt-auto pt-3">
              <AskButton label="Entender impacto" payload={impactPayload(n)} className="px-3 py-1.5 text-xs" />
            </div>
          </Card>
        ))}
      </div>
      {!items.length && <p className="text-sm text-[var(--color-ink-3)]">Nenhuma notícia nesta categoria.</p>}
    </div>
  );
}

function NewsBody({ n, big = false, clubs }: { n: NewsItem; big?: boolean; clubs?: Record<number, Club> }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-ink-3)]">
        <span className={`chip ${CAT_CLS[n.categoria]}`}>{n.categoria}</span>
        <span>{n.fonte}</span>
        {n.publicadoEm && <span>· {timeAgo(n.publicadoEm)}</span>}
      </div>
      <h2 className={`font-display mt-2 font-bold ${big ? "text-xl md:text-2xl" : "text-base"}`}>
        {n.link && n.link !== "#" ? (
          <a href={n.link} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-brand)]">
            {n.titulo} <ExternalLink size={13} className="inline opacity-60" aria-hidden />
          </a>
        ) : (
          n.titulo
        )}
      </h2>
      {n.resumo && <p className="mt-1 text-sm text-[var(--color-ink-2)]">{n.resumo}</p>}
      {(n.atletas.length > 0 || n.clubes.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {n.clubes.slice(0, 3).map((c) => (
            <span key={c} className="chip">
              <ClubBadge club={clubs?.[c]} size={14} /> {clubs?.[c]?.nome}
            </span>
          ))}
          {n.atletas.map((x) => (
            <Link key={x.id} to="/jogador/$id" params={{ id: String(x.id) }} className={`chip hover:border-[var(--color-line-strong)] ${x.impacto ? "border-[var(--color-warning)]/40" : ""}`} title={x.impacto ?? undefined}>
              {x.apelido}
              {x.impacto && <span className="text-[var(--color-warning)]">· impacto</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
