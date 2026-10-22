-- Manual photo links have no object detection ID. Preserve an explicit unknown
-- state without fabricating AI results or modifying other animals in the photo.
CREATE TABLE IF NOT EXISTS unidentified_pet_photo (
  media_id INTEGER PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE
);
