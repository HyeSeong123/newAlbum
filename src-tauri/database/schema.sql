CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  content_hash TEXT UNIQUE,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video', 'audio')),
  taken_at TEXT,
  width INTEGER,
  height INTEGER,
  duration REAL,
  size_bytes INTEGER NOT NULL,
  rating INTEGER NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  metadata_status TEXT NOT NULL DEFAULT 'queued',
  latitude REAL,
  longitude REAL,
  region_code TEXT,
  region_name TEXT,
  location_status TEXT NOT NULL DEFAULT 'queued',
  location_source TEXT NOT NULL DEFAULT 'gps',
  district TEXT,
  country TEXT,
  city TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS album (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_media_id INTEGER REFERENCES media(id),
  cover_color TEXT NOT NULL DEFAULT '#B9C58E',
  cover_concept TEXT NOT NULL DEFAULT 'mint',
  music_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS diary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  mood TEXT NOT NULL,
  weather TEXT NOT NULL,
  album_id INTEGER REFERENCES album(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_diary_date ON diary(entry_date DESC, id DESC);

CREATE TABLE IF NOT EXISTS album_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL REFERENCES album(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  display_duration REAL,
  transition_type TEXT NOT NULL DEFAULT 'fade',
  comment_visible INTEGER NOT NULL DEFAULT 1,
  UNIQUE(album_id, sequence)
);

-- Keep album covers valid before the media and its album entries are removed.
-- Written pages share album_item's sequence space; old media rows remain intact.
CREATE TABLE IF NOT EXISTS album_page (
  id TEXT PRIMARY KEY,
  album_id INTEGER NOT NULL REFERENCES album(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('CHAPTER', 'TEXT')),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  sequence INTEGER NOT NULL,
  display_duration REAL NOT NULL DEFAULT 5,
  transition_type TEXT NOT NULL DEFAULT 'fade',
  UNIQUE(album_id, sequence)
);

-- This also applies to existing databases when the schema is loaded again.
CREATE TRIGGER IF NOT EXISTS update_album_cover_before_media_delete
BEFORE DELETE ON media
FOR EACH ROW
BEGIN
  UPDATE album
  SET cover_media_id = (
    SELECT media_id
    FROM album_item
    WHERE album_id = album.id AND media_id <> OLD.id
    ORDER BY sequence
    LIMIT 1
  )
  WHERE cover_media_id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS person (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  profile_type TEXT NOT NULL DEFAULT 'person',
  cover_face_id INTEGER REFERENCES detected_face(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS face_scan (
  media_id INTEGER PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
  model_version TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detected_face (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  descriptor TEXT NOT NULL,
  thumbnail TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_detected_face_person ON detected_face(person_id);

CREATE TABLE IF NOT EXISTS excluded_face (
  face_id INTEGER PRIMARY KEY REFERENCES detected_face(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS pet_media (
  pet_id INTEGER NOT NULL REFERENCES pet(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  PRIMARY KEY (pet_id, media_id)
);
