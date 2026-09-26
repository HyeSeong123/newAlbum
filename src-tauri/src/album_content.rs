use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Content {
    pub id: String,
    pub kind: String,
    pub media_id: Option<i64>,
    pub title: String,
    pub body: String,
    pub display_duration: f64,
    pub transition_type: String,
    pub comment_visible: bool,
}

pub fn load(conn: &Connection) -> Result<HashMap<i64, Vec<Content>>, String> {
    let mut stmt = conn.prepare("SELECT ai.album_id, 'media-' || ai.id,
        CASE m.file_type WHEN 'image' THEN 'PHOTO' WHEN 'video' THEN 'VIDEO' ELSE 'AUDIO' END,
        ai.media_id, '', '', COALESCE(ai.display_duration, 5), ai.transition_type, ai.comment_visible, ai.sequence
        FROM album_item ai JOIN media m ON m.id = ai.media_id
        UNION ALL SELECT album_id, id, kind, NULL, title, body, display_duration, transition_type, 1, sequence
        FROM album_page ORDER BY 1, 10").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, Content {
        id: row.get(1)?, kind: row.get(2)?, media_id: row.get(3)?, title: row.get(4)?, body: row.get(5)?,
        display_duration: row.get(6)?, transition_type: row.get(7)?, comment_visible: row.get::<_, i64>(8)? != 0,
    }))).map_err(|e| e.to_string())?;
    let mut albums: HashMap<i64, Vec<Content>> = HashMap::new();
    for row in rows { let (id, entry) = row.map_err(|e| e.to_string())?; albums.entry(id).or_default().push(entry); }
    Ok(albums)
}

pub fn save(conn: &mut Connection, id: i64, title: &str, color: &str, contents: &[Content]) -> Result<(), String> {
    if title.trim().is_empty() || title.chars().count() > 80 || !crate::valid_album_color(color) {
        return Err("앨범 제목과 표지색을 확인해 주세요.".into());
    }
    let mut ids = std::collections::HashSet::new();
    for entry in contents {
        if entry.id.is_empty() || !ids.insert(&entry.id) || entry.title.chars().count() > 120 || entry.body.chars().count() > 4000
            || !entry.display_duration.is_finite() || !(1.0..=600.0).contains(&entry.display_duration)
            || !["fade", "slide", "zoom"].contains(&entry.transition_type.as_str()) {
            return Err("앨범 항목의 내용과 재생 시간을 확인해 주세요.".into());
        }
        match entry.kind.as_str() {
            "CHAPTER" | "TEXT" => {
                if entry.media_id.is_some() || (entry.title.trim().is_empty() && (entry.kind == "CHAPTER" || entry.body.trim().is_empty())) {
                    return Err("챕터 제목 또는 글 페이지 내용을 입력해 주세요.".into());
                }
            }
            "PHOTO" | "VIDEO" | "AUDIO" => {
                let file_type: String = conn.query_row("SELECT file_type FROM media WHERE id = ?1", [entry.media_id], |row| row.get(0))
                    .map_err(|_| "등록된 미디어를 찾을 수 없습니다.".to_string())?;
                let expected = match file_type.as_str() { "image" => "PHOTO", "video" => "VIDEO", _ => "AUDIO" };
                if entry.kind != expected { return Err("미디어 형식이 일치하지 않습니다.".into()); }
            }
            _ => return Err("지원하지 않는 앨범 항목입니다.".into()),
        }
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let cover = contents.iter().find_map(|entry| entry.media_id);
    let count = tx.execute("UPDATE album SET title = ?1, cover_color = ?2, cover_media_id = ?3 WHERE id = ?4",
        params![title.trim(), color, cover, id]).map_err(|e| e.to_string())?;
    if count == 0 { return Err("앨범을 찾을 수 없습니다.".into()); }
    tx.execute("DELETE FROM album_item WHERE album_id = ?1", [id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM album_page WHERE album_id = ?1", [id]).map_err(|e| e.to_string())?;
    for (sequence, entry) in contents.iter().enumerate() {
        if let Some(media_id) = entry.media_id {
            tx.execute("INSERT INTO album_item(album_id, media_id, sequence, display_duration, transition_type, comment_visible)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![id, media_id, sequence as i64, entry.display_duration, entry.transition_type, entry.comment_visible])
                .map_err(|e| e.to_string())?;
        } else {
            tx.execute("INSERT INTO album_page(id, album_id, kind, title, body, sequence, display_duration, transition_type)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)", params![entry.id, id, entry.kind, entry.title.trim(), entry.body, sequence as i64, entry.display_duration, entry.transition_type])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_album_migrates_preserves_media_and_roundtrips_chapters_atomically() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(include_str!("../database/schema.sql")).unwrap();
        for id in 1..=3 {
            conn.execute("INSERT INTO media(id,file_path,file_type,size_bytes,title) VALUES (?1,?2,'image',1,'사진 제목')", params![id, format!("{id}.jpg")]).unwrap();
        }
        let album = crate::insert_album(&mut conn, "기존 앨범", &[3, 1, 2], "#D8DDCB").unwrap();
        conn.execute_batch("DROP TABLE album_page;").unwrap();
        // Opening a pre-upgrade database creates only the additive table.
        conn.execute_batch(include_str!("../database/schema.sql")).unwrap();
        conn.execute_batch(include_str!("../database/schema.sql")).unwrap();
        let mut contents = load(&conn).unwrap().remove(&album).unwrap();
        assert_eq!(contents.iter().map(|entry| entry.media_id).collect::<Vec<_>>(), vec![Some(3), Some(1), Some(2)]);
        contents.insert(1, Content { id:"chapter-1".into(), kind:"CHAPTER".into(), media_id:None, title:"DAY 1".into(), body:"제주도".into(), display_duration:5.0, transition_type:"fade".into(), comment_visible:true });
        save(&mut conn, album, "기존 앨범", "#D8DDCB", &contents).unwrap();
        let loaded = load(&conn).unwrap().remove(&album).unwrap();
        assert_eq!(loaded[1].title, "DAY 1");
        assert_eq!(loaded.iter().filter_map(|entry| entry.media_id).collect::<Vec<_>>(), vec![3,1,2]);
        let raw = crate::read_albums(&conn).unwrap();
        assert_eq!(raw[0].items.len(), 3);
        assert_eq!(raw[0].items[0].title, "사진 제목");
        let mut invalid = loaded.clone(); invalid[0].media_id = Some(999);
        assert!(save(&mut conn, album, "손상되면 안 됨", "#D8DDCB", &invalid).is_err());
        assert_eq!(crate::read_albums(&conn).unwrap()[0].title, "기존 앨범");
        assert_eq!(load(&conn).unwrap()[&album].len(), 4);
        let text = Content { id:"text-1".into(), kind:"TEXT".into(), media_id:None, title:String::new(), body:"여행 마지막 날.\n가장 기억에 남는다.".into(), display_duration:8.0, transition_type:"fade".into(), comment_visible:true };
        save(&mut conn, album, "글만 있는 앨범", "#D8DDCB", &[text.clone()]).unwrap();
        let loaded = crate::read_albums(&conn).unwrap();
        assert!(loaded[0].items.is_empty());
        assert_eq!(loaded[0].contents[0].body, text.body);
        let mut empty = text; empty.body = "  ".into();
        assert!(save(&mut conn, album, "빈 글", "#D8DDCB", &[empty]).is_err());
        save(&mut conn, album, "비운 앨범", "#D8DDCB", &[]).unwrap();
        assert!(!load(&conn).unwrap().contains_key(&album));
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM media", [], |r| r.get::<_, i64>(0)).unwrap(), 3);
    }
}
