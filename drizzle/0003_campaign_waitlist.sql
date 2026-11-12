ALTER TABLE idea_previews ADD COLUMN owner_hash TEXT;
ALTER TABLE idea_previews ADD COLUMN page_views INTEGER NOT NULL DEFAULT 0;
CREATE TABLE preview_signups (
  preview_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (preview_id, email)
);
