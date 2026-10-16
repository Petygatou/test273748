import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, LogIn, LogOut, Radio, Save, Trash2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { AVATAR_LABELS, Avatar } from "../components/avatars";
import { Alert, Card, SectionTitle, Seg } from "../components/ui";
import { syncProfile, useAuth } from "../lib/auth";
import { cs, fmt1, timeAgo } from "../lib/format";
import { analysisQuery } from "../lib/queries";
import { AVATAR_KEYS, DEFAULT_PROFILE, KEYS, useLocal, writeLocal, type SavedLineup, type UserProfile } from "../lib/storage";
import { getSupabase } from "../lib/supabase";

export const Route = createFileRoute("/conta")({
  component: AccountPage,
});

function AccountPage() {
  const auth = useAuth();
  const [profile, setProfile] = useLocal<UserProfile>(KEYS.profile, DEFAULT_PROFILE);
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(profile), [profile]);

  const save = async () => {
    setProfile(draft); // atualiza o cabeçalho na hora
    await syncProfile(draft).catch(() => {});
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

      {auth.cloud && <AuthBox />}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4 p-4">
          <SectionTitle title="Perfil" icon={<UserRound size={18} className="text-[var(--color-brand)]" />} />
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
            <Seg label="Tom do Comandante" value={draft.tom} onChange={(v) => setDraft({ ...draft, tom: v })} options={[{ value: "conservador", label: "Conservador" }, { value: "agressivo", label: "Agressivo" }]} />
            <Seg label="Foco" value={draft.foco} onChange={(v) => setDraft({ ...draft, foco: v })} options={[{ value: "pontos", label: "Pontos" }, { value: "cartoletas", label: "Cartoletas" }]} />
          </div>
          <button className="btn btn-primary" onClick={save}>
            {saved ? <Check size={15} /> : <Save size={15} />} {saved ? "Salvo" : "Salvar perfil"}
          </button>
        </Card>
        <SavedLineups />
      </div>
    </div>
  );
}

function AuthBox() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const sb = getSupabase()!;
  if (auth.session) {
    return (
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="text-sm">
          Conectado como <b>{auth.session.user.email}</b>
          {auth.isAdmin && <span className="chip ml-2 text-[var(--color-gold)]">administrador</span>}
        </div>
        <button className="btn btn-ghost" onClick={() => sb.auth.signOut()}>
          <LogOut size={15} /> Sair
        </button>
      </Card>
    );
  }
  return (
    <Card className="space-y-3 p-4">
      <SectionTitle title="Entrar" subtitle="Sincronize perfil, tropas e participe da comunidade" icon={<LogIn size={18} className="text-[var(--color-brand)]" />} />
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input className="input" type="email" placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-mail" />
        <input className="input" type="password" placeholder="senha" value={senha} onChange={(e) => setSenha(e.target.value)} aria-label="Senha" />
        <button
          className="btn btn-primary"
          onClick={async () => {
            const { error } = await sb.auth.signInWithPassword({ email, password: senha });
            setMsg(error ? error.message : null);
          }}
        >
          Entrar
        </button>
        <button
          className="btn btn-ghost"
          onClick={async () => {
            const { error } = await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: window.location.origin + "/conta" } });
            setMsg(error ? error.message : "Conta criada. Confirme pelo e-mail.");
          }}
        >
          Criar conta
        </button>
      </div>
      <button
        className="text-xs font-semibold text-[var(--color-brand)]"
        onClick={async () => {
          const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + "/conta" } });
          setMsg(error ? error.message : "Link de acesso enviado para o seu e-mail.");
        }}
      >
        Prefere um link mágico? Enviar por e-mail
      </button>
      {msg && <Alert tone="info">{msg}</Alert>}
    </Card>
  );
}

function SavedLineups() {
  const [list, setList] = useLocal<SavedLineup[]>(KEYS.lineups, []);
  const an = useQuery(analysisQuery);
  const byId = new Map((an.data?.analysis.players ?? []).map((p) => [p.atletaId, p] as const));
  const rodada = an.data?.analysis.rodada;
  return (
    <Card className="p-4">
      <SectionTitle title="Tropas salvas" subtitle="Histórico das escalações geradas para consulta e auditoria" />
      {!list.length && (
        <p className="text-sm text-[var(--color-ink-3)]">
          Nenhuma tropa salva. Monte uma no <Link to="/escalacao" className="text-[var(--color-brand)] underline">Montador</Link> e toque em “Salvar tropa”.
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
                  <Link
                    to="/ao-vivo"
                    className="btn btn-ghost px-2 py-1 text-[11px]"
                    onClick={() => writeLocal(KEYS.lastLineup, { rodada: l.rodada, titulares: l.titulares, captainId: l.captainId, reservas: l.reservas })}
                  >
                    <Radio size={13} /> Ao vivo
                  </Link>
                )}
                <button className="btn btn-ghost px-2 py-1 text-[11px]" onClick={() => setList(list.filter((x) => x.id !== l.id))} aria-label="Excluir tropa">
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
