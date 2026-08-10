/** Start moving the desktop window (Tauri overlay titlebar). */
export async function startHostWindowDrag(): Promise<void> {
  if (typeof window === "undefined") return;

  const host = window.minibotHost;
  if (host && typeof host.startWindowDrag === "function") {
    try {
      await host.startWindowDrag();
      return;
    } catch {
      // fall through to Tauri globals
    }
  }

  const w = window as unknown as {
    __TAURI__?: {
      window?: {
        getCurrentWindow?: () => { startDragging: () => Promise<void> };
      };
      core?: { invoke?: (cmd: string, args?: object) => Promise<unknown> };
    };
    __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: object) => Promise<unknown> };
  };

  try {
    const getCurrentWindow = w.__TAURI__?.window?.getCurrentWindow;
    if (typeof getCurrentWindow === "function") {
      await getCurrentWindow().startDragging();
      return;
    }
    const invoke = w.__TAURI__?.core?.invoke || w.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke === "function") {
      await invoke("plugin:window|start_dragging");
    }
  } catch {
    // Not running inside Tauri, or drag permission missing.
  }
}

/** Use on mousedown of a chrome drag surface (ignore interactive descendants). */
export function onHostChromeDragMouseDown(
  event: { button: number; detail: number; target: EventTarget | null },
): void {
  if (event.button !== 0 || event.detail > 1) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("button, a, input, textarea, select, [data-no-window-drag]")) {
    return;
  }
  void startHostWindowDrag();
}
