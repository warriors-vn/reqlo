import { commentLine, joinSections, quoteDouble } from "@/features/code-snippets/templates/common";
import type { SnippetGenerator } from "@/features/code-snippets/types";

export const csharpGenerator: SnippetGenerator = {
  meta: {
    id: "csharp",
    label: "C#",
    family: "backend",
    description: "HttpClient snippet for .NET services and tools.",
    monacoLanguage: "csharp",
    accent: "from-violet-400/80 to-fuchsia-200/80",
  },
  generate: (context) => {
    const setup: string[] = [];
    let contentExpression = "null";

    if (context.canSendBody) {
      switch (context.body.kind) {
        case "text":
          if (context.body.text) {
            contentExpression = `new StringContent(${quoteDouble(context.body.text)}, Encoding.UTF8, ${quoteDouble(context.body.contentType ?? "text/plain")})`;
          }
          break;
        case "urlencoded":
          contentExpression = `new FormUrlEncodedContent(new Dictionary<string, string>\n        {\n${context.body.entries
            .map(
              (entry) => `            { ${quoteDouble(entry.key)}, ${quoteDouble(entry.value)} },`,
            )
            .join("\n")}\n        })`;
          break;
        case "multipart":
          setup.push("var content = new MultipartFormDataContent();");
          context.body.entries.forEach((entry) => {
            if (entry.kind === "file") {
              setup.push(
                `content.Add(new StreamContent(File.OpenRead(${quoteDouble(`./${entry.fileName ?? entry.value}`)})), ${quoteDouble(entry.key)}, ${quoteDouble(entry.fileName ?? entry.value)});`,
              );
              return;
            }
            setup.push(
              `content.Add(new StringContent(${quoteDouble(entry.value)}), ${quoteDouble(entry.key)});`,
            );
          });
          contentExpression = "content";
          break;
        case "binary":
          setup.push(
            `var payload = await File.ReadAllBytesAsync(${quoteDouble(`./${context.body.fileName}`)});`,
          );
          contentExpression = `new ByteArrayContent(payload)`;
          break;
        case "none":
          break;
      }
    }

    const headerLines = context.headers.map(
      (header) =>
        `request.Headers.TryAddWithoutValidation(${quoteDouble(header.key)}, ${quoteDouble(header.value)});`,
    );

    return joinSections(
      `using System.Net.Http;\nusing System.Text;\n\nvar client = new HttpClient();\nvar request = new HttpRequestMessage(HttpMethod.${context.method[0]}${context.method.slice(1).toLowerCase()}, ${quoteDouble(context.url)});\n${headerLines.join("\n")}\n${setup.join("\n")}\n${contentExpression !== "null" ? `request.Content = ${contentExpression};` : ""}\n\nvar response = await client.SendAsync(request);\nvar body = await response.Content.ReadAsStringAsync();\n\nConsole.WriteLine((int)response.StatusCode);\nConsole.WriteLine(body);`,
      context.body.kind === "multipart" || context.body.kind === "binary"
        ? commentLine("Update file paths before running the snippet.")
        : "",
    );
  },
};
