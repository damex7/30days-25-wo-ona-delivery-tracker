// Small presentational pieces shared by many pages.
import type { ReactNode } from "react";
import { displayCode } from "@/lib/tracking-code";

const STATUS: Record<string, { label: string; icon: string; cls: string }> = {
  pending: { label: "Waiting for rider", icon: "○", cls: "border-[1.5px] border-black text-ink bg-surface" },
  assigned: { label: "Assigned", icon: "◐", cls: "bg-blue-soft text-on-blue-soft" },
  picked_up: { label: "On the way", icon: "➜", cls: "bg-brand text-on-brand" },
  arrived: { label: "Arrived", icon: "◉", cls: "bg-black text-on-black" },
  delivered: { label: "Delivered", icon: "✓", cls: "bg-ok-bg text-ok" },
  failed: { label: "Failed", icon: "✕", cls: "bg-danger-bg text-danger" },
  cancelled: { label: "Cancelled", icon: "⊘", cls: "bg-danger-bg text-danger" },
};

/** A status pill. The word and the icon carry the meaning; colour is only extra. */
export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const s = STATUS[status] ?? { label: status, icon: "●", cls: "bg-surface-2 text-ink" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${s.cls} ${className}`}>
      <span aria-hidden="true">{s.icon}</span>
      {s.label}
    </span>
  );
}

/** A tracking code as a black "number plate", with a label for screen readers. */
export function CodePlate({ code, className = "" }: { code: string; className?: string }) {
  return (
    <span className={`plate ${className}`} aria-label={`Tracking code ${code.split("").join(" ")}`}>
      {displayCode(code)}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line-strong bg-surface-2 p-8 text-center">
      <p className="display text-xl">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-ink-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {subtitle && <div className="mt-2 text-ink-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, tone = "blue" }: { label: string; value: ReactNode; tone?: "blue" | "black" }) {
  return (
    <div className="card p-4">
      <dt className="eyebrow">{label}</dt>
      <dd className={`display mt-1 text-3xl tabular ${tone === "blue" ? "text-brand" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** The loading state for a whole page while its data streams in. */
export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="container-page py-8" role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      <Skeleton className="mb-3 h-9 w-2/3 max-w-md" />
      <Skeleton className="mb-8 h-5 w-1/2 max-w-sm" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

/** A message box for warnings and notes. Black-bordered, so it stays in the palette. */
export function Notice({ title, children, tone = "info" }: { title?: string; children: ReactNode; tone?: "info" | "warn" | "danger" | "ok" }) {
  const cls = {
    info: "border-brand bg-blue-soft text-on-blue-soft",
    warn: "border-black bg-surface text-ink",
    danger: "border-danger bg-danger-bg text-ink",
    ok: "border-ok bg-ok-bg text-ink",
  }[tone];
  return (
    <div className={`rounded-xl border-l-4 p-3 text-sm ${cls}`}>
      {title && <p className="font-bold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}
