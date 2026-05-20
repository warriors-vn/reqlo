import { commentLine, joinSections, quoteDouble } from "@/features/code-snippets/templates/common";
import type { SnippetGenerator } from "@/features/code-snippets/types";

export const rustGenerator: SnippetGenerator = {
  meta: {
    id: "rust",
    label: "Rust reqwest",
    family: "backend",
    description: "Async reqwest client with Tokio runtime.",
    monacoLanguage: "rust",
    accent: "from-orange-400/80 to-red-200/80",
  },
  generate: (context) => {
    const setup: string[] = [];
    let requestTail = "";

    if (context.canSendBody) {
      switch (context.body.kind) {
        case "text":
          if (context.body.text) requestTail = `.body(${quoteDouble(context.body.text)})`;
          break;
        case "urlencoded":
          setup.push(
            `let payload = [\n${context.body.entries
              .map((entry) => `    (${quoteDouble(entry.key)}, ${quoteDouble(entry.value)}),`)
              .join("\n")}\n];`,
          );
          requestTail = ".form(&payload)";
          break;
        case "multipart":
          setup.push("let form = reqwest::multipart::Form::new()");
          context.body.entries.forEach((entry, index, entries) => {
            const suffix = index === entries.length - 1 ? ";" : "";
            if (entry.kind === "file") {
              setup.push(
                `    .part(${quoteDouble(entry.key)}, reqwest::multipart::Part::file(${quoteDouble(`./${entry.fileName ?? entry.value}`)}).await?.mime_str(${quoteDouble(entry.mimeType ?? "application/octet-stream")})?)${suffix}`,
              );
              return;
            }
            setup.push(
              `    .text(${quoteDouble(entry.key)}, ${quoteDouble(entry.value)})${suffix}`,
            );
          });
          requestTail = ".multipart(form)";
          break;
        case "binary":
          setup.push(
            `let payload = tokio::fs::read(${quoteDouble(`./${context.body.fileName}`)}).await?;`,
          );
          requestTail = ".body(payload)";
          break;
        case "none":
          break;
      }
    }

    const headers = context.headers
      .map((header) => `.header(${quoteDouble(header.key)}, ${quoteDouble(header.value)})`)
      .join("\n        ");

    return joinSections(
      `use reqwest::Client;\n\n#[tokio::main]\nasync fn main() -> Result<(), Box<dyn std::error::Error>> {\n    let client = Client::new();\n${setup.length ? `\n${setup.map((line) => `    ${line}`).join("\n")}\n` : ""}\n    let response = client\n        .request(reqwest::Method::${context.method}, ${quoteDouble(context.url)})${headers ? `\n        ${headers}` : ""}${requestTail ? `\n        ${requestTail}` : ""}\n        .send()\n        .await?;\n\n    let status = response.status();\n    let body = response.text().await?;\n\n    println!("{}", status);\n    println!("{}", body);\n\n    Ok(())\n}`,
      context.body.kind === "multipart" || context.body.kind === "binary"
        ? commentLine("Update file paths so the snippet can read local assets.")
        : "",
    );
  },
};
