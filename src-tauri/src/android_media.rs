use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, io, path::{Path, PathBuf}, time::{Duration, UNIX_EPOCH}};
use tauri::{Manager, plugin::{Builder, PluginHandle, TauriPlugin}};
use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};
use crate::{ImportProgressDto, export::{ExportResultDto, valid_export_folder_name}, managed_import};

struct AndroidMedia(PluginHandle<tauri::Wry>);

pub fn init() -> TauriPlugin<tauri::Wry> {
    Builder::new("android-media").setup(|app, api| {
        let handle = api.register_android_plugin("com.oraedameun.album", "GamjassakMediaPlugin")?;
        app.manage(AndroidMedia(handle));
        Ok(())
    }).build()
}

#[derive(Serialize)]
struct UriPayload<'a> { uri: &'a str }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Document { uri: String, name: String, mime: String, size: Option<u64>, modified: Option<u64> }
#[derive(Deserialize)]
struct Documents { files: Vec<Document> }

#[derive(Deserialize)]
struct PickedDirectory { uri: Option<String> }

pub fn pick_directory(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let bridge = app.state::<AndroidMedia>();
    let selected: PickedDirectory = bridge.0.run_mobile_plugin("pickDirectory", serde_json::json!({}))
        .map_err(|error| format!("폴더를 선택하지 못했습니다: {error}"))?;
    Ok(selected.uri)
}

pub fn prepare_paths(app: &tauri::AppHandle, paths: Vec<String>, mut on_progress: impl FnMut(ImportProgressDto)) -> Result<Vec<String>, String> {
    let mut local = Vec::new();
    let mut documents = Vec::new();
    let bridge = app.state::<AndroidMedia>();
    let mut seen = HashSet::new();
    for path in paths {
        if !path.starts_with("content://") { local.push(path); continue; }
        let response: Documents = bridge.0.run_mobile_plugin("describe", UriPayload { uri: &path }).map_err(|error| format!("선택한 기록을 읽을 수 없습니다: {error}"))?;
        for mut document in response.files {
            document.name = managed_import::safe_file_name(&document.name, &document.mime);
            if crate::is_supported_file(Path::new(&document.name)) && seen.insert(document.uri.clone()) { documents.push(document); }
        }
    }
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?.join("imported-media-v1");
    let total_bytes = if documents.iter().all(|document| document.size.is_some()) { documents.iter().filter_map(|document| document.size).sum() } else { 0 };
    let mut status = ImportProgressDto { phase:"copying", processed:0, total:documents.len(), file_name:None, bytes_processed:0, total_bytes };
    on_progress(status.clone());
    let mut copied = 0;
    for (index, document) in documents.iter().enumerate() {
        status.file_name = Some(document.name.clone()); on_progress(status.clone());
        let target = managed_import::document_target(&root, &document.uri, &document.name);
        let bytes = if target.is_file() { fs::metadata(&target).map_err(|error| error.to_string())?.len() } else {
            let mut options = OpenOptions::new(); options.read(true);
            let input = app.fs().open(FilePath::Url(document.uri.parse().map_err(|error| format!("잘못된 사진 주소입니다: {error}"))?), options).map_err(|error| format!("{} 파일을 열 수 없습니다: {error}", document.name))?;
            let count = managed_import::copy_document(input, &target, |bytes| { status.bytes_processed = copied + bytes; on_progress(status.clone()); })
                .map_err(|error| format!("{} 파일을 보관하지 못했습니다: {error}", document.name))?;
            if let Some(modified) = document.modified.filter(|value| *value > 0) {
                if let Ok(file) = fs::File::options().write(true).open(&target) {
                    let _ = file.set_times(fs::FileTimes::new().set_modified(UNIX_EPOCH + Duration::from_millis(modified)));
                }
            }
            count
        };
        copied += bytes; status.bytes_processed = copied; status.processed = index + 1; on_progress(status.clone());
        local.push(target.to_string_lossy().into_owned());
    }
    Ok(local)
}

pub fn copy_to_uri(app: &tauri::AppHandle, source: &Path, destination: &str) -> Result<(), String> {
    let mut input = fs::File::open(source).map_err(|error| error.to_string())?;
    let mut options = OpenOptions::new(); options.write(true).truncate(true);
    let mut output = app.fs().open(FilePath::Url(destination.parse().map_err(|error| format!("잘못된 저장 위치입니다: {error}"))?), options).map_err(|error| error.to_string())?;
    io::copy(&mut input, &mut output).map_err(|error| format!("사진을 저장하지 못했습니다: {error}"))?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatePayload<'a> { uri: &'a str, name: &'a str, directory: bool }
#[derive(Deserialize)]
struct Created { uri: String }

pub fn export_files(app: &tauri::AppHandle, sources: &[PathBuf], parent: &str, name: &str) -> Result<ExportResultDto, String> {
    let name = valid_export_folder_name(name)?;
    let mut seen = HashSet::new();
    let sources: Vec<_> = sources.iter().filter(|path| seen.insert((*path).clone())).collect();
    if sources.is_empty() { return Err("내보낼 기록이 없습니다.".into()); }
    if let Some(missing) = sources.iter().find(|path| !path.is_file()) { return Err(format!("원본 기록을 찾을 수 없습니다: {}", missing.display())); }
    let bridge = app.state::<AndroidMedia>();
    let folder: Created = bridge.0.run_mobile_plugin("createDocument", CreatePayload { uri:parent, name:&name, directory:true }).map_err(|error| error.to_string())?;
    for source in &sources {
        let file_name = source.file_name().ok_or("기록 이름이 없습니다.")?.to_string_lossy();
        let file: Created = bridge.0.run_mobile_plugin("createDocument", CreatePayload { uri:&folder.uri, name:&file_name, directory:false }).map_err(|error| error.to_string())?;
        copy_to_uri(app, source, &file.uri)?;
    }
    Ok(ExportResultDto { directory:format!("선택한 폴더/{name}"), copied:sources.len() })
}
