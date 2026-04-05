import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// テスト間でDOMをクリーンアップし、テスト漏れを防ぐ
afterEach(() => {
  cleanup();
});
