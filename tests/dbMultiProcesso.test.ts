import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "cfc-multi-"));
const { Collection } = await import("../src/server/db");

type Linha = { id: string; v: number };
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("vários processos com o mesmo disco", () => {
  it("um processo com cópia velha não apaga o que o outro acabou de gravar", async () => {
    // dois "processos": duas instâncias da mesma coleção, cada uma com a sua memória
    const a = new Collection<Linha>("usuarios-teste");
    const b = new Collection<Linha>("usuarios-teste");
    a.put({ id: "dono", v: 1 });
    a.flush();
    expect(b.all().map((r) => r.id)).toEqual(["dono"]); // B carrega agora (fica com essa cópia)

    a.put({ id: "conta-nova", v: 1 }); // A cria uma conta
    a.flush();
    await espera(5);
    b.update("dono", { v: 2 }); // B grava outra coisa (ex.: último acesso do dono)
    b.flush();

    const disco = JSON.parse(readFileSync(join(process.env.DATA_DIR!, "db", "usuarios-teste.json"), "utf8")) as Linha[];
    expect(disco.map((r) => r.id).sort()).toEqual(["conta-nova", "dono"]);
    expect(disco.find((r) => r.id === "dono")?.v).toBe(2);
    // e A enxerga a mudança de B
    expect(a.get("dono")?.v).toBe(2);
  });

  it("apagar num processo vale no outro; mudança local ainda não gravada não se perde ao reler", async () => {
    const a = new Collection<Linha>("posts-teste");
    const b = new Collection<Linha>("posts-teste");
    a.put({ id: "p1", v: 1 });
    a.put({ id: "p2", v: 1 });
    a.flush();
    b.all();
    await espera(5);
    a.remove("p1");
    a.flush();
    b.put({ id: "p3", v: 1 }); // B relê o disco (sem p1) e mantém o p3 que ainda vai gravar
    expect(
      b
        .all()
        .map((r) => r.id)
        .sort(),
    ).toEqual(["p2", "p3"]);
    b.flush();
    expect(
      a
        .all()
        .map((r) => r.id)
        .sort(),
    ).toEqual(["p2", "p3"]);
  });
});
