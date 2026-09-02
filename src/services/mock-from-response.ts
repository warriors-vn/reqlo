import type { ResponseKind } from "@/services/execution";
import { formatResponseKindLabel } from "@/services/execution";

export interface MockSourceResponse {
  status: number | null;
  contentType: string;
  body: string;
  responseKind: ResponseKind;
  /** True when the body shown to the user was cut off (render cap, or a
   * history entry's own stored-body cap) — the full response isn't in hand. */
  truncated: boolean;
  /** True when this "response" is actually a failed send (no real response body). */
  hasError: boolean;
}

export type MockFromResponseResult =
  | { ok: true; mock: { status: number; contentType: string; body: string } }
  | { ok: false; reason: string };

const UNSUPPORTED_KINDS: ResponseKind[] = ["binary", "image", "pdf"];

/**
 * Turns a real response into a mock patch — the "Save as mock" action in
 * `ResponseViewer`. Kept as a pure function (rather than inline in the
 * component) so the eligibility rules can be tested without a DOM, and so a
 * future history-panel equivalent of this action — a past run's stored
 * response has the same shape modulo its own truncation flag — can reuse it.
 */
export function buildMockFromResponse(source: MockSourceResponse): MockFromResponseResult {
  if (source.hasError) {
    return { ok: false, reason: "This send didn't get a real response to save." };
  }

  if (source.responseKind === "stream") {
    return {
      ok: false,
      reason:
        "A streamed (SSE) response can't be saved as a mock — there's no single static body to replay.",
    };
  }

  if (UNSUPPORTED_KINDS.includes(source.responseKind)) {
    return {
      ok: false,
      reason: `A ${formatResponseKindLabel(source.responseKind)} response can't be saved as a mock — mock bodies are text only.`,
    };
  }

  if (source.truncated) {
    return {
      ok: false,
      reason:
        "This response was too large to save in full — copy it manually into the Mock tab instead.",
    };
  }

  return {
    ok: true,
    mock: {
      status: source.status ?? 200,
      contentType: source.contentType,
      body: source.body,
    },
  };
}
