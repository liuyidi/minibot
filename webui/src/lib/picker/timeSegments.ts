/** Adapted from @minikb/ui (openstatusHQ/time-picker MIT lineage). */

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function getValidNumber(
  raw: string,
  { max, min = 0, loop = false }: { max: number; min?: number; loop?: boolean },
): string {
  let n = parseInt(raw, 10);
  if (Number.isNaN(n)) return pad2(min);
  if (!loop) {
    if (n > max) n = max;
    if (n < min) n = min;
  } else {
    if (n > max) n = min;
    if (n < min) n = max;
  }
  return pad2(n);
}

export function arrowValue(current: string, step: number, min: number, max: number): string {
  const n = parseInt(current, 10);
  if (Number.isNaN(n)) return pad2(min);
  return getValidNumber(String(n + step), { max, min, loop: true });
}

export function splitTime(value: string, hourMin = 0): { hh: string; mm: string } {
  const [rawH, rawM] = (value || "").split(":");
  const hh = getValidNumber(rawH ?? "0", { max: 23, min: hourMin });
  const mm = getValidNumber(rawM ?? "0", { max: 59 });
  return { hh, mm };
}
