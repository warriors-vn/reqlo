import { createDefaultOAuth2Config, type RequestAuth } from "@/services/db";

/**
 * The auth object to store when someone picks a type in the auth editor,
 * carrying over whatever fields the new type can reuse from the old one — so
 * switching Bearer → API Key → Bearer doesn't lose the token in between.
 *
 * Pulled out of RequestAuthEditor because the "inherit" and "none" cases look
 * interchangeable and aren't: they're the two types that carry no fields, and
 * an earlier version ended its ternary chain with a literal `{ type: "none" }`
 * fallback, which silently turned every "Inherit" click into "No Auth". A pure
 * function is somewhere that can actually be tested.
 */
export function authForType(type: RequestAuth["type"], current: RequestAuth): RequestAuth {
  switch (type) {
    case "api-key":
      return {
        type,
        key: current.key ?? "",
        value: current.value ?? "",
        addTo: current.addTo ?? "header",
      };
    case "basic":
      return { type, username: current.username ?? "", password: current.password ?? "" };
    case "bearer":
      return { type, token: current.token ?? "" };
    case "oauth2":
      return { type, oauth2: current.oauth2 ?? createDefaultOAuth2Config() };
    case "inherit":
    case "none":
      return { type };
  }
}
