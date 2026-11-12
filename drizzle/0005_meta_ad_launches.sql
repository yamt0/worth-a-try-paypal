CREATE TABLE meta_ad_launches (
  launch_key TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT '{}',
  pending TEXT,
  error_code TEXT,
  lock_owner TEXT,
  lock_until INTEGER,
  updated_at INTEGER NOT NULL
);
