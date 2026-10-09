use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Serialize)]
pub struct Job { id: i64, media_id: i64, pet_id: Option<i64>, view: String, state: String, error: String }
#[derive(Serialize)]
pub struct Queue { jobs:Vec<Job>, pending:i64, paused:i64, failed:i64 }
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Input { media_id: i64, pet_id: Option<i64>, view: String }

fn enqueue(conn: &mut Connection, jobs: Vec<Input>) -> Result<(),String> {
    if jobs.len()>1000 { return Err("분석 대기 목록은 1,000장씩 저장해 주세요.".into()); }
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    for job in jobs {
        if !["unknown","front","left","right","rear"].contains(&job.view.as_str()) {return Err("촬영 방향을 확인해 주세요.".into());}
        // Duplicate import notifications do not resurrect failed or paused jobs.
        tx.execute("INSERT OR IGNORE INTO pet_analysis_job(media_id,pet_id,view)
          SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM media WHERE id=?1 AND file_type='image')",params![job.media_id,job.pet_id,job.view]).map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e|e.to_string())
}
#[tauri::command]
pub fn enqueue_pet_jobs(app:AppHandle,jobs:Vec<Input>)->Result<(),String>{enqueue(&mut super::open_database(&app)?,jobs)}
#[tauri::command]
pub fn list_pet_jobs(app:AppHandle)->Result<Queue,String>{
    let conn=super::open_database(&app)?;
    let mut stmt=conn.prepare("SELECT id,media_id,pet_id,view,state,error FROM pet_analysis_job ORDER BY CASE state WHEN 'pending' THEN 0 ELSE 1 END,id LIMIT 100").map_err(|e|e.to_string())?;
    let rows=stmt.query_map([],|r|Ok(Job{id:r.get(0)?,media_id:r.get(1)?,pet_id:r.get(2)?,view:r.get(3)?,state:r.get(4)?,error:r.get(5)?})).map_err(|e|e.to_string())?;
    let jobs=rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    let count=|state:&str|conn.query_row("SELECT COUNT(*) FROM pet_analysis_job WHERE state=?1",[state],|r|r.get::<_,i64>(0)).map_err(|e|e.to_string());
    Ok(Queue{jobs,pending:count("pending")?,paused:count("paused")?,failed:count("failed")?})
}
#[tauri::command]
pub fn finish_pet_job(app:AppHandle,id:i64,error:Option<String>)->Result<(),String>{
    let conn=super::open_database(&app)?;
    if let Some(error)=error {conn.execute("UPDATE pet_analysis_job SET state='failed',error=?1 WHERE id=?2 AND state='pending'",params![error.chars().take(500).collect::<String>(),id]).map_err(|e|e.to_string())?;}
    else {conn.execute("DELETE FROM pet_analysis_job WHERE id=?1",[id]).map_err(|e|e.to_string())?;}
    Ok(())
}
#[tauri::command]
pub fn control_pet_jobs(app:AppHandle,resume:bool)->Result<(),String>{
    let conn=super::open_database(&app)?;
    conn.execute(if resume {"UPDATE pet_analysis_job SET state='pending',error='' WHERE state IN ('paused','failed')"} else {"UPDATE pet_analysis_job SET state='paused' WHERE state='pending'"},[]).map_err(|e|e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn jobs_are_durable_deduplicated_and_cascade_without_touching_media(){
        let mut c=Connection::open_in_memory().unwrap();crate::database::initialize(&mut c).unwrap();
        c.execute_batch("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'p','image',1);INSERT INTO pet(id,name) VALUES(1,'보리');").unwrap();
        for _ in 0..2 {enqueue(&mut c,vec![Input{media_id:1,pet_id:None,view:"unknown".into()},Input{media_id:1,pet_id:Some(1),view:"left".into()}]).unwrap();}
        assert_eq!(c.query_row("SELECT COUNT(*) FROM pet_analysis_job",[],|r|r.get::<_,i64>(0)).unwrap(),2);
        assert!(enqueue(&mut c,vec![Input{media_id:1,pet_id:None,view:"bad".into()}]).is_err());
        c.execute("DELETE FROM pet WHERE id=1",[]).unwrap();assert_eq!(c.query_row("SELECT COUNT(*) FROM pet_analysis_job",[],|r|r.get::<_,i64>(0)).unwrap(),1);
        c.execute("DELETE FROM media WHERE id=1",[]).unwrap();assert_eq!(c.query_row("SELECT COUNT(*) FROM pet_analysis_job",[],|r|r.get::<_,i64>(0)).unwrap(),0);
    }
}
