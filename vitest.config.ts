import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    // テストファイルがない状態でも CI / pre-commit を通過させる
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "small",
          include: ["tests/small/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["./tests/small/setup.ts"],
          // テストファイルがない状態でも CI / pre-commit を通過させる
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        test: {
          name: "medium",
          include: ["tests/medium/**/*.test.{ts,tsx}"],
          environment: "node",
          setupFiles: ["./tests/medium/setup.ts"],
          // Medium テストは並列実行しない（DB状態の競合を防ぐ）
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
