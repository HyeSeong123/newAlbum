CREATE TABLE IF NOT EXISTS person_photo (
  person_id INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  PRIMARY KEY (person_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_person_photo_media ON person_photo(media_id);
