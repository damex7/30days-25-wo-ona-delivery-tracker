import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsForm } from "@/components/settings-form";
import { Notice, PageHeader, PageSkeleton } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { getMyBusiness } from "@/lib/services/fleet";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage(props: PageProps<"/business/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings {...props} />
    </Suspense>
  );
}

async function Settings({ searchParams }: PageProps<"/business/settings">) {
  const me = await requireActor("business");
  const b = await getMyBusiness(me);
  const welcome = (await searchParams).welcome === "1";
  return (
    <div className="container-page max-w-3xl py-8">
      <PageHeader eyebrow={b.name} title="Settings" />
      {welcome && (
        <div className="mb-6">
          <Notice tone="ok" title={`Welcome to Wo Ọ̀nà, ${me.name.split(" ")[0]}!`}>
            Set your usual pickup point below, then invite your riders from the Riders page with your fleet code.
          </Notice>
        </div>
      )}
      <div className="card p-5 sm:p-6">
        <SettingsForm b={b} />
      </div>
    </div>
  );
}
