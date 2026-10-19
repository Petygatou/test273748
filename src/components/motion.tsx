import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Número que sobe até o valor quando aparece na tela (e salta quando muda). */
export function CountUp({ value, format = (x) => String(Math.round(x)), ms = 700 }: { value: number; format?: (x: number) => string; ms?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    if (reduced()) {
      setShown(value);
      return;
    }
    const start = mounted.current ? from.current : 0;
    mounted.current = true;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const v = start + (value - start) * e;
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className="tabular">{format(shown)}</span>;
}

/** Relógio que bate a cada segundo, só no navegador (evita diferença com o servidor). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function parts(diff: number) {
  const s = Math.max(0, Math.floor(diff / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Contagem regressiva ao vivo: dias, horas, minutos e segundos. */
export function Countdown({ to, label = "Mercado fecha em" }: { to?: string | null; label?: string }) {
  const now = useNow();
  if (!to) return null;
  const target = new Date(to).getTime();
  const p = now == null ? null : parts(target - now);
  const box = (v: number | undefined, u: string, key: string) => (
    <span className="flex min-w-[2.6rem] flex-col items-center rounded-xl border border-[var(--color-line)] bg-black/30 px-2 py-1.5">
      <span key={key} className="font-display tabular animate-tick text-lg leading-none font-bold sm:text-xl">
        {v == null ? "--" : String(v).padStart(2, "0")}
      </span>
      <span className="mt-0.5 text-[9px] font-semibold tracking-widest text-[var(--color-ink-3)] uppercase">{u}</span>
    </span>
  );
  const done = p != null && target - (now ?? 0) <= 0;
  return (
    <div className="flex flex-wrap items-center gap-2" role="timer" aria-label={p ? `${label} ${p.d} dias, ${p.h} horas e ${p.m} minutos` : label}>
      <span className="text-xs font-semibold text-[var(--color-ink-2)]">{done ? "Mercado fechado" : label}</span>
      {!done && (
        <span className="flex gap-1.5">
          {(p?.d ?? 1) > 0 && box(p?.d, "dias", `d${p?.d}`)}
          {box(p?.h, "h", `h${p?.h}`)}
          {box(p?.m, "min", `m${p?.m}`)}
          {box(p?.s, "seg", `s${p?.s}`)}
        </span>
      )}
    </div>
  );
}
