import type SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism-async-light";
import type oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import type oneLight from "react-syntax-highlighter/dist/esm/styles/prism/one-light";

export type SyntaxHighlighterModules = {
  SyntaxHighlighter: typeof SyntaxHighlighter;
  oneDark: typeof oneDark;
  oneLight: typeof oneLight;
};

export type LoadSyntaxHighlighterModules = () => Promise<SyntaxHighlighterModules>;
