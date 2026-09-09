/**
 * When KaTeX is served from the CDN vendor path, inject its stylesheet on
 * demand (first markdown render / preload) instead of blocking the HTML head.
 * Local/dev builds keep the normal ``import "katex/dist/katex.min.css"``.
 */
export function ensureKatexStylesheet(): void {
  const raw = String(import.meta.env.VITE_KATEX_VENDOR_BASE ?? "").trim();
  if (!raw || typeof document === "undefined") return;

  const href = `${raw.replace(/\/+$/, "")}/katex.min.css`;
  if (document.querySelector(`link[data-minibot-katex-css="1"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.crossOrigin = "anonymous";
  link.href = href;
  link.dataset.minibotKatexCss = "1";
  document.head.appendChild(link);
}
