import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Brand rule: no browser dropdowns or pop-ups. Use the app's own Select and dialogs.
      "no-restricted-syntax": ["error",
        { selector: "JSXOpeningElement[name.name='select']", message: "Use the app's Select component." },
        { selector: "CallExpression[callee.name=/^(alert|confirm|prompt)$/]", message: "Use the app's dialogs." },
        { selector: "CallExpression[callee.object.name='window'][callee.property.name=/^(alert|confirm|prompt)$/]", message: "Use the app's dialogs." },
      ],
    },
  },
  // The end-to-end script is plain Node (CommonJS) run outside the app.
  { files: ["tests/e2e/**"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".claude/**", "src/lib/database.types.ts"]),
]);
