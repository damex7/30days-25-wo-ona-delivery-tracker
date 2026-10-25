import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TripScreen } from "@/components/trip-screen";
import { PageSkeleton } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { getRiderTrip, photoProofEnabled } from "@/lib/services/deliveries";
import { NotFoundError } from "@/lib/services/errors";
import { canSimulate } from "@/lib/services/tracking";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Trip" };

export default function TripPage(props: PageProps<"/rider/trips/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the trip" />}>
      <Trip {...props} />
    </Suspense>
  );
}

async function Trip({ params }: PageProps<"/rider/trips/[id]">) {
  const me = await requireActor("rider");
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  let trip;
  try {
    trip = await getRiderTrip(me, id.data);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  // key: a status change remounts the screen with fresh state.
  return <TripScreen key={trip.status} trip={trip} canSimulate={canSimulate(me)} photoRequired={photoProofEnabled()} />;
}
