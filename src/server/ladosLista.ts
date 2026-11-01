/**
 * Lado dos laterais pela lista da equipe (src/data/ladosLista.ts).
 *
 * Cada linha da lista traz nome, sigla do clube e lado. Aqui cada linha é casada com um
 * lateral do Cartola: primeiro no elenco do clube da lista; se não achar (atleta que trocou
 * de time, sigla ausente), só com nome idêntico e único entre todos os laterais. O que não
 * casar fica numa lista "sem par" com o motivo, para a equipe conferir no Painel ADM.
 */
import { LISTA_LATERAIS, type LinhaLista } from "../data/ladosLista";
import { POSITIONS } from "../engine/rules";
import type { Athlete, Club, LadoLateral } from "../engine/types";
import { matchPlayer, norm } from "./escalacoes";

export interface ResultadoLista {
  /** atletaId → lado da lista */
  lados: Record<number, LadoLateral>;
  /** atletaId → nome como está na lista */
  nomes: Record<number, string>;
  total: number;
  semPar: Array<{ nome: string; clube: string | null; lado: LadoLateral; motivo: string }>;
  /** dois nomes da lista que caíram no mesmo atleta com lados diferentes (fica o primeiro) */
  conflitos: Array<{ atletaId: number; nomes: string[] }>;
}

const legivel = (nome: string) => nome.replace(/_/g, " ").replace(/\s+/g, " ").trim();

export function casarLista(athletes: Athlete[], clubs: Record<number, Club>, lista: readonly LinhaLista[] = LISTA_LATERAIS): ResultadoLista {
  const laterais = athletes.filter((a) => a.posicaoId === 2);
  const porSigla = new Map(Object.values(clubs).map((c) => [norm(c.abreviacao), c] as const));
  const out: ResultadoLista = { lados: {}, nomes: {}, total: lista.length, semPar: [], conflitos: [] };
  for (const [bruto, sigla, lado] of lista) {
    const nome = legivel(bruto);
    const n = norm(nome);
    const clube = sigla ? porSigla.get(norm(sigla)) : undefined;
    let a: Athlete | null = clube
      ? matchPlayer(
          nome,
          laterais.filter((x) => x.clubeId === clube.id),
        )
      : null;
    if (!a) {
      // fora do clube da lista (sigla ausente ou atleta que trocou de time): só nome idêntico e
      // único; nome composto também casa com o nome completo que tem todas as palavras dele
      const palavras = n.split(" ");
      const exatos = laterais.filter((x) => norm(x.apelido) === n || norm(x.nome ?? "") === n);
      const completos =
        palavras.length > 1
          ? laterais.filter((x) =>
              palavras.every((p) =>
                norm(x.nome ?? "")
                  .split(" ")
                  .includes(p),
              ),
            )
          : [];
      a = exatos.length === 1 ? exatos[0] : !exatos.length && completos.length === 1 ? completos[0] : null;
    }
    if (!a) {
      const outro = clube
        ? matchPlayer(
            nome,
            athletes.filter((x) => x.clubeId === clube.id && x.posicaoId !== 2),
          )
        : null;
      const motivo =
        sigla && !clube
          ? `clube “${sigla}” não existe no Cartola`
          : outro
            ? `no Cartola ${outro.apelido} é ${POSITIONS[outro.posicaoId].name.toLowerCase()}, não lateral`
            : clube
              ? `nenhum lateral do ${clube.abreviacao} com esse nome no Cartola`
              : "sem clube na lista e nome não achado entre os laterais";
      out.semPar.push({ nome, clube: sigla, lado, motivo });
      continue;
    }
    const antes = out.lados[a.id];
    if (antes && antes !== lado) {
      const c = out.conflitos.find((x) => x.atletaId === a!.id);
      if (c) c.nomes.push(nome);
      else out.conflitos.push({ atletaId: a.id, nomes: [out.nomes[a.id], nome] });
      continue;
    }
    out.lados[a.id] = lado;
    out.nomes[a.id] ??= nome;
  }
  return out;
}

/**
 * Junta as três fontes do lado, da mais fraca para a mais forte: escalações (jogo a jogo),
 * lista da equipe e correção à mão. Quem está na lista ou foi corrigido tem um lado só,
 * que vale em todos os jogos (o lado jogo a jogo das escalações deixa de valer para ele).
 */
export function mesclarLados(
  auto: { porAtleta: Record<number, { lado?: LadoLateral | null }>; porJogo: Record<string, LadoLateral> } | null,
  lista: Record<number, LadoLateral> | null,
  manuais: Record<number, LadoLateral>,
) {
  const lados: Record<number, LadoLateral> = {};
  const ladosJogo: Record<string, LadoLateral> = {};
  if (auto) {
    for (const [id, s] of Object.entries(auto.porAtleta)) if (s.lado) lados[Number(id)] = s.lado;
    for (const [k, v] of Object.entries(auto.porJogo)) {
      const id = Number(k.split(":")[1]);
      if (!(id in manuais) && !(lista && id in lista)) ladosJogo[k] = v;
    }
  }
  Object.assign(lados, lista ?? {}, manuais);
  return { lados, ladosJogo };
}

let memo: { chave: string; valor: ResultadoLista } | null = null;

/** A lista casada com os laterais atuais (refeita só quando o elenco de laterais muda). */
export function ladosDaLista(athletes: Athlete[], clubs: Record<number, Club>): ResultadoLista & { chave: string } {
  let h = 0;
  for (const a of athletes) if (a.posicaoId === 2) for (const ch of `${a.id}:${a.clubeId}:${a.apelido};`) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  const chave = `${LISTA_LATERAIS.length}:${(h >>> 0).toString(36)}`;
  if (memo?.chave !== chave) memo = { chave, valor: casarLista(athletes, clubs) };
  return { ...memo.valor, chave };
}
