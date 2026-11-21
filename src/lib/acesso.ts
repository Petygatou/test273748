/** Acesso pago (cliente): a chave fica sob ["me"], então entrar/sair também atualiza o acesso. */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { fetchAcesso } from "../server/fnsAssinatura";

export const acessoQuery = queryOptions({ queryKey: ["me", "acesso"], queryFn: () => fetchAcesso(), staleTime: 60_000 });

/** Páginas abertas a todos, mesmo com a cobrança ligada. */
const LIVRES = ["/", "/conta", "/guia", "/admin", "/assinar"];

export const paginaLivre = (path: string) => LIVRES.includes(path) || path.startsWith("/api/");

export function useAcesso() {
  return useQuery(acessoQuery);
}
