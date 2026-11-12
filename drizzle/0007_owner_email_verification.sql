ALTER TABLE idea_previews ADD COLUMN owner_email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE idea_previews ADD COLUMN owner_email_verify_hash TEXT;
ALTER TABLE idea_previews ADD COLUMN owner_email_verify_until INTEGER;
