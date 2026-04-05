import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/theme-toggle";

// next-themes の useTheme をモック
const mockSetTheme = vi.fn();
let mockTheme = "system";

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: mockTheme,
    setTheme: mockSetTheme,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockTheme = "system";
});

describe("ThemeToggle", () => {
  it("マウント後に3つのテーマオプションを表示する", () => {
    render(<ThemeToggle />);

    // mounted=false の初期状態では button 要素はないが、
    // useEffect でマウントされると button が表示される。
    // jsdom は同期的に useEffect を実行するため、render 後に確認できる
    expect(screen.getByRole("button", { name: "システムテーマに切り替え" })).toBeDefined();
    expect(screen.getByRole("button", { name: "ライトテーマに切り替え" })).toBeDefined();
    expect(screen.getByRole("button", { name: "ダークテーマに切り替え" })).toBeDefined();
  });

  it("ライトボタンをクリックすると setTheme('light') を呼ぶ", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "ライトテーマに切り替え" }));

    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  it("ダークボタンをクリックすると setTheme('dark') を呼ぶ", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "ダークテーマに切り替え" }));

    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("システムボタンをクリックすると setTheme('system') を呼ぶ", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "システムテーマに切り替え" }));

    expect(mockSetTheme).toHaveBeenCalledWith("system");
  });

  it("現在アクティブなテーマのボタンが aria-pressed=true になる", () => {
    mockTheme = "dark";
    render(<ThemeToggle />);

    const darkButton = screen.getByRole("button", { name: "ダークテーマに切り替え" });
    expect(darkButton).toHaveAttribute("aria-pressed", "true");

    const lightButton = screen.getByRole("button", { name: "ライトテーマに切り替え" });
    expect(lightButton).toHaveAttribute("aria-pressed", "false");
  });
});
