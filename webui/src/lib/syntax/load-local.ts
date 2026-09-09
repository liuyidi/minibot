import type { LoadSyntaxHighlighterModules } from "./types";

/** Local/dev: Vite code-splits react-syntax-highlighter + refractor langs. */
export const loadSyntaxHighlighterModules: LoadSyntaxHighlighterModules = async () => {
  const [
    { default: SyntaxHighlighter },
    { default: oneDark },
    { default: oneLight },
  ] = await Promise.all([
    import("react-syntax-highlighter/dist/esm/prism-async-light"),
    import("react-syntax-highlighter/dist/esm/styles/prism/one-dark"),
    import("react-syntax-highlighter/dist/esm/styles/prism/one-light"),
  ]);
  return { SyntaxHighlighter, oneDark, oneLight };
};
