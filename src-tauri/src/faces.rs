use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

pub(crate) const MODEL: &str = "face-api-1.7.15-ssd-68-resnet-v1";

#[derive(Serialize)]
pub struct FaceMatch {
    face_id: i64,
    person_id: i64,
    state: String,
    candidates: Vec<super::person_engine::Candidate>,
}

fn find_matches(conn: &Connection) -> Result<Vec<FaceMatch>, String> {
    let rows = conn.prepare("SELECT f.id,f.media_id,f.person_id,p.name,f.confirmed,f.descriptor,COALESCE(m.reference_kind,CASE WHEN f.id=(SELECT MIN(id) FROM detected_face WHERE person_id=f.person_id) THEN 'seed' ELSE 'auto' END) FROM detected_face f JOIN person p ON p.id=f.person_id JOIN face_scan s ON s.media_id=f.media_id LEFT JOIN person_face_metadata m ON m.face_id=f.id WHERE s.model_version=?1 AND COALESCE(m.model_version,s.model_version)=?1 AND NOT EXISTS(SELECT 1 FROM excluded_face e WHERE e.face_id=f.id) AND NOT EXISTS(SELECT 1 FROM person_scan_issue i WHERE i.media_id=f.media_id) ORDER BY f.id")
      .map_err(|e|e.to_string())?.query_map([MODEL],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,i64>(1)?,r.get::<_,i64>(2)?,r.get::<_,String>(3)?,r.get::<_,bool>(4)?,r.get::<_,String>(5)?,r.get::<_,String>(6)?)))
      .map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    let rows:Vec<_>=rows.into_iter().filter_map(|(id,media,person,name,confirmed,json,kind)|{let vector=serde_json::from_str::<Vec<f64>>(&json).ok()?;(vector.len()==128 && vector.iter().all(|x|x.is_finite())).then_some((id,media,person,name,confirmed,vector,kind))}).collect();
    let confirmed:std::collections::HashSet<_>=rows.iter().filter(|r|r.4 && !r.3.trim().is_empty()).map(|r|r.2).collect();
    let mut reference_photos=std::collections::HashSet::new();
    let mut reference_counts=std::collections::HashMap::<i64,usize>::new();
    let references:Vec<_>=rows.iter().rev().filter(|r|!r.3.trim().is_empty() && (r.4 || (!confirmed.contains(&r.2) && r.6=="seed"))).filter_map(|r|{
      let count=reference_counts.entry(r.2).or_default();
      if *count>=32 || !reference_photos.insert((r.2,r.1)) {return None;}
      *count+=1;Some((r.2,r.5.clone()))
    }).collect();
    let occupied:std::collections::HashSet<_>=rows.iter().map(|r|(r.1,r.2)).collect();
    let mut proposals=Vec::new();
    for row in rows.iter().filter(|r|r.3.trim().is_empty() && !r.4) {
      let candidates:Vec<_>=super::person_engine::rank(&row.5,&references).into_iter().filter(|c|c.distance<0.6 && !occupied.contains(&(row.1,c.person_id))).take(3).collect();
      if let Some(best)=candidates.first() {proposals.push(FaceMatch{face_id:row.0,person_id:best.person_id,state:"needs-review".into(),candidates});}
    }
    Ok(proposals)
}

#[tauri::command]
pub async fn find_face_matches(app: AppHandle) -> Result<Vec<FaceMatch>, String> {
    tauri::async_runtime::spawn_blocking(move || {let conn=super::open_database(&app)?;super::person_engine::audit_references(&conn)?;find_matches(&conn)})
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
pub struct FaceInput {
    descriptor: Vec<f64>,
    thumbnail: String,
    #[serde(default, rename="modelVersion")]
    model_version: Option<String>,
    #[serde(default)]
    quality: Option<String>,
    #[serde(default, rename="box")]
    box_: Option<[f64;4]>,
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
pub struct PersonRow {
    id: i64,
    name: String,
    cover_face_id: Option<i64>,
}

#[derive(Serialize)]
pub struct FaceIndex {
    people: Vec<PersonRow>,
    faces: Vec<FaceRow>,
    scanned: Vec<i64>,
}

fn read_index(conn: &Connection) -> Result<FaceIndex, String> {
    let people = conn.prepare("SELECT id, name, cover_face_id FROM person WHERE EXISTS (SELECT 1 FROM detected_face WHERE person_id = person.id AND NOT EXISTS (SELECT 1 FROM excluded_face e WHERE e.face_id = detected_face.id)) ORDER BY id")
        .map_err(|e| e.to_string())?.query_map([], |row| Ok(PersonRow { id: row.get(0)?, name: row.get(1)?, cover_face_id: row.get(2)? }))
        .map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let faces = conn.prepare("SELECT id, media_id, person_id, thumbnail, confirmed FROM detected_face WHERE NOT EXISTS (SELECT 1 FROM excluded_face e WHERE e.face_id = detected_face.id) ORDER BY id")
        .map_err(|e| e.to_string())?.query_map([], |row| Ok(FaceRow { id: row.get(0)?, media_id: row.get(1)?, person_id: row.get(2)?, thumbnail: row.get(3)?, confirmed: row.get(4)? }))
        .map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let scanned = conn
        .prepare("SELECT media_id FROM face_scan WHERE model_version = ?1")
        .map_err(|e| e.to_string())?
        .query_map([MODEL], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(FaceIndex {
        people,
        faces,
        scanned,
    })
}

#[tauri::command]
pub fn list_face_index(app: AppHandle) -> Result<FaceIndex, String> {
    read_index(&super::open_database(&app)?)
}

#[cfg(test)]
fn save_scan(conn: &mut Connection, media_id: i64, faces: Vec<FaceInput>) -> Result<(), String> { save_scan_with_source(conn,media_id,faces,None) }
fn save_scan_with_source(conn: &mut Connection, media_id: i64, faces: Vec<FaceInput>,source_key:Option<String>) -> Result<(), String> {
    if faces.len() > 100
        || faces.iter().any(|face| {
            face.descriptor.len() != 128
                || face.descriptor.iter().any(|x| !x.is_finite())
                || !face.thumbnail.starts_with("data:image/jpeg;base64,")
                || face.thumbnail.len() > 100_000
                || face.model_version.as_deref().is_some_and(|m|m!=MODEL)
                || face.quality.as_deref().is_some_and(|q|q!="usable" && q!="review")
                || face.box_.is_some_and(|b| !b.iter().all(|v|v.is_finite() && *v>=0.0 && *v<=1.00001) || b[2]<=0.0 || b[3]<=0.0 || b[0]+b[2]>1.00001 || b[1]+b[3]>1.00001)
        })
    {
        return Err("얼굴 분석 결과가 올바르지 않습니다.".into());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let image: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM media WHERE id = ?1 AND file_type = 'image')",
            [media_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !image {
        return Err("등록된 사진을 찾을 수 없습니다.".into());
    }
    let scanned: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM face_scan WHERE media_id = ?1 AND model_version = ?2)",
            params![media_id, MODEL],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if scanned {
        return Ok(());
    }
    let existing: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM face_scan WHERE media_id=?1) OR EXISTS(SELECT 1 FROM detected_face WHERE media_id=?1)",[media_id],|r|r.get(0)).map_err(|e|e.to_string())?;
    if existing { return Err("기존 얼굴 연결을 보존했습니다. 모델 재추출에는 별도 연결 마이그레이션이 필요합니다.".into()); }
    let candidates = tx.prepare("SELECT f.person_id,f.descriptor FROM detected_face f JOIN face_scan s ON s.media_id=f.media_id LEFT JOIN person_face_metadata m ON m.face_id=f.id WHERE s.model_version=?1 AND COALESCE(m.model_version,s.model_version)=?1 AND (m.quality='usable' OR m.geometry IN ('{}','null') OR m.face_id IS NULL) AND (m.reference_kind='seed' OR (m.face_id IS NULL AND f.id=(SELECT MIN(id) FROM detected_face WHERE person_id=f.person_id))) AND NOT EXISTS (SELECT 1 FROM excluded_face e WHERE e.face_id=f.id) AND NOT EXISTS(SELECT 1 FROM person_scan_issue i WHERE i.media_id=f.media_id) ORDER BY f.id")
        .map_err(|e| e.to_string())?.query_map([MODEL], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let candidates: Vec<_> = candidates
        .into_iter()
        .filter_map(|(id, json)| {
            serde_json::from_str::<Vec<f64>>(&json)
                .ok()
                .filter(|v|v.len()==128 && v.iter().all(|x|x.is_finite()))
                .map(|vector| (id, vector))
        })
        .collect();
    let mut used = Vec::new();
    for face in faces {
        // A conservative distance and one person per photo reduce accidental merges.
        let mut scores: Vec<(i64, f64)> = Vec::new();
        for (id, vector) in &candidates {
            if used.contains(id) || vector.len() != 128 {
                continue;
            }
            let distance = vector
                .iter()
                .zip(&face.descriptor)
                .map(|(a, b)| (a - b).powi(2))
                .sum::<f64>()
                .sqrt();
            if let Some(entry) = scores.iter_mut().find(|entry| entry.0 == *id) {
                entry.1 = entry.1.min(distance);
            } else {
                scores.push((*id, distance));
            }
        }
        scores.sort_by(|a, b| a.1.total_cmp(&b.1));
        let person_id = match scores.first() {
            Some(&(id, distance))
                if face.quality.as_deref()!=Some("review") && distance < 0.45
                    && scores.get(1).map_or(true, |next| next.1 - distance > 0.06) =>
            {
                id
            }
            _ => {
                tx.execute(
                    "INSERT INTO person (name, profile_type) VALUES ('', 'face')",
                    [],
                )
                .map_err(|e| e.to_string())?;
                tx.last_insert_rowid()
            }
        };
        let is_seed = !candidates.iter().any(|(id,_)|*id==person_id);
        used.push(person_id);
        tx.execute("INSERT INTO detected_face (media_id, person_id, descriptor, thumbnail) VALUES (?1, ?2, ?3, ?4)", params![media_id, person_id, serde_json::to_string(&face.descriptor).map_err(|e| e.to_string())?, face.thumbnail]).map_err(|e| e.to_string())?;
        let id=tx.last_insert_rowid();
        tx.execute("INSERT INTO person_face_metadata(face_id,model_version,reference_kind,quality,geometry) VALUES(?1,?2,?3,?4,?5)",params![id,MODEL,if is_seed {"seed"} else {"auto"},face.quality.unwrap_or_else(||"review".into()),serde_json::to_string(&face.box_).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
    }
    tx.execute(
        "INSERT OR REPLACE INTO face_scan (media_id, model_version) VALUES (?1, ?2)",
        params![media_id, MODEL],
    )
    .map_err(|e| e.to_string())?;
    if let Some(key)=source_key {tx.execute("INSERT INTO person_scan_metadata(media_id,source_key,engine_version) VALUES(?1,?2,'gamjassak-people-v1')",params![media_id,key]).map_err(|e|e.to_string())?;}
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_face_scan(app: AppHandle, media_id: i64, faces: Vec<FaceInput>, source_key: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move|| {
      let mut conn=super::open_database(&app)?;
      // Old callers remain compatible; the new engine always supplies a content key.
      if let Some(ref key)=source_key {super::pet_recognition::verify_source(&conn,media_id,key)?;}
      if source_key.is_some() {super::person_engine::source(&conn,media_id)?;}
      save_scan_with_source(&mut conn,media_id,faces,source_key)?;
      Ok(())
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub fn rename_face_person(app: AppHandle, id: i64, name: String) -> Result<(), String> {
    if name.trim().chars().count() > 80 {
        return Err("이름은 80자 이내로 입력해 주세요.".into());
    }
    rename_person(&mut super::open_database(&app)?,id,&name)
}

fn rename_person(conn:&mut Connection,id:i64,name:&str)->Result<(),String>{
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    tx.execute("UPDATE person SET name=?1 WHERE id=?2",params![name.trim(),id]).map_err(|e|e.to_string())?;
    // The displayed cover is an explicit exemplar. Renaming must not promote
    // the entire automatically assigned group into trusted references.
    if !name.trim().is_empty() {tx.execute("UPDATE detected_face SET confirmed=1 WHERE person_id=?1 AND id=COALESCE((SELECT cover_face_id FROM person WHERE id=?1),(SELECT MIN(id) FROM detected_face WHERE person_id=?1 AND NOT EXISTS(SELECT 1 FROM excluded_face WHERE face_id=detected_face.id)))",[id]).map_err(|e|e.to_string())?;}
    tx.commit().map_err(|e|e.to_string())?;
    Ok(())
}

fn set_cover_face(conn: &Connection, person_id: i64, face_id: i64) -> Result<(), String> {
    let belongs: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM detected_face WHERE id = ?1 AND person_id = ?2 AND NOT EXISTS (SELECT 1 FROM excluded_face WHERE face_id = detected_face.id))",
        params![face_id, person_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if !belongs {
        return Err("이 인물에 등록된 얼굴을 선택해 주세요.".into());
    }
    conn.execute(
        "UPDATE person SET cover_face_id = ?1 WHERE id = ?2",
        params![face_id, person_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("UPDATE detected_face SET confirmed=1 WHERE id=?1",[face_id]).map_err(|e|e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_person_cover_face(app: AppHandle, person_id: i64, face_id: i64) -> Result<(), String> {
    set_cover_face(&super::open_database(&app)?, person_id, face_id)
}

fn reassign(conn: &mut Connection, ids: Vec<i64>, target: Option<i64>) -> Result<(), String> {
    if ids.is_empty() {
        return Err("얼굴을 선택해 주세요.".into());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let person_id = match target {
        Some(id) => id,
        None => {
            tx.execute(
                "INSERT INTO person (name, profile_type) VALUES ('', 'face')",
                [],
            )
            .map_err(|e| e.to_string())?;
            tx.last_insert_rowid()
        }
    };
    for id in ids {
        tx.execute(
            "UPDATE person SET cover_face_id = NULL WHERE cover_face_id = ?1 AND id<>?2",
            params![id,person_id],
        )
        .map_err(|e| e.to_string())?;
        let count = tx
            .execute(
                "UPDATE detected_face SET person_id = ?1, confirmed = 1 WHERE id = ?2",
                params![person_id, id],
            )
            .map_err(|e| e.to_string())?;
        if count == 0 {
            return Err("얼굴을 찾을 수 없습니다.".into());
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_faces(app: AppHandle, ids: Vec<i64>, target: Option<i64>) -> Result<(), String> {
    reassign(&mut super::open_database(&app)?, ids, target)
}

fn set_excluded(conn: &mut Connection, ids: Vec<i64>, excluded: bool) -> Result<(), String> {
    if ids.is_empty() {
        return Err("얼굴을 선택해 주세요.".into());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for id in ids {
        if excluded {
            tx.execute(
                "INSERT OR IGNORE INTO excluded_face (face_id) VALUES (?1)",
                [id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            tx.execute("DELETE FROM excluded_face WHERE face_id = ?1", [id])
                .map_err(|e| e.to_string())?;
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
    tx.execute("DELETE FROM person_evaluation_sample", []).map_err(|e|e.to_string())?;
    tx.execute("DELETE FROM detected_face", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM person WHERE profile_type = 'face'", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM person_analysis_job", []).map_err(|e|e.to_string())?;
    tx.execute("DELETE FROM face_scan", [])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(include_str!("../database/schema.sql"))
            .unwrap();
        for id in 1..=4 {
            conn.execute("INSERT INTO media (id, file_path, file_type, size_bytes) VALUES (?1, ?2, 'image', 1)", params![id, format!("photo{id}")]).unwrap();
        }
        conn
    }
    fn face(value: f64) -> FaceInput {
        FaceInput {
            descriptor: vec![value; 128],
            thumbnail: "data:image/jpeg;base64,AA==".into(),
            model_version: None, quality: None, box_: None,
        }
    }
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
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM media", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            4
        );
        save_scan(&mut conn, 2, vec![face(0.1)]).unwrap();
        assert_ne!(
            read_index(&conn).unwrap().faces[0].person_id,
            before.faces[0].person_id
        );
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
            conn.execute(
                "INSERT INTO face_scan (media_id, model_version) VALUES (?1, ?2)",
                params![media, MODEL],
            )
            .unwrap();
        }
        for (id, media, person, confirmed, value) in [
            (1, 1, 1, false, 0.1),
            (2, 2, 2, false, 0.11),
            (3, 3, 2, true, 0.11),
            (4, 1, 2, false, 0.11),
            (5, 4, 2, false, 0.9),
        ] {
            conn.execute("INSERT INTO detected_face (id, media_id, person_id, confirmed, descriptor, thumbnail) VALUES (?1, ?2, ?3, ?4, ?5, 'data:image/jpeg;base64,AA==')",
                params![id, media, person, confirmed, serde_json::to_string(&vec![value; 128]).unwrap()]).unwrap();
        }
        let matches = find_matches(&conn).unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].face_id, 2);
        assert_eq!(matches[0].person_id, 1);
        assert_eq!(read_index(&conn).unwrap().faces[1].person_id, 2);
        // Ambiguity is offered for explicit review, never an automatic write.
        conn.execute(
            "INSERT INTO person (id, name, profile_type) VALUES (3, '다른 인물', 'face')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO detected_face (media_id, person_id, descriptor, thumbnail) VALUES (3, 3, ?1, 'data:image/jpeg;base64,AA==')", [serde_json::to_string(&vec![0.115; 128]).unwrap()]).unwrap();
        let ambiguous=find_matches(&conn).unwrap();
        assert_eq!(ambiguous[0].candidates.len(),2);
        assert_eq!(ambiguous[0].state,"needs-review");
    }
    #[test]
    fn quarantine_blocks_both_suggestions_and_automatic_linking() {
        let mut conn=database();save_scan(&mut conn,1,vec![face(0.1)]).unwrap();
        let original=read_index(&conn).unwrap().faces[0].person_id;
        conn.execute("UPDATE person SET name='family' WHERE id=?1",[original]).unwrap();
        let mut uncertain=face(0.11);uncertain.quality=Some("review".into());uncertain.box_=Some([0.0,0.0,0.1,0.1]);
        save_scan(&mut conn,2,vec![uncertain]).unwrap();assert_eq!(find_matches(&conn).unwrap().len(),1);
        conn.execute("INSERT INTO person_scan_issue(media_id,state) VALUES(1,'source_changed')",[]).unwrap();
        assert!(find_matches(&conn).unwrap().is_empty());save_scan(&mut conn,3,vec![face(0.1)]).unwrap();
        let index=read_index(&conn).unwrap();assert_eq!(index.faces.len(),3);assert_eq!(index.faces[0].person_id,original);assert_ne!(index.faces[2].person_id,original);
        conn.execute("DELETE FROM person_scan_issue",[]).unwrap();assert!(!find_matches(&conn).unwrap().is_empty());
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
        assert!(save_scan(
            &mut conn,
            3,
            vec![FaceInput {
                descriptor: vec![],
                thumbnail: String::new(), model_version:None,quality:None,box_:None
            }]
        )
        .is_err());
        assert_eq!(read_index(&conn).unwrap().scanned.len(), 2);
        let old = read_index(&conn).unwrap().faces[0].person_id;
        assert!(reassign(&mut conn, vec![1, 9999], None).is_err());
        assert_eq!(read_index(&conn).unwrap().faces[0].person_id, old);
    }

    #[test]
    fn person_cover_must_belong_to_the_person_and_clears_when_moved() {
        let mut conn = database();
        save_scan(&mut conn, 1, vec![face(0.1)]).unwrap();
        save_scan(&mut conn, 2, vec![face(0.9)]).unwrap();
        let index = read_index(&conn).unwrap();
        let person = index.people[0].id;
        let own_face = index
            .faces
            .iter()
            .find(|face| face.person_id == person)
            .unwrap()
            .id;
        let other_face = index
            .faces
            .iter()
            .find(|face| face.person_id != person)
            .unwrap()
            .id;
        set_cover_face(&conn, person, own_face).unwrap();
        assert_eq!(
            read_index(&conn)
                .unwrap()
                .people
                .iter()
                .find(|row| row.id == person)
                .unwrap()
                .cover_face_id,
            Some(own_face)
        );
        assert!(set_cover_face(&conn, person, other_face).is_err());
        reassign(&mut conn, vec![own_face], Some(index.people[1].id)).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT cover_face_id FROM person WHERE id = ?1",
                [person],
                |row| row.get::<_, Option<i64>>(0)
            )
            .unwrap(),
            None
        );
    }
    #[test]
    fn model_change_preserves_existing_ids_and_vectors() {
        let mut c=database();save_scan(&mut c,1,vec![face(0.1)]).unwrap();
        let id=read_index(&c).unwrap().faces[0].id;
        c.execute("UPDATE face_scan SET model_version='future-model' WHERE media_id=1",[]).unwrap();
        assert!(save_scan(&mut c,1,vec![face(0.9)]).is_err());
        assert_eq!(read_index(&c).unwrap().faces[0].id,id);
        save_scan(&mut c,2,vec![face(0.1)]).unwrap();
        assert_ne!(read_index(&c).unwrap().faces[0].person_id,read_index(&c).unwrap().faces[1].person_id);
    }
    #[test]
    fn uncertain_faces_cannot_auto_link_or_seed_future_links() {
        let mut c=database();let mut uncertain=face(0.1);uncertain.model_version=Some(MODEL.into());uncertain.quality=Some("review".into());uncertain.box_=Some([0.1,0.1,0.2,0.2]);
        save_scan(&mut c,1,vec![uncertain]).unwrap();let mut next=face(0.1);next.quality=Some("usable".into());next.box_=Some([0.1,0.1,0.2,0.2]);save_scan(&mut c,2,vec![next]).unwrap();
        assert_eq!(read_index(&c).unwrap().people.len(),2);
    }
    #[test]
    fn automatically_added_face_does_not_expand_matching_boundary() {
        let mut c=database();save_scan(&mut c,1,vec![face(0.1)]).unwrap();save_scan(&mut c,2,vec![face(0.13)]).unwrap();
        assert_eq!(read_index(&c).unwrap().people.len(),1);
        // Close to the automatic descendant, outside the original seed radius.
        save_scan(&mut c,3,vec![face(0.16)]).unwrap();assert_eq!(read_index(&c).unwrap().people.len(),2);
    }
    #[test]
    fn unknown_descriptor_model_is_rejected_before_storage() {
        let mut c=database();let mut wrong=face(0.1);wrong.model_version=Some("same-dimension-other-model".into());
        assert!(save_scan(&mut c,1,vec![wrong]).is_err());assert!(read_index(&c).unwrap().faces.is_empty());assert!(read_index(&c).unwrap().scanned.is_empty());
    }

    #[test]
    fn naming_only_confirms_cover_and_explicit_confirmation_preserves_cover(){
      let mut c=database();save_scan(&mut c,1,vec![face(0.1)]).unwrap();save_scan(&mut c,2,vec![face(0.11)]).unwrap();
      let rows=read_index(&c).unwrap().faces;let person=rows[0].person_id;let cover=rows[0].id;
      set_cover_face(&c,person,cover).unwrap();rename_person(&mut c,person,"가족").unwrap();
      let index=read_index(&c).unwrap();assert!(index.faces[0].confirmed);assert!(!index.faces[1].confirmed);
      reassign(&mut c,vec![rows[1].id,cover],Some(person)).unwrap();let index=read_index(&c).unwrap();assert!(index.faces.iter().all(|f|f.confirmed));assert_eq!(index.people[0].cover_face_id,Some(cover));
    }

}
