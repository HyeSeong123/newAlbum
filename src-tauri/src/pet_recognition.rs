use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const ENGINE: &str = "gamjassak-pets-v1";
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Features {
    kind: String, view: String, view_source: String, #[serde(rename = "box")] box_: [f64; 4], detection_score: f64,
    appearance: Vec<f64>, mirrored_appearance: Vec<f64>, color: Vec<f64>, shape: Vec<f64>,
}
// The wire spelling of the bounding box is `box`.

#[derive(Serialize)]
pub struct Detection {
    id: i64, media_id: i64, pet_id: Option<i64>, excluded: bool,
    #[serde(flatten)] features: Features,
}
#[derive(Serialize)]
pub struct Scan { media_id: i64, engine_version: String, source_key: String, detections: Vec<Detection> }
fn validate(f: &Features) -> Result<(), String> {
    if !["dog", "cat"].contains(&f.kind.as_str()) || !["front", "left", "right", "rear", "unknown"].contains(&f.view.as_str())
        || !["unknown", "user"].contains(&f.view_source.as_str())
        || !f.box_.iter().all(|v| v.is_finite() && (0.0..=1.0).contains(v))
        || f.box_[2] <= 0.0 || f.box_[3] <= 0.0
        || f.box_[0]+f.box_[2] > 1.000001 || f.box_[1]+f.box_[3] > 1.000001
        || !f.detection_score.is_finite() || !(0.0..=1.0).contains(&f.detection_score)
        || ![&f.appearance, &f.mirrored_appearance].iter().all(|v| v.len() == 1024 || v.is_empty())
        || f.color.len() != 120 || f.shape.len() != 10
        || ![&f.appearance,&f.mirrored_appearance,&f.color,&f.shape].iter().all(|v| v.iter().all(|x| x.is_finite() && x.abs() <= 1.000001)) {
        return Err("올바르지 않은 반려동물 특징입니다.".into());
    }
    if f.view == "rear" && (!f.appearance.is_empty() || !f.mirrored_appearance.is_empty()) { return Err("뒷모습에는 개체 식별 특징을 저장할 수 없습니다.".into()); }
    Ok(())
}
fn read_detections(conn: &Connection, media: Option<i64>, after: i64, limit: i64, references: bool) -> Result<Vec<Detection>, String> {
    let mut stmt = conn.prepare("SELECT d.id,d.media_id,d.pet_id,d.excluded,d.features FROM pet_detection d
        WHERE (?1 IS NULL OR d.media_id=?1) AND d.id>?2
        AND (?4=0 OR (d.pet_id IS NOT NULL AND d.excluded=0 AND
          (SELECT COUNT(*) FROM pet_detection newer WHERE newer.pet_id=d.pet_id AND newer.excluded=0 AND newer.id>d.id)<12))
        ORDER BY d.id LIMIT ?3").map_err(|e|e.to_string())?;
    let raw = stmt.query_map(params![media,after,limit,references], |row| Ok((row.get::<_,i64>(0)?,row.get::<_,i64>(1)?,row.get::<_,Option<i64>>(2)?,row.get::<_,bool>(3)?,row.get::<_,String>(4)?)))
        .map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    raw.into_iter().map(|(id,media_id,pet_id,excluded,json)| Ok(Detection { id,media_id,pet_id,excluded,features: serde_json::from_str(&json).map_err(|e|e.to_string())? })).collect()
}
fn read_scan(conn: &Connection, media_id: i64) -> Result<Option<Scan>,String> {
    let header: Option<(String,String)> = conn.query_row("SELECT engine_version,source_key FROM pet_scan WHERE media_id=?1",[media_id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
    header.map(|(engine_version,source_key)| Ok(Scan {media_id,engine_version,source_key,detections:read_detections(conn,Some(media_id),0,20,false)?})).transpose()
}
#[tauri::command]
pub fn get_pet_scan(app: AppHandle, media_id: i64) -> Result<Option<Scan>,String> { read_scan(&super::open_database(&app)?,media_id) }
#[tauri::command]
pub fn list_pet_detections(app: AppHandle, media_id: Option<i64>, after_id: i64, references: bool, limit: i64) -> Result<Vec<Detection>,String> {
    read_detections(&super::open_database(&app)?,media_id,after_id,limit.clamp(1,100),references)
}
fn write_scan(conn: &mut Connection, media_id: i64, source_key: &str, features: Vec<Features>) -> Result<Scan,String> {
    if source_key.len()>4096 || features.len()>20 {return Err("분석 결과가 너무 큽니다.".into());}
    for feature in &features {validate(feature)?;}
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    let existing=read_scan(&tx,media_id)?;
    // Preserve user-confirmed object identities across scans/model changes.
    if let Some(scan)=existing {return Ok(scan);}
    let valid:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM media WHERE id=?1 AND file_type='image')",[media_id],|r|r.get(0)).map_err(|e|e.to_string())?;
    if !valid {return Err("등록된 사진을 찾을 수 없습니다.".into());}
    tx.execute("INSERT INTO pet_scan(media_id,engine_version,source_key) VALUES(?1,?2,?3)",params![media_id,ENGINE,source_key]).map_err(|e|e.to_string())?;
    for (index,feature) in features.into_iter().enumerate() {
        let json=serde_json::to_string(&feature).map_err(|e|e.to_string())?;
        tx.execute("INSERT INTO pet_detection(media_id,object_index,features) VALUES(?1,?2,?3)",params![media_id,index as i64,json]).map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e|e.to_string())?;
    read_scan(conn,media_id)?.ok_or_else(||"분석 결과 저장 실패".into())
}
#[tauri::command]
pub fn save_pet_scan(app: AppHandle, media_id: i64, source_key: String, features: Vec<Features>) -> Result<Scan,String> {
    write_scan(&mut super::open_database(&app)?,media_id,&source_key,features)
}
fn confirm(conn: &mut Connection, detection_id:i64, pet_id:Option<i64>, view:&str, excluded:bool) -> Result<(),String> {
    if !["front","left","right","rear","unknown"].contains(&view) || (excluded && pet_id.is_some()) {return Err("확인 내용을 다시 선택해 주세요.".into());}
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    let (media,old,json):(i64,Option<i64>,String)=tx.query_row("SELECT media_id,pet_id,features FROM pet_detection WHERE id=?1",[detection_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(|e|e.to_string())?;
    let mut features:Features=serde_json::from_str(&json).map_err(|e|e.to_string())?;
    features.view=view.into(); features.view_source=if view=="unknown" {"unknown"} else {"user"}.into();
    if view=="rear" {features.appearance.clear();features.mirrored_appearance.clear();}
    validate(&features)?;
    if let Some(pet)=pet_id {
        let mixed:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM pet_detection WHERE pet_id=?1 AND excluded=0 AND id<>?2 AND json_extract(features,'$.kind')<>?3)",params![pet,detection_id,features.kind],|r|r.get(0)).map_err(|e|e.to_string())?;
        if mixed {return Err("개와 고양이를 같은 반려동물로 연결할 수 없습니다.".into());}
    }
    tx.execute("UPDATE pet_detection SET pet_id=?1,excluded=?2,features=?3 WHERE id=?4",params![pet_id,excluded,serde_json::to_string(&features).map_err(|e|e.to_string())?,detection_id]).map_err(|e|e.to_string())?;
    if let Some(pet)=pet_id {
        let inserted=tx.execute("INSERT OR IGNORE INTO pet_media(pet_id,media_id) VALUES(?1,?2)",params![pet,media]).map_err(|e|e.to_string())?;
        if inserted>0 {tx.execute("INSERT OR IGNORE INTO pet_recognition_link VALUES(?1,?2)",params![pet,media]).map_err(|e|e.to_string())?;}
    }
    if let Some(pet)=old { if Some(pet)!=pet_id {
        tx.execute("DELETE FROM pet_media WHERE pet_id=?1 AND media_id=?2
          AND EXISTS(SELECT 1 FROM pet_recognition_link WHERE pet_id=?1 AND media_id=?2)
          AND NOT EXISTS(SELECT 1 FROM pet_detection WHERE pet_id=?1 AND media_id=?2 AND excluded=0)",params![pet,media]).map_err(|e|e.to_string())?;
    }}
    tx.commit().map_err(|e|e.to_string())
}
#[tauri::command]
pub fn confirm_pet_detection(app:AppHandle,detection_id:i64,pet_id:Option<i64>,view:String,excluded:bool)->Result<(),String> {
    confirm(&mut super::open_database(&app)?,detection_id,pet_id,&view,excluded)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn database()->Connection {let mut c=Connection::open_in_memory().unwrap();crate::database::initialize(&mut c).unwrap();c.execute_batch("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'a','image',1);INSERT INTO pet(id,name) VALUES(1,'보리'),(2,'초코');").unwrap();c}
    fn features()->Features {Features{kind:"dog".into(),view:"unknown".into(),view_source:"unknown".into(),box_:[0.0,0.0,0.5,0.5],detection_score:0.9,appearance:vec![0.0;1024],mirrored_appearance:vec![0.0;1024],color:vec![0.0;120],shape:vec![0.0;10]}}
    #[test] fn corrections_remove_only_recognition_links_and_rear_vectors() {
        let mut c=database();let scan=write_scan(&mut c,1,"a",vec![features(),features()]).unwrap();
        let a=scan.detections[0].id;let b=scan.detections[1].id;
        confirm(&mut c,a,Some(1),"front",false).unwrap();confirm(&mut c,b,Some(1),"left",false).unwrap();
        confirm(&mut c,a,Some(2),"rear",false).unwrap();
        assert_eq!(c.query_row("SELECT COUNT(*) FROM pet_media",[],|r|r.get::<_,i64>(0)).unwrap(),2);
        confirm(&mut c,b,Some(2),"right",false).unwrap();
        assert_eq!(c.query_row("SELECT COUNT(*) FROM pet_media",[],|r|r.get::<_,i64>(0)).unwrap(),1);
        assert!(read_scan(&c,1).unwrap().unwrap().detections[0].features.appearance.is_empty());
        // Reanalysis cannot overwrite corrections.
        assert_eq!(write_scan(&mut c,1,"changed",vec![]).unwrap().detections.len(),2);
        c.execute("DELETE FROM media WHERE id=1",[]).unwrap();assert!(read_scan(&c,1).unwrap().is_none());
    }
    #[test] fn invalid_assignments_roll_back_and_manual_links_survive() {
        let mut c=database();c.execute("INSERT INTO pet_media VALUES(1,1)",[]).unwrap();
        let scan=write_scan(&mut c,1,"a",vec![features()]).unwrap();let id=scan.detections[0].id;
        confirm(&mut c,id,Some(1),"front",false).unwrap();assert!(confirm(&mut c,id,Some(999),"front",false).is_err());
        assert_eq!(read_scan(&c,1).unwrap().unwrap().detections[0].pet_id,Some(1));
        confirm(&mut c,id,Some(2),"front",false).unwrap();
        assert_eq!(c.query_row("SELECT COUNT(*) FROM pet_media",[],|r|r.get::<_,i64>(0)).unwrap(),2);
    }
    #[test] fn renaming_pet_preserves_recognition_link_provenance() {
        let mut c=database();let scan=write_scan(&mut c,1,"a",vec![features()]).unwrap();let id=scan.detections[0].id;
        confirm(&mut c,id,Some(1),"front",false).unwrap();
        crate::pets::save(&mut c,Some(1),"새 이름".into(),vec![1],Some(1)).unwrap();
        confirm(&mut c,id,Some(2),"front",false).unwrap();
        assert_eq!(c.query_row("SELECT COUNT(*) FROM pet_media WHERE pet_id=1",[],|r|r.get::<_,i64>(0)).unwrap(),0);
    }
    #[test] fn rejects_bad_vectors_and_preserves_negative_scan() {
        let mut c=database();let mut bad=features();bad.shape[0]=f64::NAN;assert!(write_scan(&mut c,1,"a",vec![bad]).is_err());
        assert!(read_scan(&c,1).unwrap().is_none());assert!(write_scan(&mut c,1,"a",vec![]).unwrap().detections.is_empty());
    }
}
