CREATE TABLE price_experiments (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  prices TEXT NOT NULL
);
CREATE TABLE price_visitors (
  experiment_id TEXT NOT NULL REFERENCES price_experiments(id),
  visitor_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  interested INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (experiment_id, visitor_id)
);
CREATE INDEX price_visitors_totals ON price_visitors (experiment_id, price);
