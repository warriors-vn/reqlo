import {
  commentLine,
  indentBlock,
  isJsonContentType,
  joinSections,
  quoteBacktick,
  toJsObject,
} from "@/features/code-snippets/templates/common";
import type { SnippetGenerator } from "@/features/code-snippets/types";

export const nodeGenerator: SnippetGenerator = {
  meta: {
    id: "node",
    label: "Node.js",
    family: "backend",
    description: "Node 18+ native fetch with file-system helpers.",
    monacoLanguage: "javascript",
    accent: "from-emerald-400/80 to-lime-200/80",
  },
  generate: (context) => {
    const imports = new Set<string>();
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
          imports.add('import { openAsBlob } from "node:fs";');
          setup.push("const formData = new FormData();");
          context.body.entries.forEach((entry) => {
            if (entry.kind === "file") {
              setup.push(
                `${commentLine(`Replace ./uploads/${entry.fileName} with your local file path`)}\nformData.append(${JSON.stringify(entry.key)}, await openAsBlob(${JSON.stringify(`./uploads/${entry.fileName}`)}, { type: ${JSON.stringify(entry.mimeType ?? "application/octet-stream")} }), ${JSON.stringify(entry.fileName)});`,
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
          imports.add('import { readFile } from "node:fs/promises";');
          setup.push(
            `const body = await readFile(${JSON.stringify(`./${context.body.fileName}`)});`,
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
      Array.from(imports).join("\n"),
      setup.join("\n"),
      `const response = await fetch(${JSON.stringify(context.url)}, {\n${indentBlock(requestInit)}\n});\n\nconst text = await response.text();\nconsole.log(response.status, text);`,
    );
  },
};
