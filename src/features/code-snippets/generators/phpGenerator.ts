import { commentLine, joinSections, quotePhp } from "@/features/code-snippets/templates/common";
import type { SnippetGenerator } from "@/features/code-snippets/types";

export const phpGenerator: SnippetGenerator = {
  meta: {
    id: "php",
    label: "PHP cURL",
    family: "backend",
    description: "PHP cURL handle for backend integrations.",
    monacoLanguage: "php",
    accent: "from-indigo-300/80 to-purple-200/80",
  },
  generate: (context) => {
    const headerLines = context.headers.map(
      (header) => `${quotePhp(`${header.key}: ${header.value}`)},`,
    );
    const options = [
      "CURLOPT_RETURNTRANSFER => true,",
      `CURLOPT_URL => ${quotePhp(context.url)},`,
      `CURLOPT_CUSTOMREQUEST => ${quotePhp(context.method)},`,
      headerLines.length
        ? `CURLOPT_HTTPHEADER => [\n        ${headerLines.join("\n        ")}\n    ],`
        : "",
    ];

    if (context.canSendBody) {
      switch (context.body.kind) {
        case "text":
          if (context.body.text) {
            options.push(`CURLOPT_POSTFIELDS => ${quotePhp(context.body.text)},`);
          }
          break;
        case "urlencoded":
          options.push(
            `CURLOPT_POSTFIELDS => http_build_query([\n${context.body.entries
              .map((entry) => `        ${quotePhp(entry.key)} => ${quotePhp(entry.value)},`)
              .join("\n")}\n    ]),`,
          );
          break;
        case "multipart":
          options.push(
            `CURLOPT_POSTFIELDS => [\n${context.body.entries
              .map((entry) =>
                entry.kind === "file"
                  ? `        ${quotePhp(entry.key)} => new CURLFile(${quotePhp(`./${entry.fileName ?? entry.value}`)}, ${quotePhp(entry.mimeType ?? "application/octet-stream")}, ${quotePhp(entry.fileName ?? entry.value)}),`
                  : `        ${quotePhp(entry.key)} => ${quotePhp(entry.value)},`,
              )
              .join("\n")}\n    ],`,
          );
          break;
        case "binary":
          options.push(
            `CURLOPT_POSTFIELDS => file_get_contents(${quotePhp(`./${context.body.fileName}`)}),`,
          );
          break;
        case "none":
          break;
      }
    }

    return joinSections(
      `<?php\n\n$curl = curl_init();\n\ncurl_setopt_array($curl, [\n    ${options.filter(Boolean).join("\n    ")}\n]);\n\n$response = curl_exec($curl);\n$status = curl_getinfo($curl, CURLINFO_HTTP_CODE);\n\nif ($response === false) {\n    throw new RuntimeException(curl_error($curl));\n}\n\ncurl_close($curl);\n\necho $status . PHP_EOL;\necho $response . PHP_EOL;`,
      context.body.kind === "multipart" || context.body.kind === "binary"
        ? commentLine("Update local file paths before executing the snippet.", "//")
        : "",
    );
  },
};
