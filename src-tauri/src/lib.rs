use rusqlite::{params, Connection};
use serde::Serialize;
use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

#[derive(Serialize)]
struct MediaItemDto {
    id: i64,
    file_path: String,
    file_type: String,
    taken_at: Option<String>,
    width: Option<i64>,
    height: Option<i64>,
    duration: Option<f64>,
    size_bytes: i64,
    rating: i64,
    comment: String,
    favorite: bool,
    metadata_status: String,
}

#[tauri::command]
fn list_media(app: AppHandle) -> Result<Vec<MediaItemDto>, String> {
    let conn = open_database(&app)?;
    read_media(&conn)
}

#[tauri::command]
fn clear_registered_media(app: AppHandle) -> Result<Vec<MediaItemDto>, String> {
    let conn = open_database(&app)?;
    conn.execute("DELETE FROM media", [])
        .map_err(|error| format!("등록 목록을 비울 수 없습니다: {error}"))?;
    read_media(&conn)
}

#[tauri::command]
fn delete_registered_media(app: AppHandle, ids: Vec<i64>) -> Result<Vec<MediaItemDto>, String> {
    let conn = open_database(&app)?;

    for id in ids {
        conn.execute("DELETE FROM media WHERE id = ?1", params![id])
            .map_err(|error| format!("선택한 항목을 삭제할 수 없습니다: {error}"))?;
    }

    read_media(&conn)
}

#[tauri::command]
fn create_album_from_media(app: AppHandle, title: String, media_ids: Vec<i64>) -> Result<i64, String> {
    if media_ids.is_empty() {
        return Err("앨범에 담을 항목을 선택해 주세요.".to_string());
    }

    let title = title.trim();
    if title.is_empty() {
        return Err("앨범 이름을 입력해 주세요.".to_string());
    }

    let conn = open_database(&app)?;
    conn.execute(
        "INSERT INTO album (title, description, cover_media_id) VALUES (?1, '', ?2)",
        params![title, media_ids[0]],
    )
    .map_err(|error| format!("앨범을 만들 수 없습니다: {error}"))?;

    let album_id = conn.last_insert_rowid();
    for (index, media_id) in media_ids.iter().enumerate() {
        conn.execute(
            "INSERT INTO album_item (album_id, media_id, sequence) VALUES (?1, ?2, ?3)",
            params![album_id, media_id, index as i64],
        )
        .map_err(|error| format!("앨범 항목을 추가할 수 없습니다: {error}"))?;
    }

    Ok(album_id)
}

#[tauri::command]
fn register_paths(app: AppHandle, paths: Vec<String>) -> Result<Vec<MediaItemDto>, String> {
    let conn = open_database(&app)?;
    let files = collect_supported_files(paths)?;

    for file in files {
        register_file(&conn, &file)?;
    }

    read_media(&conn)
}

#[tauri::command]
fn update_media_details(
    app: AppHandle,
    id: i64,
    rating: i64,
    comment: String,
    favorite: bool,
) -> Result<(), String> {
    let conn = open_database(&app)?;
    conn.execute(
        "UPDATE media SET rating = ?1, comment = ?2, favorite = ?3 WHERE id = ?4",
        params![rating.clamp(0, 5), comment, if favorite { 1 } else { 0 }, id],
    )
    .map_err(|error| format!("미디어 정보를 저장할 수 없습니다: {error}"))?;
    Ok(())
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("앱 데이터 폴더를 찾을 수 없습니다: {error}"))?;
    fs::create_dir_all(&app_dir)
        .map_err(|error| format!("앱 데이터 폴더를 만들 수 없습니다: {error}"))?;

    let db_path = app_dir.join("album.sqlite");
    let conn = Connection::open(db_path).map_err(|error| format!("DB를 열 수 없습니다: {error}"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("DB 설정을 적용할 수 없습니다: {error}"))?;
    conn.execute_batch(include_str!("../database/schema.sql"))
        .map_err(|error| format!("DB 스키마를 적용할 수 없습니다: {error}"))?;
    migrate_database(&conn)?;
    Ok(conn)
}

fn migrate_database(conn: &Connection) -> Result<(), String> {
    match conn.execute("ALTER TABLE media ADD COLUMN content_hash TEXT", []) {
        Ok(_) => {}
        Err(error) if error.to_string().contains("duplicate column name") => {}
        Err(error) => return Err(format!("DB 마이그레이션을 적용할 수 없습니다: {error}")),
    }

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_media_content_hash
         ON media(content_hash)
         WHERE content_hash IS NOT NULL",
        [],
    )
    .map_err(|error| format!("중복 방지 인덱스를 만들 수 없습니다: {error}"))?;

    normalize_existing_file_paths(conn)?;

    Ok(())
}

fn normalize_existing_file_paths(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT id, file_path FROM media")
        .map_err(|error| format!("경로 정리 목록을 준비할 수 없습니다: {error}"))?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
        .map_err(|error| format!("경로 정리 목록을 읽을 수 없습니다: {error}"))?;

    let paths = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("경로 정리 목록을 변환할 수 없습니다: {error}"))?;

    for (id, file_path) in paths {
        let normalized = normalize_file_path_string(&file_path);
        if normalized != file_path {
            conn.execute(
                "UPDATE media SET file_path = ?1 WHERE id = ?2",
                params![normalized, id],
            )
            .map_err(|error| format!("저장된 파일 경로를 정리할 수 없습니다: {error}"))?;
        }
    }

    Ok(())
}

fn collect_supported_files(paths: Vec<String>) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();

    for raw_path in paths {
        let path = PathBuf::from(raw_path);
        if path.is_file() {
            if is_supported_file(&path) {
                files.push(path);
            }
            continue;
        }

        if path.is_dir() {
            for entry in WalkDir::new(&path).into_iter().filter_map(Result::ok) {
                let candidate = entry.path();
                if candidate.is_file() && is_supported_file(candidate) {
                    files.push(candidate.to_path_buf());
                }
            }
        }
    }

    Ok(files)
}

fn register_file(conn: &Connection, path: &Path) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|error| format!("파일 정보를 읽을 수 없습니다: {error}"))?;
    let file_path = normalize_file_path(&path.canonicalize().unwrap_or_else(|_| path.to_path_buf()));
    let file_type = media_type(path).ok_or_else(|| "지원하지 않는 파일 형식입니다.".to_string())?;
    let taken_at = modified_date(&metadata);
    let content_hash = file_hash(path).map_err(|error| format!("파일 해시를 계산할 수 없습니다: {error}"))?;

    conn.execute(
        "INSERT INTO media (file_path, content_hash, file_type, taken_at, size_bytes, rating, comment, favorite, metadata_status)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, '', 0, 'ready')
         ON CONFLICT(file_path) DO UPDATE SET
           file_type = excluded.file_type,
           content_hash = COALESCE(media.content_hash, excluded.content_hash),
           taken_at = COALESCE(media.taken_at, excluded.taken_at),
           size_bytes = excluded.size_bytes,
           metadata_status = 'ready'
         ON CONFLICT(content_hash) DO NOTHING",
        params![file_path, content_hash, file_type, taken_at, metadata.len() as i64],
    )
    .map_err(|error| format!("파일을 등록할 수 없습니다: {error}"))?;

    Ok(())
}

fn read_media(conn: &Connection) -> Result<Vec<MediaItemDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, file_type, taken_at, width, height, duration, size_bytes, rating, comment, favorite, metadata_status
             FROM media
             ORDER BY taken_at DESC NULLS LAST, created_at DESC",
        )
        .map_err(|error| format!("목록을 준비할 수 없습니다: {error}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(MediaItemDto {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_type: row.get(2)?,
                taken_at: row.get(3)?,
                width: row.get(4)?,
                height: row.get(5)?,
                duration: row.get(6)?,
                size_bytes: row.get(7)?,
                rating: row.get(8)?,
                comment: row.get(9)?,
                favorite: row.get::<_, i64>(10)? == 1,
                metadata_status: row.get(11)?,
            })
        })
        .map_err(|error| format!("목록을 읽을 수 없습니다: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("목록을 변환할 수 없습니다: {error}"))
}

fn is_supported_file(path: &Path) -> bool {
    media_type(path).is_some()
}

fn media_type(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_string_lossy().to_lowercase();
    match extension.as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "heic" => Some("image"),
        "mp4" | "mov" | "avi" | "mkv" | "webm" => Some("video"),
        "mp3" | "wav" | "flac" | "m4a" => Some("audio"),
        _ => None,
    }
}

fn normalize_file_path(path: &Path) -> String {
    normalize_file_path_string(&path.to_string_lossy())
}

fn normalize_file_path_string(path: &str) -> String {
    if let Some(stripped) = path.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{stripped}");
    }

    if let Some(stripped) = path.strip_prefix(r"\\?\") {
        return stripped.to_string();
    }

    path.to_string()
}

fn file_hash(path: &Path) -> io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hash = 0xcbf29ce484222325_u64;
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }

        for byte in &buffer[..read] {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x100000001b3);
        }
    }

    Ok(format!("{hash:016x}"))
}

fn modified_date(metadata: &fs::Metadata) -> Option<String> {
    let modified = metadata.modified().ok()?;
    let seconds = modified.duration_since(UNIX_EPOCH).ok()?.as_secs();
    let days = seconds / 86_400;
    civil_from_days(days as i64)
}

fn civil_from_days(days_since_epoch: i64) -> Option<String> {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    Some(format!("{year:04}-{m:02}-{d:02}"))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_media,
            clear_registered_media,
            delete_registered_media,
            create_album_from_media,
            register_paths,
            update_media_details
        ])
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
