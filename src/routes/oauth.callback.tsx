import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/oauth/callback")({
  component: OAuthCallback,
});

/**
 * Popup-only landing page for the Authorization Code + PKCE flow. Posts the
 * code/state/error back to the window that opened it (verified there via
 * event.origin) and self-closes — see src/services/oauth2.ts.
 */
function OAuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message = {
      source: "reqlo-oauth",
      code: params.get("code") ?? undefined,
      state: params.get("state") ?? undefined,
      error: params.get("error") ?? params.get("error_description") ?? undefined,
    };
    window.opener?.postMessage(message, window.location.origin);
    window.close();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <p className="text-sm text-muted-foreground">
        Completing sign-in… you can close this window.
      </p>
    </div>
  );
}
