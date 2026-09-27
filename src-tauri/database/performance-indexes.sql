-- Apply only after legacy columns have been migrated; never on every connection.
CREATE INDEX IF NOT EXISTS idx_media_chronology ON media(taken_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_pending_dimensions ON media(id)
  WHERE file_type = 'image' AND (width IS NULL OR height IS NULL OR width <= 0 OR height <= 0);

-- Reverse foreign-key lookups used by cascading deletions and cover repair.
-- Existing compound primary keys already cover lookups from their first column.
CREATE INDEX IF NOT EXISTS idx_album_item_media ON album_item(media_id);
CREATE INDEX IF NOT EXISTS idx_album_cover_media ON album(cover_media_id);
CREATE INDEX IF NOT EXISTS idx_detected_face_media ON detected_face(media_id);
CREATE INDEX IF NOT EXISTS idx_person_cover_face ON person(cover_face_id);
CREATE INDEX IF NOT EXISTS idx_pet_media_media ON pet_media(media_id);
CREATE INDEX IF NOT EXISTS idx_pet_cover_media ON pet(cover_media_id);
CREATE INDEX IF NOT EXISTS idx_media_tag_tag ON media_tag(tag_id);
CREATE INDEX IF NOT EXISTS idx_media_person_person ON media_person(person_id);
