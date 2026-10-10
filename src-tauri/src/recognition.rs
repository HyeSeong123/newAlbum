use rusqlite::params;
use serde::{Deserialize,Serialize};
use tauri::AppHandle;
pub(crate) const PERSON_512_MODEL: &str = "facex-tiny-512-af7ca993-v1";
#[derive(Deserialize,Serialize)]
#[serde(rename_all="camelCase")]
pub struct PoseInput {version:String,view:String,yaw_degrees:Option<f64>,pitch_degrees:Option<f64>,roll_degrees:Option<f64>,quality:String,normalized_error:Option<f64>}
impl PoseInput {
 pub(crate) fn validate(&self)->Result<(),String>{
  if self.version!="landmarks-pnp-v1" || !["front","left","right","unknown"].contains(&self.view.as_str()) || !["estimated","unknown"].contains(&self.quality.as_str()) || [self.yaw_degrees,self.pitch_degrees,self.roll_degrees].iter().flatten().any(|v|!v.is_finite()||v.abs()>180.0) || self.normalized_error.is_some_and(|v|!v.is_finite()||v<0.0) || self.view!="unknown" && (self.quality!="estimated"||self.yaw_degrees.is_none()||self.pitch_degrees.is_none()||self.roll_degrees.is_none()) {return Err("얼굴 방향 추정값이 올바르지 않습니다.".into());} Ok(())
 }
}
#[tauri::command]
pub async fn set_person_face_view(app:AppHandle,face_id:i64,view:String)->Result<(),String>{
 if !["front","left","right","unknown"].contains(&view.as_str()){return Err("얼굴 방향을 확인해 주세요.".into());}
 tauri::async_runtime::spawn_blocking(move||{
  let conn=super::open_database(&app)?;
  let media:i64=conn.query_row("SELECT media_id FROM detected_face WHERE id=?1",[face_id],|r|r.get(0)).map_err(|e|e.to_string())?;
  super::person_engine::source(&conn,media)?;
  let unknown=r#"{"version":"landmarks-pnp-v1","view":"unknown","yawDegrees":null,"pitchDegrees":null,"rollDegrees":null,"quality":"unknown","normalizedError":null}"#;
  conn.execute("INSERT INTO person_face_pose(face_id,automatic,manual_view) VALUES(?1,?2,?3) ON CONFLICT(face_id) DO UPDATE SET manual_view=excluded.manual_view,updated_at=CURRENT_TIMESTAMP",params![face_id,unknown,view]).map_err(|e|e.to_string())?;Ok(())
 }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub fn recognition_model_status()->serde_json::Value {
 serde_json::json!({"person128":"active","person512":"bundled-development","person512Model":PERSON_512_MODEL,"commercialClearanceConfirmed":false,"pet1024":"active","petAutomaticSides":"quadpose-keypoints-unvalidated","personPose":"estimated-unvalidated","automaticPetLinking":false})
}

#[tauri::command]
pub async fn export_recognition_report(app:AppHandle,destination:String,content:String)->Result<(),String>{
 if content.len()>2_000_000{return Err("검증 결과가 너무 큽니다.".into());}
 tauri::async_runtime::spawn_blocking(move||{
  #[cfg(target_os="android")]
  if destination.starts_with("content://") {
   use tauri_plugin_fs::{FsExt,FilePath,OpenOptions};use std::io::Write;
   let mut options=OpenOptions::new();options.write(true).truncate(true);
   let mut file=app.fs().open(FilePath::Url(destination.parse().map_err(|e|format!("잘못된 저장 위치: {e}"))?),options).map_err(|e|e.to_string())?;
   return file.write_all(content.as_bytes()).map_err(|e|e.to_string());
  }
  let _=app;std::fs::write(destination,content).map_err(|e|e.to_string())
 }).await.map_err(|e|e.to_string())?
}

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ModelFeature {pub(crate) model_version:String,pub(crate) dimensions:usize,pub(crate) descriptor:Vec<f64>}
impl ModelFeature {
 pub(crate) fn validate(&self)->Result<(),String>{
  // Keep synchronized with the hash-pinned development-model registry.
  let approved=[PERSON_512_MODEL];
  if self.dimensions!=512||self.descriptor.len()!=512||self.descriptor.iter().any(|v|!v.is_finite())||!self.descriptor.iter().any(|v|v.abs()>1e-12)||!approved.contains(&self.model_version.as_str()) {return Err("승인된 512차원 모델의 특징이 아닙니다.".into());} Ok(())
 }
}
