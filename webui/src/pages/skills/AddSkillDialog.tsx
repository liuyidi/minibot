import { useCallback, useRef, useState, type DragEvent } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DEFAULT_MARKDOWN =
  "---\nname: my-skill\ndescription: What this skill does.\n---\n\n# My skill\n\nInstructions…\n";

function skillNameFromFile(fileName: string): string {
  return fileName.replace(/\.md$/i, "").replace(/[^A-Za-z0-9_-]+/g, "-");
}

export function AddSkillDialog({
  open,
  onOpenChange,
  busy,
  onInstall,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onInstall: (body: { markdown: string; name?: string }) => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      setMarkdown(await file.text());
      setFileName(file.name);
      setName((prev) => prev.trim() || skillNameFromFile(file.name));
      setError(null);
    },
    [],
  );

  const submit = async () => {
    setError(null);
    const message = await onInstall({
      markdown,
      name: name.trim() || undefined,
    });
    if (!message) {
      setName("");
      setFileName(null);
      setMarkdown(DEFAULT_MARKDOWN);
      onOpenChange(false);
      return;
    }
    setError(message);
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    void applyFile(event.dataTransfer.files?.[0]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-5 rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle>{t("settings.skills.addSkill", { defaultValue: "Add skill" })}</DialogTitle>
          <DialogDescription>
            {t("settings.skills.addSkillHint", {
              defaultValue: "Paste a SKILL.md. It is saved under the current workspace skills/ folder.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("settings.skills.nameOptional", {
              defaultValue: "Name (optional; defaults to frontmatter)",
            })}
          />

          <textarea
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            rows={10}
            className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 font-mono text-[12px] leading-5 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0"
          />

          <div className="space-y-2">
            <input
              ref={inputRef}
              type="file"
              accept=".md,text/markdown,text/plain"
              className="sr-only"
              onChange={(event) => {
                void applyFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragging(false);
              }}
              onDrop={onDrop}
              className={cn(
                "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
                dragging
                  ? "border-foreground/35 bg-muted/50"
                  : "border-border/80 bg-muted/20 hover:border-foreground/25 hover:bg-muted/35",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <span className="relative inline-flex h-14 w-16 items-center justify-center">
                <span className="absolute left-0 top-1 h-11 w-9 -rotate-6 rounded-md border border-border/70 bg-background shadow-sm" />
                <span className="relative z-[1] flex h-12 w-10 flex-col items-center justify-center rounded-md border border-border bg-background shadow-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="mt-0.5 text-[9px] font-semibold tracking-wide text-muted-foreground">
                    MD
                  </span>
                </span>
                <span className="absolute -right-1 bottom-0 z-[2] inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background shadow-sm">
                  <Upload className="h-3 w-3" aria-hidden />
                </span>
              </span>
              <span className="text-[13px] text-muted-foreground">
                {fileName
                  ? t("settings.skills.uploadSelected", {
                      defaultValue: "Selected: {{name}}",
                      name: fileName,
                    })
                  : t("settings.skills.uploadDropHint", {
                      defaultValue: "Drag a file here, or click to choose",
                    })}
              </span>
            </button>
            <ul className="space-y-1 px-0.5 text-[12px] leading-5 text-muted-foreground">
              <li>
                {t("settings.skills.uploadRuleMarkdown", {
                  defaultValue: "Upload a .md / SKILL.md file, or paste its contents above.",
                })}
              </li>
              <li>
                {t("settings.skills.uploadRuleFrontmatter", {
                  defaultValue: "SKILL.md should include YAML frontmatter with name and description.",
                })}
              </li>
            </ul>
          </div>

          {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button type="button" disabled={busy || !markdown.trim()} onClick={() => void submit()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("settings.skills.install", { defaultValue: "Install" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
