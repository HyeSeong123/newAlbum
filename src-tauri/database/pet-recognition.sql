CREATE TABLE IF NOT EXISTS pet_scan (
  media_id INTEGER PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
  engine_version TEXT NOT NULL,
  source_key TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pet_detection (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL REFERENCES pet_scan(media_id) ON DELETE CASCADE,
  object_index INTEGER NOT NULL,
  features TEXT NOT NULL,
  pet_id INTEGER REFERENCES pet(id) ON DELETE SET NULL,
  excluded INTEGER NOT NULL DEFAULT 0 CHECK(excluded IN (0,1)),
  UNIQUE(media_id, object_index)
);
CREATE INDEX IF NOT EXISTS idx_pet_detection_pet ON pet_detection(pet_id, id DESC);
-- Only links created by recognition can be removed by correcting recognition.
CREATE TABLE IF NOT EXISTS pet_recognition_link (
  pet_id INTEGER NOT NULL,
  media_id INTEGER NOT NULL,
  PRIMARY KEY(pet_id, media_id),
  FOREIGN KEY(pet_id, media_id) REFERENCES pet_media(pet_id, media_id) ON DELETE CASCADE
);
