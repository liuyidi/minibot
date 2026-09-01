export type FilePreviewRenderMode = "markdown" | "code";

export interface PreparedFilePreviewContent {
  mode: FilePreviewRenderMode;
  content: string;
  language: string;
}

export function isMarkdownPreviewLanguage(language: string): boolean {
  const normalized = language.toLowerCase();
  return normalized === "markdown" || normalized === "md" || normalized === "mdx";
}

export function prettifyJsonContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return content;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return `${JSON.stringify(parsed, null, 2)}\n`;
  } catch {
    return content;
  }
}

export function prepareFilePreviewContent(
  language: string,
  content: string,
): PreparedFilePreviewContent {
  const normalized = language.toLowerCase();

  if (isMarkdownPreviewLanguage(normalized)) {
    return { mode: "markdown", content, language: normalized };
  }

  if (normalized === "json" || normalized === "jsonc" || normalized === "jsonl") {
    return {
      mode: "code",
      content: prettifyJsonContent(content),
      language: normalized === "jsonl" ? "json" : normalized,
    };
  }

  return { mode: "code", content, language: normalized };
}
