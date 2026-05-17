import type { ApiRequest } from "@/services/db";
import type { ExecutionResult } from "@/components/ResponseViewer";

export async function executeRequest(req: ApiRequest): Promise<ExecutionResult> {
  const started = performance.now();
  try {
    let url = req.url.trim();
    const enabledParams = req.queryParams.filter(p => p.enabled && p.key);
    if (enabledParams.length) {
      const sp = new URLSearchParams();
      enabledParams.forEach(p => sp.append(p.key, p.value));
      url += (url.includes("?") ? "&" : "?") + sp.toString();
    }

    const headers: Record<string, string> = {};
    req.headers.filter(h => h.enabled && h.key).forEach(h => { headers[h.key] = h.value; });

    const init: RequestInit = { method: req.method, headers };
    if (req.bodyType !== "none" && req.body && req.method !== "GET" && req.method !== "HEAD") {
      init.body = req.body;
      if (req.bodyType === "json" && !Object.keys(headers).some(k => k.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/json";
      }
    }

    const res = await fetch(url, init);
    const text = await res.text();
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { respHeaders[k] = v; });

    return {
      status: res.status,
      statusText: res.statusText,
      durationMs: performance.now() - started,
      sizeBytes: new Blob([text]).size,
      headers: respHeaders,
      body: text,
      contentType: respHeaders["content-type"] || "",
      ok: res.ok,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: null, statusText: "", durationMs: performance.now() - started,
      sizeBytes: 0, headers: {}, body: "", contentType: "", ok: false,
      error: `Request failed: ${msg}. Check the URL, CORS, or network connection.`,
    };
  }
}
