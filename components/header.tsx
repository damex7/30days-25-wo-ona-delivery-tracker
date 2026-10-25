import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { currentActor } from "@/lib/auth/session";
import { demoMembers } from "@/lib/services/demo";
import { DemoSwitcher } from "./demo-switcher";
import { ActionButton } from "./form";
import { LogoMark, Wordmark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

/** The black top bar (part of the 10% black). */
export function Header() {
  return (
    <header className="on-bar bg-bar text-on-bar">
      <div className="container-page flex min-h-16 items-center gap-2 sm:gap-4">
        <Link href="/" className="mr-auto flex items-center gap-2.5 rounded-lg text-xl" aria-label="Wo Ọ̀nà home">
          <LogoMark className="size-8" inverted />
          <Wordmark />
        </Link>
        <Suspense fallback={<span className="block h-10 w-24 rounded-xl bg-white/10" aria-hidden="true" />}>
          <UserNav />
        </Suspense>
        <ThemeToggle />
      </div>
      <Suspense fallback={null}>
        <DemoBanner />
      </Suspense>
    </header>
  );
}

const NAV = {
  business: [
    { href: "/business", label: "Deliveries" },
    { href: "/business/riders", label: "Riders" },
    { href: "/business/settings", label: "Settings" },
  ],
  rider: [{ href: "/rider", label: "My jobs" }],
  admin: [{ href: "/admin", label: "Admin" }],
} as const;

async function UserNav() {
  const actor = await currentActor();
  if (!actor) {
    return (
      <nav aria-label="Account" className="flex items-center gap-1">
        <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/15 sm:text-base">Log in</Link>
        <Link href="/signup" className="btn btn-on-bar btn-sm hidden sm:inline-flex">Get started</Link>
      </nav>
    );
  }
  return (
    <>
      {/* Businesses get tabs under the bar instead (components/dash-tabs.tsx). */}
      {actor.role !== "business" && <nav aria-label="Main" className="hidden items-center gap-1 text-[0.95rem] font-semibold md:flex">
        {NAV[actor.role].map((n) => (
          <Link key={n.href} href={n.href} className="rounded-xl px-3 py-2 hover:bg-white/15">{n.label}</Link>
        ))}
      </nav>}
      <details className="relative">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl px-2 font-semibold hover:bg-white/15 [&::-webkit-details-marker]:hidden">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white" aria-hidden="true">
            {actor.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="sr-only">Menu for {actor.name}</span>
          <span aria-hidden="true" className="text-xs">▾</span>
        </summary>
        <div className="absolute right-0 z-[1100] mt-2 w-60 rounded-2xl border border-line bg-surface p-2 text-ink shadow-lg">
          <p className="px-3 pt-1 pb-2 text-sm text-ink-muted">
            Signed in as <span className="font-semibold text-ink">{actor.name}</span>
            <span className="block capitalize">{actor.role} account</span>
          </p>
          {NAV[actor.role].map((n) => (
            <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2 font-semibold hover:bg-blue-soft">{n.label}</Link>
          ))}
          {actor.role === "business" && (
            <Link href="/business/deliveries/new" className="block rounded-lg px-3 py-2 font-semibold text-brand hover:bg-blue-soft">＋ New delivery</Link>
          )}
          <div className="mt-1 border-t border-line px-1 pt-2">
            <ActionButton action={logout} label="Log out" pendingLabel="Logging out…" className="btn btn-ghost btn-sm w-full justify-start" />
          </div>
        </div>
      </details>
    </>
  );
}

async function DemoBanner() {
  const actor = await currentActor();
  if (!actor?.isDemo) return null;
  const members = await demoMembers(actor);
  return (
    <div className="bg-brand text-on-brand">
      <div className="container-page flex flex-wrap items-center gap-x-4 gap-y-2 py-2 text-sm">
        <p className="font-semibold">
          <span aria-hidden="true">◆ </span>
          Private demo. You&apos;re <strong>{actor.name}</strong>. It&apos;s all deleted after 24 hours.
        </p>
        <DemoSwitcher members={members.filter((m) => !m.current)} />
      </div>
    </div>
  );
}
