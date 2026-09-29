use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{collections::{HashMap, HashSet}, path::PathBuf};

pub const MAX_PHOTOS: usize = 6;

#[derive(Clone, Serialize, Deserialize)]
pub struct Photo {
    pub id: i64,
    #[serde(default)]
    pub file_path: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Entry {
    pub id: i64,
    pub date: String,
    pub title: String,
    pub body: String,
    pub mood: String,
    pub weather: String,
    pub album_id: Option<i64>,
    #[serde(default)]
    pub photos: Vec<Photo>,
}

pub fn list(conn: &Connection) -> Result<Vec<Entry>, String> {
    let mut stmt = conn.prepare("SELECT id, entry_date, title, body, mood, weather, album_id FROM diary ORDER BY entry_date DESC, id DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(Entry { id: r.get(0)?, date: r.get(1)?, title: r.get(2)?, body: r.get(3)?, mood: r.get(4)?, weather: r.get(5)?, album_id: r.get(6)?, photos: vec![] }))
        .map_err(|e| e.to_string())?;
    let mut entries = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    // One ordered attachment query, not one query per diary.
    let mut photos = conn.prepare("SELECT p.diary_id, m.id, m.file_path FROM diary_photo p JOIN media m ON m.id=p.media_id ORDER BY p.diary_id, p.position").map_err(|e| e.to_string())?;
    let rows = photos.query_map([], |r| Ok((r.get::<_, i64>(0)?, Photo { id: r.get(1)?, file_path: r.get(2)? }))).map_err(|e| e.to_string())?;
    let mut by_diary: HashMap<i64, Vec<Photo>> = HashMap::new();
    for row in rows { let (id, photo) = row.map_err(|e| e.to_string())?; by_diary.entry(id).or_default().push(photo); }
    for entry in &mut entries { entry.photos = by_diary.remove(&entry.id).unwrap_or_default(); }
    Ok(entries)
}

fn valid(entry: &Entry) -> Result<(), String> {
    if entry.title.trim().is_empty() || entry.title.chars().count() > 120 || entry.body.chars().count() > 20000 ||
        entry.date.len() != 10 || !entry.date.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() }) ||
        !["기쁨", "평온", "그리움", "슬픔", "설렘"].contains(&entry.mood.as_str()) ||
        !["맑음", "흐림", "비", "눈", "바람"].contains(&entry.weather.as_str()) {
        return Err("일기 입력을 확인해 주세요.".into());
    }
    if entry.photos.len() > MAX_PHOTOS || entry.photos.iter().map(|p| p.id).collect::<HashSet<_>>().len() != entry.photos.len() {
        return Err("사진은 중복 없이 최대 6장까지 첨부할 수 있어요.".into());
    }
    Ok(())
}

pub fn save(conn: &mut Connection, entry: Entry) -> Result<(), String> {
    valid(&entry)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for photo in &entry.photos {
        let exists: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM media WHERE id=?1 AND file_type='image')", [photo.id], |r| r.get(0)).map_err(|e| e.to_string())?;
        if !exists { return Err("첨부할 사진을 찾지 못했습니다. 사진을 다시 선택해 주세요.".into()); }
    }
    if entry.id == 0 {
        tx.execute("INSERT INTO diary(entry_date,title,body,mood,weather,album_id) VALUES(?1,?2,?3,?4,?5,?6)",
            params![entry.date, entry.title.trim(), entry.body, entry.mood, entry.weather, entry.album_id]).map_err(|e| e.to_string())?;
    } else {
        let count = tx.execute("UPDATE diary SET entry_date=?1,title=?2,body=?3,mood=?4,weather=?5,album_id=?6 WHERE id=?7",
            params![entry.date, entry.title.trim(), entry.body, entry.mood, entry.weather, entry.album_id, entry.id]).map_err(|e| e.to_string())?;
        if count == 0 { return Err("일기를 찾지 못했습니다.".into()); }
    }
    let id = if entry.id == 0 { tx.last_insert_rowid() } else { entry.id };
    tx.execute("DELETE FROM diary_photo WHERE diary_id=?1", [id]).map_err(|e| e.to_string())?;
    for (position, photo) in entry.photos.iter().enumerate() {
        tx.execute("INSERT INTO diary_photo(diary_id,media_id,position) VALUES(?1,?2,?3)", params![id, photo.id, position as i64]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

pub fn assign(conn: &mut Connection, ids: Vec<i64>, album_id: Option<i64>) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    if let Some(id) = album_id {
        let exists: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM album WHERE id=?1)", [id], |r| r.get(0)).map_err(|e| e.to_string())?;
        if !exists { return Err("앨범을 찾지 못했습니다.".into()); }
    }
    for id in ids {
        tx.execute("UPDATE diary SET album_id=?1 WHERE id=?2", params![album_id, id]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

pub fn delete(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM diary WHERE id=?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

// Register only explicitly chosen images, atomically, returning existing IDs for duplicate files.
pub fn import_photos(conn: &mut Connection, paths: Vec<String>) -> Result<Vec<Photo>, String> {
    if paths.len() > MAX_PHOTOS { return Err("사진은 최대 6장까지 첨부할 수 있어요.".into()); }
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    if paths.iter().any(|p| !p.is_file() || super::media_type(p) != Some("image")) {
        return Err("사진 파일만 첨부할 수 있어요.".into());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    for path in paths {
        super::register_file(&tx, &path)?;
        let normalized = super::normalize_file_path(&path.canonicalize().map_err(|e| e.to_string())?);
        let hash = super::file_hash(&path).map_err(|e| e.to_string())?;
        let photo = tx.query_row("SELECT id,file_path FROM media WHERE file_type='image' AND (file_path=?1 OR content_hash=?2) ORDER BY (file_path=?1) DESC LIMIT 1", params![normalized, hash], |r| Ok(Photo { id: r.get(0)?, file_path: r.get(1)? })).map_err(|e| e.to_string())?;
        if seen.insert(photo.id) { result.push(photo); }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn diary_roundtrip_and_album_move_preserve_other_entries() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::database::initialize(&mut conn).unwrap();
        conn.execute("INSERT INTO album(title) VALUES('졸업식')", []).unwrap();
        save(&mut conn, Entry { id: 0, date: "2026-09-27".into(), title: "오늘".into(), body: "긴 하루".into(), mood: "평온".into(), weather: "맑음".into(), album_id: None, photos: vec![] }).unwrap();
        save(&mut conn, Entry { id: 0, date: "2026-09-26".into(), title: "어제".into(), body: "".into(), mood: "기쁨".into(), weather: "비".into(), album_id: None, photos: vec![] }).unwrap();
        assign(&mut conn, vec![1], Some(1)).unwrap();
        assert_eq!(list(&conn).unwrap().iter().find(|e| e.id == 1).unwrap().album_id, Some(1));
        assert!(assign(&mut conn, vec![2], Some(999)).is_err());
        assert_eq!(list(&conn).unwrap().iter().find(|e| e.id == 2).unwrap().album_id, None);
        conn.execute("DELETE FROM album WHERE id=1", []).unwrap();
        assert_eq!(list(&conn).unwrap()[1].album_id, None);
        delete(&conn, 2).unwrap();
        assert_eq!(list(&conn).unwrap().len(), 1);
    }
    fn entry(photos: Vec<i64>) -> Entry {
        Entry { id: 0, date: "2026-09-28".into(), title: "사진 일기".into(), body: "남겨 둘 이야기".into(), mood: "평온".into(), weather: "맑음".into(), album_id: None,
            photos: photos.into_iter().map(|id| Photo { id, file_path: "client path is not authoritative".into() }).collect() }
    }
    fn photo_database() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::database::initialize(&mut conn).unwrap();
        for id in 1..=7 {
            conn.execute("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(?1,?2,'image',1)", params![id, format!("photo-{id}.jpg")]).unwrap();
        }
        conn.execute("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(8,'video.mp4','video',1)", []).unwrap();
        conn
    }
    #[test]
    fn six_photos_keep_order_and_detaching_or_deleting_diary_preserves_originals() {
        let mut conn = photo_database();
        save(&mut conn, entry(vec![6, 2, 5, 1, 4, 3])).unwrap();
        let mut saved = list(&conn).unwrap().remove(0);
        assert_eq!(saved.photos.iter().map(|p| p.id).collect::<Vec<_>>(), vec![6,2,5,1,4,3]);
        assert_eq!(saved.photos[0].file_path, "photo-6.jpg");
        saved.photos.remove(1);
        save(&mut conn, saved.clone()).unwrap();
        assert_eq!(list(&conn).unwrap()[0].photos.len(), 5);
        delete(&conn, saved.id).unwrap();
        assert_eq!(conn.query_row("SELECT count(*) FROM media", [], |r| r.get::<_,i64>(0)).unwrap(), 8);
        assert_eq!(conn.query_row("SELECT count(*) FROM diary_photo", [], |r| r.get::<_,i64>(0)).unwrap(), 0);
    }
    #[test]
    fn invalid_attachments_do_not_overwrite_a_saved_diary() {
        let mut conn = photo_database();
        save(&mut conn, entry(vec![1,2])).unwrap();
        for ids in [vec![1,2,3,4,5,6,7], vec![1,1], vec![8], vec![999]] {
            let mut invalid = entry(ids); invalid.id = 1; invalid.title = "must not save".into();
            assert!(save(&mut conn, invalid).is_err());
            let saved = list(&conn).unwrap().remove(0);
            assert_eq!(saved.title, "사진 일기");
            assert_eq!(saved.photos.iter().map(|p| p.id).collect::<Vec<_>>(), vec![1,2]);
        }
        conn.execute("DELETE FROM media WHERE id=1", []).unwrap();
        assert_eq!(list(&conn).unwrap()[0].photos.len(), 1);
        assert_eq!(list(&conn).unwrap()[0].body, "남겨 둘 이야기");
    }
    #[test]
    fn upgrading_version_three_preserves_existing_diaries() {
        let mut conn = photo_database();
        save(&mut conn, entry(vec![])).unwrap();
        conn.execute_batch("DROP TABLE diary_photo; PRAGMA user_version=3;").unwrap();
        crate::database::initialize(&mut conn).unwrap();
        crate::database::initialize(&mut conn).unwrap();
        let saved = list(&conn).unwrap().remove(0);
        assert_eq!(saved.title, "사진 일기");
        assert!(saved.photos.is_empty());
        let legacy: Entry = serde_json::from_str(r#"{"id":0,"date":"2026-09-28","title":"기존 일기","body":"","mood":"평온","weather":"맑음","album_id":null}"#).unwrap();
        assert!(legacy.photos.is_empty());
    }

}
