import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CursorBlend } from "@/components/effects/cursor-blend";
import { __resetCursorBlendRuntimeForTests } from "@/components/effects/cursor-blend/cursorBlendRuntime";

function mockCanvasContext() {
  const proto = HTMLCanvasElement.prototype as HTMLCanvasElement & {
    getContext: typeof HTMLCanvasElement.prototype.getContext;
  };
  const original = proto.getContext;
  proto.getContext = vi.fn(() => ({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
  })) as unknown as typeof proto.getContext;
  return () => {
    proto.getContext = original;
  };
}

function stubMatchMedia(options: { reducedMotion?: boolean; coarsePointer?: boolean }) {
  const original = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const matches =
        (options.reducedMotion === true && query.includes("prefers-reduced-motion")) ||
        (options.coarsePointer === true && query.includes("pointer: coarse"));
      return {
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      };
    },
  });
  return () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: original,
    });
  };
}

function canvasElements() {
  return document.body.querySelectorAll("canvas.cursor-blend-canvas");
}

describe("CursorBlend", () => {
  let restoreContext: (() => void) | undefined;
  let restoreMatchMedia: (() => void) | undefined;

  beforeEach(() => {
    restoreContext = mockCanvasContext();
    restoreMatchMedia = stubMatchMedia({ reducedMotion: false, coarsePointer: false });
    __resetCursorBlendRuntimeForTests();
    let rafId = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((_cb: FrameRequestCallback) => {
        rafId += 1;
        return rafId;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cleanup();
    __resetCursorBlendRuntimeForTests();
    restoreContext?.();
    restoreMatchMedia?.();
    vi.unstubAllGlobals();
  });

  it("marks the element with data-cursor=blend", () => {
    render(<CursorBlend as="h1">Hello</CursorBlend>);
    const heading = screen.getByRole("heading", { level: 1, name: "Hello" });
    expect(heading.getAttribute("data-cursor")).toBe("blend");
  });

  it("mounts a single body canvas shared by multiple instances", () => {
    const first = render(<CursorBlend>One</CursorBlend>);
    const second = render(<CursorBlend>Two</CursorBlend>);
    expect(canvasElements()).toHaveLength(1);
    first.unmount();
    expect(canvasElements()).toHaveLength(1);
    second.unmount();
    expect(canvasElements()).toHaveLength(0);
  });

  it("does not create a canvas when reduced motion is preferred", () => {
    restoreMatchMedia?.();
    restoreMatchMedia = stubMatchMedia({ reducedMotion: true, coarsePointer: false });
    __resetCursorBlendRuntimeForTests();

    render(<CursorBlend>Quiet</CursorBlend>);
    expect(canvasElements()).toHaveLength(0);
    expect(screen.getByText("Quiet").getAttribute("data-cursor")).toBe("blend");
  });
});
