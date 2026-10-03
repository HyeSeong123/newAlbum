-- Owned companions survive deletion of the photographs that discovered them.
CREATE TABLE IF NOT EXISTS owned_character (
  character_id TEXT PRIMARY KEY,
  custom_name TEXT,
  growth_stage INTEGER NOT NULL CHECK(growth_stage BETWEEN 1 AND 6),
  affection INTEGER NOT NULL DEFAULT 0 CHECK(affection >= 0),
  is_main INTEGER NOT NULL DEFAULT 0 CHECK(is_main IN (0,1)),
  last_click_day TEXT,
  unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_character_one_main ON owned_character(is_main) WHERE is_main=1;

-- Only a content identity is retained, never another copy of the photo or its metadata.
-- Keeping credits after deletion prevents remove/reimport from awarding affection again.
CREATE TABLE IF NOT EXISTS character_photo_credit (
  photo_key TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES owned_character(character_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS character_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id TEXT NOT NULL REFERENCES owned_character(character_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('unlock','grow')),
  stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 6),
  UNIQUE(character_id,kind,stage)
);
CREATE INDEX IF NOT EXISTS idx_media_character_region ON media(gps_region_code) WHERE file_type='image' AND gps_region_code IS NOT NULL;
