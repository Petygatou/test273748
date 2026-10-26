import { BarChart3, ChevronLeft, ChevronRight, ImagePlus, Loader2, Plus, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MAX_MIDIAS_POST, type Author, type NewPost } from "../lib/community";
import { Avatar } from "./avatars";
import { Card } from "./ui";

/* ------------------------------ composer ------------------------------ */

interface Anexo {
  id: string;
  file: File;
  url: string;
}

const MAX_BYTES = 60 * 1024 * 1024;

export function Composer({ me, onPublish, oficial = false }: { me: Author; onPublish: (p: NewPost) => Promise<void>; oficial?: boolean }) {
  const [texto, setTexto] = useState("");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [pollOn, setPollOn] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [opcoes, setOpcoes] = useState(["", ""]);
  const [busy, setBusy] = useState(false);
  const [progresso, setProgresso] = useState<{ atual: number; total: number; pct: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // libera as prévias da memória quando saem da tela
  const vivos = useRef(anexos);
  vivos.current = anexos;
  useEffect(() => () => vivos.current.forEach((a) => URL.revokeObjectURL(a.url)), []);

  const validPoll = pollOn && pergunta.trim() && opcoes.filter((o) => o.trim()).length >= 2;
  const canSend = (texto.trim() || anexos.length || validPoll) && !busy;

  const adicionar = (lista: FileList | null) => {
    if (!lista?.length) return;
    const novos: Anexo[] = [];
    const grandes: string[] = [];
    for (const f of Array.from(lista)) {
      if (!/^(image|video)\//.test(f.type)) continue;
      if (f.size > MAX_BYTES) {
        grandes.push(f.name);
        continue;
      }
      novos.push({ id: `${f.name}:${f.size}:${f.lastModified}:${Math.random()}`, file: f, url: URL.createObjectURL(f) });
    }
    const vagas = MAX_MIDIAS_POST - anexos.length;
    const aceitos = novos.slice(0, Math.max(0, vagas));
    novos.slice(aceitos.length).forEach((a) => URL.revokeObjectURL(a.url));
    setAnexos([...anexos, ...aceitos]);
    const avisos = [grandes.length ? `${grandes.length} arquivo(s) acima de 60 MB ficaram de fora.` : "", novos.length > aceitos.length ? `Cada post aceita até ${MAX_MIDIAS_POST} fotos/vídeos.` : ""].filter(Boolean);
    setErro(avisos.length ? avisos.join(" ") : null);
  };
  const remover = (id: string) => {
    const a = anexos.find((x) => x.id === id);
    if (a) URL.revokeObjectURL(a.url);
    setAnexos(anexos.filter((x) => x.id !== id));
  };
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= anexos.length) return;
    const n = [...anexos];
    [n[i], n[j]] = [n[j], n[i]];
    setAnexos(n);
  };

  return (
    <Card className="p-3">
      <div className="flex gap-3">
        <Avatar k={me.avatar} size={38} />
        <div className="min-w-0 flex-1">
          <textarea className="input min-h-[70px] resize-y" placeholder={oficial ? "Publicar novidade oficial no feed…" : "Qual a sua leitura da rodada?"} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} aria-label="Texto da publicação" />
          {anexos.length > 0 && (
            <div className="mt-2">
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {anexos.map((a, i) => (
                  <div key={a.id} className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-black">
                    {a.file.type.startsWith("video") ? <video src={a.url} className="h-full w-full object-cover" muted playsInline preload="metadata" /> : <img src={a.url} alt={`Mídia ${i + 1}`} className="h-full w-full object-cover" />}
                    {i === 0 && anexos.length > 1 && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-[10px] font-semibold text-white">capa</span>}
                    <button type="button" className="absolute top-1 right-1 rounded-full bg-black/70 p-0.5 text-white" onClick={() => remover(a.id)} aria-label={`Remover mídia ${i + 1}`}>
                      <X size={14} />
                    </button>
                    {anexos.length > 1 && (
                      <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1">
                        <button type="button" disabled={i === 0} className="rounded-full bg-black/70 p-0.5 text-white disabled:opacity-30" onClick={() => mover(i, -1)} aria-label="Mover para a esquerda">
                          <ChevronLeft size={14} />
                        </button>
                        <button type="button" disabled={i === anexos.length - 1} className="rounded-full bg-black/70 p-0.5 text-white disabled:opacity-30" onClick={() => mover(i, 1)} aria-label="Mover para a direita">
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {anexos.length < MAX_MIDIAS_POST && (
                  <button type="button" onClick={() => input.current?.click()} className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--color-line-strong,var(--color-line))] text-xs text-[var(--color-ink-3)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]">
                    <Plus size={18} /> Adicionar
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-ink-3)]">
                {anexos.length} de {MAX_MIDIAS_POST} · a primeira é a capa · use as setas para mudar a ordem
              </p>
            </div>
          )}
          {pollOn && (
            <div className="mt-2 space-y-2 rounded-xl border border-[var(--color-line)] p-2">
              <input className="input" placeholder="Pergunta da enquete" value={pergunta} onChange={(e) => setPergunta(e.target.value)} maxLength={140} aria-label="Pergunta da enquete" />
              {opcoes.map((o, i) => (
                <input key={i} className="input" placeholder={`Opção ${i + 1}`} value={o} maxLength={60} onChange={(e) => setOpcoes(opcoes.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Opção ${i + 1}`} />
              ))}
              {opcoes.length < 4 && (
                <button type="button" className="text-xs font-semibold text-[var(--color-brand)]" onClick={() => setOpcoes([...opcoes, ""])}>
                  + adicionar opção
                </button>
              )}
            </div>
          )}
          <input
            ref={input}
            type="file"
            accept="image/*,video/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              adicionar(e.target.files);
              e.target.value = ""; // permite escolher os mesmos arquivos de novo
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-ghost px-2.5 py-1.5 text-xs" onClick={() => input.current?.click()} disabled={anexos.length >= MAX_MIDIAS_POST}>
              <ImagePlus size={15} /> Fotos/vídeos
            </button>
            <button type="button" className={`btn btn-ghost px-2.5 py-1.5 text-xs ${pollOn ? "border-[var(--color-brand)]" : ""}`} onClick={() => setPollOn(!pollOn)} aria-pressed={pollOn}>
              <BarChart3 size={15} /> Enquete
            </button>
            <button
              type="button"
              className="btn btn-primary ml-auto px-4 py-1.5 text-xs"
              disabled={!canSend}
              onClick={async () => {
                setBusy(true);
                setErro(null);
                try {
                  await onPublish({
                    texto: texto.trim(),
                    files: anexos.map((a) => a.file),
                    poll: validPoll ? { pergunta: pergunta.trim(), opcoes: opcoes.map((o) => o.trim()).filter(Boolean) } : null,
                    onProgress: (atual, total, pct) => setProgresso({ atual, total, pct }),
                  });
                  anexos.forEach((a) => URL.revokeObjectURL(a.url));
                  setTexto("");
                  setAnexos([]);
                  setPollOn(false);
                  setPergunta("");
                  setOpcoes(["", ""]);
                } catch (e) {
                  // mantém o rascunho para tentar de novo
                  setErro(e instanceof Error ? e.message : "Não foi possível publicar. Tente de novo.");
                } finally {
                  setBusy(false);
                  setProgresso(null);
                }
              }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Publicar
            </button>
          </div>
          {progresso && progresso.total > 0 && (
            <div className="mt-2" role="status">
              <div className="flex justify-between text-[11px] text-[var(--color-ink-3)]">
                <span>
                  Enviando {progresso.atual} de {progresso.total}…
                </span>
                <span className="tabular">{Math.round(((progresso.atual - 1 + progresso.pct / 100) / progresso.total) * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-1)]">
                <div className="h-full rounded-full bg-[var(--color-brand)] transition-[width]" style={{ width: `${((progresso.atual - 1 + progresso.pct / 100) / progresso.total) * 100}%` }} />
              </div>
            </div>
          )}
          {erro && (
            <p className="mt-1 text-xs text-[var(--color-critical-ink)]" role="alert">
              {erro}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
