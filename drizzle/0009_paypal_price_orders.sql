CREATE TABLE paypal_price_orders (
  experiment_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  order_id TEXT UNIQUE,
  approval_url TEXT,
  capture_id TEXT UNIQUE,
  PRIMARY KEY (experiment_id, visitor_id),
  FOREIGN KEY (experiment_id, visitor_id) REFERENCES price_visitors(experiment_id, visitor_id)
);
