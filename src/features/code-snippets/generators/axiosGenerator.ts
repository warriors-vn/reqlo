import {
  commentLine,
  indentBlock,
  isJsonContentType,
  joinSections,
  quoteBacktick,
  toJsObject,
} from "@/features/code-snippets/templates/common";
import type { SnippetGenerator } from "@/features/code-snippets/types";

export const axiosGenerator: SnippetGenerator = {
  meta: {
    id: "axios",
    label: "Axios",
    family: "frontend",
    description: "Promise-based Axios request config.",
    monacoLanguage: "javascript",
    accent: "from-indigo-400/80 to-violet-200/80",
  },
  generate: (context) => {
    const setup = ['import axios from "axios";\n'];
    let dataValue = "";

    if (context.canSendBody) {
      switch (context.body.kind) {
        case "text":
          if (context.body.text) {
            dataValue = isJsonContentType(context.body.contentType)
              ? context.body.text
              : quoteBacktick(context.body.text);
          }
          break;
        case "urlencoded":
          setup.push(`const data = new URLSearchParams(${toJsObject(context.body.entries)});`);
          dataValue = "data";
          break;
        case "multipart":
          setup.push("const data = new FormData();");
          context.body.entries.forEach((entry) => {
            if (entry.kind === "file") {
              setup.push(
                `${commentLine(`Replace with a real File object for ${entry.fileName}`)}\ndata.append(${JSON.stringify(entry.key)}, new File([], ${JSON.stringify(entry.fileName)}, { type: ${JSON.stringify(entry.mimeType ?? "application/octet-stream")} }));`,
              );
              return;
            }
            setup.push(
              `data.append(${JSON.stringify(entry.key)}, ${JSON.stringify(entry.value)});`,
            );
          });
          dataValue = "data";
          break;
        case "binary":
          setup.push(
            `${commentLine(`Replace with a Blob, File, or ArrayBuffer for ${context.body.fileName}`)}\nconst data = new Blob([], { type: ${JSON.stringify(context.body.mimeType)} });`,
          );
          dataValue = "data";
          break;
        case "none":
          break;
      }
    }

    const config = [
      `method: ${JSON.stringify(context.method.toLowerCase())},`,
      `url: ${JSON.stringify(context.url)},`,
      context.headers.length
        ? `headers: ${indentBlock(toJsObject(context.headers), 2).trimStart()},`
        : "",
      dataValue ? `data: ${dataValue},` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return joinSections(
      setup.join("\n"),
      `const response = await axios({\n${indentBlock(config)}\n});\n\nconsole.log(response.status, response.data);`,
    );
  },
};
