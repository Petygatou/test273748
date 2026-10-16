/// <reference types="vite/client" />
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { HeadContent, Link, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Layout } from "../components/Layout";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Comandante FC — inteligência para o Cartola" },
      { name: "description", content: "Projeções scout a scout, simulação de Monte Carlo, otimizador exato de tropas e o Comandante, seu assistente tático para o Cartola FC." },
      { name: "theme-color", content: "#0b0c0f" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icon.svg" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Oxanium:wght@600;700;800&display=swap" },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
  errorComponent: RootError,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useVersionRecovery();
  return (
    <QueryClientProvider client={queryClient}>
      <Layout>
        <Outlet />
      </Layout>
    </QueryClientProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i;

/**
 * Auto-recuperação de versão: se o app foi atualizado enquanto o usuário
 * navegava, os chunks antigos somem do servidor. Em vez de tela branca,
 * recarregamos UMA vez (guarda em sessionStorage para não entrar em loop).
 */
function reloadOnce() {
  try {
    const k = "cfc:reloaded-at";
    const last = Number(sessionStorage.getItem(k) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(k, String(Date.now()));
  } catch {
    /* sem storage: recarrega mesmo assim */
  }
  window.location.reload();
  return true;
}

function useVersionRecovery() {
  useEffect(() => {
    const onPreload = (e: Event) => {
      e.preventDefault();
      reloadOnce();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (CHUNK_ERROR.test(String(e.reason?.message ?? e.reason))) reloadOnce();
    };
    window.addEventListener("vite:preloadError", onPreload);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("vite:preloadError", onPreload);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
}

function RootError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  useEffect(() => {
    if (CHUNK_ERROR.test(message)) reloadOnce();
  }, [message]);
  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="card p-5">
        <h1 className="font-display text-xl font-bold">Algo deu errado</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-3)]">{message}</p>
        <button className="btn btn-primary mt-4" onClick={() => window.location.reload()}>
          Recarregar
        </button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="card mx-auto max-w-lg p-6 text-center">
      <h1 className="font-display text-xl font-bold">Página não encontrada</h1>
      <Link to="/" className="btn btn-primary mt-4">
        Voltar ao início
      </Link>
    </div>
  );
}
