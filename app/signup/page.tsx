import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignupForm } from "@/components/signup-form";
import { PageSkeleton } from "@/components/ui";
import { currentActor, homeFor } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage(props: PageProps<"/signup">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Signup {...props} />
    </Suspense>
  );
}

async function Signup({ searchParams }: PageProps<"/signup">) {
  const actor = await currentActor();
  if (actor) redirect(homeFor(actor.role));
  const sp = await searchParams;
  const role = sp.role === "rider" ? "rider" : sp.role === "business" ? "business" : undefined;
  const code = typeof sp.code === "string" ? sp.code : undefined;
  return (
    <div className="container-page grid max-w-lg py-12">
      <p className="eyebrow">Get started</p>
      <h1 className="mt-1 text-4xl">Join Wo Ọ̀nà</h1>
      <p className="mt-2 mb-8 text-ink-muted">
        Already have an account? <Link className="link" href="/login">Log in</Link>
      </p>
      <div className="card p-6">
        <SignupForm defaultRole={role ?? (code ? "rider" : undefined)} fleetCode={code} />
      </div>
      <p className="mt-4 text-sm text-ink-muted">
        Customers don&apos;t need an account: they track with the code the business sends them.
      </p>
    </div>
  );
}
