"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page py-16 text-center" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="mt-2 text-4xl">We hit a pothole</h1>
      <p className="mx-auto mt-3 max-w-md text-ink-muted">
        That page didn&apos;t load. It&apos;s usually a brief network or database hiccup. Try again in a moment.
      </p>
      <button type="button" onClick={reset} className="btn btn-primary mt-6">Try again</button>
    </div>
  );
}
