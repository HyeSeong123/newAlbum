use rusqlite::{params,Connection,OptionalExtension};
use serde::Deserialize;
use serde_json::{json,Value};
use tauri::AppHandle;

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Sample {media_id:i64,detection_id:Option<i64>,pet_id:Option<i64>,role:String,capture_group:String,view:String,kind:String,rights:String}
fn save(conn:&mut Connection,s:Sample)->Result<(),String>{
    if !["reference","query"].contains(&s.role.as_str()) || (s.role=="reference" && (s.pet_id.is_none() || s.detection_id.is_none())) || !["front","left","right","rear","unknown"].contains(&s.view.as_str()) || !["dog","cat"].contains(&s.kind.as_str()) || s.capture_group.trim().is_empty() || s.capture_group.len()>160 || s.rights.trim().is_empty() || s.rights.len()>500 {return Err("정답, 촬영 세션과 사진 사용 권리를 확인해 주세요.".into());}
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    let (source,engine):(String,String)=tx.query_row("SELECT source_key,engine_version FROM pet_scan WHERE media_id=?1",[s.media_id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|_|"사진을 먼저 분석해 주세요.".to_string())?;
    if !source.starts_with("sha256:"){return Err("이전 분석입니다. 연결 유지하고 재분석한 뒤 검증 자료를 추가해 주세요.".into());}
    let feature=if let Some(id)=s.detection_id {
        let text:Option<String>=tx.query_row("SELECT features FROM pet_detection WHERE id=?1 AND media_id=?2 AND excluded=0",params![id,s.media_id],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
        let mut value:Value=serde_json::from_str(&text.ok_or("해당 탐지 결과를 찾을 수 없습니다.")?).map_err(|e|e.to_string())?;
        // Ground truth is separate from live identity links and never enrolls queries.
        value["view"]=json!(s.view);value["viewSource"]=json!(if s.view=="unknown" {"unknown"} else {"user"});
        if s.view=="rear"{value["appearance"]=json!([]);value["mirroredAppearance"]=json!([]);}
        if s.view=="rear" || s.view=="unknown"{if let Some(object)=value.as_object_mut(){object.remove("faceBox");object.remove("faceAppearance");object.remove("mirroredFaceAppearance");}}
        Some(value.to_string())
    }else{None};
    tx.execute("DELETE FROM pet_evaluation_sample WHERE media_id=?1 AND detection_id IS ?2",params![s.media_id,s.detection_id]).map_err(|e|e.to_string())?;
    tx.execute("INSERT INTO pet_evaluation_sample(media_id,detection_id,pet_id,role,capture_group,source_key,view,kind,features,rights,engine_version) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",params![s.media_id,s.detection_id,s.pet_id,s.role,s.capture_group.trim(),source,s.view,s.kind,feature,s.rights.trim(),engine]).map_err(|e|e.to_string())?;
    tx.commit().map_err(|e|e.to_string())
}
fn dataset(conn:&Connection)->Result<Value,String>{
    let mut stmt=conn.prepare("SELECT id,media_id,pet_id,role,capture_group,source_key,view,kind,features,rights,engine_version FROM pet_evaluation_sample ORDER BY id").map_err(|e|e.to_string())?;
    let mut references=vec![];let mut queries=vec![];
    let mut rows=stmt.query([]).map_err(|e|e.to_string())?;
    while let Some(row)=rows.next().map_err(|e|e.to_string())? {
        let id:i64=row.get(0).map_err(|e|e.to_string())?;let media:i64=row.get(1).map_err(|e|e.to_string())?;
        let pet:Option<i64>=row.get(2).map_err(|e|e.to_string())?;let role:String=row.get(3).map_err(|e|e.to_string())?;
        let text:Option<String>=row.get(8).map_err(|e|e.to_string())?;
        let sample=json!({"sampleId":format!("sample-{id}"),"mediaKey":format!("media-{media}"),"petId":pet,"captureGroup":row.get::<_,String>(4).map_err(|e|e.to_string())?,"sourceKey":row.get::<_,String>(5).map_err(|e|e.to_string())?,"view":row.get::<_,String>(6).map_err(|e|e.to_string())?,"kind":row.get::<_,String>(7).map_err(|e|e.to_string())?,"features":text.map(|t|serde_json::from_str::<Value>(&t)).transpose().map_err(|e|e.to_string())?,"rights":row.get::<_,String>(9).map_err(|e|e.to_string())?,"engineVersion":row.get::<_,String>(10).map_err(|e|e.to_string())?});
        if role=="reference"{references.push(sample);}else{queries.push(sample);}
    }
    Ok(json!({"schemaVersion":1,"engineVersion":"gamjassak-pets-v2","references":references,"queries":queries,"automaticLinkingEnabled":false}))
}
#[tauri::command]
pub async fn save_pet_evaluation(app:AppHandle,sample:Sample)->Result<(),String>{
    tauri::async_runtime::spawn_blocking(move||{
        let mut conn=super::open_database(&app)?;
        let key:String=conn.query_row("SELECT source_key FROM pet_scan WHERE media_id=?1",[sample.media_id],|r|r.get(0)).map_err(|_|"사진을 먼저 분석해 주세요.".to_string())?;
        super::pet_recognition::verify_source(&conn,sample.media_id,&key)?;
        save(&mut conn,sample)
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub fn pet_evaluation_summary(app:AppHandle)->Result<Value,String>{
    let conn=super::open_database(&app)?;
    let count=|role:&str|conn.query_row("SELECT COUNT(*) FROM pet_evaluation_sample WHERE role=?1",[role],|r|r.get::<_,i64>(0)).map_err(|e|e.to_string());
    Ok(json!({"references":count("reference")?,"queries":count("query")?}))
}
#[tauri::command]
pub async fn export_pet_evaluation(app:AppHandle,destination:String)->Result<(),String>{
    tauri::async_runtime::spawn_blocking(move||{
        let data=serde_json::to_vec_pretty(&dataset(&super::open_database(&app)?)?).map_err(|e|e.to_string())?;
        #[cfg(target_os="android")]
        if destination.starts_with("content://") {
            use tauri_plugin_fs::{FsExt,FilePath,OpenOptions};use std::io::Write;
            let mut options=OpenOptions::new();options.write(true).truncate(true);
            let mut file=app.fs().open(FilePath::Url(destination.parse().map_err(|e|format!("잘못된 저장 위치: {e}"))?),options).map_err(|e|e.to_string())?;
            return file.write_all(&data).map_err(|e|e.to_string());
        }
        std::fs::write(destination,data).map_err(|e|e.to_string())
    }).await.map_err(|e|e.to_string())?
}
#[cfg(test)]
mod tests {
 use super::*;
 #[test] fn missed_detection_export_keeps_ground_truth_without_linking(){
  let mut c=Connection::open_in_memory().unwrap();crate::database::initialize(&mut c).unwrap();c.execute_batch("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'private/photo','image',1);INSERT INTO pet(id,name) VALUES(1,'private-name');INSERT INTO pet_scan(media_id,engine_version,source_key) VALUES(1,'gamjassak-pets-v2','sha256:test');").unwrap();
  save(&mut c,Sample{media_id:1,detection_id:None,pet_id:Some(1),role:"query".into(),capture_group:"session-B".into(),view:"left".into(),kind:"dog".into(),rights:"owner".into()}).unwrap();
  let data=dataset(&c).unwrap();assert!(data["queries"][0]["features"].is_null());assert_eq!(data["queries"][0]["petId"],1);assert!(!data.to_string().contains("private"));assert_eq!(c.query_row("SELECT COUNT(*) FROM pet_media",[],|r|r.get::<_,i64>(0)).unwrap(),0);
 }
}
