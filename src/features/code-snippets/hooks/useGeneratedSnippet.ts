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

    const context = buildSnippetContext(request, environment, ancestors);
    const meta = (snippetGeneratorMap.get(language) ?? snippetGeneratorMap.get("curl"))!.meta;
    return {
      language,
      meta,
      code: generateSnippet(language, context),
      context,
    };
  }, [ancestors, environment, language, request]);
}
