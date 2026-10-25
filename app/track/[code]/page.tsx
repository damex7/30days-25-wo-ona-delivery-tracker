import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TrackView } from "@/components/track-view";
import { Notice, PageSkeleton } from "@/components/ui";
import { rateLimit } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/services/errors";
import { getPublicTracking } from "@/lib/services/tracking";
import { parseTrackingCode } from "@/lib/tracking-code";

export const metadata: Metadata = {
  title: "Track your parcel",
  // A tracking page is personal: keep it out of search engines.
  robots: { index: false, follow: false },
};

export default function TrackPage(props: PageProps<"/track/[code]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Finding your parcel" />}>
      <Track {...props} />
    </Suspense>
  );
}

async function Track({ params }: PageProps<"/track/[code]">) {
  const code = parseTrackingCode((await params).code);
  if (!code) notFound();
  // Same limit as the API: enough for real use, far too few to guess codes.
  if (!(await rateLimit(`track:${await clientIp()}`, 120, 60))) {
    return (
      <div className="container-page max-w-lg py-12">
        <Notice tone="warn" title="Too many look-ups">Please wait a minute, then refresh this page.</Notice>
      </div>
    );
  }
  let t;
  try {
    t = await getPublicTracking(code);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  return <TrackView initial={t} />;
}
