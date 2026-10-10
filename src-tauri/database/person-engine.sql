CREATE TABLE IF NOT EXISTS person_face_metadata (
 face_id INTEGER PRIMARY KEY REFERENCES detected_face(id) ON DELETE CASCADE,
 model_version TEXT NOT NULL,
 reference_kind TEXT NOT NULL CHECK(reference_kind IN ('seed','auto')),
 quality TEXT NOT NULL DEFAULT 'review' CHECK(quality IN ('usable','review')),
 geometry TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS person_scan_metadata (
 media_id INTEGER PRIMARY KEY REFERENCES face_scan(media_id) ON DELETE CASCADE,
 source_key TEXT NOT NULL,
 engine_version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS person_analysis_job (
 media_id INTEGER PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','paused','failed')),
 error TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Freeze legacy seed faces without changing IDs, descriptors or user assignments.
INSERT OR IGNORE INTO person_face_metadata(face_id,model_version,reference_kind)
 SELECT f.id,s.model_version,CASE WHEN f.id=(SELECT MIN(id) FROM detected_face WHERE person_id=f.person_id) THEN 'seed' ELSE 'auto' END
 FROM detected_face f JOIN face_scan s ON s.media_id=f.media_id;
