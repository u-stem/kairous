import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/auth/login/actions", () => ({
  login: vi.fn(),
}));

import LoginPage from "@/app/auth/login/page";

describe("LoginPage", () => {
  it("renders email and password inputs and submit button", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText("メールアドレス")).toBeInTheDocument();
    expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ログイン" })).toBeInTheDocument();
  });
});
