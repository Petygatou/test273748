import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Heart, Lock, MessageCircle, Monitor, Search, Shield, Swords, Trash2, Unlock, Vote, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { AvatarKey } from "../lib/storage";
import { cs, fmt1, timeAgo } from "../lib/format";
import { useRealtime } from "../lib/realtime";
import { norm } from "../lib/search";
import { adminUserActionFn, adminUserDetailFn, adminUsersFn } from "../server/fnsConta";
import { Avatar } from "./avatars";
import { Alert, Card, Seg, StatTile, useScrollLock } from "./ui";

const dataHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—";

type Filtro = "todos" | "online" | "bloqueados";

/** Painel ADM → Usuários: quem está no site, o que cada um fez, bloquear e excluir. */
export function AdminUsers() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => adminUsersFn(), refetchInterval: 30_000 });
  useRealtime(["users", "community"], () => void qc.invalidateQueries({ queryKey: ["admin-users"] }));
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberto, setAberto] = useState<string | null>(null);

  const lista = useMemo(() => {
    const n = norm(busca);
    return (q.data?.usuarios ?? [])
      .filter((u) => (filtro === "online" ? u.online : filtro === "bloqueados" ? u.bloqueado : true))
      .filter((u) => !n || norm(u.nome).includes(n) || norm(u.email).includes(n));
  }, [q.data, busca, filtro]);

  if (q.error) return <Alert tone="critical">{q.error instanceof Error ? q.error.message : "Falha ao carregar usuários"}</Alert>;
  const r = q.data?.resumo;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Usuários" value={r?.total ?? "…"} />
        <StatTile label="Online agora" value={r?.online ?? "…"} hint="ativos nos últimos 5 min" accent="good" />
        <StatTile label="Ativos em 24 h" value={r?.ativos24h ?? "…"} accent="brand" />
        <StatTile label="Novos em 7 dias" value={r?.novos7d ?? "…"} accent="gold" />
      </div>

      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-3)]" aria-hidden />
            <input className="input pl-9" placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar usuário" />
          </div>
          <Seg
            label="Filtro"
            value={filtro}
            onChange={setFiltro}
            options={[
              { value: "todos", label: "Todos" },
              { value: "online", label: `Online${r ? ` (${r.online})` : ""}` },
              { value: "bloqueados", label: `Bloqueados${r?.bloqueados ? ` (${r.bloqueados})` : ""}` },
            ]}
          />
        </div>

        <ul className="mt-3 divide-y divide-[var(--color-line)]">
          {lista.map((u) => (
            <li key={u.id}>
              <button type="button" className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-3)] sm:px-2" onClick={() => setAberto(u.id)}>
                <span className="relative shrink-0">
                  <Avatar k={u.avatar as AvatarKey} size={40} />
                  <span
                    className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-[var(--color-surface-2)] ${u.online ? "bg-[var(--color-good)]" : "bg-[var(--color-surface-4)]"}`}
                    title={u.online ? "online" : "offline"}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{u.nome}</span>
                    {u.admin && (
                      <span className="chip shrink-0 border-[var(--color-brand)]/40 px-1.5 py-0 text-[10px] text-[var(--color-brand)]">
                        <Shield size={10} /> admin
                      </span>
                    )}
                    {u.bloqueado && (
                      <span className="chip shrink-0 border-[var(--color-critical)]/40 px-1.5 py-0 text-[10px] text-[var(--color-critical-ink)]">
                        <Ban size={10} /> bloqueado
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-[var(--color-ink-3)]">{u.email}</span>
                  <span className="block truncate text-[11px] text-[var(--color-ink-3)]">
                    {u.online ? "online agora" : u.ultimoAcesso ? `visto ${timeAgo(u.ultimoAcesso)}` : "nunca entrou depois do cadastro"} · {u.logins} {u.logins === 1 ? "entrada" : "entradas"}
                    {u.dispositivo ? ` · ${u.dispositivo}` : ""}
                  </span>
                </span>
                <span className="hidden shrink-0 items-center gap-3 text-xs text-[var(--color-ink-3)] sm:flex">
                  <span className="flex items-center gap-1" title="tropas salvas">
                    <Swords size={13} /> {u.tropas}
                  </span>
                  <span className="flex items-center gap-1" title="comentários">
                    <MessageCircle size={13} /> {u.comentarios}
                  </span>
                  <span className="flex items-center gap-1" title="curtidas">
                    <Heart size={13} /> {u.curtidas}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {q.isLoading && <li className="py-6 text-center text-sm text-[var(--color-ink-3)]">Carregando…</li>}
          {!q.isLoading && !lista.length && <li className="py-6 text-center text-sm text-[var(--color-ink-3)]">Nenhum usuário encontrado.</li>}
        </ul>
      </Card>

      {aberto && <UserSheet id={aberto} onClose={() => setAberto(null)} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[var(--color-surface-1)] px-3 py-2">
      <div className="text-[10px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">{label}</div>
      <div className="mt-0.5 text-sm font-semibold break-words">{value}</div>
    </div>
  );
}

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold tracking-wide text-[var(--color-ink-3)] uppercase">
        {icon} {title} <span className="text-[var(--color-ink-2)]">({count})</span>
      </div>
      {count ? <ul className="space-y-1 text-sm">{children}</ul> : <p className="text-xs text-[var(--color-ink-3)]">Nada por aqui.</p>}
    </div>
  );
}

function UserSheet({ id, onClose }: { id: string; onClose: () => void }) {
  useScrollLock();
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["admin-user", id], queryFn: () => adminUserDetailFn({ data: { id } }) });
  const [confirmar, setConfirmar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const agir = async (acao: "bloquear" | "desbloquear" | "excluir") => {
    setBusy(true);
    setErro(null);
    try {
      await adminUserActionFn({ data: { id, acao } });
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
      if (acao === "excluir") onClose();
      else await d.refetch();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
      setConfirmar(false);
    }
  };

  const u = d.data;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Detalhes do usuário">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Fechar" onClick={onClose} />
      <div className="card animate-rise relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto p-4 sm:p-5">
        <button className="absolute top-3 right-3 rounded-lg p-1 text-[var(--color-ink-3)] hover:text-[var(--color-ink)]" aria-label="Fechar" onClick={onClose}>
          <X size={18} />
        </button>
        {!u ? (
          <p className="py-10 text-center text-sm text-[var(--color-ink-3)]">{d.error ? (d.error instanceof Error ? d.error.message : "Falha") : "Carregando…"}</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3 pr-8">
              <span className="relative">
                <Avatar k={u.avatar as AvatarKey} size={56} />
                <span className={`absolute right-0 bottom-0 h-3.5 w-3.5 rounded-full ring-2 ring-[var(--color-surface-2)] ${u.online ? "bg-[var(--color-good)]" : "bg-[var(--color-surface-4)]"}`} />
              </span>
              <div className="min-w-0">
                <div className="font-display truncate text-xl font-bold">{u.nome}</div>
                <div className="truncate text-sm text-[var(--color-ink-3)]">{u.email}</div>
                {u.bio && <div className="mt-0.5 text-xs text-[var(--color-ink-2)]">“{u.bio}”</div>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Info label="Situação" value={u.bloqueado ? `Bloqueado ${u.bloqueadoEm ? timeAgo(u.bloqueadoEm) : ""}` : u.online ? "Online agora" : "Offline"} />
              <Info label="Papel" value={u.admin ? (u.adminFixo ? "Admin (do servidor)" : "Admin") : "Cartoleiro"} />
              <Info label="Cadastro" value={dataHora(u.criadoEm)} />
              <Info label="Último acesso" value={u.ultimoAcesso ? `${dataHora(u.ultimoAcesso)} (${timeAgo(u.ultimoAcesso)})` : "—"} />
              <Info label="Último login" value={dataHora(u.ultimoLogin)} />
              <Info label="Entradas" value={u.logins} />
              <Info
                label="Aparelho"
                value={
                  <span className="flex items-center gap-1">
                    <Monitor size={13} /> {u.dispositivo ?? "—"}
                  </span>
                }
              />
              <Info label="Tropas salvas" value={u.tropas} />
              <Info label="Interações" value={`${u.comentarios} coment. · ${u.curtidas} curt. · ${u.votos} votos`} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Section title="Tropas salvas" icon={<Swords size={13} />} count={u.atividade.tropas.length}>
                {u.atividade.tropas.map((t, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--color-surface-1)] px-2.5 py-1.5">
                    <span className="min-w-0 truncate">
                      {t.nome} <span className="text-xs text-[var(--color-ink-3)]">· R{t.rodada} · {t.esquema}</span>
                    </span>
                    <span className="tabular shrink-0 text-xs text-[var(--color-ink-3)]">
                      {fmt1(t.xP)} pts · {cs(t.custo)}
                    </span>
                  </li>
                ))}
              </Section>
              <Section title="Comentários" icon={<MessageCircle size={13} />} count={u.atividade.comentarios.length}>
                {u.atividade.comentarios.map((c, i) => (
                  <li key={i} className="rounded-lg bg-[var(--color-surface-1)] px-2.5 py-1.5">
                    <div className="text-sm">{c.texto}</div>
                    <div className="truncate text-[11px] text-[var(--color-ink-3)]">
                      em “{c.post}” · {timeAgo(c.em)}
                    </div>
                  </li>
                ))}
              </Section>
              <Section title="Votos em enquetes" icon={<Vote size={13} />} count={u.atividade.votos.length}>
                {u.atividade.votos.map((v, i) => (
                  <li key={i} className="rounded-lg bg-[var(--color-surface-1)] px-2.5 py-1.5 text-sm">
                    {v.pergunta} → <b>{v.opcao}</b>
                  </li>
                ))}
              </Section>
              <Section title="Curtidas" icon={<Heart size={13} />} count={u.atividade.curtidas.length}>
                {u.atividade.curtidas.map((l, i) => (
                  <li key={i} className="truncate rounded-lg bg-[var(--color-surface-1)] px-2.5 py-1.5 text-sm">
                    {l.post}
                  </li>
                ))}
              </Section>
            </div>

            {erro && <Alert tone="critical">{erro}</Alert>}
            {u.adminFixo ? (
              <p className="text-xs text-[var(--color-ink-3)]">Conta de administrador definida no servidor (ADMIN_EMAILS): não pode ser bloqueada nem excluída por aqui.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-4">
                {u.bloqueado ? (
                  <button className="btn btn-ghost" disabled={busy} onClick={() => agir("desbloquear")}>
                    <Unlock size={15} /> Desbloquear
                  </button>
                ) : (
                  <button className="btn btn-ghost" disabled={busy} onClick={() => agir("bloquear")}>
                    <Lock size={15} /> Bloquear acesso
                  </button>
                )}
                {confirmar ? (
                  <>
                    <span className="text-sm text-[var(--color-critical-ink)]">Excluir a conta e tudo dela? Não dá para desfazer.</span>
                    <button className="btn bg-[var(--color-critical)] text-white" disabled={busy} onClick={() => agir("excluir")}>
                      Sim, excluir
                    </button>
                    <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirmar(false)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button className="btn btn-ghost text-[var(--color-critical-ink)]" disabled={busy} onClick={() => setConfirmar(true)}>
                    <Trash2 size={15} /> Excluir conta
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

