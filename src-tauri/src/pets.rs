use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use tauri::AppHandle;

#[derive(Serialize)]
pub struct Pet {
    id: i64,
    name: String,
    cover_media_id: Option<i64>,
    media_ids: Vec<i64>,
}

#[tauri::command]
pub fn list_pets(app: AppHandle) -> Result<Vec<Pet>, String> {
    read_pets(&super::open_database(&app)?)
}

fn read_pets(conn: &Connection) -> Result<Vec<Pet>, String> {
    let mut pets = conn
        .prepare("SELECT id, name, cover_media_id FROM pet ORDER BY id")
        .map_err(|e| e.to_string())?
        .query_map([], |r| {
            Ok(Pet {
                id: r.get(0)?,
                name: r.get(1)?,
                cover_media_id: r.get(2)?,
                media_ids: vec![],
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut statement = conn
        .prepare("SELECT pet_id, media_id FROM pet_media ORDER BY pet_id, media_id")
        .map_err(|e| e.to_string())?;
    let rows = statement.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|e| e.to_string())?;
    let mut memberships: HashMap<i64, Vec<i64>> = HashMap::new();
    for row in rows {
        let (pet, media) = row.map_err(|e| e.to_string())?;
        memberships.entry(pet).or_default().push(media);
    }
    for pet in &mut pets {
        pet.media_ids = memberships.remove(&pet.id).unwrap_or_default();
    }
    Ok(pets)
}

pub(crate) fn save(
    conn: &mut Connection,
    id: Option<i64>,
    name: String,
    ids: Vec<i64>,
    cover: Option<i64>,
) -> Result<i64, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err("이름을 1~80자로 입력해 주세요.".into());
    }
    if cover.is_some_and(|id| !ids.contains(&id)) {
        return Err("대표 사진은 선택한 사진 중에서 지정해 주세요.".into());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let pet = match id {
        Some(id) => {
            if tx
                .execute(
                    "UPDATE pet SET name = ?1, cover_media_id = ?2 WHERE id = ?3",
                    params![name, cover, id],
                )
                .map_err(|e| e.to_string())?
                == 0
            {
                return Err("반려동물을 찾을 수 없습니다.".into());
            }
            id
        }
        None => {
            tx.execute(
                "INSERT INTO pet (name, cover_media_id) VALUES (?1, ?2)",
                params![name, cover],
            )
            .map_err(|e| e.to_string())?;
            tx.last_insert_rowid()
        }
    };
    // Preserve provenance for unchanged recognition links, even on name edits.
    let selected: HashSet<i64> = ids.iter().copied().collect();
    let existing = {
        let mut statement = tx.prepare("SELECT media_id FROM pet_media WHERE pet_id=?1").map_err(|e|e.to_string())?;
        let values = statement.query_map([pet], |row| row.get::<_,i64>(0)).map_err(|e|e.to_string())?
            .collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        values
    };
    for media in existing {
        if !selected.contains(&media) {
            tx.execute("DELETE FROM pet_media WHERE pet_id=?1 AND media_id=?2", params![pet,media]).map_err(|e|e.to_string())?;
        }
    }
    for media in ids {
        let image: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM media WHERE id = ?1 AND file_type = 'image')",
                [media],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !image {
            return Err("등록된 사진을 찾을 수 없습니다.".into());
        }
        tx.execute(
            "INSERT OR IGNORE INTO pet_media (pet_id, media_id) VALUES (?1, ?2)",
            params![pet, media],
        )
        .map_err(|e| e.to_string())?;
    }
    // A removed photo must no longer train this pet's recognition profile.
    tx.execute("UPDATE pet_detection SET pet_id=NULL WHERE pet_id=?1 AND NOT EXISTS
      (SELECT 1 FROM pet_media WHERE pet_id=?1 AND media_id=pet_detection.media_id)", [pet]).map_err(|e|e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(pet)
}

#[tauri::command]
pub fn save_pet(
    app: AppHandle,
    id: Option<i64>,
    name: String,
    media_ids: Vec<i64>,
    cover_media_id: Option<i64>,
) -> Result<i64, String> {
    save(
        &mut super::open_database(&app)?,
        id,
        name,
        media_ids,
        cover_media_id,
    )
}

#[tauri::command]
pub fn delete_pet(app: AppHandle, id: i64) -> Result<(), String> {
    super::open_database(&app)?
        .execute("DELETE FROM pet WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn batched_memberships_keep_pet_order_media_order_and_empty_pets() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::database::initialize(&mut conn).unwrap();
        conn.execute_batch("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'a','image',1),(2,'b','image',1),(3,'c','image',1);
            INSERT INTO pet(id,name) VALUES(2,'둘'),(1,'하나'),(3,'아직 없음');
            INSERT INTO pet_media VALUES(2,3),(1,2),(1,1),(2,1);").unwrap();
        let pets = read_pets(&conn).unwrap();
        assert_eq!(pets.iter().map(|p| p.id).collect::<Vec<_>>(), vec![1,2,3]);
        assert_eq!(pets.iter().map(|p| p.media_ids.clone()).collect::<Vec<_>>(), vec![vec![1,2],vec![1,3],vec![]]);
    }

    #[test]
    fn manual_links_preserve_originals_and_rollback_invalid_edits() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(include_str!("../database/schema.sql"))
            .unwrap();
        conn.execute_batch(include_str!("../database/pet-recognition.sql")).unwrap();
        conn.execute_batch("INSERT INTO media (id, file_path, file_type, size_bytes) VALUES (1, 'a', 'image', 1), (2, 'b', 'image', 1);").unwrap();
        let id = save(&mut conn, None, " 우리 강아지 ".into(), vec![1, 2], Some(2)).unwrap();
        assert_eq!(read_pets(&conn).unwrap()[0].name, "우리 강아지");
        assert!(save(&mut conn, Some(id), "변경".into(), vec![1, 999], Some(1)).is_err());
        assert_eq!(read_pets(&conn).unwrap()[0].media_ids.len(), 2);
        save(&mut conn, Some(id), "우리 강아지".into(), vec![2], Some(2)).unwrap();
        conn.execute("DELETE FROM pet WHERE id = ?1", [id]).unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM media", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM pet_media", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
}
