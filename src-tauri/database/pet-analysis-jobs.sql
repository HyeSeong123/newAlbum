CREATE TABLE IF NOT EXISTS pet_analysis_job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  pet_id INTEGER REFERENCES pet(id) ON DELETE CASCADE,
  view TEXT NOT NULL DEFAULT 'unknown' CHECK(view IN ('unknown','front','left','right','rear')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','paused','failed')),
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_job_owner ON pet_analysis_job(media_id, COALESCE(pet_id,0));
CREATE INDEX IF NOT EXISTS idx_pet_job_state ON pet_analysis_job(state,id);
CREATE TABLE IF NOT EXISTS pet_evaluation_sample (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  detection_id INTEGER REFERENCES pet_detection(id) ON DELETE SET NULL,
  pet_id INTEGER REFERENCES pet(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('reference','query')),
  capture_group TEXT NOT NULL,
  source_key TEXT NOT NULL,
  view TEXT NOT NULL,
  kind TEXT NOT NULL,
  features TEXT,
  rights TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
