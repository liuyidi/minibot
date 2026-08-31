/**
 * Adapted from @minikb/ui Calendar (react-day-picker v9).
 */
import * as React from "react";
import { DayPicker, type DayButtonProps } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "react-day-picker/style.css";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function CalendarDayButton({
  className,
  day: _day,
  modifiers,
  ...props
}: DayButtonProps) {
  void _day;
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const isSolidSelected = Boolean(modifiers.selected) && !modifiers.range_middle;

  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={cn(
        "inline-flex size-8 cursor-pointer items-center justify-center rounded-md p-0 font-normal transition-colors",
        !isSolidSelected && "hover:bg-muted",
        modifiers.today &&
          !isSolidSelected &&
          "bg-accent text-accent-foreground hover:bg-accent",
        isSolidSelected && "bg-primary text-primary-foreground",
        modifiers.range_middle && "rounded-none bg-transparent",
        className,
      )}
    />
  );
}

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components: userComponents,
  ...props
}: CalendarProps) {
  const components: React.ComponentProps<typeof DayPicker>["components"] = {
    PreviousMonthButton: ({ className: btnClass, ...buttonProps }) => (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("size-7", btnClass)}
        disabled={buttonProps["aria-disabled"] === true || buttonProps.disabled}
        {...buttonProps}
      >
        <ChevronLeft className="size-3.5" />
      </Button>
    ),
    NextMonthButton: ({ className: btnClass, ...buttonProps }) => (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("size-7", btnClass)}
        disabled={buttonProps["aria-disabled"] === true || buttonProps.disabled}
        {...buttonProps}
      >
        <ChevronRight className="size-3.5" />
      </Button>
    ),
    DayButton: CalendarDayButton,
    ...userComponents,
  };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      components={components}
      className={cn("p-2", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row",
        month: "relative space-y-2",
        month_caption: "mb-2 flex h-7 items-center justify-center px-8",
        caption_label: "text-sm font-medium",
        button_previous: "absolute left-1 top-0 z-10",
        button_next: "absolute right-1 top-0 z-10",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "inline-flex size-8 items-center justify-center text-center text-xs font-normal text-muted-foreground",
        week: "mt-1 flex w-full items-center",
        day: "relative p-0 text-center text-sm",
        day_button: "",
        selected: "bg-primary text-primary-foreground",
        today: "rounded-md bg-accent text-accent-foreground",
        outside: "text-muted-foreground opacity-45",
        disabled: "text-muted-foreground opacity-35",
        ...classNames,
      }}
      {...props}
    />
  );
}

export { Calendar };
