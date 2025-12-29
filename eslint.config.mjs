import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts"
  ]),
  {
    rules: {
      "no-trailing-spaces": "error",
      "comma-dangle": ["error", "never"],
      "semi": ["error", "never"],
      "indent": ["error", 2]
    }
  }
])

export default eslintConfig
