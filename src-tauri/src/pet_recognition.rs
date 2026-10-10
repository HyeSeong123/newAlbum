use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const ENGINE: &str = "gamjassak-pets-v2";
#[derive(Serialize, Deserialize, Clone)]
pub struct Foreground {version:String,color:Vec<f64>,shape:Vec<f64>,fraction:f64}
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Features {
    kind: String, view: String, view_source: String, #[serde(rename = "box")] box_: [f64; 4], detection_score: f64,
    appearance: Vec<f64>, mirrored_appearance: Vec<f64>, color: Vec<f64>, shape: Vec<f64>,
    #[serde(default,skip_serializing_if="Option::is_none")] detected_kind:Option<String>,
    #[serde(default, skip_serializing_if="Option::is_none")] face_box: Option<[f64;4]>,
    #[serde(default)] face_appearance: Vec<f64>,
    #[serde(default)] mirrored_face_appearance: Vec<f64>,
    #[serde(default,skip_serializing_if="Option::is_none")] foreground: Option<Foreground>,
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
        || f.detected_kind.as_ref().is_some_and(|kind|!["dog","cat"].contains(&kind.as_str()))
        || !["unknown", "user", "cat-frontal-cascade"].contains(&f.view_source.as_str())
        || !f.box_.iter().all(|v| v.is_finite() && (0.0..=1.0).contains(v))
        || f.box_[2] <= 0.0 || f.box_[3] <= 0.0
        || f.box_[0]+f.box_[2] > 1.000001 || f.box_[1]+f.box_[3] > 1.000001
        || !f.detection_score.is_finite() || !(0.0..=1.0).contains(&f.detection_score)
        || ![&f.appearance, &f.mirrored_appearance, &f.face_appearance, &f.mirrored_face_appearance].iter().all(|v| v.len() == 1024 || v.is_empty())
        || f.color.len() != 120 || f.shape.len() != 10
        || ![&f.appearance,&f.mirrored_appearance,&f.color,&f.shape,&f.face_appearance,&f.mirrored_face_appearance].iter().all(|v| v.iter().all(|x| x.is_finite() && x.abs() <= 1.000001)) {
        return Err("올바르지 않은 반려동물 특징입니다.".into());
    }
    if f.view_source=="cat-frontal-cascade" && (f.kind!="cat" || f.view!="front" || f.face_box.is_none()) {return Err("자동 고양이 얼굴 분석을 확인해 주세요.".into());}
    if let Some(g)=&f.foreground {
        if g.version!="border-connected-v1" || g.color.len()!=120 || g.shape.len()!=10 || !g.fraction.is_finite() || !(0.05..=0.85).contains(&g.fraction) || ![&g.color,&g.shape].iter().all(|v|v.iter().all(|x|x.is_finite() && x.abs()<=1.000001)) {return Err("배경을 제외한 체형·색상 특징을 확인해 주세요.".into());}
    }
    if f.view == "rear" && (!f.appearance.is_empty() || !f.mirrored_appearance.is_empty() || f.face_box.is_some() || !f.face_appearance.is_empty() || !f.mirrored_face_appearance.is_empty()) { return Err("뒷모습에는 개체 식별 특징을 저장할 수 없습니다.".into()); }
    if let Some(b)=f.face_box {
        if f.view=="unknown" || !b.iter().all(|x|x.is_finite()) || b[2]<=0.0 || b[3]<=0.0 || b[0]<f.box_[0]-0.000001 || b[1]<f.box_[1]-0.000001 || b[0]+b[2]>f.box_[0]+f.box_[2]+0.000001 || b[1]+b[3]>f.box_[1]+f.box_[3]+0.000001 || f.face_appearance.len()!=1024 || f.mirrored_face_appearance.len()!=1024 {return Err("얼굴 영역과 특징을 확인해 주세요.".into());}
    } else if !f.face_appearance.is_empty() || !f.mirrored_face_appearance.is_empty() {return Err("얼굴 영역 없는 특징은 저장할 수 없습니다.".into());}
    Ok(())
}
fn read_detections(conn: &Connection, media: Option<i64>, after: i64, limit: i64, references: bool) -> Result<Vec<Detection>, String> {
    let sql=if references {
        "SELECT id,media_id,pet_id,excluded,features FROM (
          SELECT id,media_id,pet_id,excluded,features,
            ROW_NUMBER() OVER(PARTITION BY pet_id,json_extract(features,'$.view')
              ORDER BY CASE WHEN COALESCE(json_array_length(features,'$.faceAppearance'),0)>0 THEN 0 ELSE 1 END,id DESC) AS view_rank
          FROM pet_detection WHERE pet_id IS NOT NULL AND excluded=0
        ) WHERE (?1 IS NULL OR media_id=?1) AND id>?2 AND view_rank<=3 AND ?4=1 ORDER BY id LIMIT ?3"
    } else {
        "SELECT id,media_id,pet_id,excluded,features FROM pet_detection
          WHERE (?1 IS NULL OR media_id=?1) AND id>?2 AND ?4=0 ORDER BY id LIMIT ?3"
    };
    let mut stmt=conn.prepare(sql).map_err(|e|e.to_string())?;
    let raw = stmt.query_map(params![media,after,limit,references], |row| Ok((row.get::<_,i64>(0)?,row.get::<_,i64>(1)?,row.get::<_,Option<i64>>(2)?,row.get::<_,bool>(3)?,row.get::<_,String>(4)?)))
        .map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    raw.into_iter().map(|(id,media_id,pet_id,excluded,json)| Ok(Detection { id,media_id,pet_id,excluded,features: serde_json::from_str(&json).map_err(|e|e.to_string())? })).collect()
}
fn read_scan(conn: &Connection, media_id: i64) -> Result<Option<Scan>,String> {
    let header: Option<(String,String)> = conn.query_row("SELECT engine_version,source_key FROM pet_scan WHERE media_id=?1",[media_id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
    header.map(|(engine_version,source_key)| Ok(Scan {media_id,engine_version,source_key,detections:read_detections(conn,Some(media_id),0,20,false)?})).transpose()
}
pub(crate) fn verify_source(conn:&Connection,media_id:i64,key:&str)->Result<(),String>{
    let path:String=conn.query_row("SELECT file_path FROM media WHERE id=?1 AND file_type='image'",[media_id],|r|r.get(0)).map_err(|e|e.to_string())?;
    if !key.starts_with("sha256:") || super::thumbnails::content_key(std::path::Path::new(&path))?!=key {return Err("사진 내용 또는 사진 지문이 변경되었습니다. 연결 유지하고 재분석을 선택해 주세요.".into());}
    Ok(())
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
        tx.execute("INSERT INTO pet_direction_observation(detection_id,automatic_view,automatic_source) VALUES(?1,?2,?3)",params![tx.last_insert_rowid(),if feature.view_source=="user" {None} else {Some(&feature.view)},feature.view_source]).map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e|e.to_string())?;
    read_scan(conn,media_id)?.ok_or_else(||"분석 결과 저장 실패".into())
}
#[tauri::command]
pub async fn save_pet_scan(app: AppHandle, media_id: i64, source_key: String, features: Vec<Features>) -> Result<Scan,String> {
    tauri::async_runtime::spawn_blocking(move||{let mut conn=super::open_database(&app)?;verify_source(&conn,media_id,&source_key)?;write_scan(&mut conn,media_id,&source_key,features)}).await.map_err(|e|e.to_string())?
}
fn confirm(conn: &mut Connection, detection_id:i64, pet_id:Option<i64>, view:&str, excluded:bool) -> Result<(),String> {
    confirm_with_features(conn,detection_id,pet_id,view,excluded,None)
}
fn confirm_with_features(conn: &mut Connection, detection_id:i64, pet_id:Option<i64>, view:&str, excluded:bool, replacement:Option<Features>) -> Result<(),String> {
    if !["front","left","right","rear","unknown"].contains(&view) || (excluded && pet_id.is_some()) {return Err("확인 내용을 다시 선택해 주세요.".into());}
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    let (media,old,json):(i64,Option<i64>,String)=tx.query_row("SELECT media_id,pet_id,features FROM pet_detection WHERE id=?1",[detection_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(|e|e.to_string())?;
    let mut features:Features=serde_json::from_str(&json).map_err(|e|e.to_string())?;
    tx.execute("INSERT OR IGNORE INTO pet_direction_observation(detection_id,automatic_view,automatic_source) VALUES(?1,?2,?3)",params![detection_id,if features.view_source=="user" {None} else {Some(&features.view)},features.view_source]).map_err(|e|e.to_string())?;
    if let Some(replacement)=replacement {
        validate(&replacement)?;
        if replacement.box_!=features.box_ {return Err("분석 영역이 변경되었습니다. 결과를 다시 불러와 주세요.".into());}
        features=replacement;
    }
    tx.execute("UPDATE pet_direction_observation SET manual_view=?1 WHERE detection_id=?2",params![view,detection_id]).map_err(|e|e.to_string())?;
    features.view=view.into(); features.view_source=if view=="unknown" {"unknown"} else {"user"}.into();
    if view=="rear" {features.appearance.clear();features.mirrored_appearance.clear();}
    if view=="rear" || view=="unknown" {features.face_box=None;features.face_appearance.clear();features.mirrored_face_appearance.clear();}
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
pub async fn confirm_pet_detection(app:AppHandle,detection_id:i64,pet_id:Option<i64>,view:String,excluded:bool)->Result<(),String> {
    tauri::async_runtime::spawn_blocking(move||{let mut conn=super::open_database(&app)?;verify_detection_source(&conn,detection_id)?;confirm(&mut conn,detection_id,pet_id,&view,excluded)}).await.map_err(|e|e.to_string())?
}
fn verify_detection_source(conn:&Connection,detection_id:i64)->Result<(),String>{
    let (media,key):(i64,String)=conn.query_row("SELECT d.media_id,s.source_key FROM pet_detection d JOIN pet_scan s ON s.media_id=d.media_id WHERE d.id=?1",[detection_id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|e|e.to_string())?;
    verify_source(conn,media,&key)
}
#[tauri::command]
pub async fn update_pet_features(app:AppHandle,detection_id:i64,pet_id:Option<i64>,view:String,excluded:bool,features:Features)->Result<(),String>{
    tauri::async_runtime::spawn_blocking(move||{let mut conn=super::open_database(&app)?;verify_detection_source(&conn,detection_id)?;confirm_with_features(&mut conn,detection_id,pet_id,&view,excluded,Some(features))}).await.map_err(|e|e.to_string())?
}

fn overlap(a:[f64;4],b:[f64;4])->f64 {
    let intersection=(a[0]+a[2]).min(b[0]+b[2])-(a[0].max(b[0]));
    let height=(a[1]+a[3]).min(b[1]+b[3])-(a[1].max(b[1]));
    let area=intersection.max(0.0)*height.max(0.0);
    area/(a[2]*a[3]+b[2]*b[3]-area).max(0.000001)
}
fn replace_scan(conn:&mut Connection,media_id:i64,expected_key:&str,source_key:&str,features:Vec<Features>,allow_source_change:bool)->Result<Scan,String>{
    if features.len()>20 || source_key.len()!=71 || !source_key.starts_with("sha256:") || !source_key[7..].bytes().all(|b|b.is_ascii_hexdigit()){return Err("사진 지문을 확인해 주세요.".into());}
    for f in &features {validate(f)?;}
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    let old=read_scan(&tx,media_id)?.ok_or("기존 분석을 찾을 수 없습니다.")?;
    if old.source_key!=expected_key {return Err("다른 작업에서 분석 결과가 변경되었습니다. 다시 불러와 주세요.".into());}
    let protected:Vec<_>=old.detections.into_iter().filter(|d|d.pet_id.is_some()||d.excluded||d.features.view_source=="user").collect();
    let changed=expected_key!=source_key;
    if changed && !protected.is_empty() && !allow_source_change {return Err("사진 내용 또는 기존 사진 지문이 변경되었습니다. 연결을 유지하고 재분석을 선택해 주세요.".into());}
    if changed {
        // Links remain, but become manual links: old object identities must not
        // be transferred onto different photo contents or an unverified legacy key.
        tx.execute("DELETE FROM pet_recognition_link WHERE media_id=?1",[media_id]).map_err(|e|e.to_string())?;
        tx.execute("DELETE FROM pet_detection WHERE media_id=?1",[media_id]).map_err(|e|e.to_string())?;
    } else {
        tx.execute("DELETE FROM pet_detection WHERE media_id=?1 AND pet_id IS NULL AND excluded=0 AND json_extract(features,'$.viewSource')<>'user'",[media_id]).map_err(|e|e.to_string())?;
    }
    let retained=if changed {vec![]} else {protected};
    let mut next:i64=tx.query_row("SELECT COALESCE(MAX(object_index),-1)+1 FROM pet_detection WHERE media_id=?1",[media_id],|r|r.get(0)).map_err(|e|e.to_string())?;
    let mut count=retained.len();
    for f in features {
        // Keep exact user-confirmed objects/IDs, including excluded false positives.
        // Detector boxes overlapping these objects cannot silently create duplicates.
        if retained.iter().any(|d|overlap(d.features.box_,f.box_)>=0.3) || count>=20 {continue;}
        tx.execute("INSERT INTO pet_detection(media_id,object_index,features) VALUES(?1,?2,?3)",params![media_id,next,serde_json::to_string(&f).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;next+=1;count+=1;
    }
    tx.execute("UPDATE pet_scan SET source_key=?1,engine_version=?2,completed_at=CURRENT_TIMESTAMP WHERE media_id=?3",params![source_key,ENGINE,media_id]).map_err(|e|e.to_string())?;
    tx.commit().map_err(|e|e.to_string())?;
    read_scan(conn,media_id)?.ok_or("재분석 결과를 저장하지 못했습니다.".into())
}
#[tauri::command]
pub async fn replace_pet_scan(app:AppHandle,media_id:i64,expected_source_key:String,source_key:String,features:Vec<Features>,allow_source_change:bool)->Result<Scan,String>{
    tauri::async_runtime::spawn_blocking(move||{let mut conn=super::open_database(&app)?;verify_source(&conn,media_id,&source_key)?;replace_scan(&mut conn,media_id,&expected_source_key,&source_key,features,allow_source_change)}).await.map_err(|e|e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    fn database()->Connection {let mut c=Connection::open_in_memory().unwrap();crate::database::initialize(&mut c).unwrap();c.execute_batch("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'a','image',1);INSERT INTO pet(id,name) VALUES(1,'보리'),(2,'초코');").unwrap();c}
    fn features()->Features {Features{kind:"dog".into(),detected_kind:Some("dog".into()),view:"unknown".into(),view_source:"unknown".into(),box_:[0.0,0.0,0.5,0.5],detection_score:0.9,appearance:vec![0.0;1024],mirrored_appearance:vec![0.0;1024],color:vec![0.0;120],shape:vec![0.0;10],face_box:None,face_appearance:vec![],mirrored_face_appearance:vec![],foreground:None}}
    #[test] fn reanalysis_preserves_confirmed_ids_and_explicit_source_change_preserves_photo_links(){
        let mut c=database();let key=format!("sha256:{}","a".repeat(64));let other=format!("sha256:{}","b".repeat(64));
        let scan=write_scan(&mut c,1,&key,vec![features(),features()]).unwrap();let id=scan.detections[0].id;
        confirm(&mut c,id,Some(1),"front",false).unwrap();
        let fresh=replace_scan(&mut c,1,&key,&key,vec![features()],false).unwrap();assert_eq!(fresh.detections.len(),1);assert_eq!(fresh.detections[0].id,id);
        assert!(replace_scan(&mut c,1,&key,&other,vec![features()],false).is_err());
        assert_eq!(read_scan(&c,1).unwrap().unwrap().source_key,key);
        let changed=replace_scan(&mut c,1,&key,&other,vec![features()],true).unwrap();assert_eq!(changed.detections[0].pet_id,None);
        assert_eq!(c.query_row("SELECT COUNT(*) FROM pet_media",[],|r|r.get::<_,i64>(0)).unwrap(),1);
        assert_eq!(c.query_row("SELECT COUNT(*) FROM pet_recognition_link",[],|r|r.get::<_,i64>(0)).unwrap(),0);
        assert!(replace_scan(&mut c,1,&key,&other,vec![],true).is_err());
    }
    #[test] fn face_features_and_species_correction_are_atomic_and_rear_removes_all_identity(){
        let mut c=database();let scan=write_scan(&mut c,1,"a",vec![features()]).unwrap();let id=scan.detections[0].id;
        let mut face=features();face.kind="cat".into();face.view="front".into();face.view_source="user".into();face.face_box=Some([0.1,0.1,0.2,0.2]);face.face_appearance=vec![0.0;1024];face.mirrored_face_appearance=vec![0.0;1024];
        confirm_with_features(&mut c,id,Some(1),"front",false,Some(face.clone())).unwrap();
        assert_eq!(read_scan(&c,1).unwrap().unwrap().detections[0].features.kind,"cat");
        face.face_box=Some([0.8,0.8,0.2,0.2]);assert!(confirm_with_features(&mut c,id,Some(2),"front",false,Some(face)).is_err());
        assert_eq!(read_scan(&c,1).unwrap().unwrap().detections[0].pet_id,Some(1));
        confirm(&mut c,id,Some(1),"rear",false).unwrap();let saved=read_scan(&c,1).unwrap().unwrap().detections.remove(0).features;
        assert!(saved.face_box.is_none());assert!(saved.appearance.is_empty());assert!(saved.face_appearance.is_empty());assert!(saved.mirrored_face_appearance.is_empty());assert_eq!(saved.detected_kind.as_deref(),Some("dog"));
    }
    #[test] fn source_guard_rejects_replaced_bytes_without_changing_saved_results(){
        let mut c=database();let path=std::env::temp_dir().join(format!("pet-source-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::write(&path,b"cat").unwrap();c.execute("UPDATE media SET file_path=?1 WHERE id=1",[path.to_string_lossy().as_ref()]).unwrap();
        let key=crate::thumbnails::content_key(&path).unwrap();write_scan(&mut c,1,&key,vec![features()]).unwrap();verify_source(&c,1,&key).unwrap();
        std::fs::write(&path,b"dog").unwrap();assert!(verify_source(&c,1,&key).is_err());assert_eq!(read_scan(&c,1).unwrap().unwrap().source_key,key);
        std::fs::remove_file(path).unwrap();
    }
    #[test] fn automatic_cat_face_and_optional_foreground_round_trip_without_linking(){
        let mut c=database();let mut f=features();f.kind="cat".into();f.detected_kind=Some("cat".into());f.view="front".into();f.view_source="cat-frontal-cascade".into();f.face_box=Some([0.1,0.1,0.2,0.2]);f.face_appearance=vec![0.01;1024];f.mirrored_face_appearance=vec![0.01;1024];
        f.foreground=Some(Foreground{version:"border-connected-v1".into(),color:vec![0.01;120],shape:vec![0.01;10],fraction:0.4});
        let saved=write_scan(&mut c,1,"test",vec![f.clone()]).unwrap();assert_eq!(saved.detections[0].pet_id,None);assert_eq!(saved.detections[0].features.foreground.as_ref().unwrap().fraction,0.4);
        f.kind="dog".into();assert!(validate(&f).is_err());f.kind="cat".into();f.foreground.as_mut().unwrap().fraction=f64::NAN;assert!(validate(&f).is_err());
        confirm(&mut c,saved.detections[0].id,Some(1),"rear",false).unwrap();let rear=read_scan(&c,1).unwrap().unwrap().detections.remove(0).features;
        assert!(rear.appearance.is_empty() && rear.face_box.is_none());assert!(rear.foreground.is_some());assert_eq!(rear.view_source,"user");
    }
    #[test] fn references_keep_views_balanced_and_retain_an_older_face_region(){
        let mut c=database();
        for id in 1..=20 {
            if id>1 {c.execute("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(?1,?2,'image',1)",params![id,format!("p{id}")]).unwrap();}
            let view=if id<=10 {"front"} else {"left"};let mut f=features();f.view=view.into();f.view_source="user".into();
            if id==1 {f.face_box=Some([0.1,0.1,0.2,0.2]);f.face_appearance=vec![0.0;1024];f.mirrored_face_appearance=vec![0.0;1024];}
            let scan=write_scan(&mut c,id,"test",vec![f]).unwrap();confirm(&mut c,scan.detections[0].id,Some(1),view,false).unwrap();
        }
        let refs=read_detections(&c,None,0,100,true).unwrap();assert_eq!(refs.len(),6);assert!(refs.iter().any(|r|r.media_id==1));
        assert_eq!(refs.iter().filter(|r|r.features.view=="left").count(),3);
    }
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
    #[test] fn manual_direction_never_becomes_an_automatic_success(){
      let mut c=database();let mut f=features();f.view="unknown".into();f.view_source="unknown".into();
      let scan=write_scan(&mut c,1,"a",vec![f]).unwrap();let id=scan.detections[0].id;
      confirm(&mut c,id,Some(1),"left",false).unwrap();confirm(&mut c,id,Some(1),"right",false).unwrap();
      let (auto,manual):(String,String)=c.query_row("SELECT automatic_view,manual_view FROM pet_direction_observation WHERE detection_id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
      assert_eq!(auto,"unknown");assert_eq!(manual,"right");assert_eq!(read_scan(&c,1).unwrap().unwrap().detections[0].pet_id,Some(1));
    }

}
