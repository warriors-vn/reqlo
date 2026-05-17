import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/components/Workspace";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <Workspace />;
}
