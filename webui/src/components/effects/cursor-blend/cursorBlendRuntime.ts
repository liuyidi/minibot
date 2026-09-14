const ATTR = '[data-cursor="blend"]';
const CANVAS_CLASS = "cursor-blend-canvas";
const TARGET_RADIUS = 32;
const RADIUS_LERP = 0.24;
const FOLLOW_NEAR = 0.7;
const FOLLOW_FAR = 0.4;
const NEAR_DISTANCE = 50;

type RuntimeState = {
  refCount: number;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  rafId: number | null;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  active: boolean;
  radius: number;
  reducedMotionQuery: MediaQueryList | null;
  coarsePointerQuery: MediaQueryList | null;
  onPointerMove: ((event: PointerEvent) => void) | null;
  onResize: (() => void) | null;
  onMediaChange: (() => void) | null;
};

const state: RuntimeState = {
  refCount: 0,
  canvas: null,
  ctx: null,
  rafId: null,
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  active: false,
  radius: 0,
  reducedMotionQuery: null,
  coarsePointerQuery: null,
  onPointerMove: null,
  onResize: null,
  onMediaChange: null,
};

function isEffectDisabled(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return true;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches === true;
  return reduced || coarse;
}

function applyCanvasStyles(canvas: HTMLCanvasElement): void {
  canvas.className = CANVAS_CLASS;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    zIndex: "9999",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    mixBlendMode: "difference",
  });
}

function resizeCanvas(): void {
  const { canvas, ctx } = state;
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function renderFrame(): void {
  const { ctx, canvas } = state;
  if (!ctx || !canvas) return;

  const distance = Math.hypot(state.targetX - state.x, state.targetY - state.y);
  const follow = distance < NEAR_DISTANCE ? FOLLOW_NEAR : FOLLOW_FAR;
  state.x += (state.targetX - state.x) * follow;
  state.y += (state.targetY - state.y) * follow;
  state.radius += ((state.active ? TARGET_RADIUS : 0) - state.radius) * RADIUS_LERP;

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  if (state.radius > 0.1) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(state.x, state.y, state.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  state.rafId = window.requestAnimationFrame(renderFrame);
}

function setup(): void {
  if (state.canvas || isEffectDisabled()) return;

  const canvas = document.createElement("canvas");
  applyCanvasStyles(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  state.canvas = canvas;
  state.ctx = ctx;
  document.body.appendChild(canvas);
  resizeCanvas();

  state.onPointerMove = (event: PointerEvent) => {
    state.targetX = event.clientX;
    state.targetY = event.clientY;
    const target = event.target;
    state.active =
      target instanceof Element && Boolean(target.closest(ATTR));
  };
  state.onResize = () => resizeCanvas();

  window.addEventListener("pointermove", state.onPointerMove);
  window.addEventListener("resize", state.onResize);
  state.rafId = window.requestAnimationFrame(renderFrame);
}

function teardown(): void {
  if (state.rafId != null) {
    window.cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
  if (state.onPointerMove) {
    window.removeEventListener("pointermove", state.onPointerMove);
    state.onPointerMove = null;
  }
  if (state.onResize) {
    window.removeEventListener("resize", state.onResize);
    state.onResize = null;
  }
  state.canvas?.remove();
  state.canvas = null;
  state.ctx = null;
  state.active = false;
  state.radius = 0;
  state.x = 0;
  state.y = 0;
  state.targetX = 0;
  state.targetY = 0;
}

function ensureMediaWatchers(): void {
  if (typeof window === "undefined" || !window.matchMedia) return;
  if (state.onMediaChange) return;

  state.reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  state.coarsePointerQuery = window.matchMedia("(pointer: coarse)");
  state.onMediaChange = () => {
    if (state.refCount <= 0) return;
    if (isEffectDisabled()) {
      teardown();
    } else if (!state.canvas) {
      setup();
    }
  };

  state.reducedMotionQuery.addEventListener?.("change", state.onMediaChange);
  state.coarsePointerQuery.addEventListener?.("change", state.onMediaChange);
}

function clearMediaWatchers(): void {
  if (!state.onMediaChange) return;
  state.reducedMotionQuery?.removeEventListener?.("change", state.onMediaChange);
  state.coarsePointerQuery?.removeEventListener?.("change", state.onMediaChange);
  state.reducedMotionQuery = null;
  state.coarsePointerQuery = null;
  state.onMediaChange = null;
}

export function acquire(): void {
  state.refCount += 1;
  ensureMediaWatchers();
  if (state.refCount === 1) {
    setup();
  }
}

export function release(): void {
  state.refCount = Math.max(0, state.refCount - 1);
  if (state.refCount === 0) {
    teardown();
    clearMediaWatchers();
  }
}

/** Test-only: tear down singleton between cases. */
export function __resetCursorBlendRuntimeForTests(): void {
  state.refCount = 0;
  teardown();
  clearMediaWatchers();
}
