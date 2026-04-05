import { defineProject } from "vitest/config";

export default [
  defineProject({
    extends: "./vitest.config.ts",
    test: {
      name: "small",
      include: ["tests/small/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      setupFiles: ["./tests/small/setup.ts"],
    },
  }),
  defineProject({
    extends: "./vitest.config.ts",
    test: {
      name: "medium",
      include: ["tests/medium/**/*.test.{ts,tsx}"],
      environment: "node",
      setupFiles: ["./tests/medium/setup.ts"],
      // Medium テストは並列実行しない（DB状態の競合を防ぐ）
      pool: "forks",
      poolOptions: { forks: { singleFork: true } },
    },
  }),
];
