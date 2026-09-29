CREATE TABLE IF NOT EXISTS diary_photo (
  diary_id INTEGER NOT NULL REFERENCES diary(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 5),
  PRIMARY KEY (diary_id, media_id),
  UNIQUE (diary_id, position)
);
CREATE INDEX IF NOT EXISTS idx_diary_photo_media ON diary_photo(media_id);
