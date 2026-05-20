import {
  commentLine,
  indentBlock,
  isJsonContentType,
  joinSections,
  quoteBacktick,
  toJsObject,
} from "@/features/code-snippets/templates/common";
import type { SnippetGenerator } from "@/features/code-snippets/types";

export const fetchGenerator: SnippetGenerator = {
  meta: {
    id: "fetch",
    label: "JavaScript fetch",
    family: "frontend",
    description: "Browser-native fetch with clean request init.",
    monacoLanguage: "javascript",
    accent: "from-sky-400/80 to-cyan-200/80",
  },
  generate: (context) => {
    const setup: string[] = [];
    let bodyProperty = "";

    if (context.canSendBody) {
      switch (context.body.kind) {
        case "text":
          if (context.body.text) {
            const bodyValue = isJsonContentType(context.body.contentType)
              ? context.body.text
              : quoteBacktick(context.body.text);
            setup.push(`const body = ${bodyValue};`);
            bodyProperty = "body,";
          }
          break;
        case "urlencoded":
          setup.push(`const body = new URLSearchParams(${toJsObject(context.body.entries)});`);
          bodyProperty = "body,";
          break;
        case "multipart":
          setup.push("const formData = new FormData();");
          context.body.entries.forEach((entry) => {
            if (entry.kind === "file") {
              setup.push(
                `${commentLine(`Swap in a real File object for ${entry.fileName}`)}\nformData.append(${JSON.stringify(entry.key)}, new File([], ${JSON.stringify(entry.fileName)}, { type: ${JSON.stringify(entry.mimeType ?? "application/octet-stream")} }));`,
              );
              return;
            }
            setup.push(
              `formData.append(${JSON.stringify(entry.key)}, ${JSON.stringify(entry.value)});`,
            );
          });
          bodyProperty = "body: formData,";
          break;
        case "binary":
          setup.push(
            `${commentLine(`Replace this placeholder with a File or Blob for ${context.body.fileName}`)}\nconst body = new Blob([], { type: ${JSON.stringify(context.body.mimeType)} });`,
          );
          bodyProperty = "body,";
          break;
        case "none":
          break;
      }
    }

    const requestInit = [
      `method: ${JSON.stringify(context.method)},`,
      context.headers.length
        ? `headers: ${indentBlock(toJsObject(context.headers), 2).trimStart()},`
        : "",
      bodyProperty,
    ]
      .filter(Boolean)
      .join("\n");

    return joinSections(
      setup.join("\n"),
      `const response = await fetch(${JSON.stringify(context.url)}, {\n${indentBlock(requestInit)}\n});\n\nif (!response.ok) {\n  throw new Error(\`HTTP ${"${response.status}"} ${"${response.statusText}"}\`);\n}\n\nconst data = await response.text();\nconsole.log(data);`,
    );
  },
};
