//! Versioned sidecar features only. This module never assigns identities or edits
//! legacy face/pet rows. The toy classifier has no compatible registry record.
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeFeature {
    media_id: i64,
    region_key: String,
    model_key: String,
    source_key: String,
    view: String,
    vector: Vec<f64>,
    face_id: Option<i64>,
    pet_detection_id: Option<i64>,
}
fn save(conn: &mut Connection, f: &NativeFeature) -> Result<(), String> {
    if f.region_key.is_empty() || f.region_key.len()>200 || f.model_key.len()>200 || f.source_key.len()>200 { return Err("INVALID_NATIVE_FEATURE_KEY".into()); }
    if !["front","left","right","rear","unknown"].contains(&f.view.as_str()) { return Err("INVALID_VIEW".into()); }
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    let (task,kind,dimensions,state):(String,String,usize,String)=tx.query_row(
        "SELECT task,kind,dimensions,state FROM native_ai_model WHERE model_key=?1",[&f.model_key],
        |r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).map_err(|_|"NATIVE_MODEL_NOT_REGISTERED".to_string())?;
    let norm:f64=f.vector.iter().map(|x|x*x).sum();
    if state!="trained-reviewed" || f.vector.len()!=dimensions || f.vector.iter().any(|x|!x.is_finite()) || !norm.is_finite() || (norm-1.0).abs()>0.0001 {return Err("INVALID_OR_UNTRAINED_NATIVE_FEATURE".into());}
    if task=="person" && (dimensions!=512 || kind!="identity" || f.pet_detection_id.is_some() || f.view=="rear") || task=="pet" && f.face_id.is_some() || f.view=="rear" && kind!="color-shape" {return Err("INCOMPATIBLE_NATIVE_TASK".into());}
    super::pet_recognition::verify_source(&tx,f.media_id,&f.source_key)?;
    if let Some(id)=f.face_id {
        let valid:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM detected_face WHERE id=?1 AND media_id=?2)",params![id,f.media_id],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !valid {return Err("FACE_SOURCE_MISMATCH".into());}
    }
    if let Some(id)=f.pet_detection_id {
        let valid:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM pet_detection WHERE id=?1 AND media_id=?2)",params![id,f.media_id],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !valid {return Err("PET_SOURCE_MISMATCH".into());}
    }
    tx.execute("INSERT INTO native_ai_feature(media_id,region_key,model_key,task,kind,dimensions,source_key,view,descriptor,face_id,pet_detection_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
        ON CONFLICT(media_id,region_key,model_key,source_key) DO UPDATE SET view=excluded.view,descriptor=excluded.descriptor,face_id=excluded.face_id,pet_detection_id=excluded.pet_detection_id",
        params![f.media_id,f.region_key,f.model_key,task,kind,dimensions as i64,f.source_key,f.view,serde_json::to_string(&f.vector).map_err(|e|e.to_string())?,f.face_id,f.pet_detection_id]).map_err(|e|e.to_string())?;
    tx.commit().map_err(|e|e.to_string())
}
#[tauri::command]
pub async fn save_native_ai_feature(app:AppHandle,feature:NativeFeature)->Result<(),String>{
    tauri::async_runtime::spawn_blocking(move||save(&mut super::open_database(&app)?,&feature)).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn list_native_ai_features(app:AppHandle,media_id:i64,model_key:String,source_key:String,after_region:Option<String>)->Result<Vec<NativeFeature>,String>{
    tauri::async_runtime::spawn_blocking(move||{
        let conn=super::open_database(&app)?;
        super::pet_recognition::verify_source(&conn,media_id,&source_key)?;
        let mut stmt=conn.prepare("SELECT f.region_key,f.view,f.descriptor,f.face_id,f.pet_detection_id FROM native_ai_feature f JOIN native_ai_model m ON m.model_key=f.model_key WHERE f.media_id=?1 AND f.model_key=?2 AND f.source_key=?3 AND f.region_key>?4 AND m.state='trained-reviewed' ORDER BY f.region_key LIMIT 100").map_err(|e|e.to_string())?;
        let rows=stmt.query_map(params![media_id,model_key,source_key,after_region.unwrap_or_default()],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,Option<i64>>(3)?,r.get::<_,Option<i64>>(4)?))).map_err(|e|e.to_string())?;
        let mut out=Vec::new();
        for row in rows {let(region_key,view,descriptor,face_id,pet_detection_id)=row.map_err(|e|e.to_string())?;
            out.push(NativeFeature{media_id,region_key,model_key:model_key.clone(),source_key:source_key.clone(),view,vector:serde_json::from_str(&descriptor).map_err(|e|e.to_string())?,face_id,pet_detection_id});}
        Ok(out)
    }).await.map_err(|e|e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sidecar_writes_preserve_confirmed_identity_and_reject_invalid_or_changed_sources() {
        let path=std::env::temp_dir().join(format!("gss-native-test-{}.rgb",uuid::Uuid::new_v4()));
        std::fs::write(&path,b"owned synthetic fixture").unwrap();
        let mut c=Connection::open_in_memory().unwrap();super::super::database::initialize(&mut c).unwrap();
        c.execute("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,?1,'image',23)",[path.to_str().unwrap()]).unwrap();
        c.execute_batch("INSERT INTO person(id,name) VALUES(42,'family'); INSERT INTO detected_face(id,media_id,person_id,descriptor,thumbnail,confirmed) VALUES(9,1,42,'legacy','thumb',1);").unwrap();
        let key=super::super::thumbnails::content_key(&path).unwrap();
        let mut feature=NativeFeature{media_id:1,region_key:"r1".into(),model_key:"test-only-v1".into(),source_key:key,view:"front".into(),vector:vec![0.0;512],face_id:Some(9),pet_detection_id:None};feature.vector[0]=1.0;
        assert!(save(&mut c,&feature).is_err());
        c.execute("INSERT INTO native_ai_model VALUES('test-only-v1','person','identity',512,?1,'test-only','trained-reviewed','{}')",["a".repeat(64)]).unwrap();
        save(&mut c,&feature).unwrap();save(&mut c,&feature).unwrap();
        assert_eq!(c.query_row("SELECT COUNT(*) FROM native_ai_feature",[],|r|r.get::<_,i64>(0)).unwrap(),1);
        assert_eq!(c.query_row("SELECT person_id,confirmed,descriptor FROM detected_face WHERE id=9",[],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,bool>(1)?,r.get::<_,String>(2)?))).unwrap(),(42,true,"legacy".into()));
        feature.vector[1]=f64::NAN;assert!(save(&mut c,&feature).is_err());feature.vector[1]=0.0;
        feature.face_id=Some(999);assert!(save(&mut c,&feature).is_err());feature.face_id=Some(9);
        std::fs::write(&path,b"changed fixture").unwrap();assert!(save(&mut c,&feature).is_err());
        assert_eq!(c.query_row("SELECT COUNT(*) FROM native_ai_feature",[],|r|r.get::<_,i64>(0)).unwrap(),1);
        std::fs::remove_file(path).unwrap();
    }
}
