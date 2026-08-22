import { useStore } from "@/stores/useStore";
import type { ApiRequest } from "@/services/db";

interface Props {
  request: ApiRequest;
}

export function RequestMockEditor({ request }: Props) {
  const updateRequest = useStore((state) => state.updateRequest);
  const { mock } = request;

  const setMock = (patch: Partial<ApiRequest["mock"]>) =>
    void updateRequest(request.id, { mock: { ...mock, ...patch } });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-[24px] border border-border/80 bg-background/70 p-4">
        <div>
          <div className="text-sm font-semibold tracking-tight">Mock this request</div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Send returns the saved response below instead of calling the network. Useful for demoing
            or testing Extract/Tests rules offline — this only affects Send inside reqlo, it doesn't
            serve real traffic to other apps.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 pt-0.5">
          <input
            type="checkbox"
            checked={mock.enabled}
            onChange={(event) => setMock({ enabled: event.target.checked })}
            className="h-3.5 w-3.5 accent-[var(--primary)]"
          />
          <span className="text-xs font-medium">{mock.enabled ? "On" : "Off"}</span>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-[120px_1fr_140px]">
        <Field label="Status">
          <input
            value={mock.status}
            onChange={(event) => setMock({ status: Number(event.target.value) || 0 })}
            inputMode="numeric"
            className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 font-mono text-sm outline-none transition focus:border-foreground/15"
          />
        </Field>
        <Field label="Content-Type">
          <input
            value={mock.contentType}
            onChange={(event) => setMock({ contentType: event.target.value })}
            placeholder="application/json"
            spellCheck={false}
            className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 font-mono text-sm outline-none transition focus:border-foreground/15"
          />
        </Field>
        <Field label="Delay (ms)">
          <input
            value={mock.delayMs}
            onChange={(event) => setMock({ delayMs: Math.max(0, Number(event.target.value) || 0) })}
            inputMode="numeric"
            className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 font-mono text-sm outline-none transition focus:border-foreground/15"
          />
        </Field>
      </div>

      <Field label="Body">
        <textarea
          value={mock.body}
          onChange={(event) => setMock({ body: event.target.value })}
          spellCheck={false}
          rows={10}
          className="w-full resize-y rounded-xl border border-border/80 bg-background/80 px-3 py-2 font-mono text-xs outline-none transition focus:border-foreground/15"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
