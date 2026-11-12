CREATE TABLE paypal_founder_orders (
  id TEXT PRIMARY KEY,
  preview_id TEXT NOT NULL REFERENCES idea_previews(id),
  budget INTEGER NOT NULL,
  fee INTEGER NOT NULL,
  locale TEXT NOT NULL,
  order_id TEXT UNIQUE,
  approval_url TEXT,
  capture_id TEXT UNIQUE,
  UNIQUE (preview_id, budget)
);
