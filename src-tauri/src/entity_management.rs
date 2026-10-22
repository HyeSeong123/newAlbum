//! Scoped classification edits: no command in this module deletes source media.
use rusqlite::{params, Connection};
use tauri::AppHandle;
use serde::Serialize;

fn destination(tx: &Connection, table: &str, target: Option<i64>, name: Option<String>) -> Result<i64, String> {
    if let Some(id) = target {
        let exists: bool = tx.query_row(&format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id=?1)"), [id], |r| r.get(0)).map_err(|e| e.to_string())?;
        if !exists { return Err("지정할 대상을 찾을 수 없습니다.".into()); }
        return Ok(id);
    }
    let name = name.unwrap_or_default();
    let name = name.trim();
    if name.chars().count() > 80 { return Err("이름은 80자 이내로 입력해 주세요.".into()); }
    if table == "person" {
        tx.execute("INSERT INTO person(name,profile_type) VALUES(?1,'manual')", [name]).map_err(|e|e.to_string())?;
    } else {
        if name.is_empty() { return Err("반려동물 이름을 입력해 주세요.".into()); }
        tx.execute("INSERT INTO pet(name) VALUES(?1)", [name]).map_err(|e|e.to_string())?;
    }
    Ok(tx.last_insert_rowid())
}
fn valid_ids(ids: &[i64]) -> Result<(), String> {
    if ids.is_empty() || ids.len() > 10000 { return Err("변경할 대상을 1~10000개 선택해 주세요.".into()); }
    Ok(())
}
fn assign_faces(conn: &mut Connection, ids: Vec<i64>, target: Option<i64>, name: Option<String>) -> Result<i64,String> {
    valid_ids(&ids)?;
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    let named=target.is_some() || name.as_ref().is_some_and(|n|!n.trim().is_empty());
    let destination=destination(&tx,"person",target,name)?;
    for id in ids {
        tx.execute("UPDATE person SET cover_face_id=NULL WHERE cover_face_id=?1 AND id<>?2",params![id,destination]).map_err(|e|e.to_string())?;
        if tx.execute("UPDATE detected_face SET person_id=?1,confirmed=?2 WHERE id=?3 AND NOT EXISTS(SELECT 1 FROM excluded_face WHERE face_id=?3)",params![destination,named,id]).map_err(|e|e.to_string())? != 1 { return Err("선택한 얼굴이 변경되었습니다. 목록을 다시 확인해 주세요.".into()); }
    }
    tx.execute("UPDATE person SET cover_media_id=NULL WHERE cover_media_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM person_photo WHERE person_id=person.id AND media_id=person.cover_media_id) AND NOT EXISTS(SELECT 1 FROM detected_face f WHERE f.person_id=person.id AND f.media_id=person.cover_media_id AND NOT EXISTS(SELECT 1 FROM excluded_face WHERE face_id=f.id))",[]).map_err(|e|e.to_string())?;
    tx.commit().map_err(|e|e.to_string())?; Ok(destination)
}
#[tauri::command]
pub fn assign_person_faces(app: AppHandle, ids: Vec<i64>, target: Option<i64>, name: Option<String>) -> Result<i64,String> { assign_faces(&mut super::open_database(&app)?,ids,target,name) }

fn edit_links(conn: &mut Connection, kind: &str, source: i64, ids: Vec<i64>, action: &str, target: Option<i64>, name: Option<String>) -> Result<Option<i64>,String> {
    valid_ids(&ids)?;
    if !["move","unknown","exclude"].contains(&action) { return Err("지원하지 않는 분류 작업입니다.".into()); }
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    let person=kind=="person";
    let table=if person {"person_photo"} else {"pet_media"};
    let key=if person {"person_id"} else {"pet_id"};
    let detection=if person {"detected_face"} else {"pet_detection"};
    let dest=if action=="move" {Some(destination(&tx,kind,target,name)?)} else if action=="unknown" && person {Some(destination(&tx,"person",None,None)?)} else {None};
    if dest==Some(source) { return Err("다른 대상을 선택해 주세요.".into()); }
    for media in ids {
        let belongs:bool=tx.query_row(&format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE {key}=?1 AND media_id=?2) OR EXISTS(SELECT 1 FROM {detection} WHERE {key}=?1 AND media_id=?2)"),params![source,media],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !belongs {return Err("선택한 사진의 연결이 변경되었습니다. 목록을 다시 확인해 주세요.".into());}
        if person {
            if let Some(dest)=dest {
                tx.execute("UPDATE detected_face SET person_id=?1,confirmed=?2 WHERE person_id=?3 AND media_id=?4 AND NOT EXISTS(SELECT 1 FROM excluded_face WHERE face_id=detected_face.id)",params![dest,action=="move",source,media]).map_err(|e|e.to_string())?;
                tx.execute("INSERT OR IGNORE INTO person_photo SELECT ?1,media_id FROM person_photo WHERE person_id=?2 AND media_id=?3",params![dest,source,media]).map_err(|e|e.to_string())?;
            } else {
                tx.execute("INSERT OR IGNORE INTO excluded_face SELECT id FROM detected_face WHERE person_id=?1 AND media_id=?2",params![source,media]).map_err(|e|e.to_string())?;
            }
        } else {
            if let Some(dest)=dest {
                let mixed:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM pet_detection a JOIN pet_detection b ON b.pet_id=?2 AND b.media_id=?3 AND b.excluded=0 WHERE a.pet_id=?1 AND a.excluded=0 AND json_extract(a.features,'$.kind')<>json_extract(b.features,'$.kind'))",params![dest,source,media],|r|r.get(0)).map_err(|e|e.to_string())?;
                if mixed {return Err("개와 고양이를 같은 반려동물로 연결할 수 없습니다.".into());}
            }
            let changed=tx.execute("UPDATE pet_detection SET pet_id=?1,excluded=?2 WHERE pet_id=?3 AND media_id=?4",params![dest,action=="exclude",source,media]).map_err(|e|e.to_string())?;
            if action=="unknown" && changed==0 {tx.execute("INSERT OR IGNORE INTO unidentified_pet_photo(media_id) VALUES(?1)",[media]).map_err(|e|e.to_string())?;}
            if let Some(dest)=dest {tx.execute("INSERT OR IGNORE INTO pet_media(pet_id,media_id) VALUES(?1,?2)",params![dest,media]).map_err(|e|e.to_string())?;}
        }
        tx.execute(&format!("DELETE FROM {table} WHERE {key}=?1 AND media_id=?2"),params![source,media]).map_err(|e|e.to_string())?;
    }
    if person {
        tx.execute("UPDATE person SET cover_face_id=NULL WHERE id=?1 AND cover_face_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM detected_face f WHERE f.id=person.cover_face_id AND f.person_id=?1 AND NOT EXISTS(SELECT 1 FROM excluded_face WHERE face_id=f.id))",[source]).map_err(|e|e.to_string())?;
        tx.execute("UPDATE person SET cover_media_id=NULL WHERE id=?1 AND cover_media_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM person_photo WHERE person_id=?1 AND media_id=person.cover_media_id) AND NOT EXISTS(SELECT 1 FROM detected_face f WHERE f.person_id=?1 AND f.media_id=person.cover_media_id AND NOT EXISTS(SELECT 1 FROM excluded_face WHERE face_id=f.id))",[source]).map_err(|e|e.to_string())?;
    } else {tx.execute("UPDATE pet SET cover_media_id=NULL WHERE id=?1 AND NOT EXISTS(SELECT 1 FROM pet_media WHERE pet_id=?1 AND media_id=pet.cover_media_id)",[source]).map_err(|e|e.to_string())?;}
    tx.commit().map_err(|e|e.to_string())?;Ok(dest)
}
#[tauri::command]
pub fn edit_entity_photo_links(app:AppHandle,kind:String,source:i64,ids:Vec<i64>,action:String,target:Option<i64>,name:Option<String>)->Result<Option<i64>,String>{
    if !["person","pet"].contains(&kind.as_str()){return Err("대상을 확인해 주세요.".into());}
    edit_links(&mut super::open_database(&app)?,&kind,source,ids,&action,target,name)
}
fn assign_detections(conn:&mut Connection,ids:Vec<i64>,target:Option<i64>,name:Option<String>)->Result<i64,String>{
    valid_ids(&ids)?;
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    let dest=destination(&tx,"pet",target,name)?;
    for id in ids {
        if id<0 {
            let media=id.checked_neg().ok_or("사진을 확인해 주세요.")?;
            if tx.execute("DELETE FROM unidentified_pet_photo WHERE media_id=?1",[media]).map_err(|e|e.to_string())?!=1{return Err("미확인 사진의 분류가 변경되었습니다.".into());}
            tx.execute("INSERT OR IGNORE INTO pet_media(pet_id,media_id) VALUES(?1,?2)",params![dest,media]).map_err(|e|e.to_string())?;
            continue;
        }
        let media:i64=tx.query_row("SELECT media_id FROM pet_detection WHERE id=?1 AND pet_id IS NULL AND excluded=0",[id],|r|r.get(0)).map_err(|_|"선택한 반려동물의 분류가 변경되었습니다.".to_string())?;
        let mixed:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM pet_detection a JOIN pet_detection b ON b.id=?2 WHERE a.pet_id=?1 AND a.excluded=0 AND json_extract(a.features,'$.kind')<>json_extract(b.features,'$.kind'))",params![dest,id],|r|r.get(0)).map_err(|e|e.to_string())?;
        if mixed {return Err("개와 고양이를 같은 반려동물로 연결할 수 없습니다.".into());}
        tx.execute("UPDATE pet_detection SET pet_id=?1 WHERE id=?2",params![dest,id]).map_err(|e|e.to_string())?;
        let inserted=tx.execute("INSERT OR IGNORE INTO pet_media(pet_id,media_id) VALUES(?1,?2)",params![dest,media]).map_err(|e|e.to_string())?;
        if inserted>0 {tx.execute("INSERT OR IGNORE INTO pet_recognition_link(pet_id,media_id) VALUES(?1,?2)",params![dest,media]).map_err(|e|e.to_string())?;}
    }
    tx.commit().map_err(|e|e.to_string())?;Ok(dest)
}
#[tauri::command]
pub async fn assign_pet_detections(app:AppHandle,ids:Vec<i64>,target:Option<i64>,name:Option<String>)->Result<i64,String>{
    tauri::async_runtime::spawn_blocking(move || {
        valid_ids(&ids)?;
        let mut conn=super::open_database(&app)?;
        let mut verified=std::collections::HashSet::new();
        for id in &ids {if *id>0 {
            let media:i64=conn.query_row("SELECT media_id FROM pet_detection WHERE id=?1",[id],|r|r.get(0)).map_err(|e|e.to_string())?;
            if verified.insert(media) {super::pet_recognition::verify_detection_source(&conn,*id)?;}
        }}
        assign_detections(&mut conn,ids,target,name)
    }).await.map_err(|e|e.to_string())?
}
#[derive(Serialize)]
pub struct UnknownPetItem {id:i64,media_id:i64,box_:Option<Vec<f64>>}
#[tauri::command]
pub fn list_unknown_pet_items(app:AppHandle,page:i64)->Result<Vec<UnknownPetItem>,String>{
    let conn=super::open_database(&app)?;
    let mut stmt=conn.prepare("SELECT id,media_id,box FROM (SELECT id,media_id,json_extract(features,'$.box') AS box FROM pet_detection WHERE pet_id IS NULL AND excluded=0 UNION ALL SELECT -media_id AS id,media_id,NULL AS box FROM unidentified_pet_photo) ORDER BY media_id,id LIMIT 25 OFFSET ?1").map_err(|e|e.to_string())?;
    let rows=stmt.query_map([page.clamp(0,1000000)*24],|r|{let json:Option<String>=r.get(2)?;Ok(UnknownPetItem{id:r.get(0)?,media_id:r.get(1)?,box_:json.and_then(|value|serde_json::from_str(&value).ok())})}).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    Ok(rows)
}
#[tauri::command]
pub fn rename_pet(app:AppHandle,id:i64,name:String)->Result<i64,String>{
    let name=name.trim();
    if name.is_empty() || name.chars().count()>80 {return Err("이름을 1~80자로 입력해 주세요.".into());}
    if super::open_database(&app)?.execute("UPDATE pet SET name=?1 WHERE id=?2",params![name,id]).map_err(|e|e.to_string())?!=1 {return Err("반려동물을 찾을 수 없습니다.".into());}
    Ok(id)
}
#[tauri::command]
pub fn set_pet_cover_photo(app:AppHandle,pet_id:i64,media_id:i64)->Result<i64,String>{
    if super::open_database(&app)?.execute("UPDATE pet SET cover_media_id=?1 WHERE id=?2 AND EXISTS(SELECT 1 FROM pet_media WHERE pet_id=?2 AND media_id=?1)",params![media_id,pet_id]).map_err(|e|e.to_string())?!=1 {return Err("이 반려동물에 연결된 사진을 선택해 주세요.".into());}
    Ok(pet_id)
}
#[tauri::command]
pub fn set_person_cover_photo(app:AppHandle,person_id:i64,media_id:i64)->Result<(),String>{
    let mut conn=super::open_database(&app)?;
    let conn=conn.transaction().map_err(|e|e.to_string())?;
    let belongs:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM person_photo WHERE person_id=?1 AND media_id=?2) OR EXISTS(SELECT 1 FROM detected_face f WHERE person_id=?1 AND media_id=?2 AND NOT EXISTS(SELECT 1 FROM excluded_face WHERE face_id=f.id))",params![person_id,media_id],|r|r.get(0)).map_err(|e|e.to_string())?;
    if !belongs{return Err("이 인물의 사진을 선택해 주세요.".into());}
    conn.execute("UPDATE person SET cover_media_id=?1,cover_face_id=(SELECT MIN(id) FROM detected_face f WHERE f.person_id=?2 AND f.media_id=?1 AND NOT EXISTS(SELECT 1 FROM excluded_face WHERE face_id=f.id)) WHERE id=?2",params![media_id,person_id]).map_err(|e|e.to_string())?;
    conn.execute("UPDATE detected_face SET confirmed=1 WHERE id=(SELECT cover_face_id FROM person WHERE id=?1)",[person_id]).map_err(|e|e.to_string())?;
    conn.commit().map_err(|e|e.to_string())
}
fn remove_registrations(conn:&mut Connection,kind:&str,ids:Vec<i64>)->Result<(),String>{
    valid_ids(&ids)?;
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    for id in ids {
        if kind=="person" {
            tx.execute("DELETE FROM person_photo WHERE person_id=?1",[id]).map_err(|e|e.to_string())?;
            if tx.execute("UPDATE person SET name='',profile_type='face',cover_face_id=NULL,cover_media_id=NULL WHERE id=?1",[id]).map_err(|e|e.to_string())?!=1 {return Err("등록 정보를 찾을 수 없습니다.".into());}
            tx.execute("UPDATE detected_face SET confirmed=0 WHERE person_id=?1",[id]).map_err(|e|e.to_string())?;
        } else if tx.execute("DELETE FROM pet WHERE id=?1",[id]).map_err(|e|e.to_string())?!=1 {return Err("등록 정보를 찾을 수 없습니다.".into());}
    }
    tx.commit().map_err(|e|e.to_string())
}
#[tauri::command]
pub fn remove_person_registration(app:AppHandle,id:i64)->Result<(),String>{remove_registrations(&mut super::open_database(&app)?,"person",vec![id])}
#[tauri::command]
pub fn remove_entity_registrations(app:AppHandle,kind:String,ids:Vec<i64>)->Result<(),String>{
    if !["person","pet"].contains(&kind.as_str()){return Err("대상을 확인해 주세요.".into());}
    remove_registrations(&mut super::open_database(&app)?,&kind,ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn db()->Connection {let mut c=Connection::open_in_memory().unwrap();crate::database::initialize(&mut c).unwrap();c.execute_batch("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'a','image',1),(2,'b','image',1);INSERT INTO person(id,name) VALUES(1,'가족'),(2,'친구');INSERT INTO detected_face(id,media_id,person_id,descriptor,thumbnail,confirmed) VALUES(1,1,1,'[]','a',1),(2,1,2,'[]','b',1),(3,2,1,'[]','c',0);INSERT INTO pet(id,name) VALUES(1,'보리'),(2,'콩');INSERT INTO pet_media VALUES(1,1),(2,1);INSERT INTO pet_scan(media_id,engine_version,source_key) VALUES(1,'test','test');INSERT INTO pet_detection(id,media_id,object_index,features,pet_id) VALUES(1,1,0,'{}',1),(2,1,1,'{}',2),(3,1,2,'{}',NULL);").unwrap();c}
    #[test] fn manual_pet_photo_remains_assignable_as_unknown(){let mut c=db();c.execute("INSERT INTO pet_media VALUES(1,2)",[]).unwrap();edit_links(&mut c,"pet",1,vec![2],"unknown",None,None).unwrap();assert_eq!(c.query_row("SELECT media_id FROM unidentified_pet_photo",[],|r|r.get::<_,i64>(0)).unwrap(),2);let id=assign_detections(&mut c,vec![-2],None,Some("새 반려동물".into())).unwrap();assert_eq!(c.query_row("SELECT COUNT(*) FROM pet_media WHERE pet_id=?1 AND media_id=2",[id],|r|r.get::<_,i64>(0)).unwrap(),1);assert_eq!(c.query_row("SELECT COUNT(*) FROM unidentified_pet_photo",[],|r|r.get::<_,i64>(0)).unwrap(),0);}
    #[test] fn registration_removal_is_atomic_and_keeps_originals(){let mut c=db();assert!(remove_registrations(&mut c,"pet",vec![1,999]).is_err());assert_eq!(c.query_row("SELECT COUNT(*) FROM pet",[],|r|r.get::<_,i64>(0)).unwrap(),2);remove_registrations(&mut c,"person",vec![1]).unwrap();assert_eq!(c.query_row("SELECT name FROM person WHERE id=1",[],|r|r.get::<_,String>(0)).unwrap(),"");assert_eq!(c.query_row("SELECT confirmed FROM detected_face WHERE id=2",[],|r|r.get::<_,bool>(0)).unwrap(),true);assert_eq!(c.query_row("SELECT COUNT(*) FROM media",[],|r|r.get::<_,i64>(0)).unwrap(),2);}
    #[test] fn incompatible_pet_kinds_cannot_be_combined(){let mut c=db();c.execute("UPDATE pet_detection SET features='{\"kind\":\"cat\"}' WHERE id=3",[]).unwrap();c.execute("UPDATE pet_detection SET features='{\"kind\":\"dog\"}' WHERE id=1",[]).unwrap();assert!(assign_detections(&mut c,vec![3],Some(1),None).is_err());assert_eq!(c.query_row("SELECT pet_id FROM pet_detection WHERE id=3",[],|r|r.get::<_,Option<i64>>(0)).unwrap(),None);}
    #[test] fn named_face_batch_is_atomic_and_preserves_other_face(){let mut c=db();assert!(assign_faces(&mut c,vec![1,999],None,Some("새 이름".into())).is_err());assert_eq!(c.query_row("SELECT COUNT(*) FROM person",[],|r|r.get::<_,i64>(0)).unwrap(),2);let id=assign_faces(&mut c,vec![1,3],None,Some("새 이름".into())).unwrap();assert_eq!(c.query_row("SELECT person_id FROM detected_face WHERE id=2",[],|r|r.get::<_,i64>(0)).unwrap(),2);assert_eq!(c.query_row("SELECT COUNT(*) FROM detected_face WHERE person_id=?1",[id],|r|r.get::<_,i64>(0)).unwrap(),2);}
    #[test] fn photo_edits_only_change_source_entity_and_rollback(){let mut c=db();assert!(edit_links(&mut c,"pet",1,vec![1,999],"move",Some(2),None).is_err());assert_eq!(c.query_row("SELECT COUNT(*) FROM pet_media WHERE pet_id=1",[],|r|r.get::<_,i64>(0)).unwrap(),1);edit_links(&mut c,"person",1,vec![1],"unknown",None,None).unwrap();assert_eq!(c.query_row("SELECT person_id FROM detected_face WHERE id=2",[],|r|r.get::<_,i64>(0)).unwrap(),2);edit_links(&mut c,"pet",1,vec![1],"unknown",None,None).unwrap();assert_eq!(c.query_row("SELECT pet_id FROM pet_detection WHERE id=2",[],|r|r.get::<_,i64>(0)).unwrap(),2);assert_eq!(c.query_row("SELECT COUNT(*) FROM media",[],|r|r.get::<_,i64>(0)).unwrap(),2);}
    #[test] fn unknown_pet_assignment_preserves_siblings_and_rejects_stale_selection(){let mut c=db();assert!(assign_detections(&mut c,vec![3,999],None,Some("새 반려동물".into())).is_err());assert_eq!(c.query_row("SELECT COUNT(*) FROM pet",[],|r|r.get::<_,i64>(0)).unwrap(),2);let id=assign_detections(&mut c,vec![3],None,Some("새 반려동물".into())).unwrap();assert_eq!(c.query_row("SELECT pet_id FROM pet_detection WHERE id=2",[],|r|r.get::<_,i64>(0)).unwrap(),2);assert_eq!(c.query_row("SELECT pet_id FROM pet_detection WHERE id=3",[],|r|r.get::<_,i64>(0)).unwrap(),id);}
}
