import { describe, expect, it } from "vitest";
import { LISTA_LATERAIS } from "../src/data/ladosLista";
import type { PositionId } from "../src/engine/rules";
import type { Athlete, Club } from "../src/engine/types";
import { casarLista, mesclarLados } from "../src/server/ladosLista";

const SIGLAS = ["cor", "vas", "rbb", "pal", "bah", "gre", "san", "cam", "sao", "int", "flu", "bot", "cru", "fla", "vit", "mir", "rem", "cap", "cha", "cfc"];
const clubs: Record<number, Club> = Object.fromEntries(SIGLAS.map((s, i) => [i + 1, { id: i + 1, nome: s.toUpperCase(), abreviacao: s.toUpperCase() } as Club]));
const clube = (s: string) => SIGLAS.indexOf(s) + 1;
let prox = 1000;
const atleta = (apelido: string, sigla: string, posicaoId: PositionId = 2, nome?: string): Athlete =>
  ({ id: prox++, apelido, nome, clubeId: clube(sigla), posicaoId, statusId: 7, preco: 5, variacao: 0, media: 3, jogos: 10, pontosUltima: 0 }) as Athlete;

describe("lista de laterais da equipe", () => {
  it("a planilha virou 127 linhas válidas: 61 esquerdos e 66 direitos, siglas do Cartola", () => {
    expect(LISTA_LATERAIS).toHaveLength(127);
    expect(LISTA_LATERAIS.filter((l) => l[2] === "E")).toHaveLength(61);
    expect(LISTA_LATERAIS.filter((l) => l[2] === "D")).toHaveLength(66);
    const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (const [nome, sigla] of LISTA_LATERAIS) {
      expect(nome.length).toBeGreaterThan(2);
      if (sigla) expect(SIGLAS).toContain(sem(sigla));
    }
    // a única linha sem clube na planilha
    expect(LISTA_LATERAIS.filter((l) => !l[1]).map((l) => l[0])).toEqual(["nicolas_pontes"]);
  });

  it("casa nome com acento, espaço, “_” e apóstrofo dentro do clube; homônimos de clubes diferentes não se confundem", () => {
    const bidu = atleta("Matheus Bidu", "cor");
    const enzo = atleta("Enzo Díaz", "sao");
    const leo = atleta("Léo Derik", "cap");
    const santana = atleta("Sant'Anna", "rbb");
    const marlonGre = atleta("Marlon", "gre");
    const marlonRem = atleta("Marlon", "rem");
    const vitinhoCap = atleta("Vitinho", "cap");
    const vitinhoBot = atleta("Vitinho", "bot");
    const lucasRamon = atleta("Lucas Ramon", "sao");
    const r = casarLista([bidu, enzo, leo, santana, marlonGre, marlonRem, vitinhoCap, vitinhoBot, lucasRamon], clubs, [
      ["matheus_bidu", "cor", "E"],
      ["enzo díaz", "sao", "E"],
      ["Léo_Derik", "cap", "E"],
      ["sant'anna", "rbb", "D"],
      ["marlon", "gre", "E"],
      ["marlon", "rem", "D"],
      ["vitinho", "cap", "D"],
      ["vitinho", "bot", "E"],
      ["lucas_ramon", "são", "D"],
    ]);
    expect(r.lados).toEqual({
      [bidu.id]: "E",
      [enzo.id]: "E",
      [leo.id]: "E",
      [santana.id]: "D",
      [marlonGre.id]: "E",
      [marlonRem.id]: "D",
      [vitinhoCap.id]: "D",
      [vitinhoBot.id]: "E",
      [lucasRamon.id]: "D",
    });
    expect(r.semPar).toEqual([]);
    expect(r.nomes[leo.id]).toBe("Léo Derik");
  });

  it("sem clube ou com clube desatualizado: só nome idêntico e único entre todos os laterais", () => {
    const pontes = atleta("Nicolas Pontes", "mir");
    const rene = atleta("Renê", "vit"); // a lista diz FLU
    const marlonA = atleta("Marlon", "gre");
    const marlonB = atleta("Marlon", "rem");
    const ramon = atleta("Ramon", "vit");
    const juba = atleta("Juba", "bah", 2, "Luciano Juba Pereira");
    const r = casarLista([pontes, rene, marlonA, marlonB, ramon, juba], clubs, [
      ["nicolas_pontes", null, "D"],
      ["renê", "flu", "E"],
      ["marlon", "cor", "E"], // dois Marlon fora do COR: não chuta
      ["lucas_ramon", "sao", "D"], // não é o Ramon do VIT só por causa do sobrenome
      ["luciano_juba", "cor", "E"], // nome completo com todas as palavras, único
    ]);
    expect(r.lados).toEqual({ [pontes.id]: "D", [rene.id]: "E", [juba.id]: "E" });
    expect(r.semPar.map((x) => x.nome)).toEqual(["marlon", "lucas ramon"]);
  });

  it("explica o que não casou: outra posição no Cartola, nome ausente, clube inexistente", () => {
    const hugo = atleta("Hugo", "cor", 3);
    const fagner = atleta("Fagner", "cru");
    const r = casarLista([hugo, fagner], clubs, [
      ["hugo", "cor", "E"],
      ["fulano_de_tal", "pal", "D"],
      ["ciclano", "xyz", "D"],
      ["fagner", "xyz", "D"], // sigla errada, mas o nome é único entre os laterais
    ]);
    expect(r.semPar.map((x) => x.motivo)).toEqual(["no Cartola Hugo é zagueiro, não lateral", "nenhum lateral do PAL com esse nome no Cartola", "clube “xyz” não existe no Cartola"]);
    expect(r.lados).toEqual({ [fagner.id]: "D" });
  });

  it("dois nomes da lista no mesmo atleta com lados diferentes: fica o primeiro e avisa", () => {
    const g = atleta("Gilberto", "cap", 2, "Gilberto Moraes Júnior");
    const r = casarLista([g], clubs, [
      ["gilberto", "cap", "D"],
      ["gilberto_junior", "cap", "E"],
    ]);
    expect(r.lados).toEqual({ [g.id]: "D" });
    expect(r.conflitos).toEqual([{ atletaId: g.id, nomes: ["gilberto", "gilberto junior"] }]);
  });
});

describe("prioridade das fontes do lado", () => {
  const auto = {
    porAtleta: { 1: { lado: "E" as const }, 2: { lado: "E" as const }, 3: { lado: "D" as const }, 4: { lado: null } },
    porJogo: { "10:1": "D" as const, "10:2": "E" as const, "11:2": "D" as const, "10:3": "D" as const },
  };
  it("correção à mão > lista da equipe > escalações; lista e correção valem em todos os jogos", () => {
    const { lados, ladosJogo } = mesclarLados(auto, { 2: "D", 4: "E", 5: "D" }, { 3: "E" });
    expect(lados).toEqual({ 1: "E", 2: "D", 3: "E", 4: "E", 5: "D" });
    // o lado jogo a jogo só fica para quem não está na lista nem foi corrigido
    expect(ladosJogo).toEqual({ "10:1": "D" });
  });
  it("sem descoberta automática (demonstração), lista e correção ainda valem", () => {
    expect(mesclarLados(null, { 7: "E" }, { 8: "D" })).toEqual({ lados: { 7: "E", 8: "D" }, ladosJogo: {} });
  });
});
