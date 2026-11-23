import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Crown, Gift, Inbox, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { timeAgo } from "../lib/format";
import { useRealtime } from "../lib/realtime";
import { adminAssinaturaAcaoFn, adminAssinaturasFn } from "../server/fnsAssinatura";
import { CampoSenha } from "./CampoSenha";
import { Alert, Card, SectionTitle, StatTile } from "./ui";

const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const STATUS: Record<string, string> = { ativa: "Em dia", cancelada: "Não renova", atrasada: "Renovação recusada", estornada: "Estornada" };
const erroTxt = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado.");

/** Painel ADM → Assinaturas: liga a cobrança, conecta a Cakto, libera e-mails e mostra os avisos recebidos. */
export function AdminAssinaturas() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-assinaturas"], queryFn: () => adminAssinaturasFn() });
  useRealtime(["assinaturas"], () => void qc.invalidateQueries({ queryKey: ["admin-assinaturas"] }));
  const recarregar = () => Promise.all([qc.invalidateQueries({ queryKey: ["admin-assinaturas"] }), qc.invalidateQueries({ queryKey: ["me"] })]);

  if (q.error) return <Alert tone="critical">{erroTxt(q.error)}</Alert>;
  if (!q.data) return <div className="h-40 animate-pulse rounded-2xl bg-[var(--color-surface-2)]" />;
  const d = q.data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Assinantes" value={d.resumo.ativas} accent="good" />
        <StatTile label="Cortesias" value={d.resumo.cortesias} accent="gold" />
        <StatTile label="Vencidas" value={d.resumo.vencidas} />
      </div>
      <Configuracao d={d} onSalvo={recarregar} />
      <Liberar onFeito={recarregar} />
      <Lista lista={d.lista} onFeito={recarregar} />
      <Eventos eventos={d.eventos} />
    </div>
  );
}

type Painel = Awaited<ReturnType<typeof adminAssinaturasFn>>;

function Configuracao({ d, onSalvo }: { d: Painel; onSalvo: () => Promise<unknown> }) {
  const [checkout, setCheckout] = useState(d.config.checkout);
  const [produto, setProduto] = useState(d.config.produto);
  const [segredo, setSegredo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [origem, setOrigem] = useState("");
  useEffect(() => setOrigem(window.location.origin), []);
  const webhook = `${origem}/api/cakto`;

  const salvar = async (ativo: boolean) => {
    setOcupado(true);
    setMsg(null);
    try {
      await adminAssinaturaAcaoFn({ data: { acao: "config", ativo, checkout, produto, segredo } });
      await onSalvo();
      setSegredo("");
      setMsg({ ok: true, t: ativo ? "Cobrança ligada: as páginas pagas pedem assinatura." : "Salvo." });
    } catch (e) {
      setMsg({ ok: false, t: erroTxt(e) });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Card className="space-y-4 p-4">
      <SectionTitle
        icon={<Crown size={18} />}
        title="Cakto"
        subtitle="Quem paga no checkout com o mesmo e-mail da conta tem o acesso liberado sozinho."
        right={<span className={`chip ${d.config.ativo ? "border-[var(--color-good)]/40 text-[var(--color-good-ink)]" : ""}`}>{d.config.ativo ? "Cobrança ligada" : "Cobrança desligada"}</span>}
      />

      <ol className="space-y-3 text-sm">
        <li className="space-y-1.5">
          <div>
            <b>1. Webhook na Cakto.</b> Em Integrações → Webhooks, crie um com este endereço e marque os eventos de compra aprovada, assinatura (renovada, cancelada, renovação recusada), reembolso e
            chargeback.
          </div>
          <div className="flex gap-2">
            <input className="input font-mono text-xs" readOnly value={webhook} aria-label="Endereço do webhook" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn shrink-0"
              onClick={() => {
                void navigator.clipboard?.writeText(webhook);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1500);
              }}
            >
              {copiado ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
        </li>
        <li className="space-y-1.5">
          <div>
            <b>2. Chave do webhook</b> que a Cakto mostra no webhook.{" "}
            {d.segredoDefinido ? (
              <span className="text-[var(--color-good-ink)]">
                <Check size={14} className="inline" aria-hidden /> {d.segredoNaVariavel ? "definida na hospedagem" : "salva"}
              </span>
            ) : (
              <span className="text-[var(--color-serious)]">falta</span>
            )}
          </div>
          {!d.segredoNaVariavel && (
            <CampoSenha
              className="font-mono"
              autoComplete="off"
              placeholder={d.segredoDefinido ? "salva — cole outra só para trocar" : "cole aqui a chave do webhook"}
              value={segredo}
              onChange={(e) => setSegredo(e.target.value)}
              aria-label="Chave do webhook da Cakto"
            />
          )}
        </li>
        <li className="space-y-1.5">
          <b>3. Link do checkout</b> da assinatura (começa com https://pay.cakto.com.br/).
          <input className="input" placeholder="https://pay.cakto.com.br/..." value={checkout} onChange={(e) => setCheckout(e.target.value)} aria-label="Link do checkout" />
        </li>
        <li className="space-y-1.5">
          <b>4. ID do produto</b> <span className="text-[var(--color-ink-3)]">(opcional: se você vende outras coisas na Cakto, só este produto libera o Tropa)</span>
          <input className="input" placeholder="deixe vazio para aceitar qualquer produto" value={produto} onChange={(e) => setProduto(e.target.value)} aria-label="ID do produto" />
        </li>
      </ol>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={ocupado} onClick={() => salvar(d.config.ativo)}>
          Salvar
        </button>
        {d.config.ativo ? (
          <button type="button" className="btn" disabled={ocupado} onClick={() => salvar(false)}>
            Desligar cobrança
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={ocupado || (!d.segredoDefinido && !segredo.trim())}
            onClick={() => salvar(true)}
            title={d.segredoDefinido || segredo.trim() ? undefined : "Cole a chave do webhook primeiro"}
          >
            Ligar cobrança
          </button>
        )}
      </div>
      <p className="text-xs text-[var(--color-ink-3)]">
        Com a cobrança ligada, só Início, Guia e Conta ficam abertos para quem não assina. Admins sempre têm acesso. Antes de ligar, libere como cortesia quem já usa o site e deve continuar sem pagar.
      </p>
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-[var(--color-good-ink)]" : "text-[var(--color-critical-ink)]"}`} role="status">
          {msg.t}
        </p>
      )}
    </Card>
  );
}

function Liberar({ onFeito }: { onFeito: () => Promise<unknown> }) {
  const [email, setEmail] = useState("");
  const [dias, setDias] = useState("30");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setMsg(null);
    try {
      await adminAssinaturaAcaoFn({ data: { acao: "liberar", email, dias: Number(dias) } });
      await onFeito();
      setMsg({ ok: true, t: `${email.trim()} liberado.` });
      setEmail("");
    } catch (err) {
      setMsg({ ok: false, t: erroTxt(err) });
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Card className="p-4">
      <SectionTitle icon={<Gift size={18} />} title="Liberar acesso (cortesia)" subtitle="Para equipe, parceiros ou quem pagou por fora." />
      <form onSubmit={enviar} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input className="input flex-1" type="email" required placeholder="e-mail da conta" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-mail" />
        <select className="input sm:w-40" value={dias} onChange={(e) => setDias(e.target.value)} aria-label="Por quanto tempo">
          <option value="7">7 dias</option>
          <option value="30">30 dias</option>
          <option value="90">90 dias</option>
          <option value="365">1 ano</option>
          <option value="0">Sem prazo</option>
        </select>
        <button type="submit" className="btn btn-primary" disabled={ocupado}>
          Liberar
        </button>
      </form>
      {msg && (
        <p className={`mt-2 text-sm ${msg.ok ? "text-[var(--color-good-ink)]" : "text-[var(--color-critical-ink)]"}`} role="status">
          {msg.t}
        </p>
      )}
    </Card>
  );
}

function Lista({ lista, onFeito }: { lista: Painel["lista"]; onFeito: () => Promise<unknown> }) {
  const [erro, setErro] = useState("");
  const remover = async (email: string) => {
    if (!window.confirm(`Tirar o acesso de ${email}?`)) return;
    try {
      await adminAssinaturaAcaoFn({ data: { acao: "remover", email } });
      await onFeito();
    } catch (e) {
      setErro(erroTxt(e));
    }
  };
  return (
    <Card className="p-4">
      <SectionTitle title="Quem tem acesso" subtitle={`${lista.length} e-mail${lista.length === 1 ? "" : "s"}`} />
      {erro && <Alert tone="critical">{erro}</Alert>}
      {!lista.length ? (
        <p className="mt-3 text-sm text-[var(--color-ink-3)]">Ninguém ainda. Os assinantes aparecem aqui assim que a Cakto confirmar o pagamento.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--color-line)]">
          {lista.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{a.email}</div>
                <div className="text-xs text-[var(--color-ink-3)]">
                  {a.origem === "cortesia" ? "Cortesia" : STATUS[a.status]} · {a.semPrazo ? "sem prazo" : `${a.valida ? "até" : "venceu em"} ${dataBR(a.validaAte)}`}
                  {!a.temConta && " · ainda sem conta no Tropa"}
                </div>
              </div>
              <span className={`chip shrink-0 ${a.valida ? "border-[var(--color-good)]/40 text-[var(--color-good-ink)]" : ""}`}>{a.valida ? "Com acesso" : "Sem acesso"}</span>
              <button type="button" className="btn shrink-0 px-2" onClick={() => remover(a.email)} aria-label={`Tirar o acesso de ${a.email}`} title="Tirar o acesso">
                <Trash2 size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Eventos({ eventos }: { eventos: Painel["eventos"] }) {
  return (
    <Card className="p-4">
      <SectionTitle icon={<Inbox size={18} />} title="Avisos da Cakto" subtitle="Os últimos avisos recebidos e o que o Tropa fez com cada um." />
      {!eventos.length ? (
        <p className="mt-3 text-sm text-[var(--color-ink-3)]">Nenhum aviso ainda. Na Cakto, use “Enviar teste” no webhook para conferir a ligação.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--color-line)]">
          {eventos.map((e) => (
            <li key={e.id} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <code className="text-xs font-semibold">{e.evento}</code>
                {e.email && <span className="text-[var(--color-ink-2)]">{e.email}</span>}
                <span className="ml-auto text-xs text-[var(--color-ink-3)]">{timeAgo(e.recebidoEm)}</span>
              </div>
              <div className={`text-xs ${e.resultado.startsWith("recusado") || e.resultado.startsWith("ignorado") ? "text-[var(--color-serious)]" : "text-[var(--color-ink-3)]"}`}>{e.resultado}</div>
              {e.campos.length > 0 && (
                <details className="text-xs text-[var(--color-ink-3)]">
                  <summary className="cursor-pointer">campos recebidos</summary>
                  <code className="break-all">{e.campos.join(", ")}</code>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
