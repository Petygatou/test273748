import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useScrollLock } from "./ui";

/** Janela sobre a página: painel que sobe de baixo no celular, centralizada no computador. */
export function Sheet({ title, subtitle, icon, onClose, children }: { title: string; subtitle?: string; icon?: ReactNode; onClose: () => void; children: ReactNode }) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="tour-fade absolute inset-0 bg-black/65" aria-label="Fechar" onClick={onClose} />
      <div className="tour-pop card absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-b-none pb-[env(safe-area-inset-bottom)] md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[min(760px,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-b-[var(--radius-card,20px)] md:pb-0">
        <div className="flex items-start gap-3 border-b border-[var(--color-line)] p-4">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg leading-tight font-bold">{title}</h2>
            {subtitle && <p className="text-xs text-[var(--color-ink-3)]">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="-m-1 rounded-lg p-1.5 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
