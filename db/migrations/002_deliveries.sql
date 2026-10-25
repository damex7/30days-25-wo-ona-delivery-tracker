-- 002: businesses, riders, deliveries, the GPS trail and the status history.
--
-- ON DELETE policy (one rule for the whole schema):
-- Real accounts are never deleted; an admin suspends them instead. The only
-- rows ever deleted are demo users older than 24 hours, so foreign keys that
-- point at a business CASCADE: one "DELETE FROM users WHERE is_demo" removes a
-- demo visitor's whole world (riders, deliveries, trail points) in one go.

-- ── Businesses ───────────────────────────────────────────────────────────────
-- One row per business account (a 1-to-1 extension of users).
CREATE TABLE businesses (
  user_id         uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  phone           text NOT NULL CHECK (phone ~ '^\+234[789][01]\d{8}$'),
  state           text NOT NULL,
  city            text NOT NULL CHECK (length(trim(city)) BETWEEN 2 AND 60),
  -- Riders type this code when they sign up, which attaches them to this fleet.
  -- Unambiguous characters only (no 0/O, 1/I/L) so it's easy to read out loud.
  fleet_code      text NOT NULL UNIQUE CHECK (fleet_code ~ '^[A-HJ-KM-NP-Z2-9]{6}$'),
  -- The usual pickup point (the shop or office), pre-filled on new deliveries.
  pickup_address  text CHECK (length(pickup_address) <= 200),
  pickup_lat      double precision CHECK (pickup_lat BETWEEN -90 AND 90),
  pickup_lng      double precision CHECK (pickup_lng BETWEEN -180 AND 180),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((pickup_lat IS NULL) = (pickup_lng IS NULL))
);
CREATE TRIGGER businesses_touch BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── Riders ───────────────────────────────────────────────────────────────────
-- A rider belongs to exactly one business (their fleet).
CREATE TABLE riders (
  user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  business_id  uuid NOT NULL REFERENCES businesses (user_id) ON DELETE CASCADE,
  phone        text NOT NULL CHECK (phone ~ '^\+234[789][01]\d{8}$'),
  vehicle      text NOT NULL CHECK (vehicle IN ('motorbike', 'car', 'van', 'bicycle', 'tricycle')),
  plate        text CHECK (plate ~ '^[A-Z0-9-]{5,12}$'),
  on_duty      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Lets deliveries point at (rider, business) as a pair: see the composite
  -- foreign key on deliveries below.
  UNIQUE (user_id, business_id)
);
CREATE INDEX riders_business_idx ON riders (business_id);

-- ── Deliveries ───────────────────────────────────────────────────────────────
CREATE TABLE deliveries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        uuid NOT NULL REFERENCES businesses (user_id) ON DELETE CASCADE,
  rider_id           uuid,
  -- The customer's key to /track/<code>. 8 characters from a 31-letter
  -- alphabet is about 850 billion possibilities, and look-ups are rate limited,
  -- so guessing someone else's code isn't practical.
  tracking_code      text NOT NULL UNIQUE CHECK (tracking_code ~ '^[A-HJ-KM-NP-Z2-9]{8}$'),
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN (
                       'pending',    -- waiting for a rider
                       'assigned',   -- a rider has it, not collected yet
                       'picked_up',  -- collected; the rider is on the way (live tracking on)
                       'arrived',    -- the rider is at the drop-off (live tracking on)
                       'delivered',  -- handed over, confirmed with the customer's code
                       'failed',     -- couldn't be delivered (reason recorded)
                       'cancelled')),-- called off before pickup
  customer_name      text NOT NULL CHECK (length(trim(customer_name)) BETWEEN 2 AND 80),
  customer_phone     text NOT NULL CHECK (customer_phone ~ '^\+234[789][01]\d{8}$'),
  package            text NOT NULL CHECK (length(trim(package)) BETWEEN 2 AND 120),
  notes              text NOT NULL DEFAULT '' CHECK (length(notes) <= 300),
  fee_kobo           bigint CHECK (fee_kobo >= 0),
  pickup_address     text NOT NULL CHECK (length(trim(pickup_address)) BETWEEN 3 AND 200),
  pickup_lat         double precision NOT NULL CHECK (pickup_lat BETWEEN -90 AND 90),
  pickup_lng         double precision NOT NULL CHECK (pickup_lng BETWEEN -180 AND 180),
  dropoff_address    text NOT NULL CHECK (length(trim(dropoff_address)) BETWEEN 3 AND 200),
  dropoff_lat        double precision NOT NULL CHECK (dropoff_lat BETWEEN -90 AND 90),
  dropoff_lng        double precision NOT NULL CHECK (dropoff_lng BETWEEN -180 AND 180),
  -- The 4-digit code the customer reads to the rider at the door. The customer
  -- sees it on their tracking page; the rider never does.
  otp                text NOT NULL CHECK (otp ~ '^\d{4}$'),
  otp_attempts       integer NOT NULL DEFAULT 0 CHECK (otp_attempts BETWEEN 0 AND 5),
  proof_photo_url    text CHECK (proof_photo_url ~ '^https://'),
  reason             text CHECK (length(reason) <= 300), -- why it failed or was cancelled
  -- The newest GPS fix, copied here so the tracking page reads one row instead
  -- of scanning the trail. The full trail lives in delivery_points.
  last_lat           double precision,
  last_lng           double precision,
  last_accuracy_m    real,
  last_heading       real,
  last_speed_mps     real,
  last_point_at      timestamptz,
  simulated          boolean NOT NULL DEFAULT false, -- shown honestly on the tracking page
  route              jsonb, -- cached road route for simulated trips: [[lat, lng], ...]
  created_at         timestamptz NOT NULL DEFAULT now(),
  assigned_at        timestamptz,
  picked_up_at       timestamptz,
  arrived_at         timestamptz,
  finished_at        timestamptz, -- delivered, failed or cancelled
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- THE fleet rule, enforced by the database itself: the rider must be a rider
  -- of THIS delivery's business. Even a buggy query can't hand a delivery to
  -- another company's rider. (Riders are never deleted except in demo
  -- cleanup, when their whole demo world goes too, so this cascades.)
  FOREIGN KEY (rider_id, business_id) REFERENCES riders (user_id, business_id)
    ON DELETE CASCADE,

  -- A delivery that's with a rider must say which rider.
  CHECK (status NOT IN ('assigned', 'picked_up', 'arrived', 'delivered') OR rider_id IS NOT NULL),
  CHECK ((status IN ('delivered', 'failed', 'cancelled')) = (finished_at IS NOT NULL)),
  CHECK (status <> 'delivered' OR picked_up_at IS NOT NULL)
);

-- One live trip per rider at a time. Two "start trip" taps racing each other
-- can't both win: the second insert of the same rider_id into this index fails.
CREATE UNIQUE INDEX deliveries_one_live_trip_per_rider
  ON deliveries (rider_id) WHERE status IN ('picked_up', 'arrived');

CREATE INDEX deliveries_business_created_idx ON deliveries (business_id, created_at DESC);
CREATE INDEX deliveries_rider_status_idx ON deliveries (rider_id, status) WHERE rider_id IS NOT NULL;
-- The rider's "open jobs" list: pending deliveries of one fleet.
CREATE INDEX deliveries_pending_idx ON deliveries (business_id, created_at) WHERE status = 'pending';
CREATE TRIGGER deliveries_touch BEFORE UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── The GPS trail ────────────────────────────────────────────────────────────
-- Append-only. bigserial ids give the tracking page a cheap cursor:
-- "send me every point after id 4182".
CREATE TABLE delivery_points (
  id            bigserial PRIMARY KEY,
  delivery_id   uuid NOT NULL REFERENCES deliveries (id) ON DELETE CASCADE,
  lat           double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng           double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy_m    real CHECK (accuracy_m >= 0),
  heading       real CHECK (heading >= 0 AND heading < 360),
  speed_mps     real CHECK (speed_mps >= 0),
  recorded_at   timestamptz NOT NULL, -- when the phone took the fix
  received_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_points_delivery_idx ON delivery_points (delivery_id, id);

-- ── Status history ───────────────────────────────────────────────────────────
-- Every change of status, who made it and when. Powers the timeline.
CREATE TABLE delivery_events (
  id           bigserial PRIMARY KEY,
  delivery_id  uuid NOT NULL REFERENCES deliveries (id) ON DELETE CASCADE,
  status       text NOT NULL,
  note         text NOT NULL DEFAULT '',
  actor_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_events_delivery_idx ON delivery_events (delivery_id, id);

-- ── Admin audit log ──────────────────────────────────────────────────────────
CREATE TABLE admin_actions (
  id              bigserial PRIMARY KEY,
  admin_id        uuid REFERENCES users (id) ON DELETE SET NULL,
  action          text NOT NULL CHECK (action IN ('suspend', 'unsuspend')),
  target_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  note            text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);
