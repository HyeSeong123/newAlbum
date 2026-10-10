use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct Source { source_key:String, completed:bool, legacy:bool }
fn record_issue(conn:&Connection,id:i64,state:&str)->Result<(),String>{
    if matches!(state,"source_changed"|"model_changed"|"unavailable") {
        conn.execute("INSERT INTO person_scan_issue(media_id,state) SELECT ?1,?2 WHERE EXISTS(SELECT 1 FROM face_scan WHERE media_id=?1) ON CONFLICT(media_id) DO UPDATE SET state=excluded.state,checked_at=CURRENT_TIMESTAMP",rusqlite::params![id,state]).map_err(|e|e.to_string())?;
    } else if state=="verified" {conn.execute("DELETE FROM person_scan_issue WHERE media_id=?1",[id]).map_err(|e|e.to_string())?;}
    Ok(())
}
pub(crate) fn source(conn:&Connection,media_id:i64)->Result<Source,String>{
    let path:String=conn.query_row("SELECT file_path FROM media WHERE id=?1 AND file_type='image'",[media_id],|r|r.get(0)).map_err(|_|"등록된 사진을 찾을 수 없습니다.".to_string())?;
    let saved:Option<(String,Option<String>)>=conn.query_row("SELECT s.model_version,m.source_key FROM face_scan s LEFT JOIN person_scan_metadata m ON m.media_id=s.media_id WHERE s.media_id=?1",[media_id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
    let source_key=match super::thumbnails::content_key(std::path::Path::new(&path)) {Ok(key)=>key,Err(_)=>{record_issue(conn,media_id,"unavailable")?;return Err("원본 사진을 읽을 수 없습니다. 기존 얼굴 연결은 보존했습니다.".into());}};
    if let Some((model,key))=saved {
        if model!=super::faces::MODEL || key.as_ref().is_some_and(|key|key!=&source_key) {
            record_issue(conn,media_id,if model!=super::faces::MODEL {"model_changed"} else {"source_changed"})?;
            return Err("사진 또는 모델이 변경되었습니다. 기존 얼굴 연결은 보존했으며 별도 재추출이 필요합니다.".into());
        }
        if key.is_some() {record_issue(conn,media_id,"verified")?;}
        return Ok(Source{source_key,completed:true,legacy:key.is_none()});
    }
    Ok(Source{source_key,completed:false,legacy:false})
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct AuditItem {media_id:i64,state:String}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct AuditBatch {items:Vec<AuditItem>,next_cursor:i64,done:bool}
pub(crate) fn audit(conn:&Connection,after:i64,limit:i64,references_only:bool)->Result<AuditBatch,String>{
    if after<0 || !(1..=20).contains(&limit) {return Err("사진 점검 범위가 올바르지 않습니다.".into());}
    let rows=conn.prepare("SELECT s.media_id,m.file_path,s.model_version,p.source_key FROM face_scan s JOIN media m ON m.id=s.media_id LEFT JOIN person_scan_metadata p ON p.media_id=s.media_id WHERE s.media_id>?1 AND (?3=0 OR EXISTS(SELECT 1 FROM detected_face f LEFT JOIN person_face_metadata d ON d.face_id=f.id WHERE f.media_id=s.media_id AND (f.confirmed=1 OR d.reference_kind='seed' OR d.face_id IS NULL OR EXISTS(SELECT 1 FROM person WHERE id=f.person_id AND trim(name)='')) AND NOT EXISTS(SELECT 1 FROM excluded_face e WHERE e.face_id=f.id))) ORDER BY s.media_id LIMIT ?2")
        .map_err(|e|e.to_string())?.query_map(rusqlite::params![after,limit+1,references_only],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,Option<String>>(3)?))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    let done=rows.len()<=limit as usize;let mut items=Vec::new();let mut next_cursor=after;
    for (id,path,model,saved) in rows.into_iter().take(limit as usize) {
        let state=if model!=super::faces::MODEL {"model_changed"} else {match super::thumbnails::content_key(std::path::Path::new(&path)) {Err(_)=>"unavailable",Ok(current)=>match saved {None=>"legacy",Some(key) if key==current=>"verified",Some(_)=>"source_changed"}}};
        // Legacy data has no historical hash. Restoring access cannot prove an
        // unchanged original after an earlier issue; keep that quarantine.
        record_issue(conn,id,state)?;
        items.push(AuditItem{media_id:id,state:state.into()});next_cursor=id;
    }
    Ok(AuditBatch{items,next_cursor,done})
}
pub(crate) fn audit_references(conn:&Connection)->Result<(),String>{
    let mut cursor=0;
    loop {let batch=audit(conn,cursor,20,true)?;if batch.done {return Ok(());}cursor=batch.next_cursor;}
}
#[tauri::command]
pub async fn audit_person_scans(app:AppHandle,after_id:i64,limit:i64,references_only:bool)->Result<AuditBatch,String>{
    tauri::async_runtime::spawn_blocking(move||audit(&super::open_database(&app)?,after_id,limit,references_only)).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn get_person_scan_source(app:AppHandle,media_id:i64)->Result<Source,String>{
    tauri::async_runtime::spawn_blocking(move||source(&super::open_database(&app)?,media_id)).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub fn person_runtime_environment(app:AppHandle)->serde_json::Value{serde_json::json!({"os":std::env::consts::OS,"architecture":std::env::consts::ARCH,"version":app.package_info().version.to_string()})}
fn enqueue(conn:&mut Connection,ids:Vec<i64>)->Result<(),String>{
    if ids.len()>1000 {return Err("사진 1,000장씩 대기열에 등록해 주세요.".into());}
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    // Recover a crash after scan commit but before finish_person_job.
    tx.execute("DELETE FROM person_analysis_job WHERE EXISTS(SELECT 1 FROM face_scan WHERE media_id=person_analysis_job.media_id)",[]).map_err(|e|e.to_string())?;
    for id in ids {tx.execute("INSERT OR IGNORE INTO person_analysis_job(media_id) SELECT ?1 WHERE EXISTS(SELECT 1 FROM media WHERE id=?1 AND file_type='image') AND NOT EXISTS(SELECT 1 FROM face_scan WHERE media_id=?1)",[id]).map_err(|e|e.to_string())?;}
    tx.commit().map_err(|e|e.to_string())
}
#[tauri::command]
pub fn enqueue_person_jobs(app:AppHandle,media_ids:Vec<i64>)->Result<(),String>{enqueue(&mut super::open_database(&app)?,media_ids)}
#[tauri::command]
pub fn control_person_jobs(app:AppHandle,resume:bool)->Result<(),String>{
    super::open_database(&app)?.execute(if resume {"UPDATE person_analysis_job SET state='pending',error='' WHERE state IN ('paused','failed')"} else {"UPDATE person_analysis_job SET state='paused' WHERE state='pending'"},[]).map_err(|e|e.to_string())?;Ok(())
}
#[tauri::command]
pub fn finish_person_job(app:AppHandle,media_id:i64,failed:bool)->Result<(),String>{
    let conn=super::open_database(&app)?;
    if failed {conn.execute("UPDATE person_analysis_job SET state='failed',error='얼굴 분석을 완료하지 못했습니다.' WHERE media_id=?1 AND state='pending'",[media_id]).map_err(|e|e.to_string())?;}
    else {conn.execute("DELETE FROM person_analysis_job WHERE media_id=?1",[media_id]).map_err(|e|e.to_string())?;}
    Ok(())
}

#[derive(Serialize)]
pub struct Candidate {pub person_id:i64,pub distance:f64,pub references:usize}
// Two agreeing exemplars when there are >=3 confirmed references prevents one
// mislabeled exemplar from determining a whole person's score. No probability.
pub(crate) fn rank(query:&[f64],references:&[(i64,Vec<f64>)])->Vec<Candidate>{
    if query.len()!=128 || !query.iter().all(|x|x.is_finite()) {return vec![];}
    let mut scores=std::collections::BTreeMap::<i64,Vec<f64>>::new();
    for (person,vector) in references {
        if vector.len()!=128 || !vector.iter().all(|x|x.is_finite()) {continue;}
        scores.entry(*person).or_default().push(query.iter().zip(vector).map(|(a,b)|(a-b).powi(2)).sum::<f64>().sqrt());
    }
    let mut result:Vec<_>=scores.into_iter().map(|(person_id,mut values)| {values.sort_by(f64::total_cmp);Candidate{person_id,distance:values[usize::from(values.len()>=3)],references:values.len()}}).collect();
    result.sort_by(|a,b|a.distance.total_cmp(&b.distance).then(a.person_id.cmp(&b.person_id)));result
}

// An explicitly confirmed review-quality exemplar (e.g. a side view) can
// propose a match even when the frontal exemplars disagree. Review only;
// this function never assigns an identity or changes automatic grouping.
pub(crate) fn rank_for_review(query:&[f64],references:&[(i64,Vec<f64>)],confirmed_review:&[(i64,Vec<f64>)])->Vec<Candidate>{
    let mut result=rank(query,references);
    for (person,vector) in confirmed_review {
        if vector.len()!=128 || !vector.iter().all(|x|x.is_finite()) {continue;}
        if let Some(candidate)=result.iter_mut().find(|c|c.person_id==*person) {
            let distance=query.iter().zip(vector).map(|(a,b)|(a-b).powi(2)).sum::<f64>().sqrt();
            candidate.distance=candidate.distance.min(distance);
        }
    }
    result.sort_by(|a,b|a.distance.total_cmp(&b.distance).then(a.person_id.cmp(&b.person_id)));result
}

#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn outlier_and_bad_dimensions_do_not_control_matching(){
  let q=vec![0.1;128];let refs=vec![(1,vec![0.1;128]),(1,vec![0.5;128]),(1,vec![0.5;128]),(2,vec![0.11;128]),(3,vec![0.1;512])];
  let result=rank(&q,&refs);assert_eq!(result.len(),2);assert_eq!(result[0].person_id,2);assert!(rank(&[f64::NAN;128],&refs).is_empty());
 }
 #[test]fn changed_sources_are_quarantined_without_losing_identity_or_pets(){
  let path=std::env::temp_dir().join(format!("person-source-audit-{}-{}.jpg",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
  std::fs::write(&path,b"original-source").unwrap();
  let key=crate::thumbnails::content_key(&path).unwrap();let mut c=Connection::open_in_memory().unwrap();crate::database::initialize(&mut c).unwrap();
  c.execute("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,?1,'image',15)",[path.to_string_lossy().as_ref()]).unwrap();
  c.execute("INSERT INTO person(id,name) VALUES(42,'family')",[]).unwrap();
  c.execute("INSERT INTO face_scan(media_id,model_version) VALUES(1,?1)",[crate::faces::MODEL]).unwrap();
  c.execute("INSERT INTO detected_face(id,media_id,person_id,descriptor,thumbnail,confirmed) VALUES(91,1,42,'[0.1]','thumb',1)",[]).unwrap();
  c.execute("INSERT INTO pet(id,name) VALUES(8,'pet')",[]).unwrap();c.execute("INSERT INTO pet_media VALUES(8,1)",[]).unwrap();
  c.execute("INSERT INTO person_scan_metadata VALUES(1,?1,'test')",[key]).unwrap();
  assert_eq!(audit(&c,0,1,false).unwrap().items[0].state,"verified");
  std::fs::write(&path,b"changed-source").unwrap();assert!(source(&c,1).is_err());
  assert_eq!(audit(&c,0,1,true).unwrap().items[0].state,"source_changed");
  assert_eq!(c.query_row("SELECT person_id FROM detected_face WHERE id=91",[],|r|r.get::<_,i64>(0)).unwrap(),42);
  assert_eq!(c.query_row("SELECT COUNT(*) FROM pet_media",[],|r|r.get::<_,i64>(0)).unwrap(),1);
  std::fs::write(&path,b"original-source").unwrap();assert_eq!(audit(&c,0,1,false).unwrap().items[0].state,"verified");
  assert_eq!(c.query_row("SELECT COUNT(*) FROM person_scan_issue",[],|r|r.get::<_,i64>(0)).unwrap(),0);
  c.execute("DELETE FROM person_scan_metadata",[]).unwrap();assert_eq!(audit(&c,0,1,false).unwrap().items[0].state,"legacy");
  std::fs::remove_file(&path).unwrap();assert_eq!(audit(&c,0,1,false).unwrap().items[0].state,"unavailable");
  std::fs::write(&path,b"original-source").unwrap();assert_eq!(audit(&c,0,1,false).unwrap().items[0].state,"legacy");assert!(source(&c,1).unwrap().legacy);
  assert_eq!(c.query_row("SELECT COUNT(*) FROM person_scan_issue",[],|r|r.get::<_,i64>(0)).unwrap(),1);
  c.execute("UPDATE face_scan SET model_version='future-model'",[]).unwrap();assert_eq!(audit(&c,0,1,false).unwrap().items[0].state,"model_changed");
  assert!(audit(&c,0,21,false).is_err());assert!(audit(&c,1,1,false).unwrap().done);
  c.execute("DELETE FROM face_scan",[]).unwrap();assert_eq!(c.query_row("SELECT COUNT(*) FROM person_scan_issue",[],|r|r.get::<_,i64>(0)).unwrap(),0);
  std::fs::remove_file(path).unwrap();
 }
 #[test]fn jobs_preserve_data_and_deduplicate(){
  let mut c=Connection::open_in_memory().unwrap();crate::database::initialize(&mut c).unwrap();
  c.execute_batch("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'p','image',1),(2,'v','video',1);").unwrap();
  enqueue(&mut c,vec![1,1,2]).unwrap();assert_eq!(c.query_row("SELECT COUNT(*) FROM person_analysis_job",[],|r|r.get::<_,i64>(0)).unwrap(),1);
  c.execute("UPDATE person_analysis_job SET state='failed'",[]).unwrap();enqueue(&mut c,vec![1]).unwrap();assert_eq!(c.query_row("SELECT state FROM person_analysis_job",[],|r|r.get::<_,String>(0)).unwrap(),"failed");
  assert_eq!(c.query_row("SELECT COUNT(*) FROM media",[],|r|r.get::<_,i64>(0)).unwrap(),2);
  c.execute("INSERT INTO face_scan(media_id,model_version) VALUES(1,'legacy')",[]).unwrap();enqueue(&mut c,vec![1]).unwrap();
  assert_eq!(c.query_row("SELECT COUNT(*) FROM person_analysis_job",[],|r|r.get::<_,i64>(0)).unwrap(),0);
 }
}
