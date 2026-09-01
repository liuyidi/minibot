import { isFilePatternReference } from "@/components/thread/messages/FileReferenceChip";

const PIPE_DEPTH_RE = /│/g;

export type DirectoryTreeRow = {
  kind: "root" | "dir" | "file" | "plain";
  prefix: string;
  name: string;
  previewPath?: string;
  suffix: string;
};

export function isPreviewableTreeFileName(name: string): boolean {
  const raw = name.trim();
  if (!raw || raw.endsWith("/") || isFilePatternReference(raw)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return false;
  const base = raw.split(/[\\/]/).pop() ?? raw;
  if (/^(dockerfile|makefile|readme|package-lock\.json)$/i.test(base)) return true;
  return /\.[a-z0-9][a-z0-9_-]{0,12}$/i.test(base);
}

export function isDirectoryTreeMarkdown(code: string): boolean {
  const lines = code.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim());
  if (lines.length < 2) return false;
  let branchLines = 0;
  let previewableFiles = 0;
  for (const line of lines) {
    const branchMatch = /^(\s*(?:│\s*)*(?:├──|└──|├─|└─)\s+)(.+)$/.exec(line);
    if (!branchMatch) continue;
    branchLines += 1;
    const entry = splitTreeEntry(branchMatch[2]).entry;
    if (entry && !entry.endsWith("/") && isPreviewableTreeFileName(entry)) {
      previewableFiles += 1;
    }
  }
  return branchLines >= 1 && previewableFiles >= 1;
}

export function parseDirectoryTree(code: string): DirectoryTreeRow[] | null {
  if (!isDirectoryTreeMarkdown(code)) return null;

  const rows: DirectoryTreeRow[] = [];
  let rootPrefix = "";
  const dirStack: string[] = [];

  for (const rawLine of code.split("\n")) {
    if (!rawLine.trim()) {
      rows.push({ kind: "plain", prefix: "", name: "", suffix: rawLine });
      continue;
    }

    const parsed = parseTreeLineParts(rawLine, rootPrefix, dirStack);
    if (!parsed) {
      rows.push({ kind: "plain", prefix: "", name: rawLine, suffix: "" });
      continue;
    }

    if (parsed.kind === "root") {
      rootPrefix = parsed.rootPrefix;
      dirStack.length = 0;
      rows.push({
        kind: "root",
        prefix: parsed.prefix,
        name: parsed.name,
        suffix: parsed.suffix,
      });
      continue;
    }

    if (parsed.kind === "dir") {
      dirStack.length = parsed.depth;
      dirStack[parsed.depth] = parsed.dirName;
      rows.push({
        kind: "dir",
        prefix: parsed.prefix,
        name: parsed.name,
        suffix: parsed.suffix,
      });
      continue;
    }

    rows.push({
      kind: "file",
      prefix: parsed.prefix,
      name: parsed.name,
      previewPath: parsed.previewPath,
      suffix: parsed.suffix,
    });
  }

  return rows;
}

type ParsedTreeLine =
  | { kind: "root"; prefix: string; name: string; suffix: string; rootPrefix: string }
  | { kind: "dir"; prefix: string; name: string; suffix: string; depth: number; dirName: string }
  | { kind: "file"; prefix: string; name: string; suffix: string; previewPath: string };

function parseTreeLineParts(
  rawLine: string,
  rootPrefix = "",
  dirStack: string[] = [],
): ParsedTreeLine | null {
  const trimmedEnd = rawLine.trimEnd();
  const branchMatch = /^(\s*(?:│\s*)*(?:├──|└──|├─|└─)\s+)(.+)$/.exec(trimmedEnd);
  if (!branchMatch) {
    return parseRootLine(trimmedEnd);
  }

  const linePrefix = branchMatch[1];
  const { entry, suffix } = splitTreeEntry(branchMatch[2]);
  if (!entry) return null;

  const depth = branchDepth(linePrefix);

  if (entry.endsWith("/")) {
    const dirName = entry.replace(/\/+$/, "");
    if (!dirName) return null;
    return {
      kind: "dir",
      prefix: linePrefix,
      name: entry,
      suffix,
      depth,
      dirName,
    };
  }

  if (!isPreviewableTreeFileName(entry)) return null;
  const parentParts = dirStack.slice(0, depth);
  const previewPath = joinTreePath(rootPrefix, [...parentParts, entry]);
  return {
    kind: "file",
    prefix: linePrefix,
    name: entry,
    suffix,
    previewPath,
  };
}

function parseRootLine(line: string): ParsedTreeLine | null {
  if (/[├└│]/.test(line)) return null;
  const rootMatch = /^(\S+\/)\s*(#.*)?$/.exec(line.trim());
  if (!rootMatch) return null;
  const name = rootMatch[1];
  return {
    kind: "root",
    prefix: "",
    name,
    suffix: rootMatch[2] ?? "",
    rootPrefix: normalizeRootPrefix(name),
  };
}

function splitTreeEntry(value: string): { entry: string; suffix: string } {
  const hashIndex = value.indexOf("#");
  if (hashIndex < 0) {
    return { entry: value.trim(), suffix: "" };
  }
  return {
    entry: value.slice(0, hashIndex).trim(),
    suffix: value.slice(hashIndex),
  };
}

function normalizeRootPrefix(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/?$/, "/");
}

function joinTreePath(rootPrefix: string, parts: string[]): string {
  const root = normalizeRootPrefix(rootPrefix || "");
  const tail = parts.filter(Boolean).join("/");
  return `${root}${tail}`.replace(/\\/g, "/");
}

function branchDepth(linePrefix: string): number {
  const pipeDepth = (linePrefix.match(PIPE_DEPTH_RE) ?? []).length;
  if (pipeDepth > 0) return pipeDepth;
  const indent = /^(\s*)/.exec(linePrefix)?.[1]?.length ?? 0;
  return Math.max(0, Math.floor(indent / 4));
}
