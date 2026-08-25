CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  expiration_time INTEGER,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  rooms_json TEXT NOT NULL,
  states_json TEXT NOT NULL DEFAULT '{}',
  player_url TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS push_subscriptions_updated_at
  ON push_subscriptions(updated_at DESC);
