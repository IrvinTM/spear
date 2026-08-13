CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK(level IN ('info', 'warning', 'error')),
  message TEXT NOT NULL,
  method TEXT,
  url TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_category_created_at ON request_logs(category, created_at DESC);
