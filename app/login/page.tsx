import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { login, tryDemo } from "@/app/actions/auth";
import { ActionButton, Field, Form } from "@/components/form";
import { PageSkeleton } from "@/components/ui";
import { currentActor, homeFor } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Login {...props} />
    </Suspense>
  );
}

async function Login({ searchParams }: PageProps<"/login">) {
  const actor = await currentActor();
  if (actor) redirect(homeFor(actor.role));
  const next = (await searchParams).next;
  return (
    <div className="container-page grid max-w-md py-12">
      <p className="eyebrow">Businesses and riders</p>
      <h1 className="mt-1 text-4xl">Welcome back</h1>
      <p className="mt-2 mb-8 text-ink-muted">
        New here? <Link className="link" href="/signup">Create an account</Link>
      </p>
      <div className="card p-6">
        <Form action={login} submitLabel="Log in" pendingLabel="Logging in…" submitClassName="btn btn-primary w-full">
          {typeof next === "string" && <input type="hidden" name="next" value={next} />}
          <Field name="email" label="Email" type="email" autoComplete="email" inputMode="email" />
          <Field name="password" label="Password" type="password" autoComplete="current-password" />
        </Form>
      </div>
      <div className="mt-6 rounded-2xl bg-surface-2 p-5 text-sm">
        <p className="font-semibold">Just looking around?</p>
        <p className="mt-1 mb-3 text-ink-muted">Get your own demo business with riders and deliveries. No password needed.</p>
        <ActionButton action={tryDemo} label="Try the live demo" pendingLabel="Building your demo…" className="btn btn-black btn-sm" />
      </div>
      <p className="mt-6 text-sm text-ink-muted">
        Waiting for a parcel? You don&apos;t need an account. <Link className="link" href="/#track">Track it with your code</Link>.
      </p>
    </div>
  );
}
