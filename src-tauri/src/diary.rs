use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct Entry {
    pub id: i64,
    pub date: String,
    pub title: String,
    pub body: String,
    pub mood: String,
    pub weather: String,
    pub album_id: Option<i64>,
}

pub fn list(conn: &Connection) -> Result<Vec<Entry>, String> {
    let mut stmt = conn.prepare("SELECT id, entry_date, title, body, mood, weather, album_id FROM diary ORDER BY entry_date DESC, id DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(Entry { id: r.get(0)?, date: r.get(1)?, title: r.get(2)?, body: r.get(3)?, mood: r.get(4)?, weather: r.get(5)?, album_id: r.get(6)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn valid(entry: &Entry) -> Result<(), String> {
    if entry.title.trim().is_empty() || entry.title.chars().count() > 120 || entry.body.chars().count() > 20000 ||
        entry.date.len() != 10 || !entry.date.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() }) ||
        !["기쁨", "평온", "그리움", "슬픔", "설렘"].contains(&entry.mood.as_str()) ||
        !["맑음", "흐림", "비", "눈", "바람"].contains(&entry.weather.as_str()) {
        return Err("일기 입력을 확인해 주세요.".into());
    }
    Ok(())
}

pub fn save(conn: &Connection, entry: Entry) -> Result<(), String> {
    valid(&entry)?;
    if entry.id == 0 {
        conn.execute("INSERT INTO diary(entry_date,title,body,mood,weather,album_id) VALUES(?1,?2,?3,?4,?5,?6)",
            params![entry.date, entry.title.trim(), entry.body, entry.mood, entry.weather, entry.album_id]).map_err(|e| e.to_string())?;
    } else {
        let count = conn.execute("UPDATE diary SET entry_date=?1,title=?2,body=?3,mood=?4,weather=?5,album_id=?6 WHERE id=?7",
            params![entry.date, entry.title.trim(), entry.body, entry.mood, entry.weather, entry.album_id, entry.id]).map_err(|e| e.to_string())?;
        if count == 0 { return Err("일기를 찾지 못했습니다.".into()); }
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn diary_roundtrip_and_album_move_preserve_other_entries() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::database::initialize(&mut conn).unwrap();
        conn.execute("INSERT INTO album(title) VALUES('졸업식')", []).unwrap();
        save(&conn, Entry { id: 0, date: "2026-09-27".into(), title: "오늘".into(), body: "긴 하루".into(), mood: "평온".into(), weather: "맑음".into(), album_id: None }).unwrap();
        save(&conn, Entry { id: 0, date: "2026-09-26".into(), title: "어제".into(), body: "".into(), mood: "기쁨".into(), weather: "비".into(), album_id: None }).unwrap();
        assign(&mut conn, vec![1], Some(1)).unwrap();
        assert_eq!(list(&conn).unwrap().iter().find(|e| e.id == 1).unwrap().album_id, Some(1));
        assert!(assign(&mut conn, vec![2], Some(999)).is_err());
        assert_eq!(list(&conn).unwrap().iter().find(|e| e.id == 2).unwrap().album_id, None);
        conn.execute("DELETE FROM album WHERE id=1", []).unwrap();
        assert_eq!(list(&conn).unwrap()[1].album_id, None);
        delete(&conn, 2).unwrap();
        assert_eq!(list(&conn).unwrap().len(), 1);
    }
}
