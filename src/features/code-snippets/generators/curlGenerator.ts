import { commentLine, joinSections, quoteShell } from "@/features/code-snippets/templates/common";
import type { SnippetGenerator } from "@/features/code-snippets/types";

export const curlGenerator: SnippetGenerator = {
  meta: {
    id: "curl",
    label: "cURL",
    family: "cli",
    description: "Shell-ready cURL for terminals and docs.",
    monacoLanguage: "shell",
    accent: "from-slate-400/80 to-zinc-200/80",
  },
  generate: (context) => {
    const lines = [
      `curl --request ${context.method}`,
      `  --url ${quoteShell(context.url)}`,
      ...context.headers.map(
        (header) => `  --header ${quoteShell(`${header.key}: ${header.value}`)}`,
      ),
    ];

    if (context.canSendBody) {
      switch (context.body.kind) {
        case "text":
          if (context.body.text) lines.push(`  --data ${quoteShell(context.body.text)}`);
          break;
        case "urlencoded":
          context.body.entries.forEach((entry) => {
            lines.push(`  --data-urlencode ${quoteShell(`${entry.key}=${entry.value}`)}`);
          });
          break;
        case "multipart":
          context.body.entries.forEach((entry) => {
            if (entry.kind === "file") {
              const suffix = entry.mimeType ? `;type=${entry.mimeType}` : "";
              lines.push(`  --form ${quoteShell(`${entry.key}=@${entry.fileName}${suffix}`)}`);
              return;
            }
            lines.push(`  --form ${quoteShell(`${entry.key}=${entry.value}`)}`);
          });
          break;
        case "binary":
          lines.push(`  --data-binary ${quoteShell(`@${context.body.fileName}`)}`);
          break;
        case "none":
          break;
      }
    }

    const bodyHint =
      context.body.kind === "binary"
        ? commentLine(`Attach ${context.body.fileName} before running.`, "#")
        : context.body.kind === "multipart" &&
            context.body.entries.some((entry) => entry.kind === "file" && !entry.hasBlob)
          ? commentLine(
              "Some file parts were restored from metadata only; re-attach local files if needed.",
              "#",
            )
          : "";

    return joinSections(lines.join(" \\\n"), bodyHint);
  },
};
