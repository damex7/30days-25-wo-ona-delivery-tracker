-- 001: accounts, sessions and rate limiting.
-- Same shape as the Day 17 auth system, with a fixed role chosen at sign-up.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive email column

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- citext so "Ada@Mail.com" and "ada@mail.com" are the same account.
  email         citext NOT NULL UNIQUE,
  name          text   NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  password_hash text,  -- null for demo users, who never log in with a password
  -- One role per account keeps every permission rule a simple comparison.
  -- business = the company sending parcels, rider = the person carrying them.
  role          text   NOT NULL CHECK (role IN ('business', 'rider', 'admin')),
  is_demo       boolean NOT NULL DEFAULT false,
  suspended_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Demo cleanup scans only demo rows, so a partial index keeps it cheap.
CREATE INDEX users_demo_created_idx ON users (created_at) WHERE is_demo;

CREATE TABLE sessions (
  -- We store a SHA-256 of the cookie token, never the token itself, so a
  -- leaked database dump can't be used to log in as anyone.
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Fixed-window rate limiting for login, sign-up, tracking look-ups and GPS pings.
CREATE TABLE rate_limits (
  key           text PRIMARY KEY,
  window_start  timestamptz NOT NULL,
  hits          integer NOT NULL
);

-- Keeps updated_at honest without every UPDATE having to remember it.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
