import { useMemo } from "react";
import type { ApiRequest, Environment } from "@/services/db";
import { useCodeSnippetPanelStore } from "@/features/code-snippets/stores/useCodeSnippetPanelStore";
import { snippetGeneratorMap } from "@/features/code-snippets/registry";
import { buildSnippetContext } from "@/features/code-snippets/utils/buildSnippetContext";
import { generateSnippet } from "@/features/code-snippets/utils/generate-snippet";
import { useRequestAncestors } from "@/hooks/useRequestAncestors";

export function useGeneratedSnippet(request?: ApiRequest | null, environment?: Environment | null) {
  const language = useCodeSnippetPanelStore((state) => state.selectedLanguage);
  const ancestors = useRequestAncestors(request);

  return useMemo(() => {
    if (!request) {
      const fallback = snippetGeneratorMap.get(language) ?? snippetGeneratorMap.get("curl");
      return {
        language,
        meta: fallback!.meta,
        code: "// Select a request to preview generated snippets.",
        context: null,
      };
    }

    const meta = (snippetGeneratorMap.get(language) ?? snippetGeneratorMap.get("curl"))!.meta;

    // Every generator here emits an HTTP call. None of these clients speaks
    // WebSocket, and the snippet would be actively misleading: it would show
    // a GET to a ws:// URL carrying the collection's Authorization header —
    // a header the handshake can't send at all (see the Headers tab).
    if (request.protocol === "websocket") {
      return {
        language,
        meta,
        code: `// ${meta.label} generates an HTTP request, and this is a WebSocket.\n// reqlo has no snippet for it: opening a connection, sending frames and\n// handling incoming ones has no single-call equivalent to copy.\n//\n// URL: ${request.url || "(not set)"}`,
        context: null,
      };
    }

    const context = buildSnippetContext(request, environment, ancestors);
    return {
      language,
      meta,
      code: generateSnippet(language, context),
      context,
    };
  }, [ancestors, environment, language, request]);
}
