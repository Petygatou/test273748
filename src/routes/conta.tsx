import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/conta")({
  component: ContaPage,
});

function ContaPage() {
  return <div className="card p-6">Em construção</div>;
}
