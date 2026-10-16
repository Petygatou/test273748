import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Bell, ClipboardList, Lock, Megaphone, Shield, Trash2 } from "lucide-react";
import { useState } from "react";
import { AskButton } from "../components/AskButton";
import { StoryComposer } from "../components/Stories";
import { Alert, Card, ErrorBox, PageSkeleton, PlayerPhoto, PosBadge, SectionTitle, Seg, StatusPill } from "../components/ui";
import type { LineupOverride, RoundAnalysis } from "../engine/types";
import { createAlert, deleteAlert, useAlerts, type AlertKind } from "../lib/alerts";
import { useAuth } from "../lib/auth";
import { OFFICIAL_AUTHOR, getCommunity } from "../lib/community";
import { countdown, fmt1, pct, timeAgo } from "../lib/format";
import { analysisQuery } from "../lib/queries";
import { KEYS, useLocal } from "../lib/storage";
import { getSupabase } from "../lib/supabase";
import { saveLineupOverride } from "../server/fns";
import { Composer } from "../components/Composer";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type Tab = "provaveis" | "conteudo" | "alertas";

function AdminPage() {
  const auth = useAuth();
  const [adminToken, setAdminToken] = useLocal<string>(KEYS.adminToken, "");
  const [tokenDraft, setTokenDraft] = useState("");
  const [tab, setTab] = useState<Tab>("provaveis");
  const an = useQuery(analysisQuery);

  if (!auth.ready) return <PageSkeleton />;
  if (!auth.isAdmin) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <Lock size={28} className="mx-auto text-[var(--color-brand)]" aria-hidden />
        <h1 className="font-display mt-2 text-xl font-bold">Acesso restrito</h1>
        {auth.cloud ? (
          <p className="mt-1 text-sm text-[var(--color-ink-3)]">
            Apenas perfis com papel de administrador. {auth.session ? "Sua conta não tem esse papel." : <Link to="/conta" className="text-[var(--color-brand)] underline">Entre na sua conta</Link>}
          </p>
        ) : (
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              setAdminToken(tokenDraft.trim());
            }}
          >
            <p className="text-sm text-[var(--color-ink-3)]">Modo local: informe o ADMIN_TOKEN configurado no servidor.</p>
            <input className="input" type="password" placeholder="ADMIN_TOKEN" value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} aria-label="Token de administrador" />
            <button className="btn btn-primary w-full" type="submit">
              Entrar
            </button>
          </form>
        )}
      </Card>
    );
  }

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
          value={tab}
          onChange={setTab}
          options={[
            { value: "provaveis", label: "Prováveis" },
            { value: "conteudo", label: "Conteúdo" },
            { value: "alertas", label: "Alertas" },
          ]}
        />
      </div>
      {tab === "provaveis" && (an.isLoading ? <PageSkeleton /> : an.error || !an.data ? <ErrorBox error={an.error} /> : <Provaveis a={an.data.analysis} adminToken={adminToken} />)}
      {tab === "conteudo" && <Conteudo />}
      {tab === "alertas" && <Alertas a={an.data?.analysis} fechamento={an.data?.meta.fechamento} />}
    </div>
  );
}

const OVERRIDES: Array<{ value: LineupOverride; label: string }> = [
  { value: "titular", label: "Titular" },
  { value: "reserva", label: "Reserva" },
  { value: "duvida", label: "Dúvida" },
  { value: "fora", label: "Fora" },
];

function Provaveis({ a, adminToken }: { a: RoundAnalysis; adminToken: string }) {
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
      const sb = getSupabase();
      const accessToken = sb ? (await sb.auth.getSession()).data.session?.access_token : undefined;
      await saveLineupOverride({ data: { atletaId, status, adminToken, accessToken } });
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
      {erro && (
        <div className="mb-3">
          <Alert tone="critical">{erro}</Alert>
        </div>
      )}
      <ul className="divide-y divide-[var(--color-line)]">
        {players.map((p) => (
          <li key={p.atletaId} className="flex flex-wrap items-center gap-2 py-2">
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
      <SectionTitle title="Publicar novidade oficial" subtitle="Aparece no feed com o selo do Comandante FC" icon={<Megaphone size={18} className="text-[var(--color-gold)]" />} right={<button className="btn btn-ghost" onClick={() => setStory(true)}>Story institucional</button>} />
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
