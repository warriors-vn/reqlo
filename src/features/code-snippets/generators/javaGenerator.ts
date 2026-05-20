import { commentLine, joinSections, quoteDouble } from "@/features/code-snippets/templates/common";
import type { SnippetGenerator } from "@/features/code-snippets/types";

export const javaGenerator: SnippetGenerator = {
  meta: {
    id: "java",
    label: "Java OkHttp",
    family: "backend",
    description: "OkHttp client for JVM services and tooling.",
    monacoLanguage: "java",
    accent: "from-orange-300/80 to-amber-200/80",
  },
  generate: (context) => {
    const setup: string[] = ["OkHttpClient client = new OkHttpClient();"];
    let requestBodyExpression = "null";

    if (context.canSendBody) {
      switch (context.body.kind) {
        case "text": {
          const mediaType = context.body.contentType ?? "text/plain";
          requestBodyExpression = `RequestBody.create(${quoteDouble(context.body.text)}, MediaType.parse(${quoteDouble(mediaType)}))`;
          break;
        }
        case "urlencoded":
          requestBodyExpression = `new FormBody.Builder()\n${context.body.entries
            .map((entry) => `    .add(${quoteDouble(entry.key)}, ${quoteDouble(entry.value)})`)
            .join("\n")}\n    .build()`;
          break;
        case "multipart":
          requestBodyExpression = `new MultipartBody.Builder()\n    .setType(MultipartBody.FORM)\n${context.body.entries
            .map((entry) =>
              entry.kind === "file"
                ? `    .addFormDataPart(${quoteDouble(entry.key)}, ${quoteDouble(entry.fileName ?? entry.value)}, RequestBody.create(new File(${quoteDouble(`./${entry.fileName ?? entry.value}`)}), MediaType.parse(${quoteDouble(entry.mimeType ?? "application/octet-stream")})))`
                : `    .addFormDataPart(${quoteDouble(entry.key)}, ${quoteDouble(entry.value)})`,
            )
            .join("\n")}\n    .build()`;
          break;
        case "binary":
          requestBodyExpression = `RequestBody.create(new File(${quoteDouble(`./${context.body.fileName}`)}), MediaType.parse(${quoteDouble(context.body.mimeType)}))`;
          break;
        case "none":
          break;
      }
    }

    const headers = context.headers
      .map((header) => `.addHeader(${quoteDouble(header.key)}, ${quoteDouble(header.value)})`)
      .join("\n            ");

    return joinSections(
      `import java.io.File;\nimport okhttp3.*;\n\npublic class ReqloSnippet {\n    public static void main(String[] args) throws Exception {\n        ${setup.join("\n        ")}\n\n        Request request = new Request.Builder()\n            .url(${quoteDouble(context.url)})\n            .method(${quoteDouble(context.method)}, ${requestBodyExpression})${headers ? `\n            ${headers}` : ""}\n            .build();\n\n        try (Response response = client.newCall(request).execute()) {\n            System.out.println(response.code());\n            System.out.println(response.body() != null ? response.body().string() : "");\n        }\n    }\n}`,
      context.body.kind === "multipart" || context.body.kind === "binary"
        ? commentLine("Point any File paths to assets that exist on your machine.")
        : "",
    );
  },
};
