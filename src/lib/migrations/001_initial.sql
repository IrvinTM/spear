CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  moodle_id INTEGER UNIQUE NOT NULL,
  shortname TEXT NOT NULL,
  fullname TEXT NOT NULL,
  category TEXT,
  visible INTEGER DEFAULT 1,
  summary TEXT,
  last_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  moodle_id INTEGER UNIQUE NOT NULL,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  name TEXT NOT NULL,
  intro TEXT,
  due_date TEXT,
  allow_submissions_from TEXT,
  grade_max REAL,
  submission_status TEXT,
  grade_status TEXT,
  content_hash TEXT,
  last_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  moodle_id INTEGER,
  section_name TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  url TEXT,
  local_path TEXT,
  file_size INTEGER,
  content_hash TEXT,
  last_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE NOT NULL,
  from_address TEXT NOT NULL,
  from_name TEXT,
  subject TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,
  received_at TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  summary TEXT,
  has_deadline_mention INTEGER DEFAULT 0,
  last_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL CHECK(source_type IN ('assignment', 'email', 'manual')),
  source_id INTEGER,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'done')),
  priority INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER REFERENCES todos(id),
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
  context_pack TEXT,
  outline TEXT,
  draft TEXT,
  error_message TEXT,
  model_used TEXT,
  duration_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_type TEXT NOT NULL CHECK(sync_type IN ('moodle', 'email')),
  status TEXT NOT NULL CHECK(status IN ('success', 'partial', 'failed')),
  items_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON assignments(due_date);
CREATE INDEX IF NOT EXISTS idx_todos_status_due_date ON todos(status, due_date);
CREATE INDEX IF NOT EXISTS idx_todos_source ON todos(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);
CREATE INDEX IF NOT EXISTS idx_sync_log_type_started ON sync_log(sync_type, started_at);
