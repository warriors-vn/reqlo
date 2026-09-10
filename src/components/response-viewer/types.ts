// Shared between ResponseViewer and the pieces split out of it — a single
// declaration so the parent and the body-view/preview modules can't drift
// apart on which views exist.

/** Which rendering of the response body is on screen. Not every response
 * kind offers all three — see `getBodyViews`. */
export type BodyView = "pretty" | "raw" | "preview";
