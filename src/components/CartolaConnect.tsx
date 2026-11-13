import { Bookmark, Check, ChevronDown, ClipboardPaste, Copy, KeyRound, Link2Off, MousePointerClick, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { codigoFavorito, extrairTokenCartola, tokenDoEndereco, tokenExpiraEm, tokenExpirado } from "../lib/cartolaToken";
import { KEYS, useLocal } from "../lib/storage";
import { Alert, Card, SectionTitle } from "./ui";

/**
 * Hook do token do Cartola (fica só neste navegador; o servidor não guarda).
 * Token do login novo vencido conta como "sem token": nada é enviado ao Cartola com ele.
 */
export function useCartolaToken(): [string, (v: string) => void, number | null] {
  const [token, setToken] = useLocal<string>(KEYS.cartolaToken, "");
  const [, tick] = useState(0);
  const expira = token ? tokenExpiraEm(token) : null;
  // reavalia quando chegar a hora de expirar
  useEffect(() => {
    if (!expira) return;
    const ms = expira - Date.now() - 30_000;
    if (ms <= 0) return;
    const t = setTimeout(() => tick((n) => n + 1), Math.min(ms + 50, 2_147_000_000));
    return () => clearTimeout(t);
  }, [expira]);
  const valido = token && !tokenExpirado(token) ? token : "";
  return [valido, setToken, token && !valido ? expira : null];
}

const hora = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

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

/**
 * Recebe o acesso que o favorito "Conectar ao Tropa" manda no endereço (#ctoken=…),
 * guarda neste navegador e limpa o endereço. Fica montado no layout de todas as páginas.
 */
export function RecebeTokenCartola() {
  const [, setToken] = useCartolaToken();
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    const t = tokenDoEndereco(window.location.hash);
    if (!window.location.hash.includes("ctoken=")) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!t) return setAviso("Não deu para ler o acesso do Cartola. Toque no favorito de novo com o Cartola aberto.");
    if (tokenExpirado(t)) return setAviso("Esse acesso do Cartola já tinha vencido. Recarregue o Cartola e toque no favorito de novo.");
    setToken(t);
    const exp = tokenExpiraEm(t);
    setAviso(`Conta do Cartola conectada${exp ? ` (vale até ${hora(exp)})` : ""}.`);
    const id = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!aviso) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 top-20 z-[80] mx-auto max-w-md rounded-2xl border border-[var(--color-good)]/50 bg-[var(--color-surface-2)] p-3 text-sm font-semibold shadow-xl"
      onClick={() => setAviso(null)}
    >
      {aviso}
    </div>
  );
}

/** Botão "Conectar ao Tropa" para arrastar à barra de favoritos (e copiar o código no celular). */
function BotaoFavorito() {
  const ref = useRef<HTMLAnchorElement>(null);
  const [codigo, setCodigo] = useState("");
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    const c = codigoFavorito(`${window.location.origin}/meu-time`);
    setCodigo(c);
    // o React bloqueia "javascript:" em href: o endereço do favorito entra direto no elemento
    ref.current?.setAttribute("href", c);
  }, []);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        ref={ref}
        onClick={(e) => {
          e.preventDefault();
          alert("Arraste este botão para a barra de favoritos (não clique aqui). Depois abra o Cartola, entre na sua conta e clique no favorito.");
        }}
        className="inline-flex cursor-grab items-center gap-2 rounded-xl border-2 border-dashed border-[var(--color-brand)] bg-[var(--color-brand)]/15 px-4 py-2.5 font-bold text-[var(--color-brand)]"
        title="Arraste para a barra de favoritos"
      >
        <Zap size={16} aria-hidden /> Conectar ao Tropa
      </a>
      <button
        type="button"
        className="btn btn-ghost px-3 py-2 text-xs"
        disabled={!codigo}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(codigo);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
          } catch {
            window.prompt("Copie o código do favorito:", codigo);
          }
        }}
      >
        {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? "Código copiado" : "Copiar código (celular)"}
      </button>
    </div>
  );
}

const Passo = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex gap-3">
    <span className="font-display flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-xs font-extrabold text-[#1a0a00]">{n}</span>
    <span>{children}</span>
  </li>
);

export function CartolaConnect({ onConnected }: { onConnected?: () => void }) {
  const [token, setToken, expirouEm] = useCartolaToken();
  const [draft, setDraft] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  if (token) {
    const expira = tokenExpiraEm(token);
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-ink-2)]">
        <span className="chip border-[var(--color-good)]/40 text-[var(--color-good-ink)]">Conta do Cartola conectada</span>
        {expira && <span className="text-xs text-[var(--color-ink-3)]">vale até {hora(expira)} (o Cartola libera por 1 hora; depois é só clicar no favorito de novo)</span>}
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
    if (tokenExpirado(t)) {
      setErro(`Esse acesso já expirou às ${hora(tokenExpiraEm(t)!)}. No Cartola, aperte F5 e copie a linha “time” de novo — o novo vale por 1 hora.`);
      return;
    }
    setErro(null);
    setToken(t);
    setDraft("");
    onConnected?.();
  };
  return (
    <Card className="space-y-4 p-4">
      {expirouEm && (
        <Alert tone="warning">
          Seu acesso ao Cartola expirou às {hora(expirouEm)} (o Cartola libera por 1 hora). Abra o Cartola e clique no favorito <b>Conectar ao Tropa</b> de novo.
        </Alert>
      )}
      <SectionTitle
        title="Conectar sua conta do Cartola"
        subtitle="Para ver seu time, suas ligas e escalar direto pelo site. Depois de salvar o favorito, é um clique."
        icon={<KeyRound size={18} className="text-[var(--color-gold)]" />}
      />

      <div className="space-y-3 rounded-2xl border border-[var(--color-brand)]/40 bg-[var(--color-brand)]/5 p-3 sm:p-4">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Bookmark size={16} className="text-[var(--color-brand)]" aria-hidden /> Jeito rápido: favorito “Conectar ao Tropa”
        </div>
        <ol className="space-y-3 text-sm text-[var(--color-ink-2)]">
          <Passo n={1}>
            <b>Só na primeira vez:</b> arraste o botão abaixo para a <b>barra de favoritos</b> do navegador (se ela não aparece, aperte <kbd className={kbd}>Ctrl</kbd> +{" "}
            <kbd className={kbd}>Shift</kbd> + <kbd className={kbd}>B</kbd>).
          </Passo>
        </ol>
        <BotaoFavorito />
        <ol start={2} className="space-y-3 text-sm text-[var(--color-ink-2)]">
          <Passo n={2}>
            Abra{" "}
            <a href="https://cartola.globo.com/#!/time" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-brand)] underline">
              cartola.globo.com
            </a>{" "}
            e entre na sua conta Globo normalmente.
          </Passo>
          <Passo n={3}>
            Clique no favorito <b>Conectar ao Tropa</b>. Você volta para cá já conectado. Se aparecer “toque em Meu time”, toque e pronto.
          </Passo>
        </ol>
        <p className="text-xs text-[var(--color-ink-3)]">
          <b className="text-[var(--color-ink-2)]">No celular:</b> toque em “Copiar código”, crie um favorito de qualquer página, edite o favorito, troque o endereço pelo código copiado e dê o nome{" "}
          <b>Conectar ao Tropa</b>. Depois, com o Cartola aberto, digite “Conectar ao Tropa” na barra de endereço e toque no favorito.
        </p>
      </div>

      <details className="group rounded-2xl border border-[var(--color-line)] p-3 sm:p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
          Outro jeito: copiar pelo F12 (computador)
          <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-3 space-y-4">
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
                Aperte <kbd className={kbd}>F12</kbd> (no Mac: <kbd className={kbd}>Cmd</kbd> + <kbd className={kbd}>Option</kbd> + <kbd className={kbd}>I</kbd>). Abre um painel ao lado ou embaixo da
                página. Nele, clique na aba <b>Network</b> (ou <b>Rede</b>).
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-display flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-xs font-extrabold text-[#1a0a00]">3</span>
              <span>
                No campo de filtro do painel, digite <kbd className={kbd}>auth/time</kbd> e aperte <kbd className={kbd}>F5</kbd> para recarregar a página. Vai aparecer uma linha chamada <b>time</b>{" "}
                (se aparecerem duas, qualquer uma serve).
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
                if (t && !tokenExpirado(t)) {
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
        </div>
      </details>

      <div className="space-y-1.5 rounded-xl bg-[var(--color-surface-1)] p-3 text-xs text-[var(--color-ink-3)]">
        <p className="flex gap-2">
          <MousePointerClick size={14} className="mt-px shrink-0 text-[var(--color-brand)]" aria-hidden />
          <span>
            <b className="text-[var(--color-ink-2)]">O acesso vale 1 hora</b> (regra do Cartola). Quando vencer, é só abrir o Cartola e clicar no favorito de novo: um clique.
          </span>
        </p>
        <p>O acesso fica só neste navegador e só é enviado ao Cartola quando você usa estas funções. O Tropa nunca vê nem guarda a sua senha da Globo.</p>
        <p>Nunca mande esse texto para outras pessoas: ele dá acesso à sua escalação.</p>
      </div>
    </Card>
  );
}
