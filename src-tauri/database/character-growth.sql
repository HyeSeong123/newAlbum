-- A companion that grows after another one starts counting photographs at that
-- moment. Earlier travel photographs remain in the library and on the map.
CREATE TABLE IF NOT EXISTS character_growth_start (
  character_id TEXT PRIMARY KEY REFERENCES owned_character(character_id) ON DELETE CASCADE,
  last_media_id INTEGER NOT NULL CHECK(last_media_id >= 0),
  retained_photo_count INTEGER NOT NULL CHECK(retained_photo_count >= 0)
);
