import {
  commentLine,
  indentBlock,
  isJsonContentType,
  joinSections,
  quoteDouble,
  toGoHeaderBlock,
} from "@/features/code-snippets/templates/common";
import type { SnippetGenerator } from "@/features/code-snippets/types";

export const golangGenerator: SnippetGenerator = {
  meta: {
    id: "go",
    label: "Go net/http",
    family: "backend",
    description: "Go client using net/http and idiomatic request builders.",
    monacoLanguage: "go",
    accent: "from-cyan-300/80 to-sky-200/80",
  },
  generate: (context) => {
    const imports = new Set(["fmt", "io", "net/http", "strings"]);
    const setup: string[] = [];
    let bodySource = "nil";
    let postSetup = "";

    if (context.canSendBody) {
      switch (context.body.kind) {
        case "text":
          if (context.body.text) {
            bodySource = `strings.NewReader(${quoteDouble(context.body.text)})`;
          }
          break;
        case "urlencoded":
          imports.add("net/url");
          setup.push(
            `form := url.Values{\n${context.body.entries
              .map((entry) => `\t${quoteDouble(entry.key)}: []string{${quoteDouble(entry.value)}},`)
              .join("\n")}\n}`,
          );
          bodySource = "strings.NewReader(form.Encode())";
          break;
        case "multipart":
          imports.add("bytes");
          imports.add("mime/multipart");
          imports.add("os");
          setup.push("var requestBody bytes.Buffer");
          setup.push("writer := multipart.NewWriter(&requestBody)");
          context.body.entries.forEach((entry) => {
            if (entry.kind === "file") {
              setup.push(
                `fileWriter, err := writer.CreateFormFile(${quoteDouble(entry.key)}, ${quoteDouble(entry.fileName ?? entry.value)})`,
              );
              setup.push("if err != nil { panic(err) }");
              setup.push(
                `fileHandle, err := os.Open(${quoteDouble(`./${entry.fileName ?? entry.value}`)})`,
              );
              setup.push("if err != nil { panic(err) }");
              setup.push("defer fileHandle.Close()");
              setup.push("if _, err = io.Copy(fileWriter, fileHandle); err != nil { panic(err) }");
              return;
            }
            setup.push(
              `if err := writer.WriteField(${quoteDouble(entry.key)}, ${quoteDouble(entry.value)}); err != nil { panic(err) }`,
            );
          });
          setup.push("if err := writer.Close(); err != nil { panic(err) }");
          bodySource = "&requestBody";
          postSetup = 'req.Header.Set("Content-Type", writer.FormDataContentType())';
          break;
        case "binary":
          imports.add("bytes");
          imports.add("os");
          setup.push(`payload, err := os.ReadFile(${quoteDouble(`./${context.body.fileName}`)})`);
          setup.push("if err != nil { panic(err) }");
          bodySource = "bytes.NewReader(payload)";
          break;
        case "none":
          break;
      }
    }

    const headerLines = context.headers.length ? toGoHeaderBlock(context.headers) : "";
    const importBlock = Array.from(imports)
      .sort()
      .map((pkg) => `\t${quoteDouble(pkg)}`)
      .join("\n");

    const main = [
      "package main",
      "",
      `import (\n${importBlock}\n)`,
      "",
      "func main() {",
      setup.length ? indentBlock(setup.join("\n"), 1).replace(/^/gm, "\t") : "",
      `\treq, err := http.NewRequest(${quoteDouble(context.method)}, ${quoteDouble(context.url)}, ${bodySource})`,
      "\tif err != nil { panic(err) }",
      headerLines ? indentBlock(headerLines, 1).replace(/^/gm, "\t") : "",
      postSetup ? `\t${postSetup}` : "",
      "",
      "\tresp, err := http.DefaultClient.Do(req)",
      "\tif err != nil { panic(err) }",
      "\tdefer resp.Body.Close()",
      "",
      "\tbody, err := io.ReadAll(resp.Body)",
      "\tif err != nil { panic(err) }",
      "",
      '\tfmt.Println("status:", resp.Status)',
      "\tfmt.Println(string(body))",
      "}",
    ]
      .filter(Boolean)
      .join("\n");

    return joinSections(
      main,
      context.body.kind === "multipart"
        ? `// ${commentLine("Remember to point file paths at real files before running.", "")}`
        : "",
    );
  },
};
