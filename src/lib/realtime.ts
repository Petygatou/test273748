/** Tempo real: escuta /api/events (SSE) e chama o callback quando um tópico muda. */
import { useEffect, useRef } from "react";

type Listener = (topic: string) => void;
const listeners = new Set<Listener>();
let source: EventSource | null = null;

function ensure() {
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource("/api/events");
  source.addEventListener("change", (e) => {
    const topic = (e as MessageEvent).data as string;
    if (topic !== "ping") listeners.forEach((l) => l(topic));
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
      if (!key.split(",").includes(topic)) return;
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
