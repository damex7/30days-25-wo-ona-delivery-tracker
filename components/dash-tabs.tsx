"use client";
// The business area's tabs. On phones the header hides its links, so these
// tabs are how you move around; aria-current marks the page you're on.
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/business", label: "Deliveries", match: (p: string) => p === "/business" || p.startsWith("/business/deliveries") },
  { href: "/business/riders", label: "Riders", match: (p: string) => p.startsWith("/business/riders") },
  { href: "/business/settings", label: "Settings", match: (p: string) => p.startsWith("/business/settings") },
];

export function DashTabs() {
  return <DashTabsView path={usePathname()} />;
}

export function DashTabsView({ path }: { path: string | null }) {
  return (
    <nav aria-label="Business" className="border-b border-line bg-surface">
      <ul className="container-page flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const active = path ? t.match(path) : false;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-12 items-center border-b-[3px] px-2.5 font-semibold sm:px-3 ${active ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink"}`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
        <li className="ml-auto flex items-center">
          <Link href="/business/deliveries/new" className="btn btn-primary btn-sm whitespace-nowrap" aria-label="New delivery">
            ＋ New<span className="hidden sm:inline">&nbsp;delivery</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
