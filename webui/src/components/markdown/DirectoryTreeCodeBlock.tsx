import { useCallback, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FileReferenceChip } from "@/components/thread/messages/FileReferenceChip";
import { useThemeValue } from "@/hooks/ui";
import { parseDirectoryTree } from "@/lib/markdown/directory-tree";
import { cn } from "@/lib/utils";

export function DirectoryTreeCodeBlock({
  language,
  code,
  className,
  onOpenFilePreview,
}: {
  language?: string;
  code: string;
  className?: string;
  onOpenFilePreview?: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const isDark = useThemeValue() === "dark";
  const rows = useMemo(() => parseDirectoryTree(code) ?? [], [code]);

  const onCopy = useCallback(() => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    });
  }, [code]);

  return (
    <div
      className={cn(
        "not-prose my-3 overflow-hidden rounded-lg border",
        isDark ? "border-white/10" : "border-black/10",
        className,
      )}
      data-testid="directory-tree-code-block"
    >
      <div
        className={cn(
          "flex items-center justify-between px-4 pb-1.5 pt-2 text-xs font-medium",
          isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-100 text-zinc-600",
        )}
      >
        <span className="font-mono lowercase">{language || t("code.fallbackLanguage")}</span>
        <button
          type="button"
          onClick={onCopy}
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono transition-colors",
            isDark
              ? "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              : "text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700",
          )}
          aria-label={t("code.copyAria")}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? t("code.copied") : t("code.copy")}</span>
        </button>
      </div>
      <pre
        className={cn(
          "m-0 overflow-x-auto p-4 font-mono text-sm leading-[1.6] text-foreground/90",
          "whitespace-pre",
          isDark ? "bg-zinc-800" : "bg-zinc-100",
        )}
      >
        <code className="text-inherit">
          {rows.map((row, index) => {
            if (row.kind === "plain" && !row.name) {
              return index < rows.length - 1 ? "\n" : null;
            }
            return (
              <span key={`${index}:${row.name}`} className="flex min-w-max">
                {row.prefix ? <span>{row.prefix}</span> : null}
                {row.kind === "file" && row.previewPath ? (
                  <FileReferenceChip
                    path={row.previewPath}
                    display="name"
                    onOpen={onOpenFilePreview}
                    testId="tree-file-path"
                  />
                ) : (
                  <span>{row.name}</span>
                )}
                {row.suffix ? (
                  <span className="text-muted-foreground/80">{row.suffix}</span>
                ) : null}
                {index < rows.length - 1 ? "\n" : null}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
