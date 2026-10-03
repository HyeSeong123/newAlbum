-- Rebuild all related tables with foreign keys enabled, preserving existing data.
CREATE TABLE owned_character_v10 (
  character_id TEXT PRIMARY KEY, custom_name TEXT,
  growth_stage INTEGER NOT NULL CHECK(growth_stage BETWEEN 1 AND 6),
  affection INTEGER NOT NULL DEFAULT 0 CHECK(affection >= 0),
  is_main INTEGER NOT NULL DEFAULT 0 CHECK(is_main IN (0,1)),
  last_click_day TEXT, unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO owned_character_v10
SELECT character_id,custom_name,CASE growth_stage WHEN 2 THEN 3 WHEN 3 THEN 4 WHEN 4 THEN 6 ELSE growth_stage END,
  affection,is_main,last_click_day,unlocked_at,created_at,updated_at FROM owned_character;
CREATE TABLE character_event_v10 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id TEXT NOT NULL REFERENCES owned_character_v10(character_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('unlock','grow')), stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 6),
  UNIQUE(character_id,kind,stage)
);
INSERT INTO character_event_v10 SELECT id,character_id,kind,
  CASE stage WHEN 2 THEN 3 WHEN 3 THEN 4 WHEN 4 THEN 6 ELSE stage END FROM character_event;
CREATE TABLE character_photo_credit_v10 (
  photo_key TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES owned_character_v10(character_id) ON DELETE CASCADE
);
INSERT INTO character_photo_credit_v10 SELECT * FROM character_photo_credit;
CREATE TABLE character_growth_start_v10 (
  character_id TEXT PRIMARY KEY REFERENCES owned_character_v10(character_id) ON DELETE CASCADE,
  last_media_id INTEGER NOT NULL CHECK(last_media_id >= 0), retained_photo_count INTEGER NOT NULL CHECK(retained_photo_count >= 0)
);
INSERT INTO character_growth_start_v10 SELECT * FROM character_growth_start;
DROP TABLE character_event;
DROP TABLE character_photo_credit;
DROP TABLE character_growth_start;
DROP TABLE owned_character;
ALTER TABLE owned_character_v10 RENAME TO owned_character;
ALTER TABLE character_event_v10 RENAME TO character_event;
ALTER TABLE character_photo_credit_v10 RENAME TO character_photo_credit;
ALTER TABLE character_growth_start_v10 RENAME TO character_growth_start;
CREATE UNIQUE INDEX idx_character_one_main ON owned_character(is_main) WHERE is_main=1;
