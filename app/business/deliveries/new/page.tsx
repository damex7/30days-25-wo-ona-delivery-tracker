import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DeliveryForm } from "@/components/delivery-form";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { getMyBusiness, listAssignableRiders } from "@/lib/services/fleet";

export const metadata: Metadata = { title: "New delivery" };

export default function NewDeliveryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewDelivery />
    </Suspense>
  );
}

async function NewDelivery() {
  const me = await requireActor("business");
  const [business, riders] = await Promise.all([getMyBusiness(me), listAssignableRiders(me)]);
  const shop =
    business.pickup_lat !== null && business.pickup_lng !== null && business.pickup_address
      ? { address: business.pickup_address, lat: business.pickup_lat, lng: business.pickup_lng }
      : null;
  return (
    <div className="container-page max-w-3xl py-8">
      <PageHeader
        eyebrow={<Link href="/business" className="link">← Deliveries</Link>}
        title="New delivery"
        subtitle="You'll get a tracking link to send the customer, and they'll get a secret code to confirm the handover."
      />
      <div className="card p-5 sm:p-6">
        <DeliveryForm riders={riders} shop={shop} city={business.city} />
      </div>
    </div>
  );
}
