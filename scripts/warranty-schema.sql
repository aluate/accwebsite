-- warranty_items table
-- Run in Supabase SQL Editor (or add to db-push.mjs under the other tables)
CREATE TABLE IF NOT EXISTS warranty_items (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  reported_at   TEXT NOT NULL,
  reported_by   TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'general',
  description   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  priority      TEXT NOT NULL DEFAULT 'normal',
  resolved_at   TEXT,
  resolved_by   TEXT,
  resolution    TEXT,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_warranty_items_job    ON warranty_items(job_id);
CREATE INDEX IF NOT EXISTS idx_warranty_items_status ON warranty_items(status);
