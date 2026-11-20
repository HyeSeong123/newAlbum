use crate::{android_media, backup::{self, Result, Storage, DB, MEDIA, WEB}};
use serde_json::{json, Value};
use std::{fs::{self, File}, io::{self, Write}, path::Path, sync::{Mutex, atomic::{AtomicBool, Ordering}}};
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::{FsExt, OpenOptions};

static LOCK: Mutex<()> = Mutex::new(());
static CLOSING: AtomicBool = AtomicBool::new(false);

fn durable_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = path.with_extension("tmp");
    let mut f = File::create(&tmp)?;
    f.write_all(bytes)?; f.sync_all()?;
    fs::rename(tmp,path)?;
    File::open(path.parent().unwrap())?.sync_all()?;
    Ok(())
}

pub(crate) fn action(app: &AppHandle, action: &str, storage: Option<Storage>, token: Option<String>) -> Result<Value> {
    let _lock = LOCK.try_lock().map_err(|_| "다른 백업 작업이 진행 중입니다.")?;
    let root = app.path().app_data_dir()?;
    let work = root.join("backup-work-v1");
    let stage = work.join("stage");
    let phase = work.join("phase");
    if action == "startup" && !work.exists() { return Ok(Value::Null); }
    fs::create_dir_all(&work)?;
    let previous = work.join("previous");
    let state = if phase.exists() { fs::read_to_string(&phase)? } else { String::new() };
    let set_phase = |s: &str| durable_write(&phase,s.as_bytes());
    if CLOSING.load(Ordering::SeqCst) { return Err("앱을 완전히 닫고 다시 열어 주세요.".into()); }
    match action {
        "startup" if state.is_empty() => {
            // Abandoned file pickers and interrupted previews were never approved.
            fs::remove_dir_all(&work)?;
            Ok(Value::Null)
        }
        "startup" if state == "install" => {
            fs::create_dir_all(&previous)?;
            if !previous.join(WEB).exists() {
                let storage = storage.ok_or("기존 앱 기록을 읽지 못했습니다.")?;
                backup::validate_storage(&storage)?;
                durable_write(&previous.join(WEB),&serde_json::to_vec(&storage)?)?;
            }
            if !previous.join(DB).exists() {
                // Recover hot journals and consolidate WAL before moving the database.
                let c = crate::open_database(app)?;
                let mode: String = c.query_row("PRAGMA journal_mode=DELETE", [], |r| r.get(0))?;
                if mode != "delete" { return Err("기존 기록이 사용 중입니다. 앱을 다시 열어 주세요.".into()); }
                fs::create_dir_all(root.join(MEDIA))?;
            }
            backup::install(&root,&work)?;
            set_phase("web")?;
            Ok(json!({"mode":"restore","storage":backup::storage_at(&stage)?}))
        }
        "startup" if state == "web" => Ok(json!({"mode":"restore","storage":backup::storage_at(&stage)?})),
        "rollback" | "startup" if matches!(state.as_str(),"web"|"install"|"undo") => {
            set_phase("undo")?;
            fs::create_dir_all(work.join("discard"))?;
            backup::undo(&root,&work)?;
            let old = if previous.join(WEB).exists() { backup::storage_at(&previous)? } else { storage.ok_or("앱 기록이 없습니다.")? };
            Ok(json!({"mode":"undo","storage":old}))
        }
        "ack" if state=="web" || state=="undo" => {
            // Remove the marker before optional cleanup so a killed cleanup cannot replay.
            fs::remove_file(&phase)?;
            File::open(&work)?.sync_all()?;
            let _ = fs::remove_dir_all(work);
            Ok(Value::Null)
        }
        _ if !state.is_empty() => Err("복원을 마치려면 앱을 다시 열어 주세요.".into()),
        "export" => {
            let storage = storage.ok_or("앱 기록을 읽지 못했습니다.")?;
            let temp = work.join("export");
            backup::reset_dir(&temp)?;
            let Some(path) = android_media::open_backup(app,true)? else { return Ok(Value::Null) };
            let result = (|| -> Result<Value> {
                let c = crate::open_database(app)?;
                let mut options = OpenOptions::new(); options.write(true).truncate(true);
                let mut out = app.fs().open(path.clone(),options)?;
                backup::export(&c,&root,&temp,&storage,&mut out)?;
                out.sync_all()?;
                Ok(json!(true))
            })();
            if result.is_err() { android_media::discard_failed_backup(app, &path); }
            let _ = fs::remove_dir_all(temp);
            result
        }
        "preview" => {
            let Some(path) = android_media::open_backup(app,false)? else { return Ok(Value::Null) };
            backup::reset_dir(&stage)?;
            let result = (|| -> Result<Value> {
                let mut options = OpenOptions::new(); options.read(true);
                let mut input = app.fs().open(path,options)?;
                let c = crate::open_database(app)?;
                let restored = backup::prepare(&mut input,&c,&root,&stage)?;
                let token = uuid::Uuid::new_v4().to_string();
                durable_write(&stage.join("ticket"),token.as_bytes())?;
                Ok(json!({"current":backup::counts(&c)?,"restored":restored,"token":token}))
            })();
            if result.is_err() { let _ = fs::remove_dir_all(stage); }
            result
        }
        "cancel" => { if stage.exists() { fs::remove_dir_all(stage)?; } Ok(Value::Null) }
        "confirm" => {
            if token.as_deref() != Some(fs::read_to_string(stage.join("ticket"))?.as_str()) { return Err("백업 파일을 다시 확인해 주세요.".into()); }
            set_phase("install")?;
            CLOSING.store(true,Ordering::SeqCst);
            if let Err(e) = android_media::finish_for_restore(app) {
                CLOSING.store(false,Ordering::SeqCst); fs::remove_file(phase)?; return Err(e.into());
            }
            Ok(Value::Null)
        }
        _ => Err(io::Error::other("복원 상태를 확인할 수 없습니다.").into())
    }
}
