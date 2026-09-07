CREATE TABLE IF NOT EXISTS attention_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  course_name TEXT NOT NULL,
  course_code TEXT,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('exam', 'assignment', 'project', 'quiz', 'workshop', 'other')),
  start_date TEXT,
  due_date TEXT,
  date_label TEXT NOT NULL,
  week_number INTEGER,
  weight TEXT,
  description TEXT,
  source_document TEXT,
  priority INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK(status IN ('upcoming', 'in_progress', 'completed', 'dismissed')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(course_id, title, date_label)
);

CREATE INDEX IF NOT EXISTS idx_attention_events_due_date ON attention_events(due_date);
CREATE INDEX IF NOT EXISTS idx_attention_events_course_id ON attention_events(course_id);
CREATE INDEX IF NOT EXISTS idx_attention_events_status ON attention_events(status);
