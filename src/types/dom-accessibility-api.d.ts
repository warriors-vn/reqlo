// dom-accessibility-api ships type declarations but doesn't expose them
// through its package.json "exports" map, so "moduleResolution": "Bundler"
// can't reach them. Only computeAccessibleName is used (by the a11y sweep in
// components/a11y-names.test.tsx), so that's all this declares.
declare module "dom-accessibility-api" {
  export function computeAccessibleName(
    element: Element,
    options?: { getComputedStyle?: (element: Element) => CSSStyleDeclaration },
  ): string;
}
