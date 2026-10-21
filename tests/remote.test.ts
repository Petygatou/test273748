import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Redis falso que responde ao protocolo REST /pipeline do Upstash. */
const hashes = new Map<string, Map<string, string>>();
const strings = new Map<string, string>();
function exec([cmd, ...a]: Array<string | number>): unknown {
  const k = String(a[0]);
  switch (String(cmd).toUpperCase()) {
    case "MGET":
      return a.map((x) => strings.get(String(x)) ?? null);
    case "INCR": {
      const v = Number(strings.get(k) ?? 0) + 1;
      strings.set(k, String(v));
      return v;
    }
    case "HSET": {
      const h = hashes.get(k) ?? new Map();
      for (let i = 1; i < a.length; i += 2) h.set(String(a[i]), String(a[i + 1]));
      hashes.set(k, h);
      return (a.length - 1) / 2;
    }
    case "HDEL":
      return a.slice(1).filter((f) => hashes.get(k)?.delete(String(f))).length;
    case "HGETALL":
      return [...(hashes.get(k) ?? new Map())].flat();
  }
  throw new Error(`comando ${cmd}`);
}

const realFetch = globalThis.fetch;
beforeAll(() => {
  process.env.KV_REST_API_URL = "https://redis.test";
  process.env.KV_REST_API_TOKEN = "t";
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (!String(url).startsWith("https://redis.test")) return realFetch(url, init);
    const cmds = JSON.parse(String(init?.body)) as Array<Array<string | number>>;
    return new Response(JSON.stringify(cmds.map((c) => ({ result: exec(c) }))));
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

/** Cada chamada simula uma instância nova da Vercel: módulos e disco próprios. */
async function instancia() {
  vi.resetModules();
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "tropa-inst-"));
  return import("../src/server/db");
}

describe("banco compartilhado (Redis) entre instâncias", () => {
  it("post criado numa instância aparece na outra, e apagar vale para todas", async () => {
    const a = await instancia();
    const b = await instancia();

    await a.syncRemote();
    a.db.posts.put({ id: "p1", userId: "u", oficial: true, texto: "olá", criadoEm: "2026-10-20T00:00:00Z" });
    await a.flushRemote();

    await b.syncRemote();
    expect(b.db.posts.get("p1")?.texto).toBe("olá");

    b.db.posts.remove("p1");
    await b.flushRemote();

    await a.syncRemote();
    expect(a.db.posts.get("p1")).toBeUndefined();

    // uma instância nova (cold start) também não ressuscita o post
    const c = await instancia();
    await c.syncRemote();
    expect(c.db.posts.all()).toHaveLength(0);
  });

  it("mudanças paralelas em instâncias diferentes não se perdem", async () => {
    const a = await instancia();
    const b = await instancia();
    await a.syncRemote();
    await b.syncRemote();
    a.db.comments.put({ id: "c1", postId: "p", userId: "u1", texto: "de A", criadoEm: "x" });
    b.db.comments.put({ id: "c2", postId: "p", userId: "u2", texto: "de B", criadoEm: "x" });
    await a.flushRemote();
    await b.flushRemote();
    await a.syncRemote();
    await b.syncRemote();
    expect(a.db.comments.all().map((c) => c.id).sort()).toEqual(["c1", "c2"]);
    expect(b.db.comments.all().map((c) => c.id).sort()).toEqual(["c1", "c2"]);
  });
});
