CREATE TABLE preview_limits (day TEXT NOT NULL, identity TEXT NOT NULL, uses INTEGER NOT NULL, PRIMARY KEY(day, identity));
CREATE TABLE idea_previews (id TEXT PRIMARY KEY, idea TEXT NOT NULL, content TEXT NOT NULL, image TEXT NOT NULL, created_at TEXT NOT NULL);
