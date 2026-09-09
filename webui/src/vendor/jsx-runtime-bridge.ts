/**
 * Vendor builds alias ``react/jsx-runtime`` here (see react-bridge.ts).
 */
type JsxNs = typeof import("react/jsx-runtime");

declare global {
  // eslint-disable-next-line no-var
  var __MINIBOT_JSX__: JsxNs | undefined;
}

const JSX = globalThis.__MINIBOT_JSX__;
if (!JSX) {
  throw new Error("minibot syntax vendor: __MINIBOT_JSX__ is not set");
}

export const jsx = JSX.jsx;
export const jsxs = JSX.jsxs;
export const Fragment = JSX.Fragment;
