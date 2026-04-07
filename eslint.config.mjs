import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-deprecated": "error",
      // next/typescript で既にカバーされているルールの重複を回避
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unsafe-argument": "error",
      // useCountdownTimer の hook 返り値はオブジェクトのため useEffect 依存配列に入れると無限ループする。
      // タイマー完了→フェーズ遷移の setState は effect 内でしか実行できないパターン
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Supabase 自動生成ファイルは type-checked ルールの対象外
  {
    files: ["src/lib/types/database.ts"],
    rules: {
      "@typescript-eslint/no-redundant-type-constituents": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // tsconfig.json で exclude されており projectService が解決できない
    "vitest.config.ts",
    "vitest.workspace.ts",
    // Edge Functions は Deno 環境 (npm: specifier) のため ESLint 対象外
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
