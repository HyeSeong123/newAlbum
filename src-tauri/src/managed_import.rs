//! Streaming snapshots of Android documents; never modify the selected original.
use std::{fs, io::{self, Read, Write}, path::{Path, PathBuf}, time::Instant};

pub fn safe_file_name(name: &str, mime: &str) -> String {
    let mut name: String = name.chars().map(|c| if c.is_control() || "/\\:*?\"<>|".contains(c) { '_' } else { c }).take(180).collect();
    name = name.trim().trim_matches('.').to_owned();
    if name.is_empty() { name = "기록".into(); }
    if name.len() > 200 {
        let extension = Path::new(&name).extension().and_then(|value| value.to_str()).filter(|value| value.len() <= 16).map(str::to_owned);
        let mut boundary = 180;
        while !name.is_char_boundary(boundary) { boundary -= 1; }
        name.truncate(boundary);
        if let Some(extension) = extension { name.push('.'); name.push_str(&extension); }
    }
    if Path::new(&name).extension().is_none() {
        let extension = match mime {
            "image/jpeg" => "jpg", "image/png" => "png", "image/webp" => "webp",
            "image/heic" | "image/heif" => "heic", "video/mp4" => "mp4",
            "video/quicktime" => "mov", "video/webm" => "webm", "video/x-matroska" => "mkv",
            "audio/mpeg" => "mp3", "audio/wav" | "audio/x-wav" => "wav", "audio/flac" => "flac", "audio/mp4" => "m4a",
            _ => "bin",
        };
        name.push('.'); name.push_str(extension);
    }
    name
}

pub fn document_target(root: &Path, uri: &str, name: &str) -> PathBuf {
    // The URI itself can reveal provider/account information; retain only a stable key.
    let hash = uri.bytes().fold(0xcbf29ce484222325u64, |hash, byte| (hash ^ byte as u64).wrapping_mul(0x100000001b3));
    root.join(format!("{hash:016x}")).join(name)
}

pub fn copy_document(mut reader: impl Read, target: &Path, mut on_read: impl FnMut(u64)) -> io::Result<u64> {
    on_read(0);
    let parent = target.parent().ok_or_else(|| io::Error::other("보관 위치가 없습니다."))?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(".importing");
    let result = (|| {
        let mut writer = fs::File::create(&temporary)?;
        let mut buffer = [0u8; 64 * 1024];
        let mut copied = 0;
        let mut update = Instant::now();
        loop {
            let count = reader.read(&mut buffer)?;
            if count == 0 { break; }
            writer.write_all(&buffer[..count])?;
            copied += count as u64;
            if update.elapsed().as_millis() >= 100 { on_read(copied); update = Instant::now(); }
        }
        writer.sync_all()?;
        drop(writer);
        fs::rename(&temporary, target)?;
        on_read(copied);
        Ok(copied)
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("android-copy-{label}-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()))
    }
    #[test]
    fn untrusted_display_names_stay_inside_the_app_directory() {
        let name = safe_file_name("../../가족/사진", "image/jpeg");
        assert_eq!(name, "_.._가족_사진.jpg");
        let target = document_target(Path::new("private"), "content://account/private/1", &name);
        assert!(target.starts_with("private"));
        assert_eq!(target.components().count(), 3);
        assert_eq!(safe_file_name("...", "video/mp4"), "기록.mp4");
        assert_eq!(safe_file_name("사진.JPG", "image/jpeg"), "사진.JPG");
        let long = safe_file_name(&format!("{}.jpg", "가".repeat(120)), "image/jpeg");
        assert!(long.len() <= 200);
        assert!(long.ends_with(".jpg"));
    }
    #[test]
    fn large_documents_stream_to_a_complete_file_with_final_progress() {
        let root = root("success");
        let target = document_target(&root, "content://photos/1", "사진.jpg");
        let bytes = vec![42u8; 200_001];
        let mut updates = Vec::new();
        assert_eq!(copy_document(io::Cursor::new(&bytes), &target, |read| updates.push(read)).unwrap(), bytes.len() as u64);
        assert_eq!(fs::read(&target).unwrap(), bytes);
        assert_eq!(updates.first(), Some(&0));
        assert_eq!(updates.last(), Some(&(bytes.len() as u64)));
        assert!(!target.parent().unwrap().join(".importing").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn a_failed_copy_removes_partial_data_and_preserves_previous_contents() {
        struct FailingReader(bool);
        impl Read for FailingReader {
            fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
                if self.0 { return Err(io::Error::other("읽기 실패")); }
                self.0 = true; buffer[0] = 1; Ok(1)
            }
        }
        let root = root("failure"); fs::create_dir_all(&root).unwrap();
        let target = root.join("photo.jpg"); fs::write(&target, b"previous snapshot").unwrap();
        assert!(copy_document(FailingReader(false), &target, |_| {}).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"previous snapshot");
        assert!(!root.join(".importing").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
