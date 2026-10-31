import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CircleHelp, FlaskConical, Keyboard, Newspaper, PlayCircle, RefreshCw, Trophy, UserRound, Users } from "lucide-react";
import { useTour } from "../components/Tour";
import { CAPITULOS } from "../lib/tour";

export const Route = createFileRoute("/guia")({
  head: () => ({ meta: [{ title: "Guia do site — Tropa" }] }),
  component: GuiaPage,
});

const RAPIDO = [
  { n: "1", titulo: "Veja quem joga", texto: "Abra Prováveis e confira os titulares e as dúvidas de cada time.", to: "/provaveis" },
  { n: "2", titulo: "Monte a tropa", texto: "Em Escalar, escolha o estilo e as cartoletas. A escalação sai pronta.", to: "/escalacao" },
  { n: "3", titulo: "Acompanhe", texto: "Com a bola rolando, o Ao Vivo mostra as parciais na hora.", to: "/ao-vivo" },
] as const;

const MAIS = [
  { Icon: UserRound, nome: "Ficha do atleta", texto: "Chance de jogar, pontos previstos, piso, teto e os adversários que enfrentaram o próximo rival: quem da mesma posição já jogou contra ele, jogo a jogo.", to: "/" },
  { Icon: Trophy, nome: "Ligas", texto: "Classificação das suas ligas do Cartola.", to: "/ligas" },
  { Icon: Newspaper, nome: "Notícias", texto: "Desfalques, lesões e voltas, já ligadas aos atletas.", to: "/noticias" },
  { Icon: Users, nome: "Comunidade", texto: "Stories, enquetes e dicas da equipe Tropa.", to: "/comunidade" },
  { Icon: FlaskConical, nome: "Precisão do modelo", texto: "Quanto o Tropa acertou nas rodadas passadas, medido sem olhar o futuro.", to: "/modelo" },
] as const;

const TERMOS = [
  ["Pontos previstos", "Quanto o atleta deve fazer na rodada, em média, segundo o nosso modelo."],
  ["Chance de jogar", "Probabilidade de o atleta entrar em campo. Abaixo de 45% é arriscado."],
  ["Capitão", "Pontua 1,5×. Escolha alguém com alta chance de jogar e boa previsão."],
  ["Cartoletas (C$)", "O dinheiro do Cartola. Sua tropa precisa caber nesse orçamento."],
  ["Valorização", "Quanto o preço do atleta deve subir ou cair depois da rodada."],
  ["Cedência", "O quanto um time costuma entregar de pontos para cada posição adversária."],
  ["Conquistado × Cedido", "Quanto cada posição do time faz no mando dele × quanto o adversário entrega a ela. Laranja dos dois lados é encaixe bom."],
  ["Mitar", "Fazer uma pontuação muito acima da média. É o objetivo."],
] as const;

function GuiaPage() {
  const tour = useTour();
  return (
    <div className="space-y-8">
      <section className="hero-surface relative overflow-hidden p-5 sm:p-7">
        <span className="chip border-[var(--color-brand)]/40 text-[var(--color-brand)]">
          <CircleHelp size={13} aria-hidden /> Guia do site
        </span>
        <h1 className="font-display mt-3 text-3xl leading-tight font-extrabold sm:text-4xl">Conheça o Tropa na prática</h1>
        <p className="mt-2 max-w-xl text-[15px] text-[var(--color-ink-2)]">Cada ferramenta explicada em poucas palavras. Toque em “Mostrar na prática” e a gente leva você até ela, direto na tela de verdade.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary px-5 py-3 text-[15px]" onClick={() => tour.iniciar()}>
            <PlayCircle size={18} /> Fazer o tour completo
          </button>
          <span className="self-center text-xs text-[var(--color-ink-3)]">cerca de 1 minuto · dá para sair quando quiser</span>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold sm:text-2xl">Comece em 3 passos</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {RAPIDO.map((r, i) => (
            <Link key={r.n} to={r.to} className="card lift animate-rise group flex gap-3 p-4" style={{ ["--d" as string]: `${i * 70}ms` }}>
              <span className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-brand)] text-lg font-extrabold text-[#1a0a00]">{r.n}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-bold">
                  {r.titulo} <ArrowRight size={14} className="text-[var(--color-ink-3)] transition-transform group-hover:translate-x-1" />
                </span>
                <span className="mt-0.5 block text-sm text-[var(--color-ink-3)]">{r.texto}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold sm:text-2xl">Todas as ferramentas</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CAPITULOS.map((c, i) => (
            <article key={c.id} className="card animate-rise flex flex-col p-4" style={{ ["--d" as string]: `${i * 50}ms` }}>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-brand)]/15 text-[var(--color-brand)]">
                  <c.Icon size={21} aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold leading-tight">{c.nome}</h3>
                  <p className="text-xs text-[var(--color-ink-3)]">{c.resumo}</p>
                </div>
              </div>
              <ol className="mt-3 flex-1 space-y-1.5 text-sm text-[var(--color-ink-2)]">
                {c.passos.map((p, k) => (
                  <li key={p} className="flex gap-2">
                    <span className="tabular mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[11px] font-bold text-[var(--color-ink-3)]">{k + 1}</span>
                    {p}
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex gap-2">
                <button type="button" className="btn btn-primary flex-1 py-2" onClick={() => tour.iniciar(c.id)}>
                  <PlayCircle size={15} /> Mostrar na prática
                </button>
                <Link to={c.to} search={c.search as never} className="btn btn-ghost py-2">
                  Abrir
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold sm:text-2xl">E tem mais</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MAIS.map((m) => (
            <Link key={m.nome} to={m.to} className="card lift group flex items-start gap-3 p-3.5">
              <m.Icon size={18} className="mt-0.5 shrink-0 text-[var(--color-brand)]" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-bold">{m.nome}</span>
                <span className="block text-xs text-[var(--color-ink-3)]">{m.texto}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-5 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <h2 className="font-display text-xl font-bold sm:text-2xl">Palavras que você vai ver</h2>
          <dl className="card mt-3 divide-y divide-[var(--color-line)]">
            {TERMOS.map(([t, d]) => (
              <div key={t} className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[150px_1fr] sm:gap-4">
                <dt className="text-sm font-bold">{t}</dt>
                <dd className="text-sm text-[var(--color-ink-2)]">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h2 className="font-display text-xl font-bold sm:text-2xl">Dicas rápidas</h2>
          <ul className="mt-3 space-y-2">
            <li className="card flex gap-3 p-3.5 text-sm text-[var(--color-ink-2)]">
              <Keyboard size={18} className="mt-0.5 shrink-0 text-[var(--color-brand)]" aria-hidden />
              <span>
                Aperte <kbd className="rounded border border-[var(--color-line)] px-1.5 text-xs">/</kbd> ou <kbd className="rounded border border-[var(--color-line)] px-1.5 text-xs">Ctrl K</kbd> em qualquer página para buscar.
              </span>
            </li>
            <li className="card flex gap-3 p-3.5 text-sm text-[var(--color-ink-2)]">
              <RefreshCw size={18} className="mt-0.5 shrink-0 text-[var(--color-brand)]" aria-hidden />
              <span>Não precisa recarregar: quando sai notícia, muda o mercado ou começa o jogo, o site se atualiza sozinho.</span>
            </li>
            <li className="card flex gap-3 p-3.5 text-sm text-[var(--color-ink-2)]">
              <CircleHelp size={18} className="mt-0.5 shrink-0 text-[var(--color-brand)]" aria-hidden />
              <span>O botão ? no topo abre este guia e o tour a qualquer momento.</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
