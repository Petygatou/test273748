import { KeyRound, Link2Off } from "lucide-react";
import { useState } from "react";
import { KEYS, useLocal } from "../lib/storage";
import { Alert, Card, SectionTitle } from "./ui";

/** Hook do token do Cartola (fica só neste navegador; o servidor não guarda). */
export function useCartolaToken() {
  return useLocal<string>(KEYS.cartolaToken, "");
}

export function CartolaConnect({ onConnected }: { onConnected?: () => void }) {
  const [token, setToken] = useCartolaToken();
  const [draft, setDraft] = useState("");
  if (token) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-ink-2)]">
        <span className="chip border-[var(--color-good)]/40 text-[var(--color-good-ink)]">Conta do Cartola conectada</span>
        <button className="btn btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setToken("")}>
          <Link2Off size={13} /> Desconectar
        </button>
      </div>
    );
  }
  return (
    <Card className="space-y-3 p-4">
      <SectionTitle title="Conectar sua conta do Cartola" subtitle="Para ver seu time, suas ligas e escalar direto pelo site" icon={<KeyRound size={18} className="text-[var(--color-gold)]" />} />
      <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--color-ink-2)]">
        <li>
          Entre em{" "}
          <a href="https://cartola.globo.com" target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand)] underline">
            cartola.globo.com
          </a>{" "}
          no computador, logado na sua conta.
        </li>
        <li>Abra as ferramentas do navegador (F12) → aba <b>Rede/Network</b> e recarregue a página.</li>
        <li>
          Clique numa requisição para <code>api.cartola.globo.com</code> (ex.: <code>auth/time</code>) e copie o valor do cabeçalho <b>Authorization</b> (sem a palavra
          “Bearer”) ou <b>X-GLB-Token</b>.
        </li>
        <li>Cole abaixo. O token fica só neste navegador e é enviado ao Cartola apenas quando você usa estas funções.</li>
      </ol>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = draft.trim().replace(/^Bearer\s+/i, "");
          if (t) {
            setToken(t);
            setDraft("");
            onConnected?.();
          }
        }}
      >
        <input className="input" type="password" placeholder="cole o token do Cartola" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Token do Cartola" />
        <button className="btn btn-primary" type="submit" disabled={!draft.trim()}>
          Conectar
        </button>
      </form>
      <Alert tone="info">Nunca compartilhe esse token: ele dá acesso à sua escalação. Para revogar, saia da conta no site do Cartola.</Alert>
    </Card>
  );
}
