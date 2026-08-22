import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Extension directory – plain JS browser files, not part of the Next.js app
    "extension/**",
  ]),
  {
    // scripts/ holds standalone CommonJS Node utilities (icon/logo generation)
    // that are run directly with `node`, not bundled by Next.js.
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    rules: {
      // Calling setState at the top of an effect (e.g. setLoading(true)) or syncing
      // state from server data / localStorage are established React patterns.
      // Fixing them all would require large rewrites and is out of scope.
      "react-hooks/set-state-in-effect": "off",
      // Allow rest-sibling destructuring to exclude unwanted keys:
      // e.g. const { type: _type, ...rest } = msg
      "@typescript-eslint/no-unused-vars": ["warn", { "ignoreRestSiblings": true, "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    },
  },
]);

export default eslintConfig;
