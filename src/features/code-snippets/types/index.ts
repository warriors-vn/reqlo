import type {
  ApiRequest,
  Environment,
  HttpMethod,
  RequestAuth,
  RequestBodyType,
} from "@/services/db";

export type SnippetLanguage =
  | "curl"
  | "fetch"
  | "axios"
  | "node"
  | "python"
  | "go"
  | "java"
  | "csharp"
  | "php"
  | "rust";

export type SnippetFamily = "cli" | "frontend" | "backend";

export interface SnippetLanguageMeta {
  id: SnippetLanguage;
  label: string;
  family: SnippetFamily;
  description: string;
  monacoLanguage: string;
  accent: string;
}

export interface SnippetHeader {
  key: string;
  value: string;
}

export interface SnippetQueryParam {
  key: string;
  value: string;
}

export interface SnippetMultipartEntry {
  key: string;
  kind: "text" | "file";
  value: string;
  fileName?: string;
  mimeType?: string;
  hasBlob?: boolean;
}

export type SnippetBody =
  | { kind: "none"; contentType: null }
  | {
      kind: "text";
      bodyType: Extract<RequestBodyType, "json" | "raw" | "xml" | "graphql">;
      text: string;
      contentType: string | null;
    }
  | {
      kind: "urlencoded";
      entries: SnippetQueryParam[];
      encoded: string;
      contentType: string;
    }
  | {
      kind: "multipart";
      entries: SnippetMultipartEntry[];
      contentType: null;
    }
  | {
      kind: "binary";
      fileName: string;
      mimeType: string;
      size: number;
      hasBlob: boolean;
      contentType: string;
    };

export interface SnippetContext {
  requestName: string;
  method: HttpMethod;
  url: string;
  headers: SnippetHeader[];
  queryParams: SnippetQueryParam[];
  body: SnippetBody;
  canSendBody: boolean;
  authType: RequestAuth["type"];
  request: ApiRequest;
  environment: Environment | null;
}

export interface SnippetGenerator {
  meta: SnippetLanguageMeta;
  generate: (context: SnippetContext) => string;
}
