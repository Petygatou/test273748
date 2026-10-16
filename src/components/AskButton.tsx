import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { queueAsk, type AskPayload } from "../lib/ask";

/** Botão de análise rápida: transfere o contexto da tela para o Comandante. */
export function AskButton({ label, payload, className = "" }: { label: string; payload: AskPayload | (() => AskPayload); className?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={`btn btn-ai ${className}`}
      onClick={() => {
        queueAsk(typeof payload === "function" ? payload() : payload);
        navigate({ to: "/assistente" });
      }}
    >
      <Sparkles size={15} aria-hidden />
      {label}
    </button>
  );
}
