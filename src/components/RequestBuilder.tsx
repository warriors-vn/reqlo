import { useStore } from "@/stores/useStore";
import type { ApiRequest, HttpMethod } from "@/services/db";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AdvancedBodyEditor } from "@/features/request-body/components/AdvancedBodyEditor";
import { RequestAuthEditor } from "@/components/RequestAuthEditor";
import { hasBodyContent } from "@/features/request-body/utils/body";
import { Send, Loader2, Plus, X } from "lucide-react";
import { motion } from "framer-motion";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const METHOD_BG: Record<HttpMethod, string> = {
  GET: "bg-[var(--method-get)]",
  POST: "bg-[var(--method-post)]",
  PUT: "bg-[var(--method-put)]",
  PATCH: "bg-[var(--method-patch)]",
  DELETE: "bg-[var(--method-delete)]",
  HEAD: "bg-muted-foreground",
  OPTIONS: "bg-muted-foreground",
};

interface Props {
  request: ApiRequest;
  onSend: () => void;
  sending: boolean;
}

export function RequestBuilder({ request, onSend, sending }: Props) {
  const updateRequest = useStore((s) => s.updateRequest);
  const renameRequest = useStore((s) => s.renameRequest);
  const [tab, setTab] = useState<"params" | "headers" | "body" | "auth">("params");
  const [nameEdit, setNameEdit] = useState(false);

  const tabs = [
    {
      id: "params" as const,
      label: "Params",
      count: request.queryParams.filter((p) => p.enabled).length || undefined,
    },
    {
      id: "headers" as const,
      label: "Headers",
      count: request.headers.filter((h) => h.enabled).length || undefined,
    },
    {
      id: "body" as const,
      label: "Body",
      count: hasBodyContent(request) ? ("•" as const) : undefined,
    },
    {
      id: "auth" as const,
      label: "Auth",
      count: request.auth.type !== "none" ? request.auth.type.toUpperCase() : undefined,
    },
  ];

  return (
    <div className="flex flex-col border-b border-border bg-[var(--surface-elevated)]">
      {/* Title row */}
      <div className="flex items-center gap-2 px-4 pt-3">
        {nameEdit ? (
          <input
            autoFocus
            defaultValue={request.name}
            onBlur={(e) => {
              renameRequest(request.id, e.target.value || "Untitled");
              setNameEdit(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setNameEdit(false);
            }}
            className="rounded-md border border-border bg-background px-2 py-0.5 text-sm font-medium focus-ring outline-none"
          />
        ) : (
          <button
            onClick={() => setNameEdit(true)}
            className="rounded px-1 py-0.5 text-sm font-medium hover:bg-accent"
          >
            {request.name || "Untitled request"}
          </button>
        )}
      </div>

      {/* URL row */}
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex flex-1 items-stretch overflow-hidden rounded-lg border border-border bg-background shadow-sm focus-within:border-foreground/20 focus-within:shadow">
          <div className="relative">
            <select
              value={request.method}
              onChange={(e) => updateRequest(request.id, { method: e.target.value as HttpMethod })}
              className="h-9 cursor-pointer appearance-none bg-transparent pl-3 pr-7 font-mono text-xs font-semibold uppercase tracking-wider outline-none"
              style={{ color: `var(--method-${request.method.toLowerCase()})` }}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <div
              className={cn(
                "pointer-events-none absolute bottom-0 left-2 right-2 h-[2px] rounded-full opacity-80",
                METHOD_BG[request.method],
              )}
            />
          </div>
          <div className="w-px bg-border" />
          <input
            type="text"
            value={request.url}
            onChange={(e) => updateRequest(request.id, { url: e.target.value })}
            placeholder="https://api.example.com/endpoint"
            spellCheck={false}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSend();
            }}
            className="h-9 flex-1 bg-transparent px-3 font-mono text-xs outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onSend}
          disabled={sending || !request.url}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50 focus-ring"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Send
        </motion.button>
      </div>

      {/* Tab strip */}
      <div className="flex items-center gap-1 border-b border-border px-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative h-9 px-2.5 text-xs font-medium transition",
              tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1 text-[10px] text-muted-foreground">{t.count}</span>
            )}
            {tab === t.id && (
              <motion.div
                layoutId="reqtab"
                className="absolute -bottom-px left-1 right-1 h-[2px] rounded-full bg-primary"
              />
            )}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div className="max-h-[40vh] min-h-[140px] overflow-auto px-4 py-3">
        {tab === "params" && (
          <KVEditor
            list={request.queryParams}
            onChange={(queryParams) => updateRequest(request.id, { queryParams })}
            placeholder={["key", "value"]}
          />
        )}
        {tab === "headers" && (
          <KVEditor
            list={request.headers}
            onChange={(headers) => updateRequest(request.id, { headers })}
            placeholder={["Header", "Value"]}
          />
        )}
        {tab === "body" && <AdvancedBodyEditor request={request} />}
        {tab === "auth" && <RequestAuthEditor request={request} />}
      </div>
    </div>
  );
}

function KVEditor({
  list,
  onChange,
  placeholder,
}: {
  list: { id: string; key: string; value: string; enabled: boolean }[];
  onChange: (v: typeof list) => void;
  placeholder: [string, string];
}) {
  const update = (id: string, patch: Partial<(typeof list)[number]>) =>
    onChange(list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id: string) => onChange(list.filter((i) => i.id !== id));
  const add = () =>
    onChange([
      ...list,
      { id: Math.random().toString(36).slice(2), key: "", value: "", enabled: true },
    ]);

  return (
    <div className="space-y-1">
      {list.length === 0 && (
        <div className="py-6 text-center text-xs text-muted-foreground">
          No entries. Add one to get started.
        </div>
      )}
      {list.map((item) => (
        <div key={item.id} className="group flex items-center gap-2 rounded-md hover:bg-accent/40">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={(e) => update(item.id, { enabled: e.target.checked })}
            className="h-3 w-3 accent-[var(--primary)]"
          />
          <input
            value={item.key}
            onChange={(e) => update(item.id, { key: e.target.value })}
            placeholder={placeholder[0]}
            className="h-7 flex-1 rounded-md border border-transparent bg-transparent px-2 font-mono text-xs outline-none focus:border-border focus:bg-background"
          />
          <input
            value={item.value}
            onChange={(e) => update(item.id, { value: e.target.value })}
            placeholder={placeholder[1]}
            className="h-7 flex-[2] rounded-md border border-transparent bg-transparent px-2 font-mono text-xs outline-none focus:border-border focus:bg-background"
          />
          <button
            onClick={() => remove(item.id)}
            className="grid h-6 w-6 place-items-center rounded text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> Add
      </button>
    </div>
  );
}
