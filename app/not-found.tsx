import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page py-16 text-center">
      <p className="eyebrow">Error 404</p>
      <h1 className="mt-2 text-4xl">This road doesn&apos;t lead anywhere</h1>
      <p className="mx-auto mt-3 max-w-md text-ink-muted">
        The page doesn&apos;t exist, or it belongs to another account. If you followed a tracking link, check the code with the business that sent it.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/" className="btn btn-primary">Go home</Link>
        <Link href="/#track" className="btn btn-secondary">Track a parcel</Link>
      </div>
    </div>
  );
}
