use rusqlite::{Connection, TransactionBehavior};
use std::time::Duration;

// Versions before this migration used user_version = 0 (including existing installs).
// Future schema changes must increment this and add an ordered migration here.
const VERSION: i64 = 3;

fn version(conn: &Connection) -> Result<i64, String> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| error.to_string())
}

fn check_version(version: i64) -> Result<(), String> {
    if version > VERSION {
        return Err("더 최신 버전에서 만든 DB입니다. 그루터기를 업데이트해 주세요.".into());
    }
    Ok(())
}

pub fn initialize(conn: &mut Connection) -> Result<(), String> {
    conn.busy_timeout(Duration::from_secs(5)).map_err(|error| error.to_string())?;
    conn.pragma_update(None, "foreign_keys", true).map_err(|error| error.to_string())?;
    let current = version(conn)?;
    check_version(current)?;
    if current == VERSION { return Ok(()); }

    // Acquire the writer lock before checking again: concurrent startup commands
    // must not both migrate. DDL, data normalization and the version commit together.
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let current = version(&tx)?;
    check_version(current)?;
    if current < 1 {
        tx.execute_batch(include_str!("../database/schema.sql"))
            .map_err(|error| format!("DB 스키마를 적용할 수 없습니다: {error}"))?;
        super::migrate_database(&tx)?;
        tx.execute_batch(include_str!("../database/performance-indexes.sql"))
            .map_err(|error| format!("DB 인덱스를 적용할 수 없습니다: {error}"))?;
    }
    if current < 2 { super::location::migrate(&tx)?; }
    if current < 3 {
        super::location::migrate(&tx)?;
        tx.execute_batch("CREATE TABLE IF NOT EXISTS diary (
          id INTEGER PRIMARY KEY AUTOINCREMENT, entry_date TEXT NOT NULL,
          title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', mood TEXT NOT NULL,
          weather TEXT NOT NULL, album_id INTEGER REFERENCES album(id) ON DELETE SET NULL
        ); CREATE INDEX IF NOT EXISTS idx_diary_date ON diary(entry_date DESC, id DESC);")
            .map_err(|error| format!("일기 저장소를 만들 수 없습니다: {error}"))?;
    }
    tx.pragma_update(None, "user_version", VERSION).map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())
}

pub fn delete_media(conn: &mut Connection, ids: &[i64]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    {
        let mut statement = tx.prepare("DELETE FROM media WHERE id = ?1").map_err(|error| error.to_string())?;
        for id in ids {
            statement.execute([id]).map_err(|error| format!("선택한 항목을 삭제할 수 없습니다: {error}"))?;
        }
    }
    tx.commit().map_err(|error| error.to_string())
}

#[cfg(test)]
#[path = "database_tests.rs"]
mod tests;
