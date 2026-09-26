use rusqlite::{params, Connection};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;
mod export;
use export::{copy_media_file, export_media_files, ExportResultDto};
#[cfg(test)]
use export::valid_export_folder_name;
mod faces;
mod pets;
mod thumbnails;
#[cfg(any(feature = "custom-protocol", test))]
mod localhost;

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
    title: String,
    favorite: bool,
    view_count: i64,
    metadata_status: String,
}

#[derive(Serialize)]
struct AlbumDto {
    id: i64,
    title: String,
    description: String,
    cover_color: String,
    created_at: String,
    items: Vec<MediaItemDto>,
}

#[tauri::command]
fn list_media(app: AppHandle) -> Result<Vec<MediaItemDto>, String> {
    let conn = open_database(&app)?;
    read_media(&conn)
}

#[tauri::command]
fn list_albums(app: AppHandle) -> Result<Vec<AlbumDto>, String> {
    let conn = open_database(&app)?;
    read_albums(&conn)
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
fn create_album_from_media(
    app: AppHandle,
    title: String,
    media_ids: Vec<i64>,
    cover_color: String,
) -> Result<i64, String> {
    let mut conn = open_database(&app)?;
    insert_album(&mut conn, &title, &media_ids, &cover_color)
}

fn valid_album_color(color: &str) -> bool {
    color.len() == 7
        && color.starts_with('#')
        && color[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn insert_album(
    conn: &mut Connection,
    title: &str,
    media_ids: &[i64],
    cover_color: &str,
) -> Result<i64, String> {
    if media_ids.is_empty() {
        return Err("앨범에 담을 항목을 선택해 주세요.".to_string());
    }

    let title = title.trim();
    if title.is_empty() {
        return Err("앨범 이름을 입력해 주세요.".to_string());
    }
    if !valid_album_color(cover_color) {
        return Err("올바른 표지색을 선택해 주세요.".into());
    }

    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO album (title, description, cover_media_id, cover_color, cover_concept) VALUES (?1, '', ?2, ?3, 'mint')",
        params![title, media_ids[0], cover_color],
    )
    .map_err(|error| format!("앨범을 만들 수 없습니다: {error}"))?;

    let album_id = tx.last_insert_rowid();
    for (index, media_id) in media_ids.iter().enumerate() {
        tx.execute(
            "INSERT INTO album_item (album_id, media_id, sequence) VALUES (?1, ?2, ?3)",
            params![album_id, media_id, index as i64],
        )
        .map_err(|error| format!("앨범 항목을 추가할 수 없습니다: {error}"))?;
    }

    tx.commit().map_err(|error| error.to_string())?;
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
fn update_album(
    app: AppHandle,
    id: i64,
    title: String,
    cover_color: String,
    media_ids: Vec<i64>,
) -> Result<(), String> {
    let mut conn = open_database(&app)?;
    save_album(&mut conn, id, &title, &cover_color, &media_ids)
}

fn save_album(
    conn: &mut Connection,
    id: i64,
    title: &str,
    cover_color: &str,
    media_ids: &[i64],
) -> Result<(), String> {
    if title.trim().is_empty() {
        return Err("앨범 제목을 입력해 주세요.".into());
    }
    if !valid_album_color(cover_color) {
        return Err("올바른 표지색을 선택해 주세요.".into());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let count = tx
        .execute(
            "UPDATE album SET title = ?1, cover_color = ?2, cover_media_id = ?3 WHERE id = ?4",
            params![title.trim(), cover_color, media_ids.first(), id],
        )
        .map_err(|e| e.to_string())?;
    if count == 0 {
        return Err("앨범을 찾을 수 없습니다.".into());
    }
    tx.execute("DELETE FROM album_item WHERE album_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    for (index, media_id) in media_ids.iter().enumerate() {
        tx.execute(
            "INSERT INTO album_item (album_id, media_id, sequence) VALUES (?1, ?2, ?3)",
            params![id, media_id, index as i64],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_albums(app: AppHandle, ids: Vec<i64>) -> Result<(), String> {
    let mut conn = open_database(&app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for id in ids {
        tx.execute("DELETE FROM album WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
fn export_media_group(
    source_paths: Vec<String>,
    destination_root: String,
    folder_name: String,
) -> Result<ExportResultDto, String> {
    let sources = source_paths
        .into_iter()
        .map(PathBuf::from)
        .collect::<Vec<_>>();
    export_media_files(&sources, Path::new(&destination_root), &folder_name)
}

#[tauri::command]
async fn download_media(app: AppHandle, id: i64, destination: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let conn = open_database(&app)?;
        let source: String = conn.query_row(
            "SELECT file_path FROM media WHERE id = ?1 AND file_type = 'image'",
            [id], |row| row.get(0),
        ).map_err(|_| "다운로드할 원본 사진을 찾을 수 없습니다.".to_owned())?;
        copy_media_file(Path::new(&source), Path::new(&destination))
    }).await.map_err(|error| format!("사진 저장을 완료하지 못했습니다: {error}"))?
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
        params![
            rating.clamp(0, 5),
            comment,
            if favorite { 1 } else { 0 },
            id
        ],
    )
    .map_err(|error| format!("미디어 정보를 저장할 수 없습니다: {error}"))?;
    Ok(())
}

#[tauri::command]
fn increment_media_view(app: AppHandle, id: i64) -> Result<i64, String> {
    let conn = open_database(&app)?;
    let changed = conn
        .execute(
            "UPDATE media SET view_count = view_count + 1 WHERE id = ?1",
            [id],
        )
        .map_err(|error| format!("조회수를 저장할 수 없습니다: {error}"))?;
    if changed == 0 {
        return Err("조회할 미디어를 찾을 수 없습니다.".into());
    }
    conn.query_row("SELECT view_count FROM media WHERE id = ?1", [id], |row| {
        row.get(0)
    })
    .map_err(|error| format!("조회수를 읽을 수 없습니다: {error}"))
}

#[tauri::command]
fn update_media_title(app: AppHandle, id: i64, title: String) -> Result<(), String> {
    let conn = open_database(&app)?;
    save_media_title(&conn, id, &title)
}

fn save_media_title(conn: &Connection, id: i64, title: &str) -> Result<(), String> {
    let title = title.trim();
    // Match the browser input's UTF-16 maxlength, including emoji.
    if title.encode_utf16().count() > 120 {
        return Err("제목은 120자 이내로 입력해 주세요.".into());
    }
    let changed = conn.execute("UPDATE media SET title = ?1 WHERE id = ?2", params![title, id])
        .map_err(|error| format!("제목을 저장할 수 없습니다: {error}"))?;
    if changed == 0 {
        return Err("저장할 사진을 찾을 수 없습니다.".into());
    }
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
    let conn =
        Connection::open(db_path).map_err(|error| format!("DB를 열 수 없습니다: {error}"))?;
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

    match conn.execute(
        "ALTER TABLE album ADD COLUMN cover_color TEXT NOT NULL DEFAULT '#B9C58E'",
        [],
    ) {
        Ok(_) => {}
        Err(error) if error.to_string().contains("duplicate column name") => {}
        Err(error) => return Err(format!("앨범 마이그레이션을 적용할 수 없습니다: {error}")),
    }

    normalize_existing_file_paths(conn)?;
    migrate_album_concept(conn)?;
    migrate_person_cover(conn)?;
    migrate_media_view_count(conn)?;
    migrate_media_title(conn)?;

    Ok(())
}

fn migrate_media_title(conn: &Connection) -> Result<(), String> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM pragma_table_info('media') WHERE name = 'title')",
        [], |row| row.get(0),
    ).map_err(|error| error.to_string())?;
    if !exists {
        conn.execute("ALTER TABLE media ADD COLUMN title TEXT NOT NULL DEFAULT ''", [])
            .map_err(|error| format!("사진 제목 마이그레이션 실패: {error}"))?;
    }
    Ok(())
}

fn migrate_media_view_count(conn: &Connection) -> Result<(), String> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('media') WHERE name = 'view_count')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists {
        conn.execute(
            "ALTER TABLE media ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|e| format!("조회수 마이그레이션 실패: {e}"))?;
    }
    Ok(())
}

fn migrate_person_cover(conn: &Connection) -> Result<(), String> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('person') WHERE name = 'cover_face_id')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists {
        conn.execute("ALTER TABLE person ADD COLUMN cover_face_id INTEGER REFERENCES detected_face(id) ON DELETE SET NULL", []).map_err(|e| format!("인물 대표 사진 마이그레이션 실패: {e}"))?;
    }
    Ok(())
}

fn migrate_album_concept(conn: &Connection) -> Result<(), String> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('album') WHERE name = 'cover_concept')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists {
        conn.execute(
            "ALTER TABLE album ADD COLUMN cover_concept TEXT NOT NULL DEFAULT 'mint'",
            [],
        )
        .map_err(|e| format!("앨범 컨셉 마이그레이션 실패: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod album_concept_tests {
    use super::*;

    #[test]
    fn legacy_media_titles_migrate_without_changing_existing_metadata() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE media (id INTEGER PRIMARY KEY, file_path TEXT, comment TEXT, rating INTEGER, favorite INTEGER);
            INSERT INTO media VALUES (1, 'original.jpg', '기존 댓글', 4, 1);").unwrap();
        migrate_media_title(&conn).unwrap();
        migrate_media_title(&conn).unwrap();
        let value: String = conn.query_row("SELECT title FROM media WHERE id = 1", [], |row| row.get(0)).unwrap();
        assert_eq!(value, "");
        save_media_title(&conn, 1, "  바람이 좋았던 날  ").unwrap();
        migrate_media_title(&conn).unwrap();
        let value: (String, String, String, i64, i64) = conn.query_row(
            "SELECT title, file_path, comment, rating, favorite FROM media WHERE id = 1", [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        ).unwrap();
        assert_eq!(value, ("바람이 좋았던 날".into(), "original.jpg".into(), "기존 댓글".into(), 4, 1));
    }

    #[test]
    fn titles_roundtrip_to_all_albums_and_support_clear_and_validation() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../database/schema.sql")).unwrap();
        conn.execute("INSERT INTO media(file_path, file_type, size_bytes) VALUES ('photo.jpg', 'image', 42)", []).unwrap();
        insert_album(&mut conn, "첫 앨범", &[1], "#D8DDCB").unwrap();
        insert_album(&mut conn, "둘째 앨범", &[1], "#D8DDCB").unwrap();
        save_media_title(&conn, 1, "같은 사진의 제목 🌿").unwrap();
        assert_eq!(read_media(&conn).unwrap()[0].title, "같은 사진의 제목 🌿");
        assert!(read_albums(&conn).unwrap().iter().all(|album| album.items[0].title == "같은 사진의 제목 🌿"));
        assert!(save_media_title(&conn, 1, &"가".repeat(121)).is_err());
        assert!(save_media_title(&conn, 1, &"🌿".repeat(61)).is_err());
        assert!(save_media_title(&conn, 999, "없는 사진").is_err());
        assert_eq!(read_media(&conn).unwrap()[0].title, "같은 사진의 제목 🌿");
        save_media_title(&conn, 1, "  ").unwrap();
        assert_eq!(read_media(&conn).unwrap()[0].title, "");
    }

    #[test]
    fn legacy_albums_get_mint_without_losing_data() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE album (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO album VALUES (1, 'existing');").unwrap();
        migrate_album_concept(&conn).unwrap();
        migrate_album_concept(&conn).unwrap();
        let value: (String, String) = conn
            .query_row(
                "SELECT title, cover_concept FROM album WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(value, ("existing".into(), "mint".into()));
    }

    #[test]
    fn legacy_people_gain_an_empty_cover_face_without_losing_names() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE person (id INTEGER PRIMARY KEY, name TEXT NOT NULL); CREATE TABLE detected_face (id INTEGER PRIMARY KEY); INSERT INTO person VALUES (1, '가족');").unwrap();
        migrate_person_cover(&conn).unwrap();
        migrate_person_cover(&conn).unwrap();
        let value: (String, Option<i64>) = conn
            .query_row(
                "SELECT name, cover_face_id FROM person WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(value, ("가족".into(), None));
    }

    #[test]
    fn legacy_media_gain_view_counts_without_losing_rows() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE media (id INTEGER PRIMARY KEY, file_path TEXT NOT NULL); INSERT INTO media VALUES (1, 'existing.jpg');").unwrap();
        migrate_media_view_count(&conn).unwrap();
        migrate_media_view_count(&conn).unwrap();
        let value: (String, i64) = conn
            .query_row(
                "SELECT file_path, view_count FROM media WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(value, ("existing.jpg".into(), 0));
    }

    #[test]
    fn album_colors_roundtrip_and_failed_writes_rollback() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(include_str!("../database/schema.sql"))
            .unwrap();
        conn.execute("INSERT INTO media(file_path, file_type, size_bytes) VALUES ('original.jpg', 'image', 42)", []).unwrap();
        for (title, color) in [("brown", "#6A4538"), ("navy", "#2F4058")] {
            let id = insert_album(&mut conn, title, &[1], color).unwrap();
            assert_eq!(
                read_albums(&conn)
                    .unwrap()
                    .into_iter()
                    .find(|album| album.id == id)
                    .unwrap()
                    .cover_color,
                color
            );
        }
        save_album(&mut conn, 1, "edited", "#AFC5CF", &[1]).unwrap();
        assert!(save_album(&mut conn, 1, "bad", "#AFC5CF", &[999]).is_err());
        assert!(insert_album(&mut conn, "invalid", &[1], "unknown").is_err());
        assert!(insert_album(&mut conn, "partial", &[1, 999], "#414143").is_err());
        let albums = read_albums(&conn).unwrap();
        assert_eq!(albums.len(), 2);
        let edited = albums.iter().find(|album| album.id == 1).unwrap();
        assert_eq!(edited.title, "edited");
        assert_eq!(edited.cover_color, "#AFC5CF");
        assert_eq!(edited.items.len(), 1);
        let path: String = conn
            .query_row("SELECT file_path FROM media WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(path, "original.jpg");
    }

    #[test]
    fn batched_album_reads_keep_empty_albums_order_and_current_media_details() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../database/schema.sql")).unwrap();
        assert!(read_albums(&conn).unwrap().is_empty());
        conn.execute_batch(
            "INSERT INTO media(id, file_path, file_type, size_bytes, taken_at, rating, comment, favorite, view_count)
             VALUES (1, 'first.jpg', 'image', 100, '2026-09-24', 5, 'current caption', 1, 9),
                    (2, 'second.jpg', 'image', 200, NULL, 0, '', 0, 0);
             INSERT INTO album(id, title, created_at) VALUES (1, 'older', '2025-01-01'), (2, 'newer', '2026-01-01'), (3, 'empty', '2026-01-01');
             INSERT INTO album_item(album_id, media_id, sequence) VALUES (1, 1, 9), (1, 2, 2), (2, 1, 0);"
        ).unwrap();
        let albums = read_albums(&conn).unwrap();
        assert_eq!(albums.iter().map(|album| album.id).collect::<Vec<_>>(), vec![3, 2, 1]);
        assert!(albums[0].items.is_empty());
        assert_eq!(albums[2].items.iter().map(|item| item.id).collect::<Vec<_>>(), vec![2, 1]);
        let media = read_media(&conn).unwrap();
        assert_eq!(serde_json::to_value(&albums[1].items[0]).unwrap(), serde_json::to_value(&media[0]).unwrap());
        assert_eq!(serde_json::to_value(&albums[2].items[1]).unwrap(), serde_json::to_value(&media[0]).unwrap());
        assert_eq!(albums[1].items[0].comment, "current caption");
        assert_eq!(albums[1].items[0].view_count, 9);
        assert!(albums[1].items[0].favorite);
    }

    #[test]
    fn grouped_export_copies_files_and_keeps_duplicate_names() {
        let nonce = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let test_root =
            std::env::temp_dir().join(format!("oraedameun-export-{}-{nonce}", std::process::id()));
        let first = test_root.join("first");
        let second = test_root.join("second");
        let output = test_root.join("output");
        fs::create_dir_all(&first).unwrap();
        fs::create_dir_all(&second).unwrap();
        fs::create_dir_all(&output).unwrap();
        let first_photo = first.join("photo.jpg");
        let second_photo = second.join("photo.jpg");
        fs::write(&first_photo, b"first").unwrap();
        fs::write(&second_photo, b"second").unwrap();

        let result = export_media_files(
            &[first_photo.clone(), second_photo, first_photo],
            &output,
            "가족 앨범",
        )
        .unwrap();
        let exported = output.join("가족 앨범");
        assert_eq!(result.copied, 2);
        assert_eq!(fs::read(exported.join("photo.jpg")).unwrap(), b"first");
        assert_eq!(fs::read(exported.join("photo (2).jpg")).unwrap(), b"second");
        assert!(export_media_files(&[], &output, "가족 앨범").is_err());
        fs::remove_dir_all(&test_root).unwrap();
    }

    #[test]
    fn grouped_export_rejects_unsafe_folder_names() {
        for name in ["", "..", "bad/name", "CON", "photo. "] {
            assert!(
                valid_export_folder_name(name).is_err(),
                "{name} should be rejected"
            );
        }
        assert_eq!(
            valid_export_folder_name("지은의 사진").unwrap(),
            "지은의 사진"
        );
    }
}

fn normalize_existing_file_paths(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT id, file_path FROM media")
        .map_err(|error| format!("경로 정리 목록을 준비할 수 없습니다: {error}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
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
    let metadata =
        fs::metadata(path).map_err(|error| format!("파일 정보를 읽을 수 없습니다: {error}"))?;
    let file_path =
        normalize_file_path(&path.canonicalize().unwrap_or_else(|_| path.to_path_buf()));
    let file_type = media_type(path).ok_or_else(|| "지원하지 않는 파일 형식입니다.".to_string())?;
    let taken_at = modified_date(&metadata);
    let content_hash =
        file_hash(path).map_err(|error| format!("파일 해시를 계산할 수 없습니다: {error}"))?;

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

fn media_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MediaItemDto> {
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
        view_count: row.get(12)?,
        title: row.get(13)?,
    })
}

fn read_media(conn: &Connection) -> Result<Vec<MediaItemDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, file_type, taken_at, width, height, duration, size_bytes, rating, comment, favorite, metadata_status, view_count, title
             FROM media
             ORDER BY taken_at DESC NULLS LAST, created_at DESC",
        )
        .map_err(|error| format!("목록을 준비할 수 없습니다: {error}"))?;

    let rows = stmt
        .query_map([], media_from_row)
        .map_err(|error| format!("목록을 읽을 수 없습니다: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("목록을 변환할 수 없습니다: {error}"))
}

fn read_albums(conn: &Connection) -> Result<Vec<AlbumDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, description, cover_color, created_at
             FROM album
             ORDER BY created_at DESC, id DESC",
        )
        .map_err(|error| format!("앨범 목록을 준비할 수 없습니다: {error}"))?;

    let album_rows = stmt
        .query_map([], |row| {
            Ok(AlbumDto {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                cover_color: row.get(3)?,
                created_at: row.get(4)?,
                items: Vec::new(),
            })
        })
        .map_err(|error| format!("앨범 목록을 읽을 수 없습니다: {error}"))?;

    let mut albums = album_rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("앨범 목록을 변환할 수 없습니다: {error}"))?;

    if albums.is_empty() {
        return Ok(albums);
    }
    let positions: HashMap<_, _> = albums.iter().enumerate().map(|(index, album)| (album.id, index)).collect();
    // Load all memberships once instead of issuing one photo query per album.
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.file_path, m.file_type, m.taken_at, m.width, m.height, m.duration, m.size_bytes, m.rating, m.comment, m.favorite, m.metadata_status, m.view_count, m.title, ai.album_id
             FROM album_item ai
             JOIN media m ON m.id = ai.media_id
             ORDER BY ai.album_id, ai.sequence ASC",
        )
        .map_err(|error| format!("앨범 항목을 준비할 수 없습니다: {error}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, i64>(14)?, media_from_row(row)?))
        })
        .map_err(|error| format!("앨범 항목을 읽을 수 없습니다: {error}"))?;

    for row in rows {
        let (album_id, item) = row.map_err(|error| format!("앨범 항목을 변환할 수 없습니다: {error}"))?;
        if let Some(&position) = positions.get(&album_id) {
            albums[position].items.push(item);
        }
    }
    Ok(albums)
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
    #[cfg(feature = "custom-protocol")]
    localhost::trace("application starting");
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(feature = "custom-protocol")]
            localhost::trace("application setup");
            #[cfg(feature = "custom-protocol")]
            {
                use tauri_plugin_dialog::DialogExt;
                match localhost::LocalServer::start(app.handle()) {
                    Ok(server) => { app.manage(server); }
                    Err(error) => {
                        let message = if error.kind() == io::ErrorKind::AddrInUse {
                            "127.0.0.1:5173 포트를 다른 프로그램이 사용하고 있습니다. 개발 서버 또는 해당 프로그램을 종료한 뒤 오래담은을 다시 실행해 주세요.".to_owned()
                        } else {
                            format!("로컬 서버를 시작하지 못했습니다.\n{error}")
                        };
                        app.dialog().message(&message).title("오래담은 실행 안내")
                            .kind(tauri_plugin_dialog::MessageDialogKind::Error).blocking_show();
                        return Err(Box::new(io::Error::new(error.kind(), message)));
                    }
                }
            }
            let window_config = app.config().app.windows[0].clone();
            #[cfg(feature = "custom-protocol")]
            let window_config = {
                let mut config = window_config;
                config.url = tauri::WebviewUrl::External(localhost::ORIGIN.parse()?);
                config
            };
            // Native storage/dialog commands are available only to this app's origin.
            #[cfg(feature = "custom-protocol")]
            localhost::trace("creating main webview");
            tauri::WebviewWindowBuilder::from_config(app, &window_config)?
                .on_navigation(|url| url.scheme() == "http"
                    && url.host_str() == Some("127.0.0.1") && url.port() == Some(5173))
                .build()?;
            #[cfg(feature = "custom-protocol")]
            localhost::trace("main webview created");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_media,
            thumbnails::media_thumbnail,
            list_albums,
            clear_registered_media,
            delete_registered_media,
            create_album_from_media,
            update_album,
            delete_albums,
            export_media_group,
            download_media,
            register_paths,
            update_media_details,
            update_media_title,
            increment_media_view,
            faces::list_face_index,
            pets::list_pets,
            pets::save_pet,
            pets::delete_pet,
            faces::find_face_matches,
            faces::set_faces_excluded,
            faces::save_face_scan,
            faces::rename_face_person,
            faces::set_person_cover_face,
            faces::move_faces,
            faces::clear_face_index
        ])
        .build(tauri::generate_context!())
        .expect("failed to run app");
    app.run(|app, event| {
        #[cfg(feature = "custom-protocol")]
        if let tauri::RunEvent::Exit = event {
            if let Some(server) = app.try_state::<localhost::LocalServer>() { server.stop(); }
        }
        #[cfg(not(feature = "custom-protocol"))]
        let _ = (app, event);
    });
}
