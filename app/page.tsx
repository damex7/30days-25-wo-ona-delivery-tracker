import Link from "next/link";
import { tryDemo } from "@/app/actions/auth";
import { ActionButton } from "@/components/form";
import { TrackForm } from "@/components/track-form";

export default function Home() {
  return (
    <>
      {/* The hero band: cobalt blue, part of the 30%. */}
      <section className="bg-brand text-on-brand">
        <div className="container-page grid gap-10 py-12 md:grid-cols-[1.15fr_1fr] md:items-center md:py-20">
          <div>
            <p className="eyebrow !text-white/80">Live delivery tracking for Nigerian businesses</p>
            <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl">Watch your delivery come down the road.</h1>
            <p className="mt-5 max-w-xl text-lg text-white/90">
              Your rider&apos;s phone shares where they are. Your customer opens one link and watches the parcel move
              on a map, then confirms the handover with a 4-digit code. No app to install.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ActionButton action={tryDemo} label="Try the live demo" pendingLabel="Building your demo…" className="btn btn-on-bar" />
              <Link href="/signup" className="btn border-white text-white hover:bg-white/10">Start for your business</Link>
            </div>
            <p className="mt-3 text-sm text-white/80">The demo gives you your own business with three riders. Nothing to sign up for.</p>
          </div>
          <div id="track" className="scroll-mt-6 rounded-2xl bg-surface p-5 text-ink shadow-2xl sm:p-6">
            <h2 className="text-2xl">Track a parcel</h2>
            <p className="mt-1 mb-4 text-sm text-ink-muted">Got a code from a business? Enter it here.</p>
            <TrackForm />
          </div>
        </div>
      </section>

      <section className="container-page py-14" aria-labelledby="how">
        <p className="eyebrow">How it works</p>
        <h2 id="how" className="mt-2 text-3xl">Three people, three screens, one road</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            ["01", "The business", "Creates the delivery: who it's for, where it's going. Wo Ọ̀nà makes a tracking link to send on WhatsApp, and a secret 4-digit code for the customer."],
            ["02", "The rider", "Collects the parcel and taps “Start trip”. Their phone shares its GPS position every few seconds, only while they're carrying the parcel."],
            ["03", "The customer", "Opens the link, watches the rider move towards them with a rough arrival time, and reads their code to the rider at the door."],
          ].map(([n, title, body]) => (
            <li key={n} className="card relative p-5">
              <span className="plate absolute -top-3 left-5">{n}</span>
              <h3 className="mt-3 text-xl">{title}</h3>
              <p className="mt-2 text-ink-muted">{body}</p>
            </li>
          ))}
        </ol>
        <div className="lane my-12" aria-hidden="true" />
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <p className="eyebrow">The name</p>
            <h2 className="mt-2 text-3xl"><span lang="yo">Wo Ọ̀nà</span>: “look at the road”</h2>
            <p className="mt-3 text-ink-muted">
              In Yoruba, to <em>watch the road</em> for someone means you&apos;re waiting for them to arrive:
              <span lang="yo"> mo ń wo ọ̀nà rẹ</span>, “I&apos;m watching the road for you”. That&apos;s what your customer does
              while their parcel is on its way.
            </p>
          </div>
          <div>
            <p className="eyebrow">Private by design</p>
            <h2 className="mt-2 text-3xl">Location only while it matters</h2>
            <p className="mt-3 text-ink-muted">
              A rider&apos;s position is shared from pickup to handover, and only with that one customer and their business.
              Before and after the trip, the tracking page shows no location at all. Riders sign up with their
              business&apos;s fleet code, so every business sees only its own riders and deliveries.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
