import { Sparkles } from "lucide-react";
import type { GraphqlBodyDraft } from "@/features/request-body/types";
import { TextCodeEditor } from "@/features/request-body/editors/TextCodeEditor";
import { formatJson } from "@/features/request-body/utils/body";

interface Props {
  value: GraphqlBodyDraft;
  onChange: (value: GraphqlBodyDraft) => void;
  validationDetail?: string;
}

export function GraphQLEditor({ value, onChange, validationDetail }: Props) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.9fr)]">
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">GraphQL Query</div>
            <div>Query text is preserved independently from variables.</div>
          </div>
          <button
            onClick={() =>
              onChange({ ...value, query: value.query.trim() ? value.query.trim() : value.query })
            }
            className="inline-flex items-center gap-1 rounded-xl px-2 py-1 font-medium transition hover:bg-accent hover:text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" /> Clean
          </button>
        </div>
        <TextCodeEditor
          language="plaintext"
          value={value.query}
          onChange={(query) => onChange({ ...value, query })}
          placeholder="query GetUser($id: ID!) {\n  user(id: $id) {\n    id\n    name\n  }\n}"
          minHeight={320}
        />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">Variables</div>
            <div>{validationDetail ?? "Variables must be valid JSON."}</div>
          </div>
          <button
            onClick={() => onChange({ ...value, variables: formatJson(value.variables || "{}") })}
            className="inline-flex items-center gap-1 rounded-xl px-2 py-1 font-medium transition hover:bg-accent hover:text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" /> Format
          </button>
        </div>
        <input
          value={value.operationName}
          onChange={(event) => onChange({ ...value, operationName: event.target.value })}
          placeholder="Operation name"
          className="h-10 w-full rounded-2xl border border-border/80 bg-background/75 px-3 text-xs outline-none transition focus:border-foreground/15"
        />
        <TextCodeEditor
          language="json"
          value={value.variables}
          onChange={(variables) => onChange({ ...value, variables })}
          onFormat={() => onChange({ ...value, variables: formatJson(value.variables || "{}") })}
          placeholder={'{\n  "id": "123"\n}'}
          minHeight={240}
        />
      </div>
    </div>
  );
}
