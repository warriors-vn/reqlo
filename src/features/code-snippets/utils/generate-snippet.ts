import { snippetGeneratorMap } from "@/features/code-snippets/registry";
import { buildSnippetContext } from "@/features/code-snippets/utils/buildSnippetContext";
import type { SnippetContext, SnippetLanguage } from "@/features/code-snippets/types";
import type { ApiRequest, Environment } from "@/services/db";

export function generateSnippet(language: SnippetLanguage, context: SnippetContext) {
  return (snippetGeneratorMap.get(language) ?? snippetGeneratorMap.get("curl"))!.generate(context);
}

export function generateSnippetFromRequest(
  language: SnippetLanguage,
  request: ApiRequest,
  environment?: Environment | null,
) {
  return generateSnippet(language, buildSnippetContext(request, environment));
}
