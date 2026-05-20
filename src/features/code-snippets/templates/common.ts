import type { SnippetHeader, SnippetQueryParam } from "@/features/code-snippets/types";

export function indentBlock(input: string, spaces = 2) {
  const pad = " ".repeat(spaces);
  return input
    .split("\n")
    .map((line) => (line ? `${pad}${line}` : line))
    .join("\n");
}

export function quoteSingle(value: string) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function quoteDouble(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export function quoteBacktick(value: string) {
  return `\`${value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``;
}

export function quotePhp(value: string) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function quoteRust(value: string) {
  return `String::from(${quoteDouble(value)})`;
}

export function quoteShell(value: string) {
  if (!value) return "''";
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function toJsObject(entries: Array<SnippetHeader | SnippetQueryParam>, spaces = 2) {
  const record = Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
  return JSON.stringify(record, null, spaces);
}

export function toPythonDict(entries: Array<SnippetHeader | SnippetQueryParam>, spaces = 4) {
  if (!entries.length) return "{}";
  const pad = " ".repeat(spaces);
  return `\n${entries
    .map((entry) => `${pad}${quoteSingle(entry.key)}: ${quoteSingle(entry.value)},`)
    .join("\n")}\n`;
}

export function toGoHeaderBlock(
  entries: Array<SnippetHeader | SnippetQueryParam>,
  receiver = "req.Header",
) {
  return entries
    .map((entry) => `${receiver}.Set(${quoteDouble(entry.key)}, ${quoteDouble(entry.value)})`)
    .join("\n");
}

export function toJavaHeadersArray(entries: SnippetHeader[]) {
  if (!entries.length) return "";
  return entries
    .map((entry) => `${quoteDouble(entry.key)}, ${quoteDouble(entry.value)}`)
    .join(",\n          ");
}

export function toCSharpDictionary(entries: Array<SnippetHeader | SnippetQueryParam>) {
  if (!entries.length) return "new Dictionary<string, string>()";
  return `new Dictionary<string, string>\n{\n${entries
    .map((entry) => `    { ${quoteDouble(entry.key)}, ${quoteDouble(entry.value)} },`)
    .join("\n")}\n}`;
}

export function toPhpArray(entries: Array<SnippetHeader | SnippetQueryParam>, indent = 8) {
  if (!entries.length) return "[]";
  const pad = " ".repeat(indent);
  return `[\n${entries
    .map((entry) => `${pad}${quotePhp(entry.key)} => ${quotePhp(entry.value)},`)
    .join("\n")}\n${" ".repeat(Math.max(indent - 4, 0))}]`;
}

export function toRustTupleVec(entries: Array<SnippetHeader | SnippetQueryParam>, indent = 8) {
  if (!entries.length) return "vec![]";
  const pad = " ".repeat(indent);
  return `vec![\n${entries
    .map(
      (entry) =>
        `${pad}(${quoteDouble(entry.key)}.to_string(), ${quoteDouble(entry.value)}.to_string()),`,
    )
    .join("\n")}\n${" ".repeat(Math.max(indent - 4, 0))}]`;
}

export function joinSections(...sections: Array<string | false | null | undefined>) {
  return sections.filter(Boolean).join("\n\n");
}

export function commentLine(text: string, prefix = "//") {
  return `${prefix} ${text}`;
}

export function isJsonContentType(contentType: string | null | undefined) {
  return !!contentType && contentType.toLowerCase().includes("json");
}
