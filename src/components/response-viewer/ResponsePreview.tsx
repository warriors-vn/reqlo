import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes, formatResponseKindLabel, type ExecutionResult } from "@/services/execution";
import { MAX_RESPONSE_RENDER_LENGTH } from "@/lib/response-body-view";

/** The "Preview" body view: renders HTML in a sandboxed iframe, images and
 * PDFs from the response blob, and falls back to an explanation for
 * everything else. */
export function ResponsePreview({
  result,
  previewUrl,
}: {
  result: ExecutionResult;
  previewUrl: string | null;
}) {
  if (result.responseKind === "html" && result.body.length <= MAX_RESPONSE_RENDER_LENGTH) {
    return (
      <iframe
        title="HTML preview"
        srcDoc={result.body}
        className="h-full w-full border-0 bg-white"
        sandbox="allow-same-origin"
      />
    );
  }

  if (result.responseKind === "html") {
    return (
      <PreviewUnavailable
        result={result}
        message="This response is too large to preview safely. Use download, or switch to Raw for a capped view."
      />
    );
  }

  if (result.responseKind === "image" && previewUrl) {
    return (
      <ScrollArea className="h-full">
        <div className="flex min-h-full items-start justify-center p-6">
          <img
            src={previewUrl}
            alt="Response preview"
            className="max-h-[70vh] max-w-full rounded-2xl border border-border/70 bg-background shadow-sm"
          />
        </div>
      </ScrollArea>
    );
  }

  if (result.responseKind === "pdf" && previewUrl) {
    return (
      <iframe
        title="PDF preview"
        src={previewUrl}
        className="h-full w-full border-0 bg-background"
      />
    );
  }

  return <PreviewUnavailable result={result} />;
}

function PreviewUnavailable({
  result,
  message = "This response type does not support inline preview yet. Use download to inspect the full payload.",
}: {
  result: ExecutionResult;
  message?: string;
}) {
  return (
    <div className="grid h-full min-h-[260px] place-items-center p-6">
      <div className="max-w-md rounded-[24px] border border-dashed border-border bg-background/70 px-5 py-6 text-center">
        <div className="text-sm font-semibold tracking-tight">Preview unavailable</div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
        <div className="mt-3 text-2xs font-mono text-muted-foreground">
          {formatResponseKindLabel(result.responseKind)} · {formatBytes(result.sizeBytes)}
        </div>
      </div>
    </div>
  );
}
