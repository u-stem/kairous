"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems, iconPaths } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-dvh w-56 shrink-0 border-r bg-white md:block">
      <div className="p-4">
        <h1 className="text-xl font-bold">Kairous</h1>
      </div>
      <nav>
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            // ルートパスは前方一致だと全ページでアクティブになるため完全一致のみ
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                    isActive
                      ? "bg-indigo-50 text-indigo-600"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={iconPaths[item.icon]}
                    />
                  </svg>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
