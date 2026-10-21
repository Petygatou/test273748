import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

/** Server functions só aceitam chamadas do próprio site (proteção padrão do TanStack Start). */
const csrf = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });

/**
 * Banco compartilhado entre instâncias (Redis, quando configurado): antes de cada requisição
 * traz o que outras instâncias mudaram; depois, grava o que esta mudou — antes de responder,
 * porque na Vercel a função pode ser congelada logo após a resposta.
 */
const bancoCompartilhado = createMiddleware().server(async ({ next }) => {
  const { syncRemote, flushRemote } = await import("./server/db");
  await syncRemote();
  try {
    return await next();
  } finally {
    await flushRemote();
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrf, bancoCompartilhado],
}));
