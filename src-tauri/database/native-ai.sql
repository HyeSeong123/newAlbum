-- Additive v18: never rewrites legacy detections, identities or confirmations.
CREATE TABLE IF NOT EXISTS native_ai_model (
 model_key TEXT PRIMARY KEY CHECK(length(model_key) BETWEEN 1 AND 200),
 task TEXT NOT NULL CHECK(task IN ('person','pet')),
 kind TEXT NOT NULL CHECK(kind IN ('identity','color-shape')),
 dimensions INTEGER NOT NULL CHECK(dimensions BETWEEN 1 AND 4096),
 weights_sha256 TEXT NOT NULL CHECK(length(weights_sha256)=64 AND weights_sha256 NOT GLOB '*[^0-9a-f]*'),
 preprocess TEXT NOT NULL CHECK(length(preprocess) BETWEEN 1 AND 200),
 state TEXT NOT NULL CHECK(state IN ('untrained','synthetic','trained-reviewed')),
 provenance_json TEXT NOT NULL,
 CHECK(task<>'person' OR (dimensions=512 AND kind='identity')),
 UNIQUE(model_key,task,kind,dimensions)
);
-- No models are registered by this migration. Synthetic probes cannot enter this store.
CREATE TRIGGER IF NOT EXISTS native_ai_model_immutable BEFORE UPDATE ON native_ai_model
BEGIN SELECT RAISE(ABORT,'create a new model key for a different feature space'); END;
CREATE TABLE IF NOT EXISTS native_ai_feature (
 media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
 region_key TEXT NOT NULL CHECK(length(region_key) BETWEEN 1 AND 200),
 model_key TEXT NOT NULL,
 task TEXT NOT NULL,
 kind TEXT NOT NULL,
 dimensions INTEGER NOT NULL,
 source_key TEXT NOT NULL CHECK(length(source_key)>0),
 view TEXT NOT NULL CHECK(view IN ('front','left','right','rear','unknown')),
 descriptor TEXT NOT NULL,
 face_id INTEGER REFERENCES detected_face(id) ON DELETE CASCADE,
 pet_detection_id INTEGER REFERENCES pet_detection(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(task<>'person' OR (pet_detection_id IS NULL AND view<>'rear')),
 CHECK(task<>'pet' OR face_id IS NULL),
 CHECK(view<>'rear' OR (task='pet' AND kind='color-shape')),
 FOREIGN KEY(model_key,task,kind,dimensions) REFERENCES native_ai_model(model_key,task,kind,dimensions),
 PRIMARY KEY(media_id,region_key,model_key,source_key)
);
CREATE INDEX IF NOT EXISTS idx_native_ai_feature_model ON native_ai_feature(model_key,media_id,source_key);
CREATE TRIGGER IF NOT EXISTS native_ai_feature_ready BEFORE INSERT ON native_ai_feature
WHEN NOT EXISTS(SELECT 1 FROM native_ai_model WHERE model_key=NEW.model_key AND state='trained-reviewed')
BEGIN SELECT RAISE(ABORT,'model is not independently reviewed'); END;
