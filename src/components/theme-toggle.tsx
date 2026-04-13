"use client";

import { useTheme } from "next-themes";
import { Monitor, Sun, Moon } from "lucide-react";
import { useSyncExternalStore } from "react";

type ThemeOption = {
  value: "system" | "light" | "dark";
  label: string;
  icon: React.ReactNode;
  ariaLabel: string;
};

const themeOptions: ThemeOption[] = [
  {
    value: "system",
    label: "システム",
    icon: <Monitor aria-hidden="true" className="h-4 w-4" />,
    ariaLabel: "システムテーマに切り替え",
  },
  {
    value: "light",
    label: "ライト",
    icon: <Sun aria-hidden="true" className="h-4 w-4" />,
    ariaLabel: "ライトテーマに切り替え",
  },
  {
    value: "dark",
    label: "ダーク",
    icon: <Moon aria-hidden="true" className="h-4 w-4" />,
    ariaLabel: "ダークテーマに切り替え",
  },
];

// useSyncExternalStore でハイドレーション不一致を防ぐ。
// SSR では getServerSnapshot が false を返すためスケルトンを表示し、
// CSR マウント後は getSnapshot が true を返すためインタラクティブな UI を表示する。
function useIsMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useIsMounted();

  if (!mounted) {
    return (
      <div className="flex rounded-md bg-muted p-1">
        {themeOptions.map((option) => (
          <div
            key={option.value}
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-muted-foreground"
          >
            {option.icon}
            <span>{option.label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex rounded-md bg-muted p-1">
      {themeOptions.map((option) => {
        const isActive = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-label={option.ariaLabel}
            aria-pressed={isActive}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors ${
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
