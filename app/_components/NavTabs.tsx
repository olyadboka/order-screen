"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/order", label: "New order" },
  { href: "/orders", label: "Orders" },
];

export default function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-0.5 rounded-lg border border-line bg-canvas p-0.5">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
