CREATE TABLE IF NOT EXISTS person_scan_issue (
 media_id INTEGER PRIMARY KEY REFERENCES face_scan(media_id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('source_changed','model_changed','unavailable')),
 checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
