import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, BellRing, Check, Heart, History, Lock, LogOut, MapPin, MessageCircle, Monitor, Search, Shield, Smartphone, Swords, Tablet, Trash2, Unlock, Vote, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAvisosAparelho } from "../lib/avisos";
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

type Filtro = "todos" | "online" | "varios" | "bloqueados";

const IconeAparelho = ({ tipo, size = 16 }: { tipo: string; size?: number }) => (tipo === "celular" ? <Smartphone size={size} /> : tipo === "tablet" ? <Tablet size={size} /> : <Monitor size={size} />);
const ordinal = (n: number) => `${n}º`;

/** Painel ADM → Usuários: quem está no site, o que cada um fez, bloquear e excluir. */
export function AdminUsers() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => adminUsersFn(), refetchInterval: 30_000 });
  useRealtime(["users", "community"], () => void qc.invalidateQueries({ queryKey: ["admin-users"] }));
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const av = useAvisosAparelho(true);
  const toasts = useToastsDeAvisos(av.avisos);

  const lista = useMemo(() => {
    const n = norm(busca);
    return (q.data?.usuarios ?? [])
      .filter((u) => (filtro === "online" ? u.online : filtro === "bloqueados" ? u.bloqueado : filtro === "varios" ? u.aparelhos30d >= 2 : true))
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

      <AvisosAparelho av={av} onAbrir={setAberto} />

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
              { value: "varios", label: `Vários aparelhos${r?.variosAparelhos ? ` (${r.variosAparelhos})` : ""}` },
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
                    {u.aparelhos > 0 && (
                      <span
                        className={`chip shrink-0 px-1.5 py-0 text-[10px] ${u.compartilhamento ? "border-[var(--color-critical)]/50 text-[var(--color-critical-ink)]" : u.aparelhos30d >= 2 ? "border-[var(--color-warning)]/50 text-[var(--color-warning)]" : ""}`}
                        title={`${u.aparelhos} aparelho(s) no total · ${u.aparelhos30d} nos últimos 30 dias`}
                      >
                        <Smartphone size={10} /> {u.aparelhos30d}/{u.aparelhos} {u.compartilhamento && "· alerta"}
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

      {/* aviso na hora: alguém acabou de entrar de um aparelho novo */}
      {toasts.length > 0 && (
        <div className="fixed top-20 right-3 left-3 z-[70] flex flex-col items-end gap-2 sm:left-auto sm:w-96" aria-live="polite">
          {toasts.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setAberto(t.userId)}
              className={`tour-pop card flex w-full items-start gap-3 border p-3 text-left shadow-2xl shadow-black/50 ${t.compartilhamento ? "border-[var(--color-critical)]/60" : "border-[var(--color-warning)]/50"}`}
            >
              <BellRing size={18} className={`mt-0.5 shrink-0 ${t.compartilhamento ? "text-[var(--color-critical-ink)]" : "text-[var(--color-warning)]"}`} />
              <span className="min-w-0 text-sm">
                <b>{t.nome}</b> entrou de um aparelho novo: {t.rotulo}
                <span className="block text-xs text-[var(--color-ink-3)]">
                  {ordinal(t.ordem)} aparelho · {t.aparelhos30d} em 30 dias{t.local ? ` · ${t.local}` : ""}
                  {t.compartilhamento ? " · possível conta compartilhada" : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Avisos = ReturnType<typeof useAvisosAparelho>;

/** Mostra por alguns segundos os avisos que chegaram depois que o painel abriu. */
function useToastsDeAvisos(avisos: Avisos["avisos"]) {
  const abriuEm = useRef(new Date().toISOString());
  const [toasts, setToasts] = useState<Avisos["avisos"]>([]);
  const vistos = useRef(new Set<string>());
  useEffect(() => {
    const novos = avisos.filter((a) => a.em > abriuEm.current && !vistos.current.has(a.id));
    if (!novos.length) return;
    novos.forEach((a) => vistos.current.add(a.id));
    setToasts((t) => [...novos, ...t].slice(0, 3));
    const timer = setTimeout(() => setToasts((t) => t.filter((x) => !novos.includes(x))), 9000);
    return () => clearTimeout(timer);
  }, [avisos]);
  return toasts;
}

/** Quadro de avisos: logins em aparelho novo de contas que já tinham outro aparelho. */
function AvisosAparelho({ av, onAbrir }: { av: Avisos; onAbrir: (id: string) => void }) {
  const [todos, setTodos] = useState(false);
  if (!av.avisos.length) return null;
  const lista = todos ? av.avisos : av.avisos.slice(0, 6);
  return (
    <Card className={`p-3 sm:p-4 ${av.naoVistos.length ? "border-[var(--color-warning)]/50" : ""}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <BellRing size={17} className="text-[var(--color-warning)]" />
        <h3 className="font-display text-base font-bold">Avisos de aparelho novo</h3>
        {av.naoVistos.length > 0 && <span className="rounded-full bg-[var(--color-critical)] px-2 text-xs font-bold text-white">{av.naoVistos.length} novo{av.naoVistos.length > 1 ? "s" : ""}</span>}
        <span className="text-xs text-[var(--color-ink-3)]">últimos 14 dias · com {av.limite}+ aparelhos em 30 dias vira alerta de conta compartilhada</span>
        {av.naoVistos.length > 0 && (
          <button type="button" className="btn btn-ghost ml-auto px-2.5 py-1 text-xs" onClick={av.marcarVistos}>
            <Check size={13} /> Marcar como vistos
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {lista.map((a) => {
          const novo = !av.vistoEm || a.em > av.vistoEm;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onAbrir(a.userId)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors hover:bg-[var(--color-surface-3)] ${a.compartilhamento ? "border-[var(--color-critical)]/40 bg-[var(--color-critical)]/5" : "border-[var(--color-line)]"}`}
              >
                <span className="relative shrink-0">
                  <Avatar k={a.avatar as AvatarKey} size={34} />
                  {novo && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--color-critical)] ring-2 ring-[var(--color-surface-2)]" title="não visto" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    <b>{a.nome}</b> entrou de um aparelho novo
                  </span>
                  <span className="flex items-center gap-1 truncate text-xs text-[var(--color-ink-2)]">
                    <IconeAparelho tipo={a.tipo} size={12} /> {a.rotulo}
                    {a.local && (
                      <>
                        {" "}
                        · <MapPin size={11} /> {a.local}
                      </>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11px]">
                  <span className={`chip px-1.5 py-0 text-[10px] ${a.compartilhamento ? "border-[var(--color-critical)]/50 text-[var(--color-critical-ink)]" : "border-[var(--color-warning)]/50 text-[var(--color-warning)]"}`}>
                    {a.compartilhamento && <AlertTriangle size={10} />} {ordinal(a.ordem)} aparelho · {a.aparelhos30d} em 30d
                  </span>
                  <span className="mt-0.5 block text-[var(--color-ink-3)]" title={dataHora(a.em)}>
                    {timeAgo(a.em)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {av.avisos.length > 6 && (
        <button type="button" className="mt-2 text-xs font-semibold text-[var(--color-brand)]" onClick={() => setTodos((v) => !v)}>
          {todos ? "Mostrar menos" : `Ver todos (${av.avisos.length})`}
        </button>
      )}
    </Card>
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

  const [aviso, setAviso] = useState<string | null>(null);
  const agir = async (acao: "bloquear" | "desbloquear" | "excluir" | "desconectar") => {
    setBusy(true);
    setErro(null);
    try {
      await adminUserActionFn({ data: { id, acao } });
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
      if (acao === "excluir") onClose();
      else await d.refetch();
      if (acao === "desconectar") setAviso("Pronto: todas as sessões foram encerradas. A pessoa vai precisar entrar de novo em cada aparelho.");
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
                label="Aparelhos"
                value={
                  <span className={`flex items-center gap-1 ${u.compartilhamento ? "text-[var(--color-critical-ink)]" : ""}`}>
                    <Smartphone size={13} /> {u.aparelhos} no total · {u.aparelhos30d} em 30 dias
                  </span>
                }
              />
              <Info label="Tropas salvas" value={u.tropas} />
              <Info label="Interações" value={`${u.comentarios} coment. · ${u.curtidas} curt. · ${u.votos} votos`} />
            </div>

            <Aparelhos u={u} />

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
            {aviso && <Alert tone="info">{aviso}</Alert>}
            {u.adminFixo ? (
              <p className="text-xs text-[var(--color-ink-3)]">Conta de administrador definida no servidor (ADMIN_EMAILS): não pode ser bloqueada nem excluída por aqui.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-4">
                {u.aparelhos > 0 && (
                  <button className="btn btn-ghost" disabled={busy} onClick={() => agir("desconectar")} title="Encerra a sessão em todos os aparelhos; a pessoa precisa entrar de novo">
                    <LogOut size={15} /> Desconectar todos os aparelhos
                  </button>
                )}
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


type Detalhe = Awaited<ReturnType<typeof adminUserDetailFn>>;

/** Aparelhos da conta e histórico de logins: quantos, quais, quando e de onde. */
function Aparelhos({ u }: { u: Detalhe }) {
  const [verTodos, setVerTodos] = useState(false);
  const lista = u.listaAparelhos;
  const hist = verTodos ? u.historicoLogins : u.historicoLogins.slice(0, 8);
  const rotuloDe = new Map(lista.map((a) => [a.aparelhoId, a]));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Smartphone size={15} className="text-[var(--color-brand)]" />
        <h3 className="font-display text-base font-bold">Aparelhos</h3>
        <span className="text-sm text-[var(--color-ink-2)]">
          entrou em <b>{u.aparelhos}</b> {u.aparelhos === 1 ? "aparelho" : "aparelhos diferentes"} · <b>{u.aparelhos30d}</b> nos últimos 30 dias
        </span>
      </div>
      {u.compartilhamento && (
        <Alert tone="critical">
          {u.aparelhos30d} aparelhos diferentes em 30 dias: pode ser conta compartilhada. Confira os horários e cidades abaixo; se precisar, use “Desconectar todos os aparelhos”.
        </Alert>
      )}
      {lista.length === 0 ? (
        <p className="text-xs text-[var(--color-ink-3)]">Nenhum login registrado desde que o site começou a guardar os aparelhos.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {lista.map((a) => (
            <li key={a.id} className={`rounded-xl border p-3 ${a.atual ? "border-[var(--color-brand)]/50 bg-[var(--color-brand)]/5" : "border-[var(--color-line)] bg-[var(--color-surface-1)]"} ${a.ativo30d ? "" : "opacity-70"}`}>
              <div className="flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-3)] text-[var(--color-ink-2)]">
                  <IconeAparelho tipo={a.tipo} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold">{a.rotulo}</span>
                    <span className="chip px-1.5 py-0 text-[10px]">{ordinal(a.ordem)} aparelho</span>
                    {a.atual && <span className="chip border-[var(--color-brand)]/50 px-1.5 py-0 text-[10px] text-[var(--color-brand)]">mais recente</span>}
                    {!a.ativo30d && <span className="chip px-1.5 py-0 text-[10px]">sem uso há 30+ dias</span>}
                  </div>
                  <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-ink-3)]">
                    <dt>1º login</dt>
                    <dd className="text-[var(--color-ink-2)]">{dataHora(a.primeiroLogin)}</dd>
                    <dt>Último login</dt>
                    <dd className="text-[var(--color-ink-2)]">{dataHora(a.ultimoLogin)}</dd>
                    <dt>Último uso</dt>
                    <dd className="text-[var(--color-ink-2)]">{a.ultimoAcesso ? timeAgo(a.ultimoAcesso) : "—"}</dd>
                    <dt>Entradas</dt>
                    <dd className="text-[var(--color-ink-2)]">{a.logins}</dd>
                    {a.locais.length > 0 && (
                      <>
                        <dt>Locais</dt>
                        <dd className="text-[var(--color-ink-2)]">{a.locais.join(", ")}</dd>
                      </>
                    )}
                    {a.tela && (
                      <>
                        <dt>Tela</dt>
                        <dd className="text-[var(--color-ink-2)]">{a.tela.replace("x", " × ")}</dd>
                      </>
                    )}
                  </dl>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {u.historicoLogins.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold tracking-wide text-[var(--color-ink-3)] uppercase">
            <History size={13} /> Histórico de logins ({u.historicoLogins.length})
          </div>
          <ol className="relative space-y-1 border-l border-[var(--color-line)] pl-4">
            {hist.map((l) => (
              <li key={l.id} className="relative text-sm">
                <span className={`absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full ring-2 ring-[var(--color-surface-2)] ${l.novo && l.ordem >= 2 ? "bg-[var(--color-warning)]" : "bg-[var(--color-surface-4)]"}`} aria-hidden />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="tabular text-xs text-[var(--color-ink-3)]">{dataHora(l.em)}</span>
                  <span className="flex items-center gap-1">
                    <IconeAparelho tipo={l.tipo} size={12} /> {rotuloDe.get(l.aparelhoId)?.rotulo ?? l.rotulo}
                  </span>
                  {l.novo && <span className={`chip px-1.5 py-0 text-[10px] ${l.ordem >= 2 ? "border-[var(--color-warning)]/50 text-[var(--color-warning)]" : ""}`}>{l.ordem >= 2 ? `aparelho novo (${ordinal(l.ordem)})` : "primeiro aparelho"}</span>}
                  {l.origem !== "login" && <span className="chip px-1.5 py-0 text-[10px]">{l.origem === "cadastro" ? "cadastro" : "trocou a senha"}</span>}
                </div>
                {(l.local || l.ip) && (
                  <div className="text-[11px] text-[var(--color-ink-3)]">
                    {l.local && (
                      <span className="mr-2 inline-flex items-center gap-0.5">
                        <MapPin size={10} /> {l.local}
                      </span>
                    )}
                    {l.ip && <span>rede {l.ip}</span>}
                  </div>
                )}
              </li>
            ))}
          </ol>
          {u.historicoLogins.length > 8 && (
            <button type="button" className="mt-1 text-xs font-semibold text-[var(--color-brand)]" onClick={() => setVerTodos((v) => !v)}>
              {verTodos ? "Mostrar menos" : `Ver todos (${u.historicoLogins.length})`}
            </button>
          )}
        </div>
      )}
      <p className="text-[11px] text-[var(--color-ink-3)]">
        Cada navegador conta como um aparelho. Aba anônima ou cookies apagados aparecem como aparelho novo. O modelo aparece quando o navegador informa (Chrome no Android sim; iPhone mostra só “iPhone”).
      </p>
    </div>
  );
}
