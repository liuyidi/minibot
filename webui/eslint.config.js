import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Ban CJK literals in production TS/TSX (pairs with scripts/check-no-cjk-copy.mjs). */
const noCjkCopyPlugin = {
  rules: {
    "no-cjk-copy": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Disallow hard-coded CJK copy in WebUI source; use react-i18next (webui-ui-i18n.mdc).",
        },
        schema: [],
        messages: {
          cjk: 'Hard-coded CJK copy is not allowed. Use t("…") and locale JSON (see .cursor/rules/webui-ui-i18n.mdc).',
        },
      },
      create(context) {
        const CJK = /[\u3400-\u9fff]/;
        function check(node, value) {
          if (typeof value === "string" && CJK.test(value)) {
            context.report({ node, messageId: "cjk" });
          }
        }
        return {
          Literal(node) {
            check(node, node.value);
          },
          TemplateElement(node) {
            check(node, node.value?.cooked ?? "");
          },
          JSXText(node) {
            check(node, node.value);
          },
        };
      },
    },
  },
};

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "node_modules", "*.config.js", "scripts/**"],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "minibot-i18n": noCjkCopyPlugin,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "minibot-i18n/no-cjk-copy": "error",
    },
  },
  {
    files: [
      "src/i18n/locales/**",
      "src/tests/**",
      "src/i18n/config.ts",
      "src/lib/utils/format.ts",
    ],
    rules: {
      "minibot-i18n/no-cjk-copy": "off",
    },
  },
);
