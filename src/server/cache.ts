/** Cache em memória com TTL e deduplicação de requisições em andamento (SWR no servidor). */
interface Entry<T> {
  value?: T;
  expires: number;
  inflight?: Promise<T>;
}

const store = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, opts: { staleOnError?: boolean } = {}): Promise<T> {
  const now = Date.now();
  const e = store.get(key) as Entry<T> | undefined;
  if (e?.value !== undefined && e.expires > now) return e.value;
  if (e?.inflight) return e.inflight;
  const p = fn()
    .then((v) => {
      store.set(key, { value: v, expires: Date.now() + ttlMs });
      return v;
    })
    .catch((err) => {
      const prev = store.get(key) as Entry<T> | undefined;
      if (opts.staleOnError !== false && prev?.value !== undefined) {
        store.set(key, { value: prev.value, expires: Date.now() + Math.min(ttlMs, 30_000) });
        return prev.value;
      }
      store.delete(key);
      throw err;
    });
  store.set(key, { value: e?.value, expires: e?.expires ?? 0, inflight: p });
  return p;
}

export function invalidate(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

/** Executa tarefas com limite de concorrência. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}
