//! Private provenance for app-owned Android snapshots. A missing gallery
//! original never authorizes deleting its saved copy or associated records.
use rusqlite::{params, Connection};
use serde::Serialize;

pub fn initialize(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS android_media_sources (
        file_path TEXT PRIMARY KEY NOT NULL, source_uri TEXT NOT NULL
    );").map_err(|error| error.to_string())
}

pub fn remember(conn: &Connection, path: &str, uri: &str) -> Result<(), String> {
    conn.execute("INSERT INTO android_media_sources(file_path, source_uri) VALUES (?1, ?2)
        ON CONFLICT(file_path) DO UPDATE SET source_uri=excluded.source_uri", params![path, uri])
        .map(|_| ()).map_err(|error| error.to_string())
}

pub fn registered(conn: &Connection) -> Result<Vec<(String, Option<String>)>, String> {
    let mut statement = conn.prepare("SELECT m.file_path, s.source_uri FROM media m
        LEFT JOIN android_media_sources s ON s.file_path=m.file_path
        WHERE m.file_type IN ('image', 'video') ORDER BY m.id").map_err(|error| error.to_string())?;
    let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Comparison {
    pub checked: usize,
    pub present: usize,
    pub missing: usize,
    pub unavailable: usize,
    pub untracked: usize,
    pub missing_copies: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn provenance_survives_restart_and_does_not_restore_deleted_records() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE media(id INTEGER PRIMARY KEY, file_path TEXT, file_type TEXT);
            INSERT INTO media VALUES(1, '/copy/a.jpg', 'image'), (2, '/copy/b.jpg', 'image');").unwrap();
        initialize(&conn).unwrap();
        remember(&conn, "/copy/a.jpg", "content://media/external/images/media/1").unwrap();
        initialize(&conn).unwrap();
        assert_eq!(registered(&conn).unwrap()[0].1.as_deref(), Some("content://media/external/images/media/1"));
        assert_eq!(registered(&conn).unwrap()[1].1, None);
        conn.execute("DELETE FROM media WHERE id=1", []).unwrap();
        assert_eq!(registered(&conn).unwrap(), vec![("/copy/b.jpg".into(), None)]);
    }
}
