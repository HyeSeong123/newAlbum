use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const MODEL: &str = "face-api-1.7.15-ssd-68-resnet-v1";

#[derive(Serialize)]
pub struct FaceMatch { face_id: i64, person_id: i64 }

fn find_matches(conn: &Connection) -> Result<Vec<FaceMatch>, String> {
    let rows = conn.prepare("SELECT f.id, f.media_id, f.person_id, p.name, f.confirmed, f.descriptor FROM detected_face f JOIN person p ON p.id = f.person_id JOIN face_scan s ON s.media_id = f.media_id WHERE s.model_version = ?1 AND NOT EXISTS (SELECT 1 FROM excluded_face e WHERE e.face_id = f.id) ORDER BY f.id")
        .map_err(|e| e.to_string())?.query_map([MODEL], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?, row.get::<_, String>(3)?, row.get::<_, bool>(4)?, row.get::<_, String>(5)?)))
        .map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let rows: Vec<_> = rows.into_iter().filter_map(|(id, media, person, name, confirmed, json)| {
        let vector = serde_json::from_str::<Vec<f64>>(&json).ok()?;
        (vector.len() == 128 && vector.iter().all(|v| v.is_finite())).then_some((id, media, person, name, confirmed, vector))
    }).collect();
    let references: Vec<_> = rows.iter().filter(|r| !r.3.trim().is_empty()).collect();
    let mut proposals = Vec::new();
    for row in rows.iter().filter(|r| r.3.trim().is_empty() && !r.4) {
        let mut scores = std::collections::HashMap::<i64, f64>::new();
        for reference in &references {
            let distance = row.5.iter().zip(&reference.5).map(|(a, b)| (a - b).powi(2)).sum::<f64>().sqrt();
            scores.entry(reference.2).and_modify(|score| *score = score.min(distance)).or_insert(distance);
        }
        let mut scores: Vec<_> = scores.into_iter().collect();
        scores.sort_by(|a, b| a.1.total_cmp(&b.1).then(a.0.cmp(&b.0)));
        if let Some(&(target, distance)) = scores.first() {
            if distance < 0.45 && scores.get(1).map_or(true, |next| next.1 - distance > 0.06) {
                proposals.push((row.0, row.1, target, distance));
            }
        }
    }
    // Reserve each named person once per photo, including existing assignments.
    let mut occupied: std::collections::HashSet<_> = rows.iter().map(|r| (r.1, r.2)).collect();
    proposals.sort_by(|a, b| a.3.total_cmp(&b.3).then(a.0.cmp(&b.0)));
    Ok(proposals.into_iter().filter_map(|(id, media, target, _)| {
        occupied.insert((media, target)).then_some(FaceMatch { face_id: id, person_id: target })
    }).collect())
}

#[tauri::command]
pub async fn find_face_matches(app: AppHandle) -> Result<Vec<FaceMatch>, String> {
    tauri::async_runtime::spawn_blocking(move || find_matches(&super::open_database(&app)?))
        .await.map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
pub struct FaceInput {
    descriptor: Vec<f64>,
    thumbnail: String,
}

#[derive(Serialize)]
pub struct FaceRow {
    id: i64,
    media_id: i64,
    person_id: i64,
    thumbnail: String,
    confirmed: bool,
}

#[derive(Serialize)]
pub struct PersonRow { id: i64, name: String }

#[derive(Serialize)]
pub struct FaceIndex {
    people: Vec<PersonRow>,
    faces: Vec<FaceRow>,
    scanned: Vec<i64>,
}

fn read_index(conn: &Connection) -> Result<FaceIndex, String> {
    let people = conn.prepare("SELECT id, name FROM person WHERE EXISTS (SELECT 1 FROM detected_face WHERE person_id = person.id AND NOT EXISTS (SELECT 1 FROM excluded_face e WHERE e.face_id = detected_face.id)) ORDER BY id")
        .map_err(|e| e.to_string())?.query_map([], |row| Ok(PersonRow { id: row.get(0)?, name: row.get(1)? }))
        .map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let faces = conn.prepare("SELECT id, media_id, person_id, thumbnail, confirmed FROM detected_face WHERE NOT EXISTS (SELECT 1 FROM excluded_face e WHERE e.face_id = detected_face.id) ORDER BY id")
        .map_err(|e| e.to_string())?.query_map([], |row| Ok(FaceRow { id: row.get(0)?, media_id: row.get(1)?, person_id: row.get(2)?, thumbnail: row.get(3)?, confirmed: row.get(4)? }))
        .map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let scanned = conn.prepare("SELECT media_id FROM face_scan WHERE model_version = ?1")
        .map_err(|e| e.to_string())?.query_map([MODEL], |row| row.get(0))
        .map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(FaceIndex { people, faces, scanned })
}

#[tauri::command]
pub fn list_face_index(app: AppHandle) -> Result<FaceIndex, String> { read_index(&super::open_database(&app)?) }

fn save_scan(conn: &mut Connection, media_id: i64, faces: Vec<FaceInput>) -> Result<(), String> {
    if faces.len() > 100 || faces.iter().any(|face| face.descriptor.len() != 128 || face.descriptor.iter().any(|x| !x.is_finite()) || !face.thumbnail.starts_with("data:image/jpeg;base64,") || face.thumbnail.len() > 100_000) {
        return Err("얼굴 분석 결과가 올바르지 않습니다.".into());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let image: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM media WHERE id = ?1 AND file_type = 'image')", [media_id], |row| row.get(0)).map_err(|e| e.to_string())?;
    if !image { return Err("등록된 사진을 찾을 수 없습니다.".into()); }
    let scanned: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM face_scan WHERE media_id = ?1 AND model_version = ?2)", params![media_id, MODEL], |row| row.get(0)).map_err(|e| e.to_string())?;
    if scanned { return Ok(()); }
    tx.execute("DELETE FROM detected_face WHERE media_id = ?1", [media_id]).map_err(|e| e.to_string())?;
    let candidates = tx.prepare("SELECT person_id, descriptor FROM detected_face WHERE NOT EXISTS (SELECT 1 FROM excluded_face e WHERE e.face_id = detected_face.id) ORDER BY id")
        .map_err(|e| e.to_string())?.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let candidates: Vec<_> = candidates.into_iter().filter_map(|(id, json)| serde_json::from_str::<Vec<f64>>(&json).ok().map(|vector| (id, vector))).collect();
    let mut used = Vec::new();
    for face in faces {
        // A conservative distance and one person per photo reduce accidental merges.
        let mut scores: Vec<(i64, f64)> = Vec::new();
        for (id, vector) in &candidates {
            if used.contains(id) || vector.len() != 128 { continue; }
            let distance = vector.iter().zip(&face.descriptor).map(|(a, b)| (a - b).powi(2)).sum::<f64>().sqrt();
            if let Some(entry) = scores.iter_mut().find(|entry| entry.0 == *id) { entry.1 = entry.1.min(distance); }
            else { scores.push((*id, distance)); }
        }
        scores.sort_by(|a, b| a.1.total_cmp(&b.1));
        let person_id = match scores.first() {
            Some(&(id, distance)) if distance < 0.45 && scores.get(1).map_or(true, |next| next.1 - distance > 0.06) => id,
            _ => {
                tx.execute("INSERT INTO person (name, profile_type) VALUES ('', 'face')", []).map_err(|e| e.to_string())?;
                tx.last_insert_rowid()
            }
        };
        used.push(person_id);
        tx.execute("INSERT INTO detected_face (media_id, person_id, descriptor, thumbnail) VALUES (?1, ?2, ?3, ?4)", params![media_id, person_id, serde_json::to_string(&face.descriptor).map_err(|e| e.to_string())?, face.thumbnail]).map_err(|e| e.to_string())?;
    }
    tx.execute("INSERT OR REPLACE INTO face_scan (media_id, model_version) VALUES (?1, ?2)", params![media_id, MODEL]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_face_scan(app: AppHandle, media_id: i64, faces: Vec<FaceInput>) -> Result<(), String> {
    save_scan(&mut super::open_database(&app)?, media_id, faces)
}

#[tauri::command]
pub fn rename_face_person(app: AppHandle, id: i64, name: String) -> Result<(), String> {
    if name.trim().chars().count() > 80 { return Err("이름은 80자 이내로 입력해 주세요.".into()); }
    super::open_database(&app)?.execute("UPDATE person SET name = ?1 WHERE id = ?2", params![name.trim(), id]).map_err(|e| e.to_string())?;
    Ok(())
}

fn reassign(conn: &mut Connection, ids: Vec<i64>, target: Option<i64>) -> Result<(), String> {
    if ids.is_empty() { return Err("얼굴을 선택해 주세요.".into()); }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let person_id = match target {
        Some(id) => id,
        None => {
            tx.execute("INSERT INTO person (name, profile_type) VALUES ('', 'face')", []).map_err(|e| e.to_string())?;
            tx.last_insert_rowid()
        }
    };
    for id in ids {
        let count = tx.execute("UPDATE detected_face SET person_id = ?1, confirmed = 1 WHERE id = ?2", params![person_id, id]).map_err(|e| e.to_string())?;
        if count == 0 { return Err("얼굴을 찾을 수 없습니다.".into()); }
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_faces(app: AppHandle, ids: Vec<i64>, target: Option<i64>) -> Result<(), String> {
    reassign(&mut super::open_database(&app)?, ids, target)
}

fn set_excluded(conn: &mut Connection, ids: Vec<i64>, excluded: bool) -> Result<(), String> {
    if ids.is_empty() { return Err("얼굴을 선택해 주세요.".into()); }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for id in ids {
        if excluded {
            tx.execute("INSERT OR IGNORE INTO excluded_face (face_id) VALUES (?1)", [id]).map_err(|e| e.to_string())?;
        } else {
            tx.execute("DELETE FROM excluded_face WHERE face_id = ?1", [id]).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_faces_excluded(app: AppHandle, ids: Vec<i64>, excluded: bool) -> Result<(), String> {
    set_excluded(&mut super::open_database(&app)?, ids, excluded)
}

#[tauri::command]
pub fn clear_face_index(app: AppHandle) -> Result<(), String> {
    let mut conn = super::open_database(&app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM detected_face", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM person WHERE profile_type = 'face'", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM face_scan", []).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(include_str!("../database/schema.sql")).unwrap();
        for id in 1..=4 { conn.execute("INSERT INTO media (id, file_path, file_type, size_bytes) VALUES (?1, ?2, 'image', 1)", params![id, format!("photo{id}")]).unwrap(); }
        conn
    }
    fn face(value: f64) -> FaceInput { FaceInput { descriptor: vec![value; 128], thumbnail: "data:image/jpeg;base64,AA==".into() } }
    #[test]
    fn exclusion_hides_faces_without_removing_photos_and_can_be_undone() {
        let mut conn = database();
        save_scan(&mut conn, 1, vec![face(0.1)]).unwrap();
        let before = read_index(&conn).unwrap();
        let id = before.faces[0].id;
        set_excluded(&mut conn, vec![id], true).unwrap();
        let hidden = read_index(&conn).unwrap();
        assert!(hidden.faces.is_empty());
        assert!(hidden.people.is_empty());
        assert_eq!(hidden.scanned.len(), 1);
        assert!(find_matches(&conn).unwrap().is_empty());
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM media", [], |r| r.get::<_, i64>(0)).unwrap(), 4);
        save_scan(&mut conn, 2, vec![face(0.1)]).unwrap();
        assert_ne!(read_index(&conn).unwrap().faces[0].person_id, before.faces[0].person_id);
        set_excluded(&mut conn, vec![id], false).unwrap();
        assert_eq!(read_index(&conn).unwrap().faces.len(), 2);
        assert!(set_excluded(&mut conn, vec![id, 99999], true).is_err());
        assert_eq!(read_index(&conn).unwrap().faces.len(), 2);
    }
    #[test]
    fn named_references_suggest_only_unconfirmed_unnamed_faces() {
        let conn = database();
        conn.execute("INSERT INTO person (id, name, profile_type) VALUES (1, '아버님', 'face'), (2, '', 'face')", []).unwrap();
        for media in 1..=4 {
            conn.execute("INSERT INTO face_scan (media_id, model_version) VALUES (?1, ?2)", params![media, MODEL]).unwrap();
        }
        for (id, media, person, confirmed, value) in [(1, 1, 1, false, 0.1), (2, 2, 2, false, 0.11), (3, 3, 2, true, 0.11), (4, 1, 2, false, 0.11), (5, 4, 2, false, 0.9)] {
            conn.execute("INSERT INTO detected_face (id, media_id, person_id, confirmed, descriptor, thumbnail) VALUES (?1, ?2, ?3, ?4, ?5, 'data:image/jpeg;base64,AA==')",
                params![id, media, person, confirmed, serde_json::to_string(&vec![value; 128]).unwrap()]).unwrap();
        }
        let matches = find_matches(&conn).unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].face_id, 2);
        assert_eq!(matches[0].person_id, 1);
        assert_eq!(read_index(&conn).unwrap().faces[1].person_id, 2);
        // A competing named identity with a similar score must prevent a guess.
        conn.execute("INSERT INTO person (id, name, profile_type) VALUES (3, '다른 인물', 'face')", []).unwrap();
        conn.execute("INSERT INTO detected_face (media_id, person_id, descriptor, thumbnail) VALUES (3, 3, ?1, 'data:image/jpeg;base64,AA==')", [serde_json::to_string(&vec![0.115; 128]).unwrap()]).unwrap();
        assert!(find_matches(&conn).unwrap().is_empty());
    }
    #[test]
    fn grouping_resume_and_manual_moves() {
        let mut conn = database();
        save_scan(&mut conn, 1, vec![face(0.1), face(0.1)]).unwrap();
        let first = read_index(&conn).unwrap();
        assert_eq!(first.people.len(), 2);
        save_scan(&mut conn, 1, vec![face(0.9)]).unwrap();
        assert_eq!(read_index(&conn).unwrap().faces.len(), 2);
        save_scan(&mut conn, 2, vec![face(0.1)]).unwrap();
        assert_eq!(read_index(&conn).unwrap().people.len(), 3); // Ambiguous candidates stay separate.
        reassign(&mut conn, vec![first.faces[1].id], Some(first.people[0].id)).unwrap();
        assert!(read_index(&conn).unwrap().faces[1].confirmed);
        reassign(&mut conn, vec![first.faces[1].id], None).unwrap();
        save_scan(&mut conn, 3, vec![]).unwrap();
        assert_eq!(read_index(&conn).unwrap().scanned.len(), 3);
        conn.execute("DELETE FROM media WHERE id = 1", []).unwrap();
        assert_eq!(read_index(&conn).unwrap().faces.len(), 1);
    }
    #[test]
    fn matches_and_invalid_scan_rolls_back() {
        let mut conn = database();
        save_scan(&mut conn, 1, vec![face(0.1)]).unwrap();
        save_scan(&mut conn, 2, vec![face(0.11)]).unwrap();
        assert_eq!(read_index(&conn).unwrap().people.len(), 1);
        assert!(save_scan(&mut conn, 3, vec![FaceInput { descriptor: vec![], thumbnail: String::new() }]).is_err());
        assert_eq!(read_index(&conn).unwrap().scanned.len(), 2);
        let old = read_index(&conn).unwrap().faces[0].person_id;
        assert!(reassign(&mut conn, vec![1, 9999], None).is_err());
        assert_eq!(read_index(&conn).unwrap().faces[0].person_id, old);
    }
}
