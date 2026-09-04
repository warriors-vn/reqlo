import { createFileRoute } from "@tanstack/react-router";
import { handleProxyRequest } from "@/services/proxy-handler";

// ANY, not POST: fetchViaProxy (executor.ts) re-sends the outer call to
// /api/proxy with the SAME method as the original target request (a GET stays
// a GET), since the tunnel is transparent — the real HTTP verb only ever
// matters for the forwarded upstream fetch inside the handler.
export const Route = createFileRoute("/api/proxy")({
  server: { handlers: { ANY: handleProxyRequest } },
});
