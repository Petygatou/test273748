import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/noticias")({
  component: NoticiasPage,
});

function NoticiasPage() {
  return <div className="card p-6">Em construção</div>;
}
