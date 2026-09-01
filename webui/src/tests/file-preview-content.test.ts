import { describe, expect, it } from "vitest";

import {
  isMarkdownPreviewLanguage,
  prepareFilePreviewContent,
  prettifyJsonContent,
} from "@/lib/markdown/file-preview-content";

describe("file-preview-content", () => {
  it("detects markdown preview languages", () => {
    expect(isMarkdownPreviewLanguage("markdown")).toBe(true);
    expect(isMarkdownPreviewLanguage("MD")).toBe(true);
    expect(isMarkdownPreviewLanguage("mdx")).toBe(true);
    expect(isMarkdownPreviewLanguage("json")).toBe(false);
  });

  it("pretty-prints minified JSON", () => {
    const input = '{"name":"pm2-demo-app","version":"1.0.0"}';
    expect(prettifyJsonContent(input)).toBe(
      '{\n  "name": "pm2-demo-app",\n  "version": "1.0.0"\n}\n',
    );
  });

  it("returns original content when JSON is invalid", () => {
    const input = "{'name': 'pm2-demo-app'}";
    expect(prettifyJsonContent(input)).toBe(input);
  });

  it("routes markdown to markdown mode", () => {
    const table = "| a | b |\n|---|---|\n| 1 | 2 |";
    expect(prepareFilePreviewContent("markdown", table)).toEqual({
      mode: "markdown",
      content: table,
      language: "markdown",
    });
  });

  it("routes JSON through pretty-print for code mode", () => {
    const input = '{"ok":true}';
    expect(prepareFilePreviewContent("json", input)).toEqual({
      mode: "code",
      content: '{\n  "ok": true\n}\n',
      language: "json",
    });
  });
});
