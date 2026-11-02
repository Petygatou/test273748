/**
 * Tempo real: escuta /api/events (SSE) e chama o callback quando um tópico muda.
 * Sem SSE (na Vercel o servidor responde 204), cai para uma consulta leve: a cada 3 min
 * com a aba visível e ao voltar para a aba.
 */
import { useEffect, useRef } from "react";

type Listener = (topic: string) => void;
const listeners = new Set<Listener>();
let source: EventSource | null = null;
let reserva = false;
let ultimo = Date.now();
const TODOS = "*";
const avisarTodos = () => {
  ultimo = Date.now();
  listeners.forEach((l) => l(TODOS));
};

/** Consulta periódica no lugar do SSE: só com a aba visível. */
function ligarReserva() {
  if (reserva || typeof document === "undefined") return;
  reserva = true;
  setInterval(() => document.visibilityState === "visible" && avisarTodos(), 3 * 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - ultimo > 60_000) avisarTodos();
  });
}

function ensure() {
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource("/api/events");
  source.addEventListener("change", (e) => {
    const topic = (e as MessageEvent).data as string;
    if (topic !== "ping") listeners.forEach((l) => l(topic));
  });
  source.addEventListener("error", () => {
    if (source?.readyState === EventSource.CLOSED) ligarReserva();
  });
}

export function useRealtime(topics: string[], cb: () => void) {
  const ref = useRef(cb);
  ref.current = cb;
  const key = topics.join(",");
  useEffect(() => {
    ensure();
    let t: ReturnType<typeof setTimeout> | null = null;
    const l: Listener = (topic) => {
      if (topic !== TODOS && !key.split(",").includes(topic)) return;
      // agrupa rajadas de eventos (ex.: curtida + contagem)
      if (t) clearTimeout(t);
      t = setTimeout(() => ref.current(), 150);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
      if (t) clearTimeout(t);
    };
  }, [key]);
}
