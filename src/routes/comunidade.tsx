import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/comunidade")({
  component: ComunidadePage,
});

function ComunidadePage() {
  return <div className="card p-6">Em construção</div>;
}
