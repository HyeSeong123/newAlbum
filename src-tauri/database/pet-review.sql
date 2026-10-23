-- Explicit candidate rejections are object-specific, never global species rules.
CREATE TABLE IF NOT EXISTS pet_candidate_rejection (
  detection_id INTEGER NOT NULL REFERENCES pet_detection(id) ON DELETE CASCADE,
  pet_id INTEGER NOT NULL REFERENCES pet(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(detection_id,pet_id)
);
