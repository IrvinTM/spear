CREATE TABLE IF NOT EXISTS sync_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_log_id INTEGER REFERENCES sync_log(id),
  diff_json TEXT NOT NULL,            -- JSON: { newMaterials, newAssignments, newTodos, updatedMaterials, filesDownloaded }
  summary_text TEXT,                  -- AI-generated summary (null until generated)
  audio_cache_path TEXT,              -- Path to cached audio file (null until generated)
  audio_content_type TEXT,            -- 'audio/wav' or 'audio/mpeg'
  is_read INTEGER NOT NULL DEFAULT 0, -- Whether user has dismissed/read the briefing
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_snapshots_created ON sync_snapshots(created_at DESC);
