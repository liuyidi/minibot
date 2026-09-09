import * as React from "react";
import * as ReactJsxRuntime from "react/jsx-runtime";

import type { LoadSyntaxHighlighterModules, SyntaxHighlighterModules } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __MINIBOT_REACT__: typeof React | undefined;
  // eslint-disable-next-line no-var
  var __MINIBOT_JSX__: typeof ReactJsxRuntime | undefined;
}

const SYNTAX_VENDOR_BASE = String(import.meta.env.VITE_SYNTAX_VENDOR_BASE ?? "").replace(
  /\/+$/,
  "",
);

/**
 * CDN publish: load the version-pinned vendor entry. React is shared with the
 * SPA via ``globalThis.__MINIBOT_REACT__`` (see vendor react-bridge).
 */
export const loadSyntaxHighlighterModules: LoadSyntaxHighlighterModules = async () => {
  if (!SYNTAX_VENDOR_BASE) {
    throw new Error("VITE_SYNTAX_VENDOR_BASE is required for the CDN syntax loader");
  }
  globalThis.__MINIBOT_REACT__ = React;
  globalThis.__MINIBOT_JSX__ = ReactJsxRuntime;
  return import(
    /* @vite-ignore */ `${SYNTAX_VENDOR_BASE}/syntax-highlight.js`
  ) as Promise<SyntaxHighlighterModules>;
};
