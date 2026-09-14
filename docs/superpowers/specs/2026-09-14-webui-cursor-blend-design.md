# WebUI CursorBlend（difference 反色光标）

**Date:** 2026-09-14  
**Status:** approved for implementation  
**Scope:** minibot `webui` empty-state hero headline

## Goal

在空状态 hero 标题上提供类似 DeepSeek 首页的「放大镜」观感：并非真正放大文字，而是全屏 Canvas 画白色圆 + `mix-blend-mode: difference` 反色，并用 rAF 插值跟随鼠标。

## Decisions

| Item | Choice |
|------|--------|
| API | `<CursorBlend as="h1">` 包裹目标元素 |
| Canvas | 全局单例，runtime 直接 `appendChild` 到 `document.body`（非 React portal） |
| 多实例 | ref-count：首个 mount 创建，末个 unmount teardown |
| 样式 | 写在组件 / runtime 内，不进 `globals.css` |
| 目录 | `webui/src/components/effects/cursor-blend/` |
| 首接入口 | `ThreadShell` empty-state hero `<h1>` |
| 关闭 | `prefers-reduced-motion: reduce` 或 `pointer: coarse` |

## Architecture

```text
CursorBlend (wrapper)
  └─ data-cursor="blend"
  └─ acquire() / release()  ──►  cursorBlendRuntime (module singleton)
                                   ├─ create canvas → document.body
                                   ├─ pointermove → target + active
                                   ├─ rAF → lerp position / radius
                                   └─ draw white circle + mix-blend-mode:difference
```

### Files

| Path | Role |
|------|------|
| `webui/src/components/effects/cursor-blend/cursorBlendRuntime.ts` | 单例：ref-count、canvas、listeners、rAF、禁用检测 |
| `webui/src/components/effects/cursor-blend/CursorBlend.tsx` | polymorphic 包裹 + mount/unmount acquire/release |
| `webui/src/components/effects/cursor-blend/index.ts` | 导出 `CursorBlend` |
| `webui/src/components/thread/ThreadShell.tsx` | hero 接入 |
| `webui/src/tests/cursor-blend.test.tsx` | 行为测试 |

### Component API

```ts
type CursorBlendProps = {
  as?: keyof JSX.IntrinsicElements; // default "span"
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>;
```

Usage:

```tsx
<CursorBlend
  as="h1"
  className="max-w-[30rem] text-balance text-[34px] font-normal leading-[1.08] tracking-normal text-foreground sm:text-[48px] sm:leading-tight"
>
  {t(heroGreetingKey)}
</CursorBlend>
```

### Runtime behavior

- Activate when `event.target.closest('[data-cursor="blend"]')` is truthy.
- Position lerp: follow `0.7` if distance `< 50`, else `0.4`.
- Radius lerp toward `active ? 32 : 0` with factor `0.24`.
- DPR: `Math.min(devicePixelRatio, 2)`; canvas CSS covers viewport; transform scales for DPR.
- Canvas element styles (inline / colocated): `position:fixed; inset:0; z-index:9999; width:100vw; height:100vh; pointer-events:none; mix-blend-mode:difference`.
- Fill: `#fff`.
- If disabled (reduced motion / coarse pointer / no 2d context): no canvas, no listeners, acquire is no-op beyond ref-count bookkeeping that stays safe for release.

### Lifecycle

1. First `acquire` (enabled) → create canvas, append to `body`, bind `pointermove` + `resize`, start rAF.
2. Further `acquire` → `refCount++` only.
3. Last `release` → cancel rAF, unbind, remove canvas, reset state.
4. Media-query change to disabled → teardown if running; re-enable only while `refCount > 0`.

## Testing

- Vitest: `data-cursor="blend"` present; one canvas for two mounts; canvas removed after last unmount; reduced-motion skips canvas.
- Mock `HTMLCanvasElement.getContext("2d")`.
- Do not assert pixel drawing or lerp curves.
- Existing ThreadShell / app-layout hero text assertions remain valid (`h1` preserved).

## Out of scope

- Real optical zoom / `clip-path` / CSS `scale()`
- App-wide Provider wiring
- Other pages beyond ThreadShell empty hero
- Touch-device visual variant
