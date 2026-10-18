import { AI_ENABLED } from "../lib/features";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, KeyRound, Link2, LogIn, LogOut, Radio, Save, Trash2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { AVATAR_LABELS, Avatar } from "../components/avatars";
import { Alert, Card, SectionTitle, Seg } from "../components/ui";
import { meQuery, useAuth } from "../lib/auth";
import { cs, fmt1, timeAgo } from "../lib/format";
import { analysisQuery } from "../lib/queries";
import { AVATAR_KEYS, DEFAULT_PROFILE, KEYS, useLocal, writeLocal, type SavedLineup, type UserProfile } from "../lib/storage";
import { changePasswordFn, deleteLineupFn, listLineups, login, logout, register, saveProfile } from "../server/fnsConta";

export const Route = createFileRoute("/conta")({
  component: AccountPage,
});

function AccountPage() {
  const auth = useAuth();
  const [profile, setProfile] = useLocal<UserProfile>(KEYS.profile, DEFAULT_PROFILE);
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [saved, setSaved] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => setDraft(profile), [profile]);

  const save = async () => {
    setErro(null);
    setProfile(draft); // cabeçalho atualiza na hora
    if (auth.user) {
      try {
        await saveProfile({ data: { nome: draft.nome, bio: draft.bio, avatar: draft.avatar } });
        await auth.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao salvar");
        return;
      }
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center gap-4">
        <Avatar k={profile.avatar} size={64} ring />
        <div>
          <h1 className="font-display text-2xl font-extrabold">{profile.nome || "Cartoleiro"}</h1>
          <p className="text-sm text-[var(--color-ink-3)]">{profile.bio || "Sem bio ainda."}</p>
        </div>
      </div>

      <AuthBox />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4 p-4">
          <SectionTitle title="Perfil" subtitle={auth.user ? "Salvo na sua conta" : "Salvo neste navegador (entre para levar a outros aparelhos)"} icon={<UserRound size={18} className="text-[var(--color-brand)]" />} />
          <div>
            <label htmlFor="nome" className="mb-1 block text-xs font-semibold text-[var(--color-ink-3)] uppercase">
              Nome
            </label>
            <input id="nome" className="input" value={draft.nome} maxLength={40} onChange={(e) => setDraft({ ...draft, nome: e.target.value })} />
          </div>
          <div>
            <label htmlFor="bio" className="mb-1 block text-xs font-semibold text-[var(--color-ink-3)] uppercase">
              Bio
            </label>
            <textarea id="bio" className="input min-h-[70px]" value={draft.bio} maxLength={160} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-[var(--color-ink-3)] uppercase">Avatar</div>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-8 lg:grid-cols-4">
              {AVATAR_KEYS.map((k) => (
                <button key={k} type="button" onClick={() => setDraft({ ...draft, avatar: k })} className="flex flex-col items-center gap-1" aria-pressed={draft.avatar === k} aria-label={`Avatar ${AVATAR_LABELS[k]}`}>
                  <Avatar k={k} size={52} ring={draft.avatar === k} />
                  <span className={`text-[11px] ${draft.avatar === k ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-ink-3)]"}`}>{AVATAR_LABELS[k]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {AI_ENABLED && (<Seg label="Tom do Comandante" value={draft.tom} onChange={(v) => setDraft({ ...draft, tom: v })} options={[{ value: "conservador", label: "Conservador" }, { value: "agressivo", label: "Agressivo" }]} />)}
            <Seg label="Foco" value={draft.foco} onChange={(v) => setDraft({ ...draft, foco: v })} options={[{ value: "pontos", label: "Pontos" }, { value: "cartoletas", label: "Cartoletas" }]} />
          </div>
          {erro && <Alert tone="critical">{erro}</Alert>}
          <button className="btn btn-primary" onClick={save}>
            {saved ? <Check size={15} /> : <Save size={15} />} {saved ? "Salvo" : "Salvar perfil"}
          </button>
        </Card>
        <div className="space-y-5">
          <SavedLineups />
          <Card className="p-4">
            <SectionTitle title="Conta do Cartola" subtitle="Conecte seu time para ver patrimônio, ligas e enviar a tropa direto ao Cartola" icon={<Link2 size={18} className="text-[var(--color-gold)]" />} />
            <Link to="/meu-time" className="btn btn-ghost">
              Abrir Meu Time
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AuthBox() {
  const auth = useAuth();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ atual: "", nova: "" });

  const refreshAll = async () => {
    await qc.invalidateQueries({ queryKey: meQuery.queryKey });
    await qc.invalidateQueries({ queryKey: ["lineups"] });
  };

  if (auth.user) {
    return (
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            Conectado como <b>{auth.user.email}</b>
            {auth.isAdmin && <span className="chip ml-2 text-[var(--color-gold)]">administrador</span>}
          </div>
          <button
            className="btn btn-ghost"
            onClick={async () => {
              await logout();
              await refreshAll();
            }}
          >
            <LogOut size={15} /> Sair
          </button>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--color-ink-3)]">
            <KeyRound size={13} className="mr-1 inline" /> Trocar senha
          </summary>
          <form
            className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await changePasswordFn({ data: pw });
                setPw({ atual: "", nova: "" });
                setMsg("Senha alterada.");
              } catch (err) {
                setMsg(err instanceof Error ? err.message : "Falha");
              }
            }}
          >
            <input className="input" type="password" placeholder="senha atual" value={pw.atual} onChange={(e) => setPw({ ...pw, atual: e.target.value })} aria-label="Senha atual" autoComplete="current-password" />
            <input className="input" type="password" placeholder="nova senha (8+)" value={pw.nova} onChange={(e) => setPw({ ...pw, nova: e.target.value })} aria-label="Nova senha" autoComplete="new-password" />
            <button className="btn btn-ghost" type="submit">
              Alterar
            </button>
          </form>
        </details>
        {msg && <Alert tone="info">{msg}</Alert>}
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <SectionTitle
        title={mode === "entrar" ? "Entrar" : "Criar conta"}
        subtitle="Sincronize perfil e tropas e participe da comunidade"
        icon={<LogIn size={18} className="text-[var(--color-brand)]" />}
        right={<Seg label="Modo" value={mode} onChange={setMode} options={[{ value: "entrar", label: "Entrar" }, { value: "criar", label: "Criar conta" }]} />}
      />
      <form
        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg(null);
          try {
            if (mode === "entrar") await login({ data: { email, senha } });
            else await register({ data: { email, senha, nome } });
            setSenha("");
            await refreshAll();
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Falha");
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode === "criar" && <input className="input sm:col-span-3" placeholder="nome no app" value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} aria-label="Nome" />}
        <input className="input" type="email" placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-mail" autoComplete="email" required />
        <input className="input" type="password" placeholder="senha (8+ caracteres)" value={senha} onChange={(e) => setSenha(e.target.value)} aria-label="Senha" autoComplete={mode === "entrar" ? "current-password" : "new-password"} required />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {mode === "entrar" ? "Entrar" : "Criar"}
        </button>
      </form>
      {msg && <Alert tone="critical">{msg}</Alert>}
    </Card>
  );
}

function SavedLineups() {
  const auth = useAuth();
  const qc = useQueryClient();
  const [local, setLocal] = useLocal<SavedLineup[]>(KEYS.lineups, []);
  const remote = useQuery({ queryKey: ["lineups", auth.user?.id ?? "anon"], queryFn: () => listLineups(), enabled: Boolean(auth.user) });
  const list: SavedLineup[] = auth.user ? ((remote.data ?? []) as SavedLineup[]) : local;
  const an = useQuery(analysisQuery);
  const byId = new Map((an.data?.analysis.players ?? []).map((p) => [p.atletaId, p] as const));
  const rodada = an.data?.analysis.rodada;
  const remove = async (id: string) => {
    if (auth.user) {
      await deleteLineupFn({ data: { id } });
      await qc.invalidateQueries({ queryKey: ["lineups"] });
    } else setLocal(local.filter((x) => x.id !== id));
  };
  return (
    <Card className="p-4">
      <SectionTitle title="Tropas salvas" subtitle={auth.user ? "Na sua conta — disponíveis em qualquer aparelho" : "Neste navegador"} />
      {!list.length && (
        <p className="text-sm text-[var(--color-ink-3)]">
          Nenhuma tropa salva. Monte uma no{" "}
          <Link to="/escalacao" className="text-[var(--color-brand)] underline">
            Montador
          </Link>{" "}
          e toque em “Salvar tropa”.
        </p>
      )}
      <ul className="space-y-2">
        {list.map((l) => (
          <li key={l.id} className="rounded-xl border border-[var(--color-line)] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{l.nome}</div>
                <div className="tabular text-[11px] text-[var(--color-ink-3)]">
                  {cs(l.custo)} · xP {fmt1(l.xP)} · {timeAgo(l.criadoEm)}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {l.rodada === rodada && (
                  <Link to="/ao-vivo" className="btn btn-ghost px-2 py-1 text-[11px]" onClick={() => writeLocal(KEYS.lastLineup, { rodada: l.rodada, titulares: l.titulares, captainId: l.captainId, reservas: l.reservas })}>
                    <Radio size={13} /> Ao vivo
                  </Link>
                )}
                <button className="btn btn-ghost px-2 py-1 text-[11px]" onClick={() => remove(l.id)} aria-label="Excluir tropa">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {l.titulares.map((id) => (
                <span key={id} className={`chip text-[10px] ${id === l.captainId ? "border-[var(--color-gold)]/50 text-[var(--color-gold)]" : ""}`}>
                  {byId.get(id)?.apelido ?? `#${id}`}
                  {id === l.captainId && " (C)"}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
