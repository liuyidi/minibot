import { useCallback, useEffect, useState } from "react";

export interface InstalledSettingItemsOptions<Payload, Item> {
  token: string;
  eventName: string;
  fetchPayload: (token: string) => Promise<Payload>;
  isPayload: (value: unknown) => value is Payload;
  selectItems: (payload: Payload) => Item[];
}

/** Load + refresh gateway setting catalogs (CLI apps, MCP presets, …). */
export function useInstalledSettingItems<Payload, Item>({
  token,
  eventName,
  fetchPayload,
  isPayload,
  selectItems,
}: InstalledSettingItemsOptions<Payload, Item>): Item[] {
  const [items, setItems] = useState<Item[]>([]);

  const refresh = useCallback(async (isCancelled?: () => boolean) => {
    try {
      const payload = await fetchPayload(token);
      if (!isCancelled?.()) setItems(selectItems(payload));
    } catch {
      if (!isCancelled?.()) setItems([]);
    }
  }, [fetchPayload, selectItems, token]);

  useEffect(() => {
    let cancelled = false;
    void refresh(() => cancelled);

    const refreshOnFocus = () => {
      if (document.visibilityState === "hidden") return;
      void refresh();
    };
    const refreshOnChanged = (event: Event) => {
      const payload = (event as CustomEvent<unknown>).detail;
      if (isPayload(payload)) {
        setItems(selectItems(payload));
        return;
      }
      void refresh();
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    window.addEventListener(eventName, refreshOnChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      window.removeEventListener(eventName, refreshOnChanged);
    };
  }, [eventName, isPayload, refresh, selectItems]);

  return items;
}
