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
struct PhotoLocationPermission { granted: bool }
#[derive(Deserialize)]
struct OriginalPhoto { uri: String, notice: Option<String> }

#[derive(Deserialize)]
struct PickedDirectory { uri: Option<String> }

#[derive(Deserialize)]
struct PickedGallery { uris: Option<Vec<String>> }

pub fn pick_gallery(app: &tauri::AppHandle) -> Result<Option<Vec<String>>, String> {
    let bridge = app.state::<AndroidMedia>();
    let selected: PickedGallery = bridge.0.run_mobile_plugin("pickGallery", serde_json::json!({}))
        .map_err(|error| format!("갤러리를 열지 못했습니다: {error}"))?;
    Ok(selected.uris)
}

pub fn pick_directory(app: &tauri::AppHandle, prefer_pictures: bool) -> Result<Option<String>, String> {
    let bridge = app.state::<AndroidMedia>();
    let selected: PickedDirectory = bridge.0.run_mobile_plugin("pickDirectory", serde_json::json!({ "preferPictures": prefer_pictures }))
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
    let source_database = crate::open_database(app)?;
    crate::gallery_sources::initialize(&source_database)?;
    let total_bytes = if documents.iter().all(|document| document.size.is_some()) { documents.iter().filter_map(|document| document.size).sum() } else { 0 };
    let photo_location = if documents.iter().any(|document| crate::media_type(Path::new(&document.name)) == Some("image")) {
        let permission: PhotoLocationPermission = bridge.0.run_mobile_plugin("requestPhotoLocation", serde_json::json!({}))
            .map_err(|error| format!("사진 위치정보 권한을 확인하지 못했습니다: {error}"))?;
        Some(permission.granted)
    } else { None };
    let notice = (photo_location == Some(false)).then(|| "사진 위치정보 권한이 꺼져 있어 촬영 위치를 읽지 못할 수 있습니다. 앱 설정에서 사진 위치정보를 허용한 뒤 원본을 다시 가져와 주세요.".to_string());
    let mut status = ImportProgressDto { phase:"copying", processed:0, total:documents.len(), file_name:None, bytes_processed:0, total_bytes, notice };
    on_progress(status.clone());
    let mut copied = 0;
    for (index, document) in documents.iter().enumerate() {
        status.file_name = Some(document.name.clone()); on_progress(status.clone());
        let target = managed_import::document_target(&root, &document.uri, &document.name);
        let image = crate::media_type(Path::new(&document.name)) == Some("image");
        // Re-read selected photos, including SAF originals when MediaStore cannot
        // supply them. Keep the stable path and never replace valid GPS with a
        // redacted fallback. Other media can reuse the existing app snapshot.
        let bytes = if target.is_file() && !image { fs::metadata(&target).map_err(|error| error.to_string())?.len() } else {
            let mut original_notice = None;
            let source = if image {
                let original: OriginalPhoto = bridge.0.run_mobile_plugin("originalPhotoUri", UriPayload { uri: &document.uri })
                    .map_err(|error| format!("원본 사진을 준비하지 못했습니다: {error}"))?;
                original_notice = original.notice;
                original.uri
            } else { document.uri.clone() };
            let mut options = OpenOptions::new(); options.read(true);
            let input = app.fs().open(FilePath::Url(source.parse().map_err(|error| format!("잘못된 사진 주소입니다: {error}"))?), options).map_err(|error| format!("{} 파일을 열 수 없습니다: {error}", document.name))?;
            let previous_gps = image && target.is_file() && crate::location::analyze_path(&target, "image").latitude.is_some();
            let mut preserved_gps = false;
            let count = managed_import::copy_document_checked(input, &target,
                |bytes| { status.bytes_processed = copied + bytes; on_progress(status.clone()); },
                |candidate| {
                    let replace = !previous_gps || crate::location::analyze_path(candidate, "image").latitude.is_some();
                    preserved_gps = !replace;
                    replace
                })
                .map_err(|error| format!("{} 파일을 보관하지 못했습니다: {error}", document.name))?;
            if preserved_gps {
                status.notice = Some("선택한 사진에서 촬영 위치를 읽지 못해 위치정보가 있는 기존 보관본을 유지했습니다. 휴대폰의 원본을 다시 선택해 주세요.".into());
                on_progress(status.clone());
            }
            // A valid SAF fallback is a successful GPS read. Only show the
            // provider limitation when the selected photo actually lacks GPS.
            if !preserved_gps && original_notice.is_some() && crate::location::analyze_path(&target, "image").latitude.is_none() {
                status.notice = original_notice;
                on_progress(status.clone());
            }
            if let Some(modified) = document.modified.filter(|value| *value > 0) {
                if let Ok(file) = fs::File::options().write(true).open(&target) {
                    let _ = file.set_times(fs::FileTimes::new().set_modified(UNIX_EPOCH + Duration::from_millis(modified)));
                }
            }
            count
        };
        copied += bytes; status.bytes_processed = copied; status.processed = index + 1; on_progress(status.clone());
        local.push(target.to_string_lossy().into_owned());
        crate::gallery_sources::remember(&source_database, &crate::normalize_file_path(&target.canonicalize().unwrap_or_else(|_| target.clone())), &document.uri)?;
    }
    Ok(local)
}

#[derive(Deserialize)]
struct GallerySourceState { uri: String, state: String }
#[derive(Deserialize)]
struct GalleryDocument { uri: String, name: String }
#[derive(Deserialize)]
struct GallerySources { rows: Vec<GallerySourceState>, gallery: Vec<GalleryDocument> }

pub fn compare_gallery(app: &tauri::AppHandle) -> Result<crate::gallery_sources::Comparison, String> {
    let conn = crate::open_database(app)?;
    crate::gallery_sources::initialize(&conn)?;
    let records = crate::gallery_sources::registered(&conn)?;
    let mut result = crate::gallery_sources::Comparison::default();
    if records.is_empty() { return Ok(result); }
    let bridge = app.state::<AndroidMedia>();
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?.join("imported-media-v1");
    let root = root.canonicalize().unwrap_or(root);
    let mut states = std::collections::HashMap::new();
    let mut legacy = std::collections::HashMap::new();
    let uris: Vec<_> = records.iter().filter_map(|(_, uri)| uri.clone()).collect::<HashSet<_>>().into_iter().collect();
    let discover = records.iter().any(|(path, uri)| uri.is_none() && Path::new(path).starts_with(&root));
    // Include an empty first chunk so legacy snapshots can be matched once by
    // their stable URI-derived path, without reading image bytes or running AI.
    for index in 0..std::cmp::max(1, uris.len().div_ceil(200)) {
        let start = (index * 200).min(uris.len());
        let end = (start + 200).min(uris.len());
        let response: GallerySources = bridge.0.run_mobile_plugin("checkGallerySources", serde_json::json!({"uris": &uris[start..end], "discover": discover && index == 0}))
            .map_err(|_| "갤러리 원본을 확인하지 못했습니다. 앱에 보관한 사진은 그대로 사용할 수 있어요.".to_string())?;
        for row in response.rows { states.insert(row.uri, row.state); }
        for document in response.gallery {
            let path = managed_import::document_target(&root, &document.uri, &managed_import::safe_file_name(&document.name, ""));
            legacy.insert(crate::normalize_file_path(&path.canonicalize().unwrap_or(path)), document.uri);
        }
    }
    for (path, source) in records {
        result.checked += 1;
        if !Path::new(&path).is_file() { result.missing_copies += 1; }
        if let Some(uri) = source {
            match states.get(&uri).map(String::as_str) {
                Some("present") => result.present += 1,
                Some("missing") => result.missing += 1,
                _ => result.unavailable += 1,
            }
        } else if let Some(uri) = legacy.get(&path) {
            crate::gallery_sources::remember(&conn, &path, uri)?;
            result.present += 1;
        } else { result.untracked += 1; }
    }
    Ok(result)
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

#[derive(Deserialize)]
struct VideoThumbnail { path: String }
pub fn video_thumbnail(app: &tauri::AppHandle, source: &Path, target: &Path) -> Result<(), String> {
    let bridge = app.state::<AndroidMedia>();
    let result: VideoThumbnail = bridge.0.run_mobile_plugin("videoThumbnail", serde_json::json!({"source":source.to_string_lossy(),"target":target.to_string_lossy()}))
        .map_err(|error| format!("동영상 썸네일을 만들 수 없습니다: {error}"))?;
    if result.path != target.to_string_lossy() || !target.is_file() { return Err("동영상 썸네일이 없습니다.".into()); }
    Ok(())
}

