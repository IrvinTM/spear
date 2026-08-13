CREATE TABLE IF NOT EXISTS course_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  moodle_id INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(course_id, moodle_id)
);

CREATE TABLE IF NOT EXISTS material_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT,
  expected_size INTEGER,
  local_path TEXT,
  file_size INTEGER,
  content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'downloaded', 'skipped', 'failed')),
  error_message TEXT,
  downloaded_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(material_id, source_url)
);

ALTER TABLE materials ADD COLUMN section_id INTEGER REFERENCES course_sections(id);
ALTER TABLE materials ADD COLUMN module_url TEXT;
ALTER TABLE materials ADD COLUMN description TEXT;
ALTER TABLE materials ADD COLUMN visible INTEGER DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_materials_moodle_id ON materials(moodle_id) WHERE moodle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_course_sections_course_position ON course_sections(course_id, position);
CREATE INDEX IF NOT EXISTS idx_material_files_material_status ON material_files(material_id, status);
