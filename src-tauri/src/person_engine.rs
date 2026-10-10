use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct Source { source_key:String, completed:bool, legacy:bool }
pub(crate) fn source(conn:&Connection,media_id:i64)->Result<Source,String>{
    let path:String=conn.query_row("SELECT file_path FROM media WHERE id=?1 AND file_type='image'",[media_id],|r|r.get(0)).map_err(|e|e.to_string())?;
    let source_key=super::thumbnails::content_key(std::path::Path::new(&path))?;
    let saved:Option<(String,Option<String>)>=conn.query_row("SELECT s.model_version,m.source_key FROM face_scan s LEFT JOIN person_scan_metadata m ON m.media_id=s.media_id WHERE s.media_id=?1",[media_id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
    if let Some((model,key))=saved {
        if model!=super::faces::MODEL || key.as_ref().is_some_and(|key|key!=&source_key) {return Err("사진 또는 모델이 변경되었습니다. 기존 얼굴 연결은 보존했으며 별도 재추출이 필요합니다.".into());}
        return Ok(Source{source_key,completed:true,legacy:key.is_none()});
    }
    Ok(Source{source_key,completed:false,legacy:false})
}
#[tauri::command]
pub async fn get_person_scan_source(app:AppHandle,media_id:i64)->Result<Source,String>{
    tauri::async_runtime::spawn_blocking(move||source(&super::open_database(&app)?,media_id)).await.map_err(|e|e.to_string())?
}
fn enqueue(conn:&mut Connection,ids:Vec<i64>)->Result<(),String>{
    if ids.len()>1000 {return Err("사진 1,000장씩 대기열에 등록해 주세요.".into());}
    let tx=conn.transaction().map_err(|e|e.to_string())?;
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

#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn outlier_and_bad_dimensions_do_not_control_matching(){
  let q=vec![0.1;128];let refs=vec![(1,vec![0.1;128]),(1,vec![0.5;128]),(1,vec![0.5;128]),(2,vec![0.11;128]),(3,vec![0.1;512])];
  let result=rank(&q,&refs);assert_eq!(result.len(),2);assert_eq!(result[0].person_id,2);assert!(rank(&[f64::NAN;128],&refs).is_empty());
 }
 #[test]fn jobs_preserve_data_and_deduplicate(){
  let mut c=Connection::open_in_memory().unwrap();crate::database::initialize(&mut c).unwrap();
  c.execute_batch("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'p','image',1),(2,'v','video',1);").unwrap();
  enqueue(&mut c,vec![1,1,2]).unwrap();assert_eq!(c.query_row("SELECT COUNT(*) FROM person_analysis_job",[],|r|r.get::<_,i64>(0)).unwrap(),1);
  c.execute("UPDATE person_analysis_job SET state='failed'",[]).unwrap();enqueue(&mut c,vec![1]).unwrap();assert_eq!(c.query_row("SELECT state FROM person_analysis_job",[],|r|r.get::<_,String>(0)).unwrap(),"failed");
  assert_eq!(c.query_row("SELECT COUNT(*) FROM media",[],|r|r.get::<_,i64>(0)).unwrap(),2);
 }
}
