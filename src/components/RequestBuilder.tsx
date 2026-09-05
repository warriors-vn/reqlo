import { useStore } from "@/stores/useStore";
import { uid, type ApiRequest, type HttpMethod, type KV } from "@/services/db";
import type { ExecutionResult } from "@/services/execution";
import { parseCurl } from "@/services/curl";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AdvancedBodyEditor } from "@/features/request-body/components/AdvancedBodyEditor";
import { RequestAuthEditor } from "@/components/RequestAuthEditor";
import { useRequestAncestors } from "@/hooks/useRequestAncestors";
import { inheritedContributions } from "@/services/inheritance";
import { RequestExtractEditor } from "@/components/RequestExtractEditor";
import { RequestAssertionEditor } from "@/components/RequestAssertionEditor";
import { RequestMockEditor } from "@/components/RequestMockEditor";
import { RequestScriptEditor } from "@/components/RequestScriptEditor";
import { TemplateInput } from "@/components/TemplateInput";
import { evaluateAssertions } from "@/services/assertions";
import { hasBodyContent } from "@/features/request-body/utils/body";
import { parseKVText, serializeKVText } from "@/features/request-body/utils/kv-text";
import { Send, Square, Plus, X, ChevronDown, Timer, AlignLeft, Rows3 } from "lucide-react";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

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
  onCancel: () => void;
  sending: boolean;
  result?: ExecutionResult | null;
}

export function RequestBuilder({ request, onSend, onCancel, sending, result = null }: Props) {
  const updateRequest = useStore((s) => s.updateRequest);
  const renameRequest = useStore((s) => s.renameRequest);
  const applyCurlToRequest = useStore((s) => s.applyCurlToRequest);
  const [tab, setTab] = useState<
    "params" | "headers" | "body" | "auth" | "script" | "extract" | "tests" | "mock"
  >("params");
  const [nameEdit, setNameEdit] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  const ancestors = useRequestAncestors(request);
  const inherited = inheritedContributions(ancestors);
  // The badge counts both kinds of check together — a declarative rule and a
  // script test both answer "did this response pass?", and splitting them into
  // two numbers would just make the tab harder to read.
  const assertionOutcomes = evaluateAssertions(request.assertions, result);
  const scriptTests = result?.scriptTests ?? [];
  const ranTotal = assertionOutcomes.length + scriptTests.length;
  const ranPassed =
    assertionOutcomes.filter((o) => o.passed).length + scriptTests.filter((t) => t.passed).length;
  const testsCount =
    request.assertions.filter((rule) => rule.enabled).length +
    (request.postResponseScript.enabled && request.postResponseScript.source.trim() ? 1 : 0);
  const testsBadge = ranTotal ? (`${ranPassed}/${ranTotal}` as const) : testsCount || undefined;

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
    {
      id: "script" as const,
      label: "Script",
      count: request.preRequestScript.enabled ? ("ON" as const) : undefined,
    },
    {
      id: "extract" as const,
      label: "Extract",
      count: request.extracts.filter((rule) => rule.enabled).length || undefined,
    },
    {
      id: "tests" as const,
      label: "Tests",
      count: testsBadge,
    },
    {
      id: "mock" as const,
      label: "Mock",
      count: request.mock.enabled ? ("ON" as const) : undefined,
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
            className="w-full max-w-md rounded-md border border-border bg-background px-2 py-0.5 text-sm font-medium focus-ring outline-none"
          />
        ) : (
          // min-w-0 + truncate + text-left: a long name would otherwise span
          // the full width, wrap to two centre-aligned lines (button's own
          // default alignment) and push the URL row down — the sidebar, tab
          // bar and snippet header all truncate the same name instead.
          <button
            onClick={() => setNameEdit(true)}
            title={request.name || "Untitled request"}
            className="min-w-0 max-w-full truncate rounded px-1 py-0.5 text-left text-sm font-medium hover:bg-accent"
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
              aria-label="HTTP method"
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
          <TemplateInput
            type="text"
            value={request.url}
            onChange={(url) => updateRequest(request.id, { url })}
            placeholder="https://api.example.com/endpoint"
            aria-label="Request URL"
            spellCheck={false}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSend();
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              // Same gate ImportCurlModal already uses to decide whether to
              // show its own preview — a plain URL paste falls through to
              // the input's normal default behavior untouched.
              if (!text.trim().toLowerCase().startsWith("curl")) return;
              const parsed = parseCurl(text, request.workspaceId, request.collectionId);
              if (!parsed.url) return;
              e.preventDefault();
              void applyCurlToRequest(request.id, text);
            }}
            className="h-9 flex-1 bg-transparent px-3 font-mono text-xs outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        {request.mock.enabled && (
          <span
            className="flex h-9 shrink-0 items-center rounded-lg border border-[var(--status-warn)]/40 bg-[var(--status-warn)]/10 px-2.5 text-2xs font-semibold uppercase tracking-wide text-[var(--status-warn)]"
            title="Send returns the saved mock response instead of calling the network"
          >
            Mocked
          </span>
        )}
        <TimeoutControl
          timeoutMs={request.timeoutMs}
          onChange={(timeoutMs) => void updateRequest(request.id, { timeoutMs })}
        />
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={sending ? onCancel : onSend}
          disabled={!sending && !request.url}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold shadow-sm transition disabled:opacity-50 focus-ring",
            sending
              ? "bg-destructive text-destructive-foreground hover:opacity-90"
              : "bg-primary text-primary-foreground hover:opacity-90",
          )}
        >
          {sending ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {sending ? "Cancel" : "Send"}
        </motion.button>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        {/* Tab strip */}
        <div className="flex items-center gap-1 border-b border-border px-3">
          <TabsList className="h-9 gap-1 rounded-none bg-transparent p-0">
            {tabs.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="relative h-9 rounded-none bg-transparent px-2.5 text-xs font-medium text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {t.label}
                {t.count !== undefined && (
                  <span className="ml-1 text-3xs text-muted-foreground">{t.count}</span>
                )}
                {tab === t.id && (
                  <motion.div
                    layoutId="reqtab"
                    className="absolute -bottom-px left-1 right-1 h-[2px] rounded-full bg-primary"
                  />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <button
            onClick={() => setPanelCollapsed((v) => !v)}
            className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-ring"
            title={
              panelCollapsed
                ? "Expand request panel"
                : "Collapse request panel — more room for the response"
            }
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", panelCollapsed && "-rotate-180")}
            />
          </button>
        </div>

        {/* Panel */}
        {!panelCollapsed && (
          <div className="max-h-[40vh] min-h-[140px] overflow-auto px-4 py-3">
            <TabsContent value="params" className="mt-0 space-y-2">
              <InheritedRows rows={inherited.queryParams} kind="query param" />
              <KVEditor
                list={request.queryParams}
                onChange={(queryParams) => updateRequest(request.id, { queryParams })}
                placeholder={["key", "value"]}
              />
            </TabsContent>
            <TabsContent value="headers" className="mt-0 space-y-2">
              <InheritedRows rows={inherited.headers} kind="header" />
              <KVEditor
                list={request.headers}
                onChange={(headers) => updateRequest(request.id, { headers })}
                placeholder={["Header", "Value"]}
              />
            </TabsContent>
            <TabsContent value="body" className="mt-0">
              <AdvancedBodyEditor request={request} />
            </TabsContent>
            <TabsContent value="auth" className="mt-0">
              <RequestAuthEditor request={request} />
            </TabsContent>
            <TabsContent value="script" className="mt-0">
              <RequestScriptEditor request={request} />
            </TabsContent>
            <TabsContent value="extract" className="mt-0">
              <RequestExtractEditor request={request} result={result} />
            </TabsContent>
            <TabsContent value="tests" className="mt-0">
              <RequestAssertionEditor request={request} result={result} />
            </TabsContent>
            <TabsContent value="mock" className="mt-0">
              <RequestMockEditor request={request} />
            </TabsContent>
          </div>
        )}
      </Tabs>
    </div>
  );
}

function formatTimeoutBadge(timeoutMs: number) {
  if (timeoutMs % 1000 === 0) return `${timeoutMs / 1000}s`;
  return `${timeoutMs}ms`;
}

function TimeoutControl({
  timeoutMs,
  onChange,
}: {
  timeoutMs: number;
  onChange: (timeoutMs: number) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={
            timeoutMs > 0 ? `Times out after ${formatTimeoutBadge(timeoutMs)}` : "No timeout set"
          }
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-2xs font-medium transition",
            timeoutMs > 0
              ? "border-primary/25 bg-primary/8 text-primary"
              : "border-border/80 bg-background/70 text-muted-foreground hover:border-foreground/15 hover:bg-accent/30",
          )}
        >
          <Timer className="h-3.5 w-3.5" />
          {timeoutMs > 0 ? formatTimeoutBadge(timeoutMs) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 space-y-2 p-3">
        <div>
          <div className="text-xs font-semibold tracking-tight">Timeout</div>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Auto-cancel this request if it hasn't finished within this many milliseconds.
          </p>
        </div>
        <input
          value={timeoutMs || ""}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
          placeholder="No timeout"
          inputMode="numeric"
          className="h-9 w-full rounded-lg border border-border/80 bg-background/80 px-3 font-mono text-xs outline-none transition focus:border-foreground/15"
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The headers/params a request picks up from its folder and collection, shown
 * read-only above its own. Without this the inherited ones are invisible: the
 * request goes out with headers that appear nowhere in its editor, which is
 * the failure mode that makes inheritance feel like a bug rather than a
 * feature. Editing happens where they're defined, not here.
 */
function InheritedRows({ rows, kind }: { rows: KV[]; kind: string }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-2">
      <div className="px-1 pb-1.5 text-3xs font-medium uppercase tracking-wide text-muted-foreground">
        Inherited — edit in the collection or folder settings
      </div>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li
            key={`${row.key}-${row.id}`}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 rounded-lg bg-background/60 px-2 py-1.5 text-xs"
            title={`Inherited ${kind}`}
          >
            <span className="truncate font-mono text-muted-foreground">{row.key}</span>
            <span className="truncate font-mono text-muted-foreground/80">{row.value}</span>
          </li>
        ))}
      </ul>
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
  const [mode, setMode] = useState<"rows" | "text">("rows");
  // The textarea's displayed value lives here, not derived from `list` on
  // every render — it's fed through a parse/serialize round-trip that isn't
  // a strict identity of what was just typed (e.g. re-normalizes spacing),
  // so binding the textarea straight to `serializeKVText(list)` would fight
  // React's controlled-value reset against the browser's own in-progress
  // edit and scramble fast typing. Re-seeded fresh only when entering text
  // mode, so it can't go stale against edits made in Rows mode.
  const [textDraft, setTextDraft] = useState("");
  // The exact `list` reference textDraft currently reflects. Our own edits
  // (via applyText below) update this to the same array reference passed to
  // onChange, so the next render's `list` prop comes back reference-equal —
  // the effect below sees no change and leaves textDraft alone, avoiding the
  // controlled-value fight the comment above guards against. If `list`
  // changes to a *different* reference while still in text mode — something
  // else wrote to this request's params/headers, e.g. restoring a history
  // entry into the same open tab — the effect re-syncs so a subsequent edit
  // doesn't silently overwrite that change with stale text.
  const syncedListRef = useRef(list);

  useEffect(() => {
    if (mode === "text" && list !== syncedListRef.current) {
      setTextDraft(serializeKVText(list));
      syncedListRef.current = list;
    }
  }, [list, mode]);

  const enterTextMode = () => {
    setTextDraft(serializeKVText(list));
    syncedListRef.current = list;
    setMode("text");
  };

  const update = (id: string, patch: Partial<(typeof list)[number]>) =>
    onChange(list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id: string) => onChange(list.filter((i) => i.id !== id));
  const add = () => onChange([...list, { id: uid(), key: "", value: "", enabled: true }]);

  const applyText = (text: string) => {
    setTextDraft(text);
    const next = parseKVText(text).map((row, index) => ({
      id: list[index]?.id ?? uid(),
      ...row,
    }));
    syncedListRef.current = next;
    onChange(next);
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-end">
        <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-muted/30 p-0.5">
          <ModeButton
            active={mode === "rows"}
            onClick={() => setMode("rows")}
            title="Edit as rows"
            icon={<Rows3 className="h-3 w-3" />}
          />
          <ModeButton
            active={mode === "text"}
            onClick={enterTextMode}
            title="Edit as text"
            icon={<AlignLeft className="h-3 w-3" />}
          />
        </div>
      </div>
      {mode === "text" ? (
        <textarea
          value={textDraft}
          onChange={(event) => applyText(event.target.value)}
          placeholder={`${placeholder[0]}: ${placeholder[1]}\n# disabled-${placeholder[0].toLowerCase()}: value`}
          spellCheck={false}
          className="h-40 w-full resize-y rounded-md border border-transparent bg-transparent px-2 py-1.5 font-mono text-xs leading-relaxed outline-none focus:border-border focus:bg-background"
        />
      ) : (
        <>
          {list.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No entries. Add one to get started.
            </div>
          )}
          {list.map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-2 rounded-md hover:bg-accent/40"
            >
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(e) => update(item.id, { enabled: e.target.checked })}
                className="h-3 w-3 accent-[var(--primary)]"
              />
              <TemplateInput
                value={item.key}
                onChange={(key) => update(item.id, { key })}
                placeholder={placeholder[0]}
                className="h-7 flex-1 rounded-md border border-transparent bg-transparent px-2 font-mono text-xs outline-none focus:border-border focus:bg-background"
              />
              <TemplateInput
                value={item.value}
                onChange={(value) => update(item.id, { value })}
                placeholder={placeholder[1]}
                className="h-7 flex-[2] rounded-md border border-transparent bg-transparent px-2 font-mono text-xs outline-none focus:border-border focus:bg-background"
              />
              <button
                onClick={() => remove(item.id)}
                aria-label={`Remove ${item.key || placeholder[0].toLowerCase()}`}
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
        </>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "grid h-6 w-6 place-items-center rounded-md transition",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
    </button>
  );
}
