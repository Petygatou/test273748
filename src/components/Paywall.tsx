import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BarChart3, Check, Crown, Goal, Lock, RefreshCw, Swords } from "lucide-react";
import { useState } from "react";
import { acessoQuery, useAcesso } from "../lib/acesso";
import { Card } from "./ui";

const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

const VANTAGENS = [
  { Icon: Swords, t: "Escalação otimizada, capitão e reservas de luxo" },
  { Icon: BarChart3, t: "Cruzamento de scout, X1, cedência e valorização" },
  { Icon: Goal, t: "Campinhos, prováveis e parciais ao vivo" },
];

/** No lugar de uma página paga, para quem ainda não tem acesso. */
export function Paywall({ titulo = "Esta parte é para assinantes" }: { titulo?: string } = {}) {
  const { data } = useAcesso();
  const qc = useQueryClient();
  const [conferindo, setConferindo] = useState(false);
  const [aviso, setAviso] = useState("");
  const a = data?.assinatura;

  const conferir = async () => {
    setConferindo(true);
    setAviso("");
    const r = await qc.fetchQuery({ ...acessoQuery, staleTime: 0 }).catch(() => null);
    setConferindo(false);
    if (!r?.liberado) setAviso("Ainda não chegou a confirmação da Cakto. Pix costuma levar menos de 1 minuto; cartão, até alguns minutos. Confira se pagou com o mesmo e-mail da conta.");
  };

  return (
    <div className="mx-auto max-w-lg py-4">
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--color-line)] bg-gradient-to-br from-[var(--color-brand)]/15 to-transparent px-5 py-5">
          <div className="flex items-center gap-2 text-[var(--color-brand)]">
            <Crown size={20} aria-hidden />
            <span className="text-xs font-bold tracking-wide uppercase">Tropa completo</span>
          </div>
          <h1 className="font-display mt-1 text-2xl font-extrabold">{titulo}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-2)]">Assine para liberar todas as análises do Tropa. O pagamento é feito pela Cakto e o acesso libera sozinho.</p>
        </div>
        <div className="space-y-4 px-5 py-5">
          <ul className="space-y-2">
            {VANTAGENS.map(({ Icon, t }) => (
              <li key={t} className="flex items-center gap-2.5 text-sm">
                <Icon size={16} className="shrink-0 text-[var(--color-good)]" aria-hidden />
                {t}
              </li>
            ))}
          </ul>

          {a && !a.valida && (
            <p className="rounded-lg border border-[var(--color-serious)]/40 bg-[var(--color-serious)]/10 px-3 py-2 text-sm">
              {a.status === "estornada" ? "Seu pagamento foi estornado." : `Sua assinatura venceu em ${dataBR(a.validaAte)}.`} Assine de novo para voltar a ter acesso.
            </p>
          )}

          {!data ? (
            <div className="h-11 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
          ) : !data.logado ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--color-ink-2)]">
                <b>1.</b> Crie sua conta (ou entre). <b>2.</b> Assine com o mesmo e-mail.
              </p>
              <Link to="/conta" className="btn btn-primary w-full justify-center">
                <Lock size={16} aria-hidden /> Entrar ou criar conta
              </Link>
            </div>
          ) : data.checkout ? (
            <div className="space-y-2">
              <a href={data.checkout} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full justify-center">
                <Crown size={16} aria-hidden /> Assinar agora
              </a>
              <p className="text-center text-xs text-[var(--color-ink-3)]">Use no pagamento o mesmo e-mail da sua conta do Tropa.</p>
              <button type="button" onClick={conferir} disabled={conferindo} className="btn w-full justify-center">
                {conferindo ? <RefreshCw size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
                Já paguei, liberar meu acesso
              </button>
              {aviso && (
                <p className="text-xs text-[var(--color-ink-3)]" role="status">
                  {aviso}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink-3)]">As assinaturas abrem em breve.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
