use crate::normalize_file_path;
use serde::Serialize;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

#[derive(Serialize)]
pub(super) struct ExportResultDto {
    pub(super) directory: String,
    pub(super) copied: usize,
}

pub(super) fn export_media_files(
    source_paths: &[PathBuf],
    destination_root: &Path,
    folder_name: &str,
) -> Result<ExportResultDto, String> {
    let folder_name = valid_export_folder_name(folder_name)?;
    if source_paths.is_empty() {
        return Err("내보낼 파일이 없습니다.".into());
    }
    if !destination_root.is_dir() {
        return Err("내보낼 상위 폴더를 찾을 수 없습니다.".into());
    }

    let mut unique_sources = Vec::new();
    let mut seen = HashSet::new();
    for source in source_paths {
        if !source.is_file() {
            return Err(format!(
                "원본 파일을 찾을 수 없습니다: {}",
                source.display()
            ));
        }
        let key = source
            .canonicalize()
            .unwrap_or_else(|_| source.to_path_buf());
        if seen.insert(key) {
            unique_sources.push(source);
        }
    }

    let destination = destination_root.join(folder_name);
    if destination.exists() {
        return Err("같은 이름의 폴더가 이미 있습니다. 다른 폴더명을 입력해 주세요.".into());
    }
    fs::create_dir(&destination)
        .map_err(|error| format!("내보낼 폴더를 만들 수 없습니다: {error}"))?;

    let result: Result<ExportResultDto, String> = (|| {
        for source in &unique_sources {
            let file_name = source
                .file_name()
                .ok_or_else(|| format!("파일명을 확인할 수 없습니다: {}", source.display()))?;
            let target = unique_export_path(&destination, file_name);
            fs::copy(source, &target).map_err(|error| {
                format!("파일을 복사할 수 없습니다: {} ({error})", source.display())
            })?;
        }
        Ok(ExportResultDto {
            directory: normalize_file_path(&destination),
            copied: unique_sources.len(),
        })
    })();

    if result.is_err() {
        let _ = fs::remove_dir_all(&destination);
    }
    result
}

pub(super) fn valid_export_folder_name(value: &str) -> Result<&str, String> {
    let name = value.trim();
    if name.is_empty() {
        return Err("폴더명을 입력해 주세요.".into());
    }
    if name == "."
        || name == ".."
        || name.ends_with('.')
        || name.ends_with(' ')
        || name.chars().count() > 100
        || name
            .chars()
            .any(|character| character.is_control() || "<>:\"/\\|?*".contains(character))
    {
        return Err("폴더명에 사용할 수 없는 문자가 있습니다.".into());
    }
    let base = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    let reserved = matches!(base.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (base.len() == 4
            && (base.starts_with("COM") || base.starts_with("LPT"))
            && base.as_bytes()[3].is_ascii_digit()
            && base.as_bytes()[3] != b'0');
    if reserved {
        return Err("Windows에서 사용할 수 없는 폴더명입니다.".into());
    }
    Ok(name)
}

fn unique_export_path(directory: &Path, file_name: &std::ffi::OsStr) -> PathBuf {
    let direct = directory.join(file_name);
    if !direct.exists() {
        return direct;
    }
    let original = Path::new(file_name);
    let stem = original
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("파일");
    let extension = original.extension().and_then(|value| value.to_str());
    for index in 2.. {
        let candidate = match extension {
            Some(extension) => directory.join(format!("{stem} ({index}).{extension}")),
            None => directory.join(format!("{stem} ({index})")),
        };
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}
