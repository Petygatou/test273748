import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Bell, ClipboardList, Megaphone, Shield, Trash2 } from "lucide-react";
import { useState } from "react";
import { AskButton } from "../components/AskButton";
import { AdminUsers } from "../components/AdminUsers";
import { PlayerSearch } from "../components/PlayerSearch";
import { StoryComposer } from "../components/Stories";
import { Alert, Card, ErrorBox, PageSkeleton, PlayerPhoto, PosBadge, SectionTitle, Seg, StatusPill } from "../components/ui";
import type { LineupOverride, RoundAnalysis } from "../engine/types";
import { createAlert, deleteAlert, useAlerts, type AlertKind } from "../lib/alerts";
import { meQuery, useAuth } from "../lib/auth";
import { OFFICIAL_AUTHOR, getCommunity } from "../lib/community";
import { countdown, fmt1, pct, timeAgo } from "../lib/format";
import { analysisQuery } from "../lib/queries";
import { saveLineupOverride } from "../server/fns";
import { Composer } from "../components/Composer";

export const Route = createFileRoute("/admin")({
  // o painel não existe para quem não é administrador
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(meQuery).catch(() => null);
    if (!me?.admin) throw redirect({ to: "/" });
  },
  component: AdminPage,
});

type Tab = "usuarios" | "provaveis" | "conteudo" | "alertas" | "dados";

function AdminPage() {
  const auth = useAuth();
  const an = useQuery(analysisQuery);
  const [tab, setTab] = useState<Tab>("provaveis");
  // sem dados reais, a única coisa útil no painel é descobrir por quê
  const tabEff: Tab = an.isError && tab === "provaveis" ? "dados" : tab;

  if (!auth.ready) return <PageSkeleton />;
  if (!auth.isAdmin) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold">
            <Shield size={22} className="text-[var(--color-brand)]" /> Painel ADM
          </h1>
          <p className="text-sm text-[var(--color-ink-3)]">Prováveis escalações (alimentam o modelo), conteúdo oficial e alertas de mercado.</p>
        </div>
        <Seg
          label="Seção"
          value={tabEff}
          onChange={setTab}
          options={[
            { value: "provaveis", label: "Prováveis" },
            { value: "conteudo", label: "Conteúdo" },
            { value: "alertas", label: "Alertas" },
            { value: "usuarios", label: "Usuários" },
            { value: "dados", label: "Dados reais" },
          ]}
        />
      </div>
      {tabEff === "provaveis" && (an.isLoading ? <PageSkeleton /> : an.error || !an.data ? <ErrorBox error={an.error} /> : <Provaveis a={an.data.analysis} />)}
      {tabEff === "conteudo" && <Conteudo />}
      {tabEff === "dados" && <Dados meta={an.data?.meta} />}
      {tabEff === "usuarios" && <AdminUsers />}
      {tabEff === "alertas" && <Alertas a={an.data?.analysis} fechamento={an.data?.meta.fechamento} />}
    </div>
  );
}

const OVERRIDES: Array<{ value: LineupOverride; label: string }> = [
  { value: "titular", label: "Titular" },
  { value: "reserva", label: "Reserva" },
  { value: "duvida", label: "Dúvida" },
  { value: "fora", label: "Fora" },
];

function Provaveis({ a }: { a: RoundAnalysis }) {
  const qc = useQueryClient();
  const clubs = Object.values(a.clubs).sort((x, y) => x.nome.localeCompare(y.nome));
  const [club, setClub] = useState(clubs[0]?.id);
  const [saving, setSaving] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const players = a.players.filter((p) => p.clubeId === club && p.posicaoId !== 6).sort((x, y) => x.posicaoId - y.posicaoId || y.pJogar - x.pJogar);

  const save = async (atletaId: number, status: LineupOverride | null) => {
    setSaving(atletaId);
    setErro(null);
    try {
      await saveLineupOverride({ data: { atletaId, status } });
      await qc.invalidateQueries({ queryKey: analysisQuery.queryKey });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card className="p-3 sm:p-4">
      <SectionTitle
        title="Prováveis escalações"
        subtitle="Marque titulares, reservas, dúvidas e fora. O modelo recalcula a chance de jogar e todas as projeções na hora."
        icon={<ClipboardList size={18} className="text-[var(--color-brand)]" />}
        right={
          <select className="input w-48" value={club} onChange={(e) => setClub(Number(e.target.value))} aria-label="Clube">
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        }
      />
      <PlayerSearch
        className="mb-3"
        players={a.players.filter((p) => p.posicaoId !== 6)}
        clubs={a.clubs}
        placeholder="Ir direto para um atleta ou clube"
        label="Buscar atleta"
        onSelect={(p) => {
          setClub(p.clubeId);
          setTimeout(() => document.getElementById(`ov-${p.atletaId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
        }}
      />
      {erro && (
        <div className="mb-3">
          <Alert tone="critical">{erro}</Alert>
        </div>
      )}
      <ul className="divide-y divide-[var(--color-line)]">
        {players.map((p) => (
          <li key={p.atletaId} id={`ov-${p.atletaId}`} className="flex scroll-mt-32 flex-wrap items-center gap-2 py-2">
            <PosBadge pos={p.posicaoId} />
            <PlayerPhoto p={p} size={28} />
            <div className="min-w-[140px] flex-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                {p.apelido} <StatusPill status={p.statusId} compact />
              </div>
              <div className="tabular text-[11px] text-[var(--color-ink-3)]">
                joga {pct(p.pJogar)} · xP {fmt1(p.xP)}
              </div>
            </div>
            <div className="seg" role="group" aria-label={`Status de ${p.apelido}`}>
              {OVERRIDES.map((o) => (
                <button key={o.value} aria-pressed={p.override === o.value} disabled={saving === p.atletaId} onClick={() => save(p.atletaId, p.override === o.value ? null : o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Conteudo() {
  const backend = getCommunity();
  const [story, setStory] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <SectionTitle title="Publicar novidade oficial" subtitle="Aparece no feed com o selo oficial do Tropa" icon={<Megaphone size={18} className="text-[var(--color-gold)]" />} right={<button className="btn btn-ghost" onClick={() => setStory(true)}>Story institucional</button>} />
      {msg && <Alert tone="info">{msg}</Alert>}
      <Composer
        me={OFFICIAL_AUTHOR}
        oficial
        onPublish={async (p) => {
          await backend.createPost(p, OFFICIAL_AUTHOR);
          setMsg("Publicado no feed.");
        }}
      />
      {story && (
        <StoryComposer
          onClose={() => setStory(false)}
          onPublish={async (s) => {
            await backend.createStory(s, OFFICIAL_AUTHOR);
            setMsg("Story institucional publicado.");
          }}
        />
      )}
    </div>
  );
}

function Alertas({ a, fechamento }: { a?: RoundAnalysis; fechamento?: string }) {
  const { alerts } = useAlerts();
  const [tipo, setTipo] = useState<AlertKind>("fechamento");
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const facts = () => ({
    tipo,
    rodada: a?.rodada,
    fechamentoEm: fechamento,
    faltam: countdown(fechamento),
    atletasComAlerta: a?.players
      .filter((p) => p.pJogar > 0.3 && p.alertas.length)
      .slice(0, 12)
      .map((p) => ({ atleta: p.apelido, clube: a.clubs[p.clubeId]?.nome, alertas: p.alertas, xP: p.xP })),
    lesionadosOuSuspensosRelevantes: a?.players
      .filter((p) => (p.statusId === 5 || p.statusId === 3) && p.media > 4)
      .slice(0, 10)
      .map((p) => ({ atleta: p.apelido, clube: a.clubs[p.clubeId]?.nome, status: p.statusId === 5 ? "contundido" : "suspenso", media: p.media })),
  });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3 p-4">
        <SectionTitle title="Disparar alerta de mercado" icon={<Bell size={18} className="text-[var(--color-warning)]" />} />
        <Seg
          label="Tipo"
          value={tipo}
          onChange={setTipo}
          options={[
            { value: "fechamento", label: "Fechamento" },
            { value: "lesao", label: "Lesão" },
            { value: "desfalque", label: "Desfalque" },
            { value: "geral", label: "Geral" },
          ]}
        />
        <input className="input" placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={90} aria-label="Título do alerta" />
        <textarea className="input min-h-[90px]" placeholder="Mensagem" value={mensagem} onChange={(e) => setMensagem(e.target.value)} maxLength={600} aria-label="Mensagem do alerta" />
        {erro && <Alert tone="critical">{erro}</Alert>}
        <div className="flex flex-wrap gap-2">
          <AskButton
            label="Preparar texto com Comandante"
            payload={() => ({ titulo: "Texto de alerta", pergunta: `Escreva um alerta curto (título de até 80 caracteres + mensagem de até 3 frases) do tipo "${tipo}" para os cartoleiros, usando só os fatos do contexto.`, contexto: facts() })}
          />
          <AskButton
            label="Revisar alerta"
            payload={() => ({ titulo: "Revisão de alerta", pergunta: "Revise este alerta: clareza, tom, erros e se algum fato contradiz os dados do motor. Devolva a versão final.", contexto: { rascunho: { tipo, titulo, mensagem }, fatos: facts() } })}
          />
          <button
            className="btn btn-primary ml-auto"
            disabled={!titulo.trim() || !mensagem.trim()}
            onClick={async () => {
              setErro(null);
              try {
                await createAlert({ tipo, titulo: titulo.trim(), mensagem: mensagem.trim() });
                setTitulo("");
                setMensagem("");
              } catch (e) {
                setErro(e instanceof Error ? e.message : "Falha ao publicar");
              }
            }}
          >
            Disparar
          </button>
        </div>
      </Card>
      <Card className="p-4">
        <SectionTitle title="Alertas ativos" subtitle="Últimas 72 horas · aparecem no topo do Início" />
        <ul className="space-y-2">
          {alerts.map((al) => (
            <li key={al.id} className="flex items-start gap-2 rounded-xl border border-[var(--color-line)] p-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{al.titulo}</div>
                <div className="text-xs text-[var(--color-ink-2)]">{al.mensagem}</div>
                <div className="mt-1 text-[10px] text-[var(--color-ink-3)] uppercase">
                  {al.tipo} · {timeAgo(al.criadoEm)}
                </div>
              </div>
              <button className="text-[var(--color-ink-3)] hover:text-[var(--color-critical-ink)]" onClick={() => deleteAlert(al.id)} aria-label="Excluir alerta">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
          {!alerts.length && <li className="text-sm text-[var(--color-ink-3)]">Nenhum alerta ativo.</li>}
        </ul>
      </Card>
    </div>
  );
}

interface Probe {
  hosts: Array<{ host: string; ok: boolean; status?: number; ms: number; leitura: string; trecho?: string; server?: string }>;
  proxy: boolean;
  variaveis: Record<string, string | null>;
  fotos: { atletas: number; comFoto: number; exemplo?: string; servidor: string; leitura: string; apiFootball?: { mapeadas: number; timesLidos: number; timesTotal: number; naoCasados: number; modo: string; temporadaFoto: number | null; erro: string | null } } | null;
  escalacao: {
    ligada: boolean;
    jogosComEscalacao: number;
    usadas: number;
    limite: number;
    restantesNaApi: number | null;
    ultimaChamada: string | null;
    erro: string | null;
    chave: { ok: boolean; leitura: string };
    jogos: Array<{ id: number; quando: string; mandante: string; visitante: string; situacao: "oficial" | "esgotado" | "aguardando" | "buscando"; tentativas: number }>;
  } | null;
}

function Dados({ meta }: { meta?: { source: string; importadoEm?: string; rodada: number } }) {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const run = async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch("/api/diagnostico");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setProbe(await res.json());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle title="De onde vêm os dados" subtitle="O site só usa dados reais do Cartola" icon={<Shield size={18} className="text-[var(--color-brand)]" />} />
        <p className="text-sm text-[var(--color-ink-2)]">
          {meta?.source === "cartola"
            ? meta.importadoEm
              ? `Dados reais da rodada ${meta.rodada}, enviados de outro computador ${timeAgo(meta.importadoEm)}.`
              : `Dados reais da rodada ${meta.rodada}, direto da API do Cartola.`
            : "Sem dados reais no momento. Teste a conexão abaixo."}
        </p>
        <button className="btn btn-primary mt-3" onClick={run} disabled={loading}>
          {loading ? "Testando…" : "Testar conexão com a Globo"}
        </button>
        {erro && <p className="mt-2 text-sm text-[var(--color-critical-ink)]">{erro}</p>}
      </Card>
      {probe && (
        <Card className="space-y-3 p-4">
          {probe.hosts.map((h) => (
            <div key={h.host} className={`rounded-xl border p-3 ${h.ok ? "border-[var(--color-good)]/40" : "border-[var(--color-critical)]/40"}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span className={h.ok ? "text-[var(--color-good-ink)]" : "text-[var(--color-critical-ink)]"}>{h.ok ? "● conectou" : "● falhou"}</span>
                <code className="break-all text-xs">{h.host}</code>
                <span className="tabular text-xs text-[var(--color-ink-3)]">
                  {h.status ? `HTTP ${h.status} · ` : ""}
                  {h.ms} ms
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--color-ink-2)]">{h.leitura}</p>
              {h.trecho && <code className="mt-1 block max-h-16 overflow-hidden rounded bg-black/30 p-1.5 text-[11px] break-all text-[var(--color-ink-3)]">{h.trecho}</code>}
            </div>
          ))}
          {probe.escalacao && (
            <div className={`rounded-xl border p-3 ${probe.escalacao.chave.ok && !probe.escalacao.erro ? "border-[var(--color-good)]/40" : "border-[var(--color-warning)]/40"}`}>
              <div className="text-sm font-semibold">Escalação oficial (API-Football)</div>
              <p className={`mt-1 text-sm ${probe.escalacao.chave.ok ? "text-[var(--color-good-ink)]" : "text-[var(--color-warning)]"}`}>{probe.escalacao.chave.ok ? "● " : "● "}{probe.escalacao.chave.leitura}</p>
              {probe.escalacao.ligada && (
                <p className="mt-1 text-xs text-[var(--color-ink-3)]">
                  Gasto por este site hoje: <b>{probe.escalacao.usadas}</b> de {probe.escalacao.limite} (teto) · jogos com súmula oficial: {probe.escalacao.jogosComEscalacao}
                  {probe.escalacao.ultimaChamada ? ` · última consulta ${timeAgo(probe.escalacao.ultimaChamada)}` : " · ainda não consultou (só começa 75 min antes de um jogo)"}.
                  {probe.escalacao.erro ? ` Último erro: ${probe.escalacao.erro}` : ""}
                </p>
              )}
              {probe.escalacao.jogos.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {probe.escalacao.jogos.map((j) => (
                    <li key={j.id} className="flex items-center gap-2">
                      <span className="tabular w-28 shrink-0 text-[var(--color-ink-3)]">{new Date(j.quando).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</span>
                      <span className="flex-1 font-semibold">
                        {j.mandante} x {j.visitante}
                      </span>
                      <span className={`chip text-[10px] ${j.situacao === "oficial" ? "text-[var(--color-good-ink)]" : ""}`}>
                        {j.situacao === "oficial" ? "✓ súmula oficial" : j.situacao === "buscando" ? `buscando (${j.tentativas}ª)` : j.situacao === "esgotado" ? "não saiu a tempo" : "aguardando a janela"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {probe.fotos && (
            <div className={`rounded-xl border p-3 ${probe.fotos.servidor === "ok" ? "border-[var(--color-good)]/40" : "border-[var(--color-warning)]/40"}`}>
              <div className="text-sm font-semibold">Fotos dos atletas</div>
              <p className="mt-1 text-sm text-[var(--color-ink-2)]">{probe.fotos.leitura}</p>
              {probe.fotos.apiFootball && (
                <p className="mt-1 text-xs text-[var(--color-ink-3)]">
                  Rostos reais da API-Football: <b>{probe.fotos.apiFootball.mapeadas}</b> atletas · {probe.fotos.apiFootball.timesLidos} de {probe.fotos.apiFootball.timesTotal || "?"} times lidos (1 chamada por minuto)
                  {probe.fotos.apiFootball.temporadaFoto ? ` · usando a temporada ${probe.fotos.apiFootball.temporadaFoto}, a que o plano gratuito libera (contratados depois dela ficam com o desenho)` : ""}
                  {probe.fotos.apiFootball.naoCasados ? ` · ${probe.fotos.apiFootball.naoCasados} nomes sem par` : ""}.
                  {probe.fotos.apiFootball.erro ? ` Erro: ${probe.fotos.apiFootball.erro}` : ""}
                </p>
              )}
              {probe.fotos.exemplo && <code className="mt-1 block overflow-hidden rounded bg-black/30 p-1.5 text-[11px] break-all text-[var(--color-ink-3)]">{probe.fotos.exemplo}</code>}
            </div>
          )}
          <p className="text-xs text-[var(--color-ink-3)]">
            Variáveis: DATA_MODE={probe.variaveis.DATA_MODE ?? "(padrão)"} · CARTOLA_API_HOSTS={probe.variaveis.CARTOLA_API_HOSTS ?? "(padrão)"} · relay: {probe.proxy ? "sim" : "não"}.
          </p>
          {!probe.hosts.some((h) => h.ok) && (
            <Alert tone="warning">
              O servidor do site não alcança a API. As três saídas (relay gratuito, envio a partir do seu computador ou hospedagem que a Globo aceita) estão em <b>docs/CARTOLA.md</b>.
            </Alert>
          )}
        </Card>
      )}
    </div>
  );
}
