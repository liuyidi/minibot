/**
 * Adapted from @minikb/ui TimePicker — HH:MM popover picker.
 */
import * as React from "react";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimePanel } from "@/components/ui/time-panel";
import {
  defaultDraftTime,
  normalizeTimeString,
  pickerTriggerClassName,
} from "@/lib/picker/pickerUtils";
import { cn } from "@/lib/utils";

export type TimePickerProps = {
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  hourOnly?: boolean;
  className?: string;
  "aria-label"?: string;
};

function nearestDialog(node: HTMLElement | null): HTMLElement | null {
  return node?.closest<HTMLElement>('[role="dialog"]') ?? null;
}

export function TimePicker({
  value,
  onChange,
  disabled,
  placeholder = "Select time",
  hourOnly = false,
  className,
  "aria-label": ariaLabel = "Select time",
}: TimePickerProps) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(() => defaultDraftTime(value));

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(defaultDraftTime(value));
    setOpen(next);
  };

  const label = value ? (hourOnly ? `${value.split(":")[0]}:00` : value) : placeholder;

  const commit = (next: string) => {
    const normalized = normalizeTimeString(next);
    onChange(hourOnly ? `${normalized.split(":")[0]}:00` : normalized);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            pickerTriggerClassName,
            "cursor-pointer",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        // Portal into the dialog so RemoveScroll allows wheel / pointer inside the panel.
        container={open ? nearestDialog(triggerRef.current) : undefined}
        className="w-auto p-2"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onWheel={(event) => event.stopPropagation()}
      >
        <TimePanel
          key={open ? "open" : "closed"}
          value={draft}
          hourOnly={hourOnly}
          onChange={(next) => {
            setDraft(next);
            commit(next);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
