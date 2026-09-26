use image::{metadata::Orientation, ImageDecoder, ImageReader};
use rusqlite::{params, Connection};
use std::path::Path;

// Read headers/EXIF only, without decoding full-size pixels or changing the source.
pub fn read(path: &Path) -> Option<(i64, i64)> {
    let mut decoder = ImageReader::open(path).ok()?.with_guessed_format().ok()?.into_decoder().ok()?;
    let (width, height) = decoder.dimensions();
    if width == 0 || height == 0 { return None; }
    let rotated = matches!(decoder.orientation().ok()?,
        Orientation::Rotate90 | Orientation::Rotate270 | Orientation::Rotate90FlipH | Orientation::Rotate270FlipH);
    Some(if rotated { (height.into(), width.into()) } else { (width.into(), height.into()) })
}

pub fn backfill(conn: &Connection) -> Result<(), String> {
    let pending = {
        let mut stmt = conn.prepare("SELECT id, file_path FROM media WHERE file_type = 'image'
            AND (width IS NULL OR height IS NULL OR width <= 0 OR height <= 0)").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };
    let dimensions: Vec<_> = pending.into_iter().filter_map(|(id, path)|
        read(Path::new(&path)).map(|(width, height)| (id, width, height))).collect();
    if dimensions.is_empty() { return Ok(()); }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (id, width, height) in dimensions {
        tx.execute("UPDATE media SET width = ?1, height = ?2 WHERE id = ?3
            AND (width IS NULL OR height IS NULL OR width <= 0 OR height <= 0)",
            params![width, height, id]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, time::{SystemTime, UNIX_EPOCH}};

    #[test]
    fn legacy_dimensions_and_exif_rotation_are_persisted_without_touching_originals() {
        let root = std::env::temp_dir().join(format!("album-dimensions-{}-{}", std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("rotated.jpg");
        image::DynamicImage::new_rgb8(90, 60).save(&path).unwrap();
        let jpeg = fs::read(&path).unwrap();
        // APP1: little-endian TIFF, one SHORT Orientation entry with value 6 (90 degrees).
        let exif: &[u8] = b"Exif\0\0II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0";
        let mut bytes = jpeg[..2].to_vec();
        bytes.extend_from_slice(&[0xff, 0xe1]);
        bytes.extend_from_slice(&((exif.len() + 2) as u16).to_be_bytes());
        bytes.extend_from_slice(exif);
        bytes.extend_from_slice(&jpeg[2..]);
        fs::write(&path, &bytes).unwrap();
        assert_eq!(read(&path), Some((60, 90)));
        let imported = Connection::open_in_memory().unwrap();
        imported.execute_batch(include_str!("../database/schema.sql")).unwrap();
        crate::register_file(&imported, &path).unwrap();
        let imported_size: (i64, i64) = imported.query_row("SELECT width, height FROM media", [],
            |row| Ok((row.get(0)?, row.get(1)?))).unwrap();
        assert_eq!(imported_size, (60, 90));
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../database/schema.sql")).unwrap();
        conn.execute("INSERT INTO media(file_path, file_type, size_bytes, title, rating) VALUES (?1, 'image', 1, '기존 제목', 4)",
            [path.to_string_lossy().as_ref()]).unwrap();
        conn.execute("INSERT INTO media(file_path, file_type, size_bytes) VALUES ('missing.jpg', 'image', 1)", []).unwrap();
        backfill(&conn).unwrap();
        backfill(&conn).unwrap();
        let value: (i64, i64, String, i64) = conn.query_row("SELECT width, height, title, rating FROM media WHERE id = 1", [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))).unwrap();
        assert_eq!(value, (60, 90, "기존 제목".into(), 4));
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(read(&root.join("missing.jpg")), None);
        fs::remove_dir_all(root).unwrap();
    }
}
