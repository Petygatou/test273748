import { createFileRoute, redirect } from "@tanstack/react-router";
import { AI_ENABLED } from "../lib/features";
import { Bot, Loader2, Send, Sparkles, Trash2, Wrench } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "../components/avatars";
import { Alert, Card, Seg } from "../components/ui";
import { takeAsk } from "../lib/ask";
import { DEFAULT_PROFILE, KEYS, readLocal, useLocal, writeLocal, type UserProfile } from "../lib/storage";

export const Route = createFileRoute("/assistente")({
  beforeLoad: () => {
    if (!AI_ENABLED) throw redirect({ to: "/" });
  },
  component: AssistantPage,
});

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  contextoTitulo?: string;
  offline?: boolean;
  erro?: boolean;
}

const SUGGESTIONS = [
  "Quem é o capitão mais seguro da rodada? E o diferencial?",
  "Monte uma tropa equilibrada com C$ 120 e explique o capitão.",
  "Quais defesas têm mais chance de SG nesta rodada?",
  "Me indique 3 atacantes baratos (até C$ 8) para valorizar.",
  "O modelo é confiável? Mostre a precisão nas últimas rodadas.",
];

/** Renderizador mínimo e seguro de markdown (negrito, listas, títulos). */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="text-[var(--color-ink)]">{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list.ordered ? "ol" : "ul";
    out.push(
      <L key={out.length} className={`my-1.5 space-y-1 pl-5 ${list.ordered ? "list-decimal" : "list-disc"} marker:text-[var(--color-brand)]`}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </L>,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      const ordered = Boolean(num);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? num)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) out.push(<h4 key={out.length} className="font-display mt-2 mb-1 font-bold text-[var(--color-ink)]">{inline(h[1])}</h4>);
    else out.push(<p key={out.length} className="my-1">{inline(line)}</p>);
  }
  flush();
  return <div className="text-sm leading-relaxed text-[var(--color-ink-2)]">{out}</div>;
}

function AssistantPage() {
  const [profile, setProfile] = useLocal<UserProfile>(KEYS.profile, DEFAULT_PROFILE);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    setMsgs(readLocal<Msg[]>(KEYS.chat, []));
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, status]);

  const persist = (list: Msg[]) => writeLocal(KEYS.chat, list.slice(-60));

  async function send(text: string, contexto?: unknown, contextoTitulo?: string) {
    if (!text.trim() || busy) return;
    const user: Msg = { id: `${Date.now()}u`, role: "user", content: text.trim(), contextoTitulo };
    const bot: Msg = { id: `${Date.now()}a`, role: "assistant", content: "", tools: [] };
    const base = [...readLocal<Msg[]>(KEYS.chat, msgs), user];
    setMsgs([...base, bot]);
    setInput("");
    setBusy(true);
    setStatus("Pensando…");
    let acc = "";
    const tools: string[] = [];
    let offline = false;
    let erro = false;
    try {
      const res = await fetch("/api/comandante", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: base.filter((m) => !m.erro).map((m) => ({ role: m.role, content: m.content })),
          contexto,
          prefs: { tom: profile.tom, foco: profile.foco, nome: profile.nome },
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as { type: string; text?: string; label?: string; message?: string; offline?: boolean };
          if (ev.type === "text" && ev.text) {
            acc += ev.text;
            setStatus(null);
          } else if (ev.type === "tool" && ev.label) {
            tools.push(ev.label);
            setStatus(`${ev.label}…`);
          } else if (ev.type === "error") {
            erro = true;
            acc += (acc ? "\n\n" : "") + `⚠️ ${ev.message}`;
          } else if (ev.type === "done") {
            offline = Boolean(ev.offline);
          }
          setMsgs([...base, { ...bot, content: acc, tools: [...tools], offline, erro }]);
        }
      }
    } catch (e) {
      erro = true;
      acc = `⚠️ ${e instanceof Error ? e.message : "Falha de conexão"}`;
    } finally {
      const final = [...base, { ...bot, content: acc || "Sem resposta.", tools, offline, erro }];
      setMsgs(final);
      persist(final);
      setBusy(false);
      setStatus(null);
    }
  }

  // atalhos de análise rápida vindos de outras telas
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const ask = takeAsk();
    if (ask) void send(ask.pergunta, ask.contexto, ask.titulo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-gold)] text-[#140700]">
            <Bot size={22} aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-xl font-extrabold">O Comandante</h1>
            <p className="text-xs text-[var(--color-ink-3)]">Assistente tático. Lê o motor, nunca inventa números.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Seg label="Tom" value={profile.tom} onChange={(v) => setProfile({ ...profile, tom: v })} options={[{ value: "conservador", label: "Conservador" }, { value: "agressivo", label: "Agressivo" }]} />
          <Seg label="Foco" value={profile.foco} onChange={(v) => setProfile({ ...profile, foco: v })} options={[{ value: "pontos", label: "Pontos" }, { value: "cartoletas", label: "Cartoletas" }]} />
          {msgs.length > 0 && (
            <button
              className="btn btn-ghost px-2.5 py-2"
              aria-label="Limpar conversa"
              onClick={() => {
                setMsgs([]);
                persist([]);
              }}
              disabled={busy}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </Card>

      <div className="min-h-[45dvh] space-y-4" aria-live="polite">
        {msgs.length === 0 && (
          <Card className="p-5">
            <p className="text-sm text-[var(--color-ink-2)]">
              Pergunte sobre capitão, confrontos, valorização ou peça para montar e auditar tropas. Cada número da resposta vem do motor analítico — as ferramentas que o Comandante consulta aparecem embaixo de cada resposta.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip max-w-full shrink cursor-pointer whitespace-normal text-left hover:border-[var(--color-line-strong)]" onClick={() => send(s)}>
                  <Sparkles size={12} className="text-[var(--color-gold)]" aria-hidden /> {s}
                </button>
              ))}
            </div>
          </Card>
        )}
        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end gap-2">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--color-surface-4)] px-4 py-2.5 text-sm">
                {m.contextoTitulo && <div className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--color-gold)] uppercase">Contexto: {m.contextoTitulo}</div>}
                {m.content}
              </div>
              <div className="shrink-0">
                <Avatar k={profile.avatar} size={30} />
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2">
              <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-gold)] text-[#140700]">
                <Bot size={16} aria-hidden />
              </div>
              <div className={`card max-w-[90%] px-4 py-3 ${m.erro ? "border-[var(--color-critical)]/40" : ""}`}>
                {m.content ? <Markdown text={m.content} /> : <span className="text-sm text-[var(--color-ink-3)]">…</span>}
                {m.tools && m.tools.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[var(--color-line)] pt-2">
                    {m.tools.map((t, i) => (
                      <span key={i} className="chip text-[10px]">
                        <Wrench size={10} aria-hidden /> {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        {status && (
          <div className="flex items-center gap-2 pl-10 text-xs text-[var(--color-ink-3)]">
            <Loader2 size={14} className="animate-spin" aria-hidden /> {status}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {msgs.some((m) => m.offline) && (
        <Alert tone="info">O Comandante está respondendo em modo offline (sem chave de IA no servidor). Configure ANTHROPIC_API_KEY para respostas completas.</Alert>
      )}

      <form
        className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 flex gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-1)]/95 p-2 backdrop-blur lg:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="ask" className="sr-only">
          Pergunte ao Comandante
        </label>
        <textarea
          id="ask"
          rows={1}
          className="input max-h-40 min-h-[42px] resize-none border-0 bg-transparent focus:shadow-none"
          placeholder="Pergunte ao Comandante…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button type="submit" className="btn btn-primary px-3" disabled={busy || !input.trim()} aria-label="Enviar">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
}
