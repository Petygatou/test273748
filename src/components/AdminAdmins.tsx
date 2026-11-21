import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Shield, Trash2 } from "lucide-react";
import { useState } from "react";
import { adminListaAdminsFn, adminMudarAdminFn } from "../server/fnsConta";
import { Card, SectionTitle } from "./ui";

const erroTxt = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado.");

/** Painel ADM → Usuários: quem administra o site. Só o dono (ADMIN_EMAILS) adiciona e remove. */
export function AdminAdmins() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-admins"], queryFn: () => adminListaAdminsFn() });
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const d = q.data;

  const mudar = async (alvo: string, acao: "adicionar" | "remover") => {
    if (acao === "remover" && !window.confirm(`Tirar o ADM de ${alvo}?`)) return;
    setOcupado(true);
    setMsg(null);
    try {
      await adminMudarAdminFn({ data: { email: alvo, acao } });
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin-admins"] }), qc.invalidateQueries({ queryKey: ["admin-users"] })]);
      setMsg({ ok: true, t: acao === "adicionar" ? `${alvo.trim().toLowerCase()} agora é ADM.` : `${alvo} não é mais ADM.` });
      if (acao === "adicionar") setEmail("");
    } catch (e) {
      setMsg({ ok: false, t: erroTxt(e) });
    } finally {
      setOcupado(false);
    }
  };

  if (!d) return null;
  return (
    <Card className="p-3 sm:p-4">
      <SectionTitle icon={<Shield size={18} />} title="Administradores" subtitle="Quem entra no Painel ADM. Só o dono do site adiciona ou remove." />
      <ul className="mt-3 divide-y divide-[var(--color-line)]">
        {d.donos.map((e) => (
          <li key={e} className="flex items-center gap-2 py-2 text-sm">
            <Crown size={15} className="shrink-0 text-[var(--color-brand)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{e}</span>
            <span className="chip shrink-0">Dono</span>
          </li>
        ))}
        {d.extras.map((a) => (
          <li key={a.email} className="flex items-center gap-2 py-2 text-sm">
            <Shield size={15} className="shrink-0 text-[var(--color-ink-3)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {a.email}
              {!a.temConta && <span className="text-xs text-[var(--color-ink-3)]"> · ainda sem conta</span>}
            </span>
            <span className="chip shrink-0">ADM</span>
            {d.podeEditar && (
              <button type="button" className="btn shrink-0 px-2" disabled={ocupado} onClick={() => mudar(a.email, "remover")} aria-label={`Tirar o ADM de ${a.email}`} title="Tirar o ADM">
                <Trash2 size={15} aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
      {d.podeEditar && (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void mudar(email, "adicionar");
          }}
        >
          <input className="input flex-1" type="email" required placeholder="e-mail do novo ADM" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-mail do novo ADM" />
          <button type="submit" className="btn btn-primary" disabled={ocupado}>
            Dar ADM
          </button>
        </form>
      )}
      {msg && (
        <p className={`mt-2 text-sm ${msg.ok ? "text-[var(--color-good-ink)]" : "text-[var(--color-critical-ink)]"}`} role="status">
          {msg.t}
        </p>
      )}
    </Card>
  );
}
