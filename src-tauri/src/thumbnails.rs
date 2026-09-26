use image::{DynamicImage, ImageDecoder, ImageReader};
use std::{
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    sync::Mutex,
    time::UNIX_EPOCH,
};
use tauri::{AppHandle, Manager};

static GENERATION: [Mutex<()>; 2] = [Mutex::new(()), Mutex::new(())];

#[tauri::command]
pub async fn media_thumbnail(app: AppHandle, id: i64) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let db = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("album.sqlite");
        let conn =
            rusqlite::Connection::open_with_flags(db, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(|e| e.to_string())?;
        let source: String = conn
            .query_row(
                "SELECT file_path FROM media WHERE id = ?1 AND file_type = 'image'",
                [id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        let cache = app
            .path()
            .app_cache_dir()
            .map_err(|e| e.to_string())?
            .join("thumbnails-v1");
        generate(Path::new(&source), &cache, id)
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn generate(
    source: &Path,
    cache: &Path,
    id: i64,
) -> Result<PathBuf, Box<dyn std::error::Error + Send + Sync>> {
    let metadata = fs::metadata(source)?;
    let modified = metadata.modified()?.duration_since(UNIX_EPOCH)?.as_nanos();
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    source.hash(&mut hash);
    let target = cache.join(format!(
        "{id}-{}-{}-{modified}.png",
        hash.finish(),
        metadata.len()
    ));
    if target.is_file() {
        return Ok(target);
    }
    // Cached reads never wait for decoding. The same ID always uses the same lane.
    let _guard = GENERATION[id.unsigned_abs() as usize % GENERATION.len()]
        .lock()
        .map_err(|e| e.to_string())?;
    if target.is_file() {
        return Ok(target);
    }
    fs::create_dir_all(cache)?;
    let mut decoder = ImageReader::open(source)?
        .with_guessed_format()?
        .into_decoder()?;
    let orientation = decoder.orientation()?;
    let mut image = DynamicImage::from_decoder(decoder)?;
    image.apply_orientation(orientation);
    let thumbnail = image.thumbnail(640, 640);
    let temporary = target.with_extension("tmp");
    let writer = std::io::BufWriter::new(fs::File::create(&temporary)?);
    let encoder = image::codecs::png::PngEncoder::new_with_quality(
        writer,
        image::codecs::png::CompressionType::Fast,
        image::codecs::png::FilterType::Adaptive,
    );
    thumbnail.write_with_encoder(encoder)?;
    fs::rename(&temporary, &target)?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn thumbnail_is_small_cached_and_original_is_unchanged() {
        let root = std::env::temp_dir().join(format!(
            "album-thumb-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let original = root.join("photo.png");
        DynamicImage::new_rgb8(2000, 1000).save(&original).unwrap();
        let bytes = fs::read(&original).unwrap();
        let output = generate(&original, &root.join("cache"), 1).unwrap();
        assert_eq!(image::image_dimensions(&output).unwrap(), (640, 320));
        let time = fs::metadata(&output).unwrap().modified().unwrap();
        // A warm cache must work even while its decode lane is busy.
        let busy = GENERATION[1].lock().unwrap();
        assert_eq!(generate(&original, &root.join("cache"), 1).unwrap(), output);
        drop(busy);
        assert_eq!(fs::metadata(&output).unwrap().modified().unwrap(), time);
        assert_eq!(fs::read(&original).unwrap(), bytes);
        fs::remove_dir_all(root).unwrap();
    }
}
