import { useScrollLock } from "./ui";
import { Camera, Circle, Image as ImageIcon, Loader2, Plus, Square, Type, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { STORY_FILTERS, type Author, type NewStory, type Story, type StoryFilter, type StoryText } from "../lib/community";
import { timeAgo } from "../lib/format";
import { Avatar } from "./avatars";

const FILTER_LABELS: Record<StoryFilter, string> = { nenhum: "Original", vivido: "Vívido", pb: "P&B", sepia: "Sépia", quente: "Quente", frio: "Frio", arena: "Arena" };
const COLORS = ["#ffffff", "#ff6b1a", "#f5c518", "#3987e5", "#0ca30c", "#111111"];

/* ------------------------------ barra de stories ------------------------------ */

export function StoriesBar({ stories, me, onCreate, onOpen }: { stories: Story[]; me: Author; onCreate?: () => void; onOpen: (authorId: string) => void }) {
  const byAuthor = new Map<string, Story[]>();
  for (const s of stories) {
    if (!byAuthor.has(s.author.id)) byAuthor.set(s.author.id, []);
    byAuthor.get(s.author.id)!.push(s);
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none" role="list" aria-label="Stories">
      {onCreate && (
      <button type="button" onClick={onCreate} className="flex w-16 shrink-0 flex-col items-center gap-1" role="listitem">
        <span className="relative">
          <Avatar k={me.avatar} size={58} />
          <span className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brand)] text-[#140700] ring-2 ring-[var(--color-page)]">
            <Plus size={13} aria-hidden />
          </span>
        </span>
        <span className="w-full truncate text-center text-[11px] text-[var(--color-ink-2)]">Novo story</span>
      </button>
      )}
      {!onCreate && !byAuthor.size && <p className="py-3 text-sm text-[var(--color-ink-3)]">Nenhum story nas últimas 24 horas.</p>}
      {[...byAuthor.entries()].map(([id, list]) => {
        const a = list[0].author;
        return (
          <button key={id} type="button" onClick={() => onOpen(id)} className="flex w-16 shrink-0 flex-col items-center gap-1" role="listitem" aria-label={`Stories de ${a.nome}`}>
            <span className="rounded-full bg-gradient-to-tr from-[var(--color-gold)] via-[var(--color-brand)] to-[#e23b2e] p-[2.5px]">
              <span className="block rounded-full bg-[var(--color-page)] p-[2px]">
                <Avatar k={a.avatar} size={50} />
              </span>
            </span>
            <span className="w-full truncate text-center text-[11px] text-[var(--color-ink-2)]">{a.oficial ? "Oficial" : a.nome}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ visualizador ------------------------------ */

export function StoryViewer({ stories, startAuthor, onClose }: { stories: Story[]; startAuthor: string; onClose: () => void }) {
  useScrollLock();
  // agrupa por autor (na ordem em que aparecem na barra) e, dentro do grupo, por horário
  const authorOrder: string[] = [];
  for (const s of stories) if (!authorOrder.includes(s.author.id)) authorOrder.push(s.author.id);
  const ordered = authorOrder.flatMap((id) => stories.filter((s) => s.author.id === id).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)));
  const firstIdx = Math.max(0, ordered.findIndex((s) => s.author.id === startAuthor));
  const [idx, setIdx] = useState(firstIdx);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const s = ordered[idx];
  const group = ordered.filter((x) => x.author.id === s?.author.id);
  const posInGroup = group.findIndex((x) => x.id === s?.id);

  useEffect(() => {
    setProgress(0);
    if (!s) return;
    if (s.media.kind === "image") {
      const start = Date.now();
      const t = setInterval(() => {
        const p = (Date.now() - start) / 5000;
        setProgress(Math.min(1, p));
        if (p >= 1) {
          clearInterval(t);
          next();
        }
      }, 50);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function next() {
    if (idx + 1 >= ordered.length) onClose();
    else setIdx(idx + 1);
  }
  function prev() {
    setIdx((i) => Math.max(0, i - 1));
  }
  if (!s) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95" role="dialog" aria-modal="true" aria-label={`Story de ${s.author.nome}`}>
      <div className="relative aspect-[9/16] h-full max-h-[100dvh] w-full max-w-[min(100vw,56.25dvh)] overflow-hidden bg-black [container-type:inline-size] sm:rounded-2xl">
        <StoryCanvas story={s} videoRef={videoRef} onVideoEnd={next} onVideoProgress={setProgress} autoPlay />
        <div className="absolute inset-x-2 top-2 z-10 flex gap-1" aria-hidden>
          {group.map((g, i) => (
            <div key={g.id} className="h-0.5 flex-1 overflow-hidden rounded bg-white/30">
              <div className="h-full bg-white" style={{ width: `${i < posInGroup ? 100 : i === posInGroup ? progress * 100 : 0}%` }} />
            </div>
          ))}
        </div>
        <div className="absolute inset-x-3 top-5 z-10 flex items-center gap-2">
          <Avatar k={s.author.avatar} size={30} />
          <span className="text-sm font-semibold text-white drop-shadow">{s.author.nome}</span>
          <span className="text-xs text-white/70">{timeAgo(s.criadoEm)}</span>
          <button type="button" className="-m-2 ml-auto p-2 text-white" onClick={onClose} aria-label="Fechar">
            <X size={22} />
          </button>
        </div>
        <button className="absolute inset-y-0 left-0 w-1/3" onClick={prev} aria-label="Anterior" />
        <button className="absolute inset-y-0 right-0 w-2/3" onClick={next} aria-label="Próximo" />
      </div>
    </div>,
    document.body,
  );
}

function StoryCanvas({
  story,
  videoRef,
  onVideoEnd,
  onVideoProgress,
  autoPlay,
}: {
  story: Pick<Story, "media" | "filtro" | "textos">;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onVideoEnd?: () => void;
  onVideoProgress?: (p: number) => void;
  autoPlay?: boolean;
}) {
  const filter = STORY_FILTERS[story.filtro] ?? "none";
  return (
    <div className="absolute inset-0">
      {story.media.kind === "image" ? (
        <img src={story.media.url} alt="" className="h-full w-full object-cover" style={{ filter }} />
      ) : (
        <video
          ref={videoRef}
          src={story.media.url}
          className="h-full w-full object-cover"
          style={{ filter }}
          autoPlay={autoPlay}
          playsInline
          onEnded={onVideoEnd}
          onTimeUpdate={(e) => onVideoProgress?.(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
        />
      )}
      {story.textos.map((t) => (
        <span
          key={t.id}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-lg px-2 py-0.5 text-center font-bold whitespace-pre-wrap"
          style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, color: t.cor, fontSize: `${(t.tamanho / 360) * 100}cqw`, textShadow: "0 1px 6px rgb(0 0 0 / 0.6)" }}
        >
          {t.texto}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------ criação / editor ------------------------------ */

export function StoryComposer({ onClose, onPublish }: { onClose: () => void; onPublish: (s: NewStory) => Promise<void> }) {
  useScrollLock();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [kind, setKind] = useState<"image" | "video">("image");
  const [url, setUrl] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<StoryFilter>("nenhum");
  const [textos, setTextos] = useState<StoryText[]>([]);
  const [draft, setDraft] = useState("");
  const [cor, setCor] = useState(COLORS[0]);
  const [tamanho, setTamanho] = useState(28);
  const [camera, setCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const useBlob = (b: Blob, k: "image" | "video") => {
    setBlob(b);
    setKind(k);
    setUrl(URL.createObjectURL(b));
    setCamera(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const x = Math.min(0.95, Math.max(0.05, (e.clientX - r.left) / r.width));
    const y = Math.min(0.95, Math.max(0.05, (e.clientY - r.top) / r.height));
    setTextos((ts) => ts.map((t) => (t.id === dragging.current ? { ...t, x, y } : t)));
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/90 p-3" role="dialog" aria-modal="true" aria-label="Criar story">
      <div className="card mx-auto max-w-3xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Novo story</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-[var(--color-ink-3)]">
            <X size={20} />
          </button>
        </div>
        {!blob && !camera && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="card card-hover flex cursor-pointer flex-col items-center gap-2 p-6 text-center">
              <ImageIcon size={28} className="text-[var(--color-brand)]" aria-hidden />
              <span className="font-semibold">Enviar foto ou vídeo</span>
              <span className="text-xs text-[var(--color-ink-3)]">JPG, PNG, MP4, WEBM</span>
              <input
                type="file"
                accept="image/*,video/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) useBlob(f, f.type.startsWith("video") ? "video" : "image");
                }}
              />
            </label>
            <button className="card card-hover flex flex-col items-center gap-2 p-6" onClick={() => setCamera(true)}>
              <Camera size={28} className="text-[var(--color-gold)]" aria-hidden />
              <span className="font-semibold">Gravar com a câmera</span>
              <span className="text-xs text-[var(--color-ink-3)]">Vídeo de até 15s ou foto</span>
            </button>
          </div>
        )}
        {camera && <CameraCapture onCancel={() => setCamera(false)} onCapture={useBlob} />}
        {blob && url && (
          <div className="grid gap-4 grid-cols-[minmax(0,1fr)] md:grid-cols-[300px_minmax(0,1fr)]">
            <div ref={stageRef} className="relative mx-auto aspect-[9/16] w-full max-w-[300px] touch-none overflow-hidden rounded-2xl bg-black [container-type:inline-size]" onPointerMove={onPointerMove} onPointerUp={() => (dragging.current = null)}>
              {kind === "image" ? (
                <img src={url} alt="Prévia do story" className="h-full w-full object-cover" style={{ filter: STORY_FILTERS[filtro] }} />
              ) : (
                <video src={url} className="h-full w-full object-cover" style={{ filter: STORY_FILTERS[filtro] }} autoPlay loop muted playsInline />
              )}
              {textos.map((t) => (
                <span
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Texto: ${t.texto}. Arraste para mover.`}
                  onPointerDown={(e) => {
                    dragging.current = t.id;
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  }}
                  onPointerUp={() => (dragging.current = null)}
                  onDoubleClick={() => setTextos((ts) => ts.filter((x) => x.id !== t.id))}
                  className="absolute -translate-x-1/2 -translate-y-1/2 cursor-move rounded-lg px-2 py-0.5 text-center font-bold whitespace-pre-wrap select-none"
                  style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, color: t.cor, fontSize: `${(t.tamanho / 360) * 100}cqw`, textShadow: "0 1px 6px rgb(0 0 0 / 0.6)" }}
                >
                  {t.texto}
                </span>
              ))}
            </div>
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-xs font-semibold text-[var(--color-ink-3)] uppercase">Filtro</div>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(STORY_FILTERS) as StoryFilter[]).map((f) => (
                    <button key={f} className={`chip ${filtro === f ? "border-[var(--color-brand)] text-[var(--color-ink)]" : ""}`} onClick={() => setFiltro(f)} aria-pressed={filtro === f}>
                      {FILTER_LABELS[f]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold text-[var(--color-ink-3)] uppercase">Texto (arraste na prévia · duplo clique remove)</div>
                <div className="flex gap-2">
                  <input className="input" placeholder="Escreva algo…" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} aria-label="Texto do story" />
                  <button
                    className="btn btn-ghost"
                    disabled={!draft.trim()}
                    onClick={() => {
                      setTextos((ts) => [...ts, { id: `${Date.now()}`, texto: draft.trim(), x: 0.5, y: 0.3 + 0.1 * (ts.length % 5), cor, tamanho }]);
                      setDraft("");
                    }}
                  >
                    <Type size={15} /> Adicionar
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {COLORS.map((c) => (
                    <button key={c} className={`h-6 w-6 rounded-full ring-2 ${cor === c ? "ring-[var(--color-brand)]" : "ring-white/20"}`} style={{ background: c }} onClick={() => setCor(c)} aria-label={`Cor ${c}`} aria-pressed={cor === c} />
                  ))}
                  <input type="range" min={16} max={56} value={tamanho} onChange={(e) => setTamanho(Number(e.target.value))} className="ml-2 flex-1 accent-[var(--color-brand)]" aria-label="Tamanho do texto" />
                </div>
              </div>
              {erro && <p className="text-sm text-[var(--color-critical-ink)]">{erro}</p>}
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setBlob(null);
                    setUrl(null);
                    setTextos([]);
                  }}
                >
                  Trocar mídia
                </button>
                <button
                  className="btn btn-primary flex-1"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    setErro(null);
                    try {
                      await onPublish({ blob, kind, filtro, textos });
                      onClose();
                    } catch (e) {
                      setErro(e instanceof Error ? e.message : "Falha ao publicar");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : null} Publicar story
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function CameraCapture({ onCancel, onCapture }: { onCancel: () => void; onCapture: (b: Blob, k: "image" | "video") => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1920 } }, audio: true })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setErro("Não foi possível acessar a câmera. Verifique a permissão do navegador."));
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => {
    if (recording && secs >= 15) recRef.current?.stop();
  }, [secs, recording]);

  const start = () => {
    if (!streamRef.current) return;
    const chunks: BlobPart[] = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "video/mp4";
    const rec = new MediaRecorder(streamRef.current, { mimeType: mime });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      setRecording(false);
      onCapture(new Blob(chunks, { type: mime.split(";")[0] }), "video");
    };
    recRef.current = rec;
    setSecs(0);
    rec.start(250);
    setRecording(true);
  };

  const photo = () => {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onCapture(b, "image"), "image/jpeg", 0.9);
  };

  return (
    <div className="space-y-3">
      {erro ? (
        <p className="text-sm text-[var(--color-critical-ink)]">{erro}</p>
      ) : (
        <video ref={videoRef} autoPlay muted playsInline className="mx-auto aspect-[9/16] w-full max-w-[300px] rounded-2xl bg-black object-cover" />
      )}
      <div className="flex items-center justify-center gap-3">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        {!recording ? (
          <>
            <button className="btn btn-ghost" onClick={photo} disabled={Boolean(erro)}>
              <Camera size={15} /> Foto
            </button>
            <button className="btn btn-primary" onClick={start} disabled={Boolean(erro)}>
              <Circle size={15} className="fill-current" /> Gravar
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => recRef.current?.stop()}>
            <Square size={15} className="fill-current" /> Parar ({15 - secs}s)
          </button>
        )}
      </div>
    </div>
  );
}
