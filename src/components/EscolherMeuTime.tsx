import { useQuery } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
import { useState } from "react";
import { useDebounced } from "../lib/search";
import type { TeamSummary } from "../server/cartolaConta";
import { searchTeamsFn } from "../server/fnsCartola";
import { Alert, Card, SectionTitle } from "./ui";

/** Meu Time sem login: a pessoa acha o próprio time pelo nome e pronto (leitura pública do Cartola). */
export function EscolherMeuTime({ onEscolher }: { onEscolher: (t: TeamSummary) => void }) {
  const [q, setQ] = useState("");
  const termo = useDebounced(q.trim(), 350);
  const busca = useQuery({ queryKey: ["times", termo], queryFn: () => searchTeamsFn({ data: { q: termo } }), enabled: termo.length >= 2, retry: false });
  return (
    <Card className="space-y-3 p-4">
      <SectionTitle
        title="Qual é o seu time no Cartola?"
        subtitle="Digite o nome do time (ou o seu nome de cartoleiro) e toque em “É o meu”. Sem senha, sem login da Globo."
        icon={<Search size={18} className="text-[var(--color-brand)]" />}
      />
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-3)]" aria-hidden />
        <input
          className="input pl-9 text-base"
          placeholder="Ex.: Tropa da Mitagem"
          autoComplete="off"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Nome do seu time no Cartola"
        />
      </div>
      {busca.error && <Alert tone="warning">{busca.error instanceof Error ? busca.error.message : "A busca do Cartola não respondeu. Tente de novo."}</Alert>}
      {busca.isFetching && <p className="text-sm text-[var(--color-ink-3)]">Procurando no Cartola…</p>}
      {busca.data && busca.data.length > 0 && (
        <ul className="max-h-80 divide-y divide-[var(--color-line)] overflow-y-auto rounded-xl border border-[var(--color-line)]">
          {busca.data.map((t) => (
            <li key={t.timeId}>
              <button type="button" onClick={() => onEscolher(t)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-surface-2)]">
                {t.escudo ? <img src={t.escudo} alt="" width={36} height={36} className="shrink-0 rounded" /> : <span className="h-9 w-9 shrink-0 rounded bg-[var(--color-surface-2)]" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{t.nome}</span>
                  <span className="block truncate text-xs text-[var(--color-ink-3)]">{t.cartoleiro}</span>
                </span>
                <span className="btn btn-primary shrink-0 px-3 py-1.5 text-xs">
                  <Check size={14} aria-hidden /> É o meu
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {busca.data && !busca.data.length && !busca.isFetching && <p className="text-sm text-[var(--color-ink-3)]">Nenhum time com esse nome. Confira como está escrito no Cartola.</p>}
    </Card>
  );
}
