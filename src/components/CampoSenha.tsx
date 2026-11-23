import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";

/** Campo de senha com o "olhinho": toque para mostrar ou esconder o que foi digitado. */
export function CampoSenha({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={ver ? "text" : "password"} className={`input pr-11 ${className}`} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
        aria-label={ver ? "Esconder senha" : "Mostrar senha"}
        aria-pressed={ver}
        title={ver ? "Esconder senha" : "Mostrar senha"}
      >
        {ver ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  );
}
