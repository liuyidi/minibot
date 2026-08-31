import type { Dispatch, SetStateAction } from "react";

import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { dateFromLocalInput, localInputFromDate } from "@/lib/picker/pickerUtils";
import { cn } from "@/lib/utils";

import {
  AUTOMATION_EVERY_UNITS,
  type AutomationCreateDraft,
  type AutomationEditDraft,
  type AutomationEveryUnit,
} from "../../lib/automationTypes";

const selectClassName =
  "h-10 w-full cursor-pointer rounded-xl border border-input bg-background px-3 text-[13px] text-foreground outline-none transition-colors disabled:opacity-60";

type Tx = (key: string, fallback: string, values?: Record<string, unknown>) => string;

export function AutomationCreateTriggerPanel({
  draft,
  setDraft,
  scheduleOptions,
  unitLabels,
  tx,
}: {
  draft: AutomationCreateDraft;
  setDraft: Dispatch<SetStateAction<AutomationCreateDraft>>;
  scheduleOptions: Array<{ value: string; label: string }>;
  unitLabels: Record<AutomationEveryUnit, string>;
  tx: Tx;
}) {
  return (
    <aside className="min-h-0 space-y-4 overflow-y-auto border-t border-border/40 bg-muted/15 px-5 py-4 dark:bg-background/20 lg:border-l lg:border-t-0">
      <h3 className="text-[13px] font-semibold text-foreground">
        {tx("settings.automations.triggerSection", "Trigger")}
      </h3>

      <label className="block space-y-1.5">
        <span className="text-[12px] font-medium text-muted-foreground">
          {tx("settings.automations.fields.frequency", "Frequency")}
        </span>
        <select
          value={draft.scheduleKind}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              scheduleKind: event.target.value as AutomationEditDraft["scheduleKind"],
            }))
          }
          className={selectClassName}
        >
          {scheduleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {draft.scheduleKind === "cron" ? (
        <div className="space-y-3">
          <div className={cn(selectClassName, "flex items-center bg-muted/40")}>
            {tx("settings.automations.fields.everyDay", "Every day")}
          </div>
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">
              {tx("settings.automations.fields.time", "Time")}
            </span>
            <TimePicker
              value={draft.dailyTime || null}
              onChange={(next) => setDraft((prev) => ({ ...prev, dailyTime: next ?? "" }))}
              placeholder={tx("settings.automations.fields.timePlaceholder", "Select time")}
              aria-label={tx("settings.automations.fields.time", "Time")}
              className="w-full"
            />
          </label>
        </div>
      ) : null}

      {draft.scheduleKind === "every" ? (
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">
              {tx("settings.automations.fields.every", "Every")}
            </span>
            <Input
              type="number"
              min={1}
              step={1}
              value={draft.everyValue}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, everyValue: event.target.value }))
              }
              className="h-10 rounded-xl"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">
              {tx("settings.automations.fields.unit", "Unit")}
            </span>
            <select
              value={draft.everyUnit}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  everyUnit: event.target.value as AutomationEveryUnit,
                }))
              }
              className={selectClassName}
            >
              {AUTOMATION_EVERY_UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unitLabels[unit.value]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {draft.scheduleKind === "at" ? (
        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-muted-foreground">
            {tx("settings.automations.fields.runAt", "Run at")}
          </span>
          <DateTimePicker
            value={dateFromLocalInput(draft.atLocal)}
            onChange={(next) =>
              setDraft((prev) => ({
                ...prev,
                atLocal: next ? localInputFromDate(next) : "",
              }))
            }
            placeholder={tx(
              "settings.automations.fields.runAtPlaceholder",
              "Select date and time",
            )}
            aria-label={tx("settings.automations.fields.runAt", "Run at")}
          />
        </label>
      ) : null}
    </aside>
  );
}
