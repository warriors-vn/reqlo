import { useEffect } from "react";
import { AlertCircle, Database, Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { ApiRequest } from "@/services/db";
import type { GraphqlBodyDraft } from "@/features/request-body/types";
import { LazyTextCodeEditor as TextCodeEditor } from "@/features/request-body/editors/LazyTextCodeEditor";
import { formatJson } from "@/features/request-body/utils/body";
import { useStore, type GraphQLSchemaState } from "@/stores/useStore";
import { cn } from "@/lib/utils";

interface Props {
  request: ApiRequest;
  value: GraphqlBodyDraft;
  onChange: (value: GraphqlBodyDraft) => void;
  validationDetail?: string;
}

const IDLE_SCHEMA_STATE: GraphQLSchemaState = { status: "idle" };

export function GraphQLEditor({ request, value, onChange, validationDetail }: Props) {
  // Select the raw map entry (referentially stable — `undefined` both times
  // when absent) rather than falling back with `?? {...}` *inside* the
  // selector: a fresh object literal there would compare unequal to itself
  // on every call under Zustand's default Object.is check, forcing a
  // re-render every render — an infinite loop, caught live while verifying
  // this feature. The fallback happens here instead, outside the selector.
  const schemaEntry = useStore((s) => s.graphqlSchemas[request.id]);
  const schemaState = schemaEntry ?? IDLE_SCHEMA_STATE;
  const fetchGraphQLSchema = useStore((s) => s.fetchGraphQLSchema);

  // Registers (or clears) this request's fetched schema with Monaco's GraphQL
  // mode whenever the active request or its schema state changes — only one
  // GraphQL editor is ever mounted at once in this UI, so a single global
  // schema config is correct; clearing it on switch/idle prevents a
  // previously-fetched schema from silently applying to a different request.
  // Depends on primitives (status + fetchedAt), not the schemaState object
  // itself, so it doesn't re-run on every unrelated render.
  const readyFetchedAt = schemaState.status === "ready" ? schemaState.fetchedAt : null;
  useEffect(() => {
    let cancelled = false;
    import("@/lib/graphql-mode").then(({ getGraphQLModeApi }) =>
      getGraphQLModeApi().then((api) => {
        if (cancelled) return;
        api.setSchemaConfig(
          schemaState.status === "ready"
            ? [
                {
                  uri: "schema.graphql",
                  introspectionJSON: schemaState.introspection,
                  fileMatch: ["**/*"],
                },
              ]
            : [],
        );
      }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id, schemaState.status, readyFetchedAt]);

  // Defensive only — today exactly one GraphQLEditor is ever mounted, so this
  // never fires in practice. Clears the global Monaco GraphQL schema
  // registration on true unmount (empty deps, so it doesn't run on every
  // schema-state change above) so a future concurrent-editor layout (split
  // view, diff view) can't have one editor's schema silently leak into
  // another's autocomplete/validation.
  useEffect(() => {
    return () => {
      void import("@/lib/graphql-mode").then(({ getGraphQLModeApi }) =>
        getGraphQLModeApi().then((api) => api.setSchemaConfig([])),
      );
    };
  }, []);

  const hasSchema = schemaState.status === "ready";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.9fr)]">
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-3 py-2 text-2xs text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">GraphQL Query</div>
            <div>Query text is preserved independently from variables.</div>
          </div>
          <div className="flex items-center gap-1">
            <SchemaButton state={schemaState} onClick={() => void fetchGraphQLSchema(request.id)} />
            <button
              onClick={() =>
                onChange({
                  ...value,
                  query: value.query.trim() ? value.query.trim() : value.query,
                })
              }
              className="inline-flex items-center gap-1 rounded-xl px-2 py-1 font-medium transition hover:bg-accent hover:text-foreground"
            >
              <Sparkles className="h-3.5 w-3.5" /> Clean
            </button>
          </div>
        </div>
        {schemaState.status === "error" && (
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-2xs text-destructive">
            {schemaState.message}
          </div>
        )}
        <TextCodeEditor
          language={hasSchema ? "graphql" : "plaintext"}
          value={value.query}
          onChange={(query) => onChange({ ...value, query })}
          placeholder="query GetUser($id: ID!) {\n  user(id: $id) {\n    id\n    name\n  }\n}"
          minHeight={320}
        />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-3 py-2 text-2xs text-muted-foreground">
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

function SchemaButton({
  state,
  onClick,
}: {
  state: { status: "idle" | "loading" | "ready" | "error" };
  onClick: () => void;
}) {
  if (state.status === "loading") {
    return (
      <span className="inline-flex items-center gap-1 rounded-xl px-2 py-1 font-medium text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching…
      </span>
    );
  }
  if (state.status === "ready") {
    return (
      <button
        onClick={onClick}
        title="Refetch schema"
        className={cn(
          "inline-flex items-center gap-1 rounded-xl px-2 py-1 font-medium text-primary transition hover:bg-accent",
        )}
      >
        <Database className="h-3.5 w-3.5" /> Schema loaded <RefreshCw className="h-3 w-3" />
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-xl px-2 py-1 font-medium transition hover:bg-accent hover:text-foreground"
    >
      {state.status === "error" ? (
        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
      ) : (
        <Database className="h-3.5 w-3.5" />
      )}
      {state.status === "error" ? "Retry fetch" : "Fetch schema"}
    </button>
  );
}
