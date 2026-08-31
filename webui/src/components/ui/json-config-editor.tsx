import { useMemo, useRef, type UIEvent } from "react";

import { cn } from "@/lib/utils";

/** Lightweight JSON editor: line gutter + monospace textarea (Workbuddy-style). */
export function JsonConfigEditor({
  value,
  onChange,
  disabled,
  className,
  minHeightClassName = "min-h-[280px]",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  minHeightClassName?: string;
}) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lineCount = useMemo(() => Math.max(1, value.split("\n").length), [value]);

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[12px] border border-border/60 bg-background",
        className,
      )}
    >
      <div className={cn("flex", minHeightClassName)}>
        <div
          ref={gutterRef}
          aria-hidden
          className="shrink-0 select-none overflow-hidden border-r border-border/50 bg-muted/35 px-2.5 py-3 text-right font-mono text-[12px] leading-5 text-muted-foreground/80"
        >
          {Array.from({ length: lineCount }, (_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
        <textarea
          value={value}
          disabled={disabled}
          spellCheck={false}
          onScroll={syncScroll}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "min-h-full min-w-0 flex-1 resize-y bg-transparent px-3 py-3 font-mono text-[12.5px] leading-5 text-foreground",
            "outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        />
      </div>
    </div>
  );
}
