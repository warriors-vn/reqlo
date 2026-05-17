import type {
  ApiRequest,
  BinaryBodyDraft,
  FormDataRow,
  GraphqlBodyDraft,
  KV,
  RequestBodyDrafts,
  RequestBodyType,
  StoredFileBlob,
} from "@/services/db";

export type {
  ApiRequest,
  BinaryBodyDraft,
  FormDataRow,
  GraphqlBodyDraft,
  KV,
  RequestBodyDrafts,
  RequestBodyType,
  StoredFileBlob,
};

export interface SerializedRequestBody {
  body?: BodyInit | null;
  headers: Record<string, string>;
  contentType: string | null;
}

export const BODY_TYPE_OPTIONS: Array<{ id: RequestBodyType; label: string; shortLabel: string }> =
  [
    { id: "none", label: "None", shortLabel: "none" },
    { id: "json", label: "JSON", shortLabel: "json" },
    { id: "raw", label: "Raw Text", shortLabel: "raw" },
    { id: "xml", label: "XML", shortLabel: "xml" },
    { id: "form-data", label: "Form Data", shortLabel: "form-data" },
    { id: "x-www-form-urlencoded", label: "URL Encoded", shortLabel: "urlencoded" },
    { id: "binary", label: "Binary", shortLabel: "binary" },
    { id: "graphql", label: "GraphQL", shortLabel: "graphql" },
  ];

export type TextualBodyType = Extract<RequestBodyType, "json" | "raw" | "xml">;

export type BodyEditorValidation = {
  tone: "default" | "success" | "error";
  label: string;
  detail?: string;
};
