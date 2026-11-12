CREATE TABLE IF NOT EXISTS waitlist_signups (
  campaign_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, email)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_signups_campaign
  ON waitlist_signups (campaign_id, created_at);
