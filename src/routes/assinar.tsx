import { Link, createFileRoute } from "@tanstack/react-router";
import { Crown } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, PageSkeleton } from "../components/ui";
import { Paywall } from "../components/Paywall";
import { useAcesso } from "../lib/acesso";

export const Route = createFileRoute("/assinar")({ head: () => ({ meta: [{ title: "Assinar — Tropa" }] }), component: AssinarPage });

const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Página de assinatura: o convite para assinar ou, para quem já assina, até quando vale. */
function AssinarPage() {
  const { data } = useAcesso();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado || !data) return <PageSkeleton />;
  const a = data.assinatura;
  if (data.liberado && data.logado) {
    return (
      <div className="mx-auto max-w-lg py-4">
        <Card className="space-y-3 p-5 text-center">
          <Crown size={28} className="mx-auto text-[var(--color-brand)]" aria-hidden />
          <h1 className="font-display text-2xl font-extrabold">Você tem acesso completo</h1>
          <p className="text-sm text-[var(--color-ink-2)]">
            {a?.valida
              ? a.validaAte.startsWith("9999")
                ? "Acesso liberado sem prazo."
                : `Seu acesso vale até ${dataBR(a.validaAte)}${a.status === "ativa" ? " e renova sozinho." : "."}`
              : "Todas as análises do Tropa estão liberadas para você."}
          </p>
          <Link to="/escalacao" className="btn btn-primary justify-center">
            Montar minha tropa
          </Link>
        </Card>
      </div>
    );
  }
  return <Paywall titulo="Assine o Tropa" />;
}
