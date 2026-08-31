/**
 * Adapted from @minikb/ui TimePanel (scroll columns for hour/minute).
 */
import * as React from "react";

import { parseTimeString } from "@/lib/picker/pickerUtils";
import { pad2 } from "@/lib/picker/timeSegments";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

export const TIME_OPTION_HEIGHT = 32;
export const TIME_OPTION_GAP = 2;
export const TIME_COLUMN_VIEWPORT = 224;
export const TIME_COLUMN_PAD = (TIME_COLUMN_VIEWPORT - TIME_OPTION_HEIGHT) / 2;

export function timeColumnScrollTop(index: number): number {
  return index * (TIME_OPTION_HEIGHT + TIME_OPTION_GAP);
}

function TimeColumn({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (next: number) => void;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const userScrollingRef = React.useRef(false);
  const scrollEndTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToValue = React.useCallback((nextValue: number, behavior: ScrollBehavior = "auto") => {
    const container = listRef.current;
    if (!container) return;
    if (container.clientHeight < 8) return;
    container.scrollTo({ top: timeColumnScrollTop(nextValue), behavior });
  }, []);

  React.useLayoutEffect(() => {
    if (userScrollingRef.current) return;
    scrollToValue(value);
    const frame = requestAnimationFrame(() => {
      if (!userScrollingRef.current) scrollToValue(value);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollToValue, value]);

  const markUserScroll = () => {
    userScrollingRef.current = true;
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = setTimeout(() => {
      userScrollingRef.current = false;
    }, 150);
  };

  React.useEffect(
    () => () => {
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    },
    [],
  );

  return (
    <div className="flex-1">
      <div className="px-2 pb-1 text-center text-xs text-muted-foreground">{label}</div>
      <div
        ref={listRef}
        onWheel={markUserScroll}
        onTouchMove={markUserScroll}
        onPointerDown={markUserScroll}
        className="h-56 overflow-y-auto overscroll-contain px-1"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div style={{ height: TIME_COLUMN_PAD }} aria-hidden className="shrink-0" />
        <div className="flex flex-col gap-0.5">
          {options.map((option) => {
            const selected = option === value;
            return (
              <button
                key={option}
                type="button"
                data-value={option}
                aria-label={`${label} ${pad2(option)}`}
                className={cn(
                  "h-8 shrink-0 cursor-pointer rounded-md text-sm tabular-nums transition-colors hover:bg-muted",
                  selected && "bg-primary/10 font-medium text-primary",
                )}
                onClick={() => onChange(option)}
              >
                {pad2(option)}
              </button>
            );
          })}
        </div>
        <div style={{ height: TIME_COLUMN_PAD }} aria-hidden className="shrink-0" />
      </div>
    </div>
  );
}

export type TimePanelProps = {
  value: string;
  onChange: (next: string) => void;
  hourOnly?: boolean;
  className?: string;
  hourLabel?: string;
  minuteLabel?: string;
};

export function TimePanel({
  value,
  onChange,
  hourOnly = false,
  className,
  hourLabel = "H",
  minuteLabel = "M",
}: TimePanelProps) {
  const { hours, minutes } = parseTimeString(value);

  return (
    <div className={cn("flex w-[168px] divide-x divide-border", className)}>
      <TimeColumn
        label={hourLabel}
        value={hours}
        options={HOURS}
        onChange={(nextHour) => onChange(`${pad2(nextHour)}:${pad2(minutes)}`)}
      />
      {!hourOnly ? (
        <TimeColumn
          label={minuteLabel}
          value={minutes}
          options={MINUTES}
          onChange={(nextMinute) => onChange(`${pad2(hours)}:${pad2(nextMinute)}`)}
        />
      ) : null}
    </div>
  );
}
