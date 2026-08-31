import { useLayoutEffect, type MutableRefObject, type RefObject } from "react";

/** Keep caret at an explicit index after controlled composer value updates. */
export function usePendingComposerSelection(
  value: string,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  pendingSelectionRef: MutableRefObject<number | null>,
  setCursorPosition: (pos: number) => void,
): void {
  useLayoutEffect(() => {
    const pos = pendingSelectionRef.current;
    if (pos == null) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(pos, pos);
    setCursorPosition(pos);
    const id = requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node || pendingSelectionRef.current !== pos) return;
      pendingSelectionRef.current = null;
      node.setSelectionRange(pos, pos);
      setCursorPosition(pos);
    });
    return () => cancelAnimationFrame(id);
  }, [pendingSelectionRef, setCursorPosition, textareaRef, value]);
}
