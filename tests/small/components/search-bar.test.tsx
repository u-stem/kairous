import { describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { SearchBar } from "@/components/search-bar";

describe("SearchBar", () => {
  it("プレースホルダーを表示する", () => {
    render(<SearchBar onSearch={() => {}} placeholder="教材を検索..." />);
    expect(screen.getByPlaceholderText("教材を検索...")).toBeDefined();
  });

  it("デフォルト表示で入力欄が存在する", () => {
    render(<SearchBar onSearch={() => {}} />);
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("300ms のデバウンス後に onSearch を呼ぶ", () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();

    render(<SearchBar onSearch={onSearch} />);

    act(() => {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "react" } });
    });

    // 300ms 未満では呼ばれていない
    act(() => vi.advanceTimersByTime(299));
    expect(onSearch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledWith("react");
    expect(onSearch).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("連続入力では最後の入力後300ms で onSearch を1回だけ呼ぶ", () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();

    render(<SearchBar onSearch={onSearch} />);

    act(() => {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "a" } });
    });
    act(() => vi.advanceTimersByTime(100));

    act(() => {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "ab" } });
    });
    act(() => vi.advanceTimersByTime(100));

    act(() => {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "abc" } });
    });

    // まだ呼ばれていない
    expect(onSearch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));

    // 最後の値で1回だけ呼ばれる
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("abc");

    vi.useRealTimers();
  });
});
