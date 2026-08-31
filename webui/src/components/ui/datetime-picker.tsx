/**
 * Adapted from @minikb/ui DateTimePicker — date + HH:MM popover picker.
 */
import * as React from "react";
import { CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimePanel } from "@/components/ui/time-panel";
import {
  applyDateToDateTime,
  applyTimeToDateTime,
  defaultDraftTime,
  formatDateTimeValue,
  pickerTriggerClassName,
  timeStringFromDate,
} from "@/lib/picker/pickerUtils";
import { cn } from "@/lib/utils";

export type DateTimePickerProps = {
  value: Date | null;
  onChange: (next: Date | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
};

function nearestDialog(node: HTMLElement | null): HTMLElement | null {
  return node?.closest<HTMLElement>('[role="dialog"]') ?? null;
}

export function DateTimePicker({
  value,
  onChange,
  disabled,
  placeholder = "Select date and time",
  className,
  "aria-label": ariaLabel = "Select date and time",
}: DateTimePickerProps) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const [draftTime, setDraftTime] = React.useState(() =>
    value ? timeStringFromDate(value) : defaultDraftTime(null),
  );

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraftTime(value ? timeStringFromDate(value) : defaultDraftTime(null));
    }
    setOpen(next);
  };

  const label = value ? formatDateTimeValue(value) : placeholder;

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
          <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={open ? nearestDialog(triggerRef.current) : undefined}
        className="w-auto p-0"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col sm:flex-row">
          <Calendar
            mode="single"
            selected={value ?? undefined}
            defaultMonth={value ?? undefined}
            className="border-b border-border sm:border-b-0 sm:border-r"
            onSelect={(date) => {
              if (!date) return;
              onChange(applyDateToDateTime(value, date));
            }}
          />
          <div className="p-2">
            <TimePanel
              key={open ? "open" : "closed"}
              value={draftTime}
              onChange={(next) => {
                setDraftTime(next);
                onChange(applyTimeToDateTime(value, next));
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
