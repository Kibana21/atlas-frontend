// ESLint flat config: Next.js core-web-vitals + TypeScript rules + jsx-a11y (bundled by eslint-config-next).
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [
      ".next/**",
      ".tools/**",
      "build/**",
      "coverage/**",
      "node_modules/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      "src/generated/**",
    ],
  },
  {
    rules: {
      // No arbitrary executable HTML (FR-57, CLAUDE.md): never inject raw HTML.
      "react/no-danger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "jsx-a11y/no-autofocus": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
];

export default config;
