import {
  commentLine,
  indentBlock,
  isJsonContentType,
  joinSections,
  quoteSingle,
} from "@/features/code-snippets/templates/common";
import type { SnippetGenerator } from "@/features/code-snippets/types";

export const pythonGenerator: SnippetGenerator = {
  meta: {
    id: "python",
    label: "Python requests",
    family: "backend",
    description: "Python requests client ready for scripts and tooling.",
    monacoLanguage: "python",
    accent: "from-yellow-300/80 to-blue-300/80",
  },
  generate: (context) => {
    const sections = ["import requests"];
    const bodyLines: string[] = [];
    let requestArgument = "";

    if (context.headers.length) {
      bodyLines.push(
        `headers = {\n${context.headers
          .map((header) => `    ${quoteSingle(header.key)}: ${quoteSingle(header.value)},`)
          .join("\n")}\n}`,
      );
    }

    if (context.canSendBody) {
      switch (context.body.kind) {
        case "text":
          if (context.body.text) {
            if (isJsonContentType(context.body.contentType)) {
              bodyLines.push(`payload = ${context.body.text}`);
              requestArgument = "json=payload,";
            } else {
              bodyLines.push(`payload = ${JSON.stringify(context.body.text)}`);
              requestArgument = "data=payload,";
            }
          }
          break;
        case "urlencoded":
          bodyLines.push(
            `payload = {\n${context.body.entries
              .map((entry) => `    ${quoteSingle(entry.key)}: ${quoteSingle(entry.value)},`)
              .join("\n")}\n}`,
          );
          requestArgument = "data=payload,";
          break;
        case "multipart": {
          const textEntries = context.body.entries.filter((entry) => entry.kind === "text");
          const fileEntries = context.body.entries.filter((entry) => entry.kind === "file");
          if (textEntries.length) {
            bodyLines.push(
              `data = {\n${textEntries
                .map((entry) => `    ${quoteSingle(entry.key)}: ${quoteSingle(entry.value)},`)
                .join("\n")}\n}`,
            );
          }
          if (fileEntries.length) {
            bodyLines.push(
              `files = {\n${fileEntries
                .map(
                  (entry) =>
                    `    ${quoteSingle(entry.key)}: (${quoteSingle(entry.fileName ?? entry.value)}, open(${quoteSingle(`./${entry.fileName ?? entry.value}`)}, "rb"), ${quoteSingle(entry.mimeType ?? "application/octet-stream")}),`,
                )
                .join("\n")}\n}`,
            );
          }
          requestArgument = [
            textEntries.length ? "data=data," : "",
            fileEntries.length ? "files=files," : "",
          ]
            .filter(Boolean)
            .join("\n    ");
          break;
        }
        case "binary":
          bodyLines.push(
            `${commentLine(`Replace ./${context.body.fileName} with your real file path`, "#")}\npayload = open(${quoteSingle(`./${context.body.fileName}`)}, "rb")`,
          );
          requestArgument = "data=payload,";
          break;
        case "none":
          break;
      }
    }

    const requestLines = [
      `response = requests.request(`,
      `    ${quoteSingle(context.method)},`,
      `    ${quoteSingle(context.url)},`,
      context.headers.length ? "    headers=headers," : "",
      requestArgument ? `    ${requestArgument}` : "",
      `)`,
      "",
      "print(response.status_code)",
      "print(response.text)",
    ]
      .filter(Boolean)
      .join("\n");

    return joinSections(bodyLines.join("\n\n"), requestLines);
  },
};
