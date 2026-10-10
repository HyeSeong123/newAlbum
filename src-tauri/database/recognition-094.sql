-- Additive only. Legacy embeddings, identities and confirmed links stay intact.
CREATE TABLE IF NOT EXISTS person_face_pose (
 face_id INTEGER PRIMARY KEY REFERENCES detected_face(id) ON DELETE CASCADE,
 automatic TEXT NOT NULL,
 manual_view TEXT CHECK(manual_view IN ('front','left','right','unknown')),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS person_model_feature (
 face_id INTEGER NOT NULL REFERENCES detected_face(id) ON DELETE CASCADE,
 model_version TEXT NOT NULL,
 dimensions INTEGER NOT NULL CHECK(dimensions=512),
 descriptor TEXT NOT NULL,
 source_key TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(face_id,model_version)
);
CREATE TABLE IF NOT EXISTS pet_direction_observation (
 detection_id INTEGER PRIMARY KEY REFERENCES pet_detection(id) ON DELETE CASCADE,
 automatic_view TEXT CHECK(automatic_view IN ('front','left','right','rear','unknown')),
 automatic_source TEXT NOT NULL,
 manual_view TEXT CHECK(manual_view IN ('front','left','right','rear','unknown'))
);
-- Historical user corrections cannot recover an overwritten automatic result.
INSERT OR IGNORE INTO pet_direction_observation(detection_id,automatic_view,automatic_source,manual_view)
 SELECT id,CASE WHEN json_extract(features,'$.viewSource')='user' THEN NULL ELSE json_extract(features,'$.view') END,
 COALESCE(json_extract(features,'$.viewSource'),'unknown'),
 CASE WHEN json_extract(features,'$.viewSource')='user' THEN json_extract(features,'$.view') ELSE NULL END FROM pet_detection;
