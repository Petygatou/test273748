import { BarChart3, ImagePlus, Loader2, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Author } from "../lib/community";
import { Avatar } from "./avatars";
import { Card } from "./ui";

/* ------------------------------ composer ------------------------------ */

export function Composer({ me, onPublish, oficial = false }: { me: Author; onPublish: (p: { texto: string; file?: File | null; poll?: { pergunta: string; opcoes: string[] } | null }) => Promise<void>; oficial?: boolean }) {
  const [texto, setTexto] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pollOn, setPollOn] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [opcoes, setOpcoes] = useState(["", ""]);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const validPoll = pollOn && pergunta.trim() && opcoes.filter((o) => o.trim()).length >= 2;
  const canSend = (texto.trim() || file || validPoll) && !busy;
  return (
    <Card className="p-3">
      <div className="flex gap-3">
        <Avatar k={me.avatar} size={38} />
        <div className="min-w-0 flex-1">
          <textarea className="input min-h-[70px] resize-y" placeholder={oficial ? "Publicar novidade oficial no feed…" : "Qual a sua leitura da rodada?"} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} aria-label="Texto da publicação" />
          {preview && file && (
            <div className="relative mt-2 overflow-hidden rounded-xl">
              {file.type.startsWith("video") ? <video src={preview} className="max-h-72 w-full bg-black object-contain" controls /> : <img src={preview} alt="Prévia" className="max-h-72 w-full object-cover" />}
              <button className="absolute top-2 right-2 rounded-full bg-black/70 p-1 text-white" onClick={() => { setFile(null); setPreview(null); }} aria-label="Remover mídia">
                <X size={16} />
              </button>
            </div>
          )}
          {pollOn && (
            <div className="mt-2 space-y-2 rounded-xl border border-[var(--color-line)] p-2">
              <input className="input" placeholder="Pergunta da enquete" value={pergunta} onChange={(e) => setPergunta(e.target.value)} maxLength={140} aria-label="Pergunta da enquete" />
              {opcoes.map((o, i) => (
                <input key={i} className="input" placeholder={`Opção ${i + 1}`} value={o} maxLength={60} onChange={(e) => setOpcoes(opcoes.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Opção ${i + 1}`} />
              ))}
              {opcoes.length < 4 && (
                <button className="text-xs font-semibold text-[var(--color-brand)]" onClick={() => setOpcoes([...opcoes, ""])}>
                  + adicionar opção
                </button>
              )}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="btn btn-ghost cursor-pointer px-2.5 py-1.5 text-xs">
              <ImagePlus size={15} /> Foto/vídeo
              <input
                type="file"
                accept="image/*,video/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > 60 * 1024 * 1024) return alert("Arquivo acima de 60 MB.");
                  setFile(f);
                  setPreview(f ? URL.createObjectURL(f) : null);
                }}
              />
            </label>
            <button className={`btn btn-ghost px-2.5 py-1.5 text-xs ${pollOn ? "border-[var(--color-brand)]" : ""}`} onClick={() => setPollOn(!pollOn)} aria-pressed={pollOn}>
              <BarChart3 size={15} /> Enquete
            </button>
            <button
              className="btn btn-primary ml-auto px-4 py-1.5 text-xs"
              disabled={!canSend}
              onClick={async () => {
                setBusy(true);
                try {
                  await onPublish({ texto: texto.trim(), file, poll: validPoll ? { pergunta: pergunta.trim(), opcoes: opcoes.map((o) => o.trim()).filter(Boolean) } : null });
                  setTexto("");
                  setFile(null);
                  setPreview(null);
                  setPollOn(false);
                  setPergunta("");
                  setOpcoes(["", ""]);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Publicar
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

