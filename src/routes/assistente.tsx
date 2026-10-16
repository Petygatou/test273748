import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/assistente")({
  component: AssistentePage,
});

function AssistentePage() {
  return <div className="card p-6">Em construção</div>;
}
