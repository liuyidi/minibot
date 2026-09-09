import type { Plugin } from "vite";

/**
 * When ``VITE_KATEX_VENDOR_BASE`` is set (CDN publish), load KaTeX JS/CSS/fonts
 * from a version-pinned vendor URL instead of bundling them into app assets.
 */
export function katexVendorCdnPlugin(vendorBase: string): Plugin {
  const base = vendorBase.replace(/\/+$/, "");
  const cssStub = "\0minibot-katex-css-stub";

  return {
    name: "minibot-katex-vendor-cdn",
    enforce: "pre",
    config() {
      return {
        build: {
          rollupOptions: {
            external(id: string) {
              if (id === "katex") return true;
              // Keep CSS on the stub path below; only JS subpaths are external.
              if (id.startsWith("katex/") && !id.includes(".css")) return true;
              return false;
            },
          },
        },
      };
    },
    resolveId(id) {
      if (
        id === "katex/dist/katex.min.css"
        || id === "katex/dist/katex.css"
        || id.endsWith("/katex.min.css")
        || id.endsWith("/katex.css")
      ) {
        return cssStub;
      }
      return null;
    },
    load(id) {
      if (id === cssStub) {
        return "/* katex CSS loaded from vendor CDN */\n";
      }
      return null;
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const importMap = JSON.stringify({
          imports: {
            katex: `${base}/katex.mjs`,
          },
        });
        const inject = [
          `    <link rel="stylesheet" crossorigin href="${base}/katex.min.css" />`,
          `    <link rel="modulepreload" crossorigin href="${base}/katex.mjs" />`,
          `    <script type="importmap">${importMap}</script>`,
        ].join("\n");
        if (html.includes("type=\"importmap\"")) {
          return html;
        }
        return html.replace(/<title>\s*minibot\s*<\/title>/i, `${inject}\n    <title>minibot</title>`);
      },
    },
  };
}
