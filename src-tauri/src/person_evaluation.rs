use rusqlite::{params, Connection};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use tauri::AppHandle;

const CATEGORIES: [&str; 12] = ["front","expression","left","right","lookalikes","group","small","glasses","dark","occluded","unregistered","person-pet"];
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Sample { media_id:i64, face_id:Option<i64>, person_id:Option<i64>, missed_slot:Option<u32>, role:String, capture_group:String, category:String, rights:String }
fn save(conn:&mut Connection,s:Sample)->Result<(),String>{
 if !["reference","query"].contains(&s.role.as_str()) || !CATEGORIES.contains(&s.category.as_str()) || s.capture_group.trim().is_empty() || s.capture_group.len()>160 || s.rights.trim().is_empty() || s.rights.len()>500 || (s.role=="reference" && (s.person_id.is_none() || s.face_id.is_none())) || s.missed_slot.unwrap_or(1)>100 || s.missed_slot==Some(0) {return Err("정답, 촬영 세션과 사진 사용 권리를 확인해 주세요.".into());}
 let tx=conn.transaction().map_err(|e|e.to_string())?;
 let key:String=tx.query_row("SELECT m.source_key FROM person_scan_metadata m JOIN face_scan s ON s.media_id=m.media_id WHERE m.media_id=?1 AND s.model_version=?2",params![s.media_id,super::faces::MODEL],|r|r.get(0)).map_err(|_|"원본 지문이 확인된 현재 모델의 분석 사진만 평가할 수 있습니다.".to_string())?;
 super::pet_recognition::verify_source(&tx,s.media_id,&key)?;
 if let Some(id)=s.face_id {
  let valid:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM detected_face f JOIN person_face_metadata m ON m.face_id=f.id WHERE f.id=?1 AND f.media_id=?2 AND m.model_version=?3 AND NOT EXISTS(SELECT 1 FROM excluded_face WHERE face_id=f.id))",params![id,s.media_id,super::faces::MODEL],|r|r.get(0)).map_err(|e|e.to_string())?;
  if !valid{return Err("이 사진의 유효한 얼굴을 선택해 주세요.".into());}
 }
 let label=s.face_id.map(|id|format!("face-{id}")).unwrap_or_else(||format!("miss-{}",s.missed_slot.unwrap_or(1)));
 let leak:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM person_evaluation_sample WHERE NOT (media_id=?1 AND label_key=?2) AND role<>?3 AND (source_key=?4 OR (person_id IS ?5 AND person_id IS NOT NULL AND capture_group=?6)))",params![s.media_id,label,s.role,key,s.person_id,s.capture_group.trim()],|r|r.get(0)).map_err(|e|e.to_string())?;
 if leak{return Err("등록 기준과 평가는 다른 사진·다른 촬영 세션을 사용해 주세요.".into());}
 let count:i64=tx.query_row("SELECT COUNT(*) FROM person_evaluation_sample",[],|r|r.get(0)).map_err(|e|e.to_string())?;
 let editing:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM person_evaluation_sample WHERE media_id=?1 AND label_key=?2)",params![s.media_id,label],|r|r.get(0)).map_err(|e|e.to_string())?;
 if count>=2000 && !editing {return Err("평가 자료는 한 묶음에 2,000개까지 사용할 수 있습니다.".into());}
 tx.execute("INSERT INTO person_evaluation_sample(media_id,face_id,person_id,label_key,role,capture_group,category,rights,source_key) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(media_id,label_key) DO UPDATE SET face_id=excluded.face_id,person_id=excluded.person_id,role=excluded.role,capture_group=excluded.capture_group,category=excluded.category,rights=excluded.rights,source_key=excluded.source_key",params![s.media_id,s.face_id,s.person_id,label,s.role,s.capture_group.trim(),s.category,s.rights.trim(),key]).map_err(|e|e.to_string())?;
 tx.commit().map_err(|e|e.to_string())
}
#[derive(Clone)]
struct Row { media:i64, person:Option<i64>, reference:bool, session:String, source:String, category:String, detected:bool, vector:Option<Vec<f64>>, quality:String, seed:bool }
fn rows(conn:&Connection)->Result<Vec<Row>,String>{
 let mut stmt=conn.prepare("SELECT e.media_id,e.person_id,e.role,e.capture_group,e.source_key,e.category,e.face_id,f.descriptor,m.quality,m.reference_kind,m.model_version FROM person_evaluation_sample e LEFT JOIN detected_face f ON f.id=e.face_id LEFT JOIN person_face_metadata m ON m.face_id=f.id ORDER BY e.id").map_err(|e|e.to_string())?;
 let result=stmt.query_map([],|r|{
  let text:Option<String>=r.get(7)?;let version:Option<String>=r.get(10)?;
  let vector=text.and_then(|t|serde_json::from_str::<Vec<f64>>(&t).ok()).filter(|v|version.as_deref()==Some(super::faces::MODEL)&&v.len()==128&&v.iter().all(|x|x.is_finite()));
  Ok(Row{media:r.get(0)?,person:r.get(1)?,reference:r.get::<_,String>(2)?=="reference",session:r.get(3)?,source:r.get(4)?,category:r.get(5)?,detected:r.get::<_,Option<i64>>(6)?.is_some(),vector,quality:r.get::<_,Option<String>>(8)?.unwrap_or_else(||"review".into()),seed:r.get::<_,Option<String>>(9)?.as_deref()==Some("seed")})
 }).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
 let mut checked=BTreeSet::new();
 for r in &result {if checked.insert((r.media,r.source.clone())){super::pet_recognition::verify_source(conn,r.media,&r.source)?;}}
 Ok(result)
}
fn rank(q:&[f64],refs:&[(i64,Vec<f64>)],robust:bool)->Vec<super::person_engine::Candidate>{
 if robust{return super::person_engine::rank(q,refs);}
 let mut nearest:BTreeMap<i64,(&Vec<f64>,f64)>=BTreeMap::new();
 for (id,v) in refs {let d=q.iter().zip(v).map(|(x,y)|(x-y).powi(2)).sum::<f64>();if nearest.get(id).is_none_or(|(_,old)|d<*old){nearest.insert(*id,(v,d));}}
 super::person_engine::rank(q,&nearest.into_iter().map(|(id,(v,_))|(id,v.clone())).collect::<Vec<_>>())
}
fn evaluate(all:&[Row])->Result<Value,String>{
 let refs:Vec<_>=all.iter().filter(|r|r.reference).collect();let queries:Vec<_>=all.iter().filter(|r|!r.reference).collect();
 if refs.is_empty() || queries.is_empty(){return Err("등록 기준과 평가 사진을 각각 추가해 주세요.".into());}
 if refs.iter().any(|r|r.person.is_none()||r.vector.is_none()){return Err("등록 기준의 얼굴 특징을 확인할 수 없습니다.".into());}
 if queries.iter().any(|q|refs.iter().any(|r|r.source==q.source||(r.person==q.person&&q.person.is_some()&&r.session==q.session))){return Err("등록 기준과 평가의 사진·촬영 세션이 겹칩니다.".into());}
 let mut bounded=Vec::new();let mut photos=BTreeSet::new();let mut counts:BTreeMap<i64,usize>=BTreeMap::new();
 for r in refs.iter().rev(){let id=r.person.unwrap();let count=counts.entry(id).or_default();if *count<32&&photos.insert((id,r.source.clone())){bounded.push((id,r.vector.as_ref().unwrap().clone()));*count+=1;}}
 let baseline:Vec<_>=refs.iter().map(|r|(r.person.unwrap(),r.vector.as_ref().unwrap().clone())).collect();
 let seeds:Vec<_>=refs.iter().filter(|r|r.seed&&r.quality=="usable").map(|r|(r.person.unwrap(),r.vector.as_ref().unwrap().clone())).collect();
 let mut conditions=serde_json::Map::new();
 for label in std::iter::once("all").chain(CATEGORIES){
  let subset:Vec<_>=queries.iter().filter(|q|label=="all"||q.category==label).copied().collect();let total=subset.len();
  let ratio=|n:usize,d:usize|if d==0 {Value::Null}else{json!(n as f64/d as f64)};
  let mut condition=json!({"samples":total,"detectionRecall":ratio(subset.iter().filter(|q|q.detected).count(),total),"featureCompatibilityRate":ratio(subset.iter().filter(|q|q.vector.is_some()).count(),total)});
  for improved in [false,true]{
   let mut correct=0;let mut wrong=0;let mut unknown_wrong=0;let mut auto_count=0;let mut occupied:BTreeMap<String,BTreeSet<i64>>=BTreeMap::new();
   for q in &subset {if let Some(vector)=&q.vector {
    let candidates=rank(vector,if improved {&bounded}else{&baseline},improved);
    if q.person.is_some()&&candidates.first().is_some_and(|c|Some(c.person_id)==q.person){correct+=1;}
    let used=occupied.entry(q.source.clone()).or_default();let available:Vec<_>=(if improved {&seeds}else{&baseline}).iter().filter(|(id,_)|!used.contains(id)).cloned().collect();let auto=rank(vector,&available,false);
    if (!improved||q.quality=="usable")&&auto.first().is_some_and(|c|c.distance<0.45&&(auto.len()==1||auto[1].distance-c.distance>0.06)){
     auto_count+=1;let id=auto[0].person_id;used.insert(id);if Some(id)!=q.person{wrong+=1;}if q.person.is_none(){unknown_wrong+=1;}
    }
   }}
   let known=subset.iter().filter(|q|q.person.is_some()).count();let unknown=total-known;
   condition[if improved {"improved"}else{"baseline"}]=json!({"top1Known":ratio(correct,known),"falseLinkPerLabeledFace":ratio(wrong,total),"falseLinkPerAutoLink":ratio(wrong,auto_count),"unknownFalseAccept":ratio(unknown_wrong,unknown),"autoLinks":auto_count});
  }
  conditions.insert(label.into(),condition);
 }
 Ok(json!({"modelVersion":super::faces::MODEL,"photos":queries.iter().map(|q|&q.source).collect::<BTreeSet<_>>().len(),"labeledFaces":queries.len(),"referenceFaces":refs.len(),"referencePeople":counts.len(),"conditions":conditions,"automaticLinksWritten":false,"independentSessionsUserDeclared":true,"processingTimeMeasured":false,"wholeAppMemoryMeasured":false}))
}
#[tauri::command]
pub async fn save_person_evaluation(app:AppHandle,sample:Sample)->Result<(),String>{tauri::async_runtime::spawn_blocking(move||save(&mut super::open_database(&app)?,sample)).await.map_err(|_|"평가 자료를 저장하지 못했습니다.".to_string())?}
#[tauri::command]
pub fn person_evaluation_summary(app:AppHandle)->Result<Value,String>{let c=super::open_database(&app)?;let count=|role:&str|c.query_row("SELECT COUNT(*) FROM person_evaluation_sample WHERE role=?1",[role],|r|r.get::<_,i64>(0)).map_err(|e|e.to_string());Ok(json!({"references":count("reference")?,"queries":count("query")?}))}
#[tauri::command]
pub async fn evaluate_person_samples(app:AppHandle)->Result<Value,String>{tauri::async_runtime::spawn_blocking(move||evaluate(&rows(&super::open_database(&app)?)?)).await.map_err(|_|"평가를 완료하지 못했습니다.".to_string())?}
#[tauri::command]
pub fn clear_person_evaluation(app:AppHandle)->Result<(),String>{super::open_database(&app)?.execute("DELETE FROM person_evaluation_sample",[]).map_err(|e|e.to_string())?;Ok(())}

#[cfg(test)]
mod tests {
 use super::*;
 fn row(person:Option<i64>,reference:bool,category:&str,value:f64)->Row{Row{media:if reference {1}else{2},person,reference,session:if reference {"A"}else{"B"}.into(),source:if reference {"sha256:ref"}else{"sha256:query"}.into(),category:category.into(),detected:true,vector:Some(vec![value;128]),quality:"usable".into(),seed:true}}
 #[test]fn empty_and_leaked_data_are_not_accuracy(){assert!(evaluate(&[]).is_err());let r=row(Some(1),true,"front",0.1);let mut q=row(Some(1),false,"left",0.1);q.session="A".into();assert!(evaluate(&[r.clone(),q.clone()]).is_err());q.session="B".into();q.source=r.source.clone();assert!(evaluate(&[r,q]).is_err());}
 #[test]fn misses_unknowns_and_missing_conditions_remain_visible(){let r=row(Some(1),true,"front",0.1);let mut q=row(Some(1),false,"left",0.1);q.detected=false;q.vector=None;let u=row(None,false,"unregistered",0.1);let report=evaluate(&[r,q,u]).unwrap();assert_eq!(report["conditions"]["left"]["improved"]["top1Known"],0.0);assert_eq!(report["conditions"]["unregistered"]["improved"]["unknownFalseAccept"],1.0);assert!(report["conditions"]["right"]["detectionRecall"].is_null());assert!(!report.to_string().contains("sha256:"));assert!(!report.to_string().contains("descriptor"));}
 #[test]fn automatic_candidates_do_not_reuse_person_in_group(){let r=row(Some(1),true,"front",0.1);let q=row(Some(1),false,"group",0.1);let u=row(None,false,"group",0.1);let report=evaluate(&[r,q,u]).unwrap();assert_eq!(report["conditions"]["all"]["improved"]["autoLinks"],1);}
 #[test]fn labels_preserve_live_links_and_reject_session_content_leakage(){
  let dir=std::env::temp_dir().join(format!("person-eval-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&dir).unwrap();
  let mut c=Connection::open_in_memory().unwrap();crate::database::initialize(&mut c).unwrap();c.execute("INSERT INTO person(id,name) VALUES(1,'private-name')",[]).unwrap();
  for id in 1..=3 {let path=dir.join(format!("{id}.jpg"));std::fs::write(&path,if id==2 {b"photo-B"}else{b"photo-A"}).unwrap();let key=crate::thumbnails::content_key(&path).unwrap();
   c.execute("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(?1,?2,'image',7)",params![id,path.to_str().unwrap()]).unwrap();
   c.execute("INSERT INTO face_scan(media_id,model_version) VALUES(?1,?2)",params![id,crate::faces::MODEL]).unwrap();
   c.execute("INSERT INTO person_scan_metadata(media_id,source_key,engine_version) VALUES(?1,?2,'gamjassak-people-v1')",params![id,key]).unwrap();
   c.execute("INSERT INTO detected_face(id,media_id,person_id,descriptor,thumbnail,confirmed) VALUES(?1,?1,1,?2,'private-thumbnail',0)",params![id,serde_json::to_string(&vec![0.1;128]).unwrap()]).unwrap();
   c.execute("INSERT INTO person_face_metadata(face_id,model_version,reference_kind,quality) VALUES(?1,?2,'seed','usable')",params![id,crate::faces::MODEL]).unwrap();
  }
  let sample=|id,role:&str,session:&str|Sample{media_id:id,face_id:Some(id),person_id:Some(1),missed_slot:None,role:role.into(),capture_group:session.into(),category:"front".into(),rights:"consented owner".into()};
  save(&mut c,sample(1,"reference","A")).unwrap();assert!(save(&mut c,sample(2,"query","A")).is_err());save(&mut c,sample(2,"query","B")).unwrap();assert!(save(&mut c,sample(3,"query","C")).is_err());
  let report=evaluate(&rows(&c).unwrap()).unwrap();assert!(!report.to_string().contains("private"));assert_eq!(c.query_row("SELECT SUM(confirmed) FROM detected_face",[],|r|r.get::<_,i64>(0)).unwrap(),0);
  std::fs::write(dir.join("2.jpg"),b"modified").unwrap();assert!(rows(&c).is_err());assert_eq!(c.query_row("SELECT COUNT(*) FROM detected_face",[],|r|r.get::<_,i64>(0)).unwrap(),3);std::fs::remove_dir_all(dir).unwrap();
 }
}
