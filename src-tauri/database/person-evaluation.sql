CREATE TABLE IF NOT EXISTS person_evaluation_sample (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
 face_id INTEGER REFERENCES detected_face(id) ON DELETE CASCADE,
 person_id INTEGER REFERENCES person(id) ON DELETE CASCADE,
 label_key TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('reference','query')),
 capture_group TEXT NOT NULL,
 category TEXT NOT NULL,
 rights TEXT NOT NULL,
 source_key TEXT NOT NULL,
 UNIQUE(media_id,label_key)
);
