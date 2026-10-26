import { ChevronLeft, ChevronRight, Expand, Heart, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Media } from "../lib/community";
import { useScrollLock } from "./ui";

/**
 * Mídias de um post, no jeito do Instagram: carrossel com deslizar, contador e bolinhas;
 * tocar abre em tela cheia (com zoom de pinça e dois toques); dois toques no feed curtem.
 */
export function MediaCarousel({ midias, onDoubleLike }: { midias: Media[]; onDoubleLike?: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [ratio, setRatio] = useState<number | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);
  const [coracao, setCoracao] = useState(0);
  const toque = useRef<ReturnType<typeof setTimeout> | null>(null);
  const multi = midias.length > 1;

  const irPara = (i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  // um toque abre a mídia ampliada; dois toques seguidos curtem (como no Instagram)
  const clique = (i: number) => {
    if (toque.current) {
      clearTimeout(toque.current);
      toque.current = null;
      onDoubleLike?.();
      setCoracao((n) => n + 1);
      return;
    }
    toque.current = setTimeout(() => {
      toque.current = null;
      setAberto(i);
    }, 260);
  };
  useEffect(() => () => void (toque.current && clearTimeout(toque.current)), []);

  // proporção do carrossel = a da primeira mídia (entre 4:5 retrato e 1,91:1 paisagem)
  const alturaPor = ratio ? 1 / Math.min(1.91, Math.max(0.8, ratio)) : 1;

  return (
    <div className="relative select-none">
      <div
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-none"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {midias.map((m, i) => (
          <div key={`${m.url}:${i}`} className="relative w-full shrink-0 snap-center snap-always bg-black" style={{ aspectRatio: `1 / ${alturaPor}` }}>
            {m.kind === "image" ? (
              <img
                src={m.url}
                alt={multi ? `Foto ${i + 1} de ${midias.length}` : "Foto da publicação"}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
                className="h-full w-full cursor-zoom-in object-cover"
                onLoad={(e) => i === 0 && setRatio(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))}
                onClick={() => clique(i)}
              />
            ) : (
              <FeedVideo src={m.url} onMeta={(r) => i === 0 && setRatio(r)} onExpand={() => setAberto(i)} />
            )}
          </div>
        ))}
      </div>

      {coracao > 0 && (
        <span key={coracao} className="heart-burst pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <Heart size={96} className="fill-white text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]" />
        </span>
      )}

      {multi && (
        <>
          <span className="tabular pointer-events-none absolute top-2.5 right-2.5 rounded-full bg-black/65 px-2 py-0.5 text-xs font-semibold text-white">
            {idx + 1}/{midias.length}
          </span>
          {idx > 0 && (
            <button type="button" onClick={() => irPara(idx - 1)} className="absolute top-1/2 left-2 hidden -translate-y-1/2 rounded-full bg-white/85 p-1 text-black shadow sm:block" aria-label="Anterior">
              <ChevronLeft size={18} />
            </button>
          )}
          {idx < midias.length - 1 && (
            <button type="button" onClick={() => irPara(idx + 1)} className="absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-full bg-white/85 p-1 text-black shadow sm:block" aria-label="Próxima">
              <ChevronRight size={18} />
            </button>
          )}
          <div className="flex justify-center gap-1 pt-2" aria-hidden>
            {midias.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-4 bg-[var(--color-brand)]" : "w-1.5 bg-[var(--color-ink-3)]/50"}`} />
            ))}
          </div>
        </>
      )}

      {aberto != null && (
        <Lightbox
          midias={midias}
          inicio={aberto}
          onClose={(ultimo) => {
            setAberto(null);
            if (ultimo !== idx) {
              const el = track.current;
              if (el) el.scrollTo({ left: ultimo * el.clientWidth });
            }
          }}
        />
      )}
    </div>
  );
}

function FeedVideo({ src, onMeta, onExpand }: { src: string; onMeta?: (ratio: number) => void; onExpand: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  // reprodução automática muda ao entrar na tela; áudio só com o toque
  useEffect(() => {
    const v = ref.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.6 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <>
      <video
        ref={ref}
        src={src}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        className="h-full w-full bg-black object-contain"
        onLoadedMetadata={(e) => onMeta?.(e.currentTarget.videoWidth / Math.max(1, e.currentTarget.videoHeight))}
        onClick={() => {
          const v = ref.current!;
          v.muted = !muted;
          setMuted(!muted);
          if (!v.muted) void v.play();
        }}
      />
      <button type="button" className="absolute right-2 bottom-2 rounded-full bg-black/70 p-1.5 text-white" onClick={() => setMuted((m) => { const v = ref.current!; v.muted = !m; return !m; })} aria-label={muted ? "Ativar áudio" : "Silenciar"}>
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <button type="button" className="absolute bottom-2 left-2 rounded-full bg-black/70 p-1.5 text-white" onClick={onExpand} aria-label="Ver em tela cheia">
        <Expand size={16} />
      </button>
    </>
  );
}

/* ------------------------------ tela cheia ------------------------------ */

export function Lightbox({ midias, inicio, onClose }: { midias: Media[]; inicio: number; onClose: (ultimo: number) => void }) {
  useScrollLock();
  const track = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(inicio);
  const [zoom, setZoom] = useState(false);
  const [arrasto, setArrasto] = useState(0);
  const idxRef = useRef(inicio);
  idxRef.current = idx;
  const fechar = useCallback(() => onClose(idxRef.current), [onClose]);

  useLayoutEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = inicio * el.clientWidth;
  }, [inicio]);
  const irPara = useCallback((i: number) => {
    const el = track.current;
    if (!el || i < 0 || i >= midias.length) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }, [midias.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
      else if (e.key === "ArrowRight") irPara(idxRef.current + 1);
      else if (e.key === "ArrowLeft") irPara(idxRef.current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fechar, irPara]);

  const fundo = Math.max(0.35, 1 - arrasto / 400);
  return createPortal(
    <div className="tour-fade fixed inset-0 z-[90] flex flex-col" style={{ background: `rgb(0 0 0 / ${fundo})` }} role="dialog" aria-modal="true" aria-label="Mídia ampliada">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white" style={{ opacity: arrasto ? 0 : 1 }}>
        <span className="tabular rounded-full bg-white/10 px-2.5 py-0.5 text-sm font-semibold">{midias.length > 1 ? `${idx + 1} / ${midias.length}` : ""}</span>
        <button type="button" onClick={fechar} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Fechar">
          <X size={20} />
        </button>
      </div>
      <div
        ref={track}
        className={`flex h-full w-full snap-x snap-mandatory scrollbar-none ${zoom ? "overflow-hidden" : "overflow-x-auto"}`}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {midias.map((m, i) => (
          <div key={`${m.url}:${i}`} className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center overflow-hidden">
            {m.kind === "image" ? (
              <ZoomImage src={m.url} ativo={i === idx} onZoom={setZoom} onArrasto={setArrasto} onFechar={fechar} />
            ) : (
              <video src={m.url} controls playsInline autoPlay={i === idx} className="max-h-full max-w-full" />
            )}
          </div>
        ))}
      </div>
      {midias.length > 1 && !zoom && (
        <>
          {idx > 0 && (
            <button type="button" onClick={() => irPara(idx - 1)} className="absolute top-1/2 left-3 hidden -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25 sm:block" aria-label="Anterior">
              <ChevronLeft size={24} />
            </button>
          )}
          {idx < midias.length - 1 && (
            <button type="button" onClick={() => irPara(idx + 1)} className="absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25 sm:block" aria-label="Próxima">
              <ChevronRight size={24} />
            </button>
          )}
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 pb-[calc(1rem+env(safe-area-inset-bottom))]" aria-hidden>
            {midias.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-4 bg-white" : "w-1.5 bg-white/40"}`} />
            ))}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

const MAX_ZOOM = 4;

/** Foto com zoom: pinça, dois toques (ou duplo clique), roda do mouse; arrastar para baixo fecha. */
function ZoomImage({ src, ativo, onZoom, onArrasto, onFechar }: { src: string; ativo: boolean; onZoom: (z: boolean) => void; onArrasto: (dy: number) => void; onFechar: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const [dy, setDy] = useState(0);
  const [animando, setAnimando] = useState(false);
  const pontos = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ dist: number; s: number; x: number; y: number; cx: number; cy: number } | null>(null);
  const pan = useRef<{ px: number; py: number; x: number; y: number; vertical: boolean | null } | null>(null);
  const ultimoToque = useRef({ t: 0, x: 0, y: 0 });

  // ao sair da foto, volta ao tamanho normal
  useEffect(() => {
    if (!ativo) setT({ s: 1, x: 0, y: 0 });
  }, [ativo]);
  useEffect(() => onZoom(t.s > 1.01), [t.s, onZoom]);
  useEffect(() => onArrasto(dy), [dy, onArrasto]);

  const limita = useCallback((s: number, x: number, y: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return { s, x, y };
    const mx = ((s - 1) * r.width) / 2;
    const my = ((s - 1) * r.height) / 2;
    return { s, x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  }, []);

  /** zoom mantendo o ponto (px, py) da tela parado */
  const zoomEm = useCallback(
    (novo: number, px: number, py: number, base = t) => {
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      const s = Math.max(1, Math.min(MAX_ZOOM, novo));
      const ox = px - (r.left + r.width / 2);
      const oy = py - (r.top + r.height / 2);
      const k = s / base.s;
      setT(limita(s, ox - (ox - base.x) * k, oy - (oy - base.y) * k));
    },
    [limita, t],
  );

  const down = (e: RPointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pontos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setAnimando(false);
    if (pontos.current.size === 2) {
      const [a, b] = [...pontos.current.values()];
      gesto.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), s: t.s, x: t.x, y: t.y, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      pan.current = null;
    } else if (pontos.current.size === 1) {
      pan.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y, vertical: null };
    }
  };
  const move = (e: RPointerEvent) => {
    if (!pontos.current.has(e.pointerId)) return;
    pontos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pontos.current.size === 2 && gesto.current) {
      const [a, b] = [...pontos.current.values()];
      const g = gesto.current;
      zoomEm((g.s * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, g.dist), g.cx, g.cy, { s: g.s, x: g.x, y: g.y });
      return;
    }
    const p = pan.current;
    if (!p) return;
    const ddx = e.clientX - p.px;
    const ddy = e.clientY - p.py;
    if (t.s > 1.01) {
      setT(limita(t.s, p.x + ddx, p.y + ddy));
    } else {
      // sem zoom: arrastar para baixo fecha (o deslizar para os lados é da faixa de fotos)
      if (p.vertical == null && Math.hypot(ddx, ddy) > 8) p.vertical = Math.abs(ddy) > Math.abs(ddx);
      if (p.vertical) setDy(Math.max(0, ddy));
    }
  };
  const up = (e: RPointerEvent) => {
    const tinha = pontos.current.size;
    pontos.current.delete(e.pointerId);
    if (tinha === 2) {
      gesto.current = null;
      const resto = [...pontos.current.values()][0];
      if (resto) pan.current = { px: resto.x, py: resto.y, x: t.x, y: t.y, vertical: null };
      if (t.s < 1.05) setT({ s: 1, x: 0, y: 0 });
      return;
    }
    if (e.type === "pointercancel") {
      pan.current = null;
      setAnimando(true);
      setDy(0);
      return;
    }
    const p = pan.current;
    pan.current = null;
    if (dy > 110) return onFechar();
    if (dy) {
      setAnimando(true);
      setDy(0);
      return;
    }
    // dois toques rápidos no mesmo lugar: amplia ali / volta ao normal
    const mexeu = p ? Math.hypot(e.clientX - p.px, e.clientY - p.py) > 10 : true;
    if (mexeu) return;
    const agora = Date.now();
    const u = ultimoToque.current;
    if (agora - u.t < 300 && Math.hypot(e.clientX - u.x, e.clientY - u.y) < 30) {
      setAnimando(true);
      if (t.s > 1.01) setT({ s: 1, x: 0, y: 0 });
      else zoomEm(2.5, e.clientX, e.clientY);
      ultimoToque.current = { t: 0, x: 0, y: 0 };
    } else ultimoToque.current = { t: agora, x: e.clientX, y: e.clientY };
  };

  return (
    <div
      ref={box}
      className="flex h-full w-full items-center justify-center"
      style={{ touchAction: t.s > 1.01 ? "none" : "pan-x" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onWheel={(e) => {
        setAnimando(false);
        zoomEm(t.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className={`max-h-full max-w-full object-contain ${animando ? "transition-transform duration-200" : ""} ${t.s > 1.01 ? "cursor-grab" : "cursor-zoom-in"}`}
        style={{ transform: `translate(${t.x}px, ${t.y + dy}px) scale(${t.s * (1 - Math.min(dy, 300) / 1200)})` }}
      />
    </div>
  );
}
