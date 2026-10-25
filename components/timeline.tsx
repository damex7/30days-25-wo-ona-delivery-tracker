// The progress steps, drawn as a little road: a dashed line between stops,
// solid blue where the parcel has already been.
import { formatTime } from "@/lib/format";

export type Step = { status: string; label: string; at: string | null; done: boolean; current: boolean };

export function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="relative space-y-4" aria-label="Delivery progress">
      {steps.map((s, i) => (
        <li key={s.status} className="relative flex gap-3 pl-0" aria-current={s.current ? "step" : undefined}>
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={`absolute top-6 left-[11px] h-[calc(100%-0.5rem)] w-0.5 ${s.done && steps[i + 1]!.done ? "bg-brand" : ""}`}
              style={s.done && steps[i + 1]!.done ? undefined : { backgroundImage: "repeating-linear-gradient(180deg, var(--line-strong) 0 5px, transparent 5px 10px)" }}
            />
          )}
          <span
            aria-hidden="true"
            className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2 text-xs font-bold ${
              s.current ? "border-brand bg-brand text-on-brand" : s.done ? "border-brand bg-surface text-brand" : "border-line-strong bg-surface text-ink-muted"
            }`}
          >
            {s.done && !s.current ? "✓" : i + 1}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className={`font-semibold ${s.current ? "text-brand" : s.done ? "text-ink" : "text-ink-muted"}`}>
              {s.label}
              <span className="sr-only">{s.current ? " (current step)" : s.done ? " (done)" : " (not yet)"}</span>
            </p>
            {s.at && <p className="text-xs text-ink-muted tabular">{formatTime(s.at)}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
