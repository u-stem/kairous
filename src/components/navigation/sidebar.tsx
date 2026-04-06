"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "./nav-items";
import { NavIcon } from "./nav-icon";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-dvh w-56 shrink-0 border-r bg-card md:block">
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
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <NavIcon icon={item.icon} />
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
