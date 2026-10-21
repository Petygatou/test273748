import { ClipboardPaste, KeyRound, Link2Off, MousePointerClick } from "lucide-react";
import { useState } from "react";
import { extrairTokenCartola } from "../lib/cartolaToken";
import { KEYS, useLocal } from "../lib/storage";
import { Alert, Card, SectionTitle } from "./ui";

/** Hook do token do Cartola (fica só neste navegador; o servidor não guarda). */
export function useCartolaToken() {
  return useLocal<string>(KEYS.cartolaToken, "");
}

const kbd = "rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-ink)]";

/** Desenho simplificado do painel do navegador, mostrando onde clicar. */
function PainelExemplo() {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-[#1e1f24] text-[11px] text-[#c9ccd3] select-none" aria-hidden>
      <div className="flex gap-3 border-b border-white/10 px-3 py-1.5">
        <span>Elements</span>
        <span>Console</span>
        <span className="border-b-2 border-[var(--color-brand)] pb-0.5 font-semibold text-white">Network</span>
        <span>Sources</span>
      </div>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5">
        <span className="rounded border border-[var(--color-brand)] bg-black/40 px-2 py-0.5 text-white">auth/time</span>
        <span className="text-white/40">← digite aqui no filtro</span>
      </div>
      <div className="relative px-3 py-1.5">
        <div className="flex justify-between text-white/40">
          <span>Name</span>
          <span>Status</span>
        </div>
        <div className="mt-1 flex justify-between rounded bg-[var(--color-brand)]/25 px-1.5 py-1 font-semibold text-white">
          <span>time</span>
          <span>200</span>
        </div>
        <div className="absolute top-9 left-24 z-10 w-44 rounded-md border border-white/15 bg-[#2a2c33] py-1 shadow-xl">
          <div className="px-2 py-0.5 text-white/50">Open in new tab</div>
          <div className="flex items-center justify-between bg-white/10 px-2 py-0.5 text-white">
            Copy <span>›</span>
          </div>
          <div className="absolute top-6 left-[10.5rem] w-40 rounded-md border border-white/15 bg-[#2a2c33] py-1 shadow-xl">
            <div className="px-2 py-0.5 text-white/50">Copy URL</div>
            <div className="bg-[var(--color-brand)] px-2 py-0.5 font-semibold text-[#1a0a00]">Copy as cURL (bash)</div>
            <div className="px-2 py-0.5 text-white/50">Copy as fetch</div>
          </div>
        </div>
        <div className="h-[4.75rem]" />
      </div>
    </div>
  );
}

export function CartolaConnect({ onConnected }: { onConnected?: () => void }) {
  const [token, setToken] = useCartolaToken();
  const [draft, setDraft] = useState("");
  const [erro, setErro] = useState<string | null>(null);
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
  const conectar = () => {
    const t = extrairTokenCartola(draft);
    if (!t) {
      setErro("Não encontramos o token nesse texto. Confira se copiou a linha “time” com “Copy as cURL” e cole tudo de novo.");
      return;
    }
    setErro(null);
    setToken(t);
    setDraft("");
    onConnected?.();
  };
  return (
    <Card className="space-y-4 p-4">
      <SectionTitle title="Conectar sua conta do Cartola" subtitle="Para ver seu time, suas ligas e escalar direto pelo site. Leva uns 2 minutos, uma vez só." icon={<KeyRound size={18} className="text-[var(--color-gold)]" />} />

      <ol className="space-y-3 text-sm text-[var(--color-ink-2)]">
        <li className="flex gap-3">
          <span className="font-display flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-xs font-extrabold text-[#1a0a00]">1</span>
          <span>
            No <b>computador</b>, abra{" "}
            <a href="https://cartola.globo.com/#!/time" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-brand)] underline">
              cartola.globo.com
            </a>{" "}
            e entre na sua conta (tem que aparecer o seu time).
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-display flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-xs font-extrabold text-[#1a0a00]">2</span>
          <span>
            Aperte <kbd className={kbd}>F12</kbd> (no Mac: <kbd className={kbd}>Cmd</kbd> + <kbd className={kbd}>Option</kbd> + <kbd className={kbd}>I</kbd>). Abre um painel ao lado ou embaixo da página. Nele, clique na aba <b>Network</b> (ou <b>Rede</b>).
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-display flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-xs font-extrabold text-[#1a0a00]">3</span>
          <span>
            No campo de filtro do painel, digite <kbd className={kbd}>auth/time</kbd> e aperte <kbd className={kbd}>F5</kbd> para recarregar a página. Vai aparecer uma linha chamada <b>time</b>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-display flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-xs font-extrabold text-[#1a0a00]">4</span>
          <span>
            Clique com o <b>botão direito</b> na linha <b>time</b> → <b>Copy</b> (Copiar) → <b>Copy as cURL</b> (Copiar como cURL).
          </span>
        </li>
      </ol>

      <PainelExemplo />

      <div className="space-y-2">
        <label htmlFor="cartola-curl" className="flex items-center gap-2 text-sm font-semibold">
          <span className="font-display flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-xs font-extrabold text-[#1a0a00]">5</span>
          Cole tudo aqui (<kbd className={kbd}>Ctrl</kbd> + <kbd className={kbd}>V</kbd>) — o Tropa acha o token sozinho
        </label>
        <textarea
          id="cartola-curl"
          className="input min-h-[88px] resize-y font-mono text-xs"
          placeholder={"curl 'https://api.cartola.globo.com/auth/time' -H 'authorization: Bearer …' …"}
          value={draft}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setDraft(e.target.value);
            setErro(null);
          }}
          onPaste={(e) => {
            // colou o texto: conecta na hora se o token estiver nele
            const t = extrairTokenCartola(e.clipboardData.getData("text"));
            if (t) {
              e.preventDefault();
              setErro(null);
              setToken(t);
              setDraft("");
              onConnected?.();
            }
          }}
        />
        {erro && <Alert tone="warning">{erro}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" type="button" onClick={conectar} disabled={!draft.trim()}>
            <ClipboardPaste size={15} /> Conectar
          </button>
          <span className="text-xs text-[var(--color-ink-3)]">Também aceita só o token, ou o valor do cabeçalho Authorization / X-GLB-Token.</span>
        </div>
      </div>

      <div className="space-y-1.5 rounded-xl bg-[var(--color-surface-1)] p-3 text-xs text-[var(--color-ink-3)]">
        <p className="flex gap-2">
          <MousePointerClick size={14} className="mt-px shrink-0 text-[var(--color-brand)]" aria-hidden />
          <span>
            <b className="text-[var(--color-ink-2)]">Vai usar no celular?</b> Faça os passos no computador, mande o texto copiado para você mesmo (WhatsApp, e-mail) e cole aqui no celular.
          </span>
        </p>
        <p>O token fica só neste navegador e só é enviado ao Cartola quando você usa estas funções. Ele expira de tempos em tempos: se o seu time parar de carregar, é só repetir.</p>
        <p>Nunca mande esse texto para outras pessoas: ele dá acesso à sua escalação.</p>
      </div>
    </Card>
  );
}
