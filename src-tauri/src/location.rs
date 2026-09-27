//! Offline EXIF/track coordinates and province lookup. Original files are only read.
use nom_exif::{read_exif, read_track};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{path::Path, sync::OnceLock};

#[derive(Clone, Debug, Serialize)]
pub struct LocationResult {
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub region_code: Option<String>,
    pub region_name: Option<String>,
    pub status: &'static str,
}

impl LocationResult {
    fn no_gps() -> Self {
        Self {
            latitude: None,
            longitude: None,
            region_code: None,
            region_name: None,
            status: "no-gps",
        }
    }
    fn failed() -> Self {
        Self {
            status: "failed",
            ..Self::no_gps()
        }
    }
}

#[derive(Deserialize)]
struct FeatureCollection {
    features: Vec<Feature>,
}
#[derive(Deserialize)]
struct Feature {
    properties: Properties,
    geometry: Geometry,
}
#[derive(Deserialize)]
struct Properties {
    #[serde(rename = "shapeISO")]
    shape_iso: String,
}
#[derive(Deserialize)]
struct Geometry {
    #[serde(rename = "type")]
    kind: String,
    coordinates: serde_json::Value,
}

struct RegionBoundary {
    code: String,
    name: &'static str,
    polygons: Vec<Vec<Vec<[f64; 2]>>>,
}

pub const REGIONS: [(&str, &str); 17] = [
    ("KR-11", "서울특별시"),
    ("KR-26", "부산광역시"),
    ("KR-27", "대구광역시"),
    ("KR-28", "인천광역시"),
    ("KR-29", "광주광역시"),
    ("KR-30", "대전광역시"),
    ("KR-31", "울산광역시"),
    ("KR-41", "경기도"),
    ("KR-42", "강원특별자치도"),
    ("KR-43", "충청북도"),
    ("KR-44", "충청남도"),
    ("KR-45", "전북특별자치도"),
    ("KR-46", "전남광주통합특별시"),
    ("KR-47", "경상북도"),
    ("KR-48", "경상남도"),
    ("KR-49", "제주특별자치도"),
    ("KR-50", "세종특별자치시"),
];

// Separate predicates let SQLite use the region index when a province is selected.
pub const REGION_FILTER_SQL: &str =
    "file_type IN ('image','video') AND location_status='ready' AND region_code=?1";
pub const UNCLASSIFIED_FILTER_SQL: &str =
    "file_type IN ('image','video') AND ?1='unclassified' AND location_status NOT IN ('ready','queued')";

fn boundaries() -> &'static [RegionBoundary] {
    static BOUNDARIES: OnceLock<Vec<RegionBoundary>> = OnceLock::new();
    BOUNDARIES.get_or_init(|| {
        let data: FeatureCollection =
            serde_json::from_str(include_str!("../../data/korea-adm1.geojson"))
                .expect("bundled KOR ADM1 GeoJSON must be valid");
        assert_eq!(
            data.features.len(),
            REGIONS.len(),
            "all 17 provinces must be present"
        );
        data.features
            .into_iter()
            .map(|feature| {
                let name = REGIONS
                    .iter()
                    .find(|(code, _)| *code == feature.properties.shape_iso)
                    .expect("unknown province code in bundled map")
                    .1;
                let geometry = feature.geometry;
                let coordinates = if geometry.kind == "Polygon" {
                    // The outer vector is a list of separate polygons, not a list of rings.
                    vec![
                        serde_json::from_value::<Vec<Vec<[f64; 2]>>>(geometry.coordinates)
                            .expect("valid polygon rings"),
                    ]
                } else {
                    assert_eq!(geometry.kind, "MultiPolygon");
                    serde_json::from_value::<Vec<Vec<Vec<[f64; 2]>>>>(geometry.coordinates)
                        .expect("valid multipolygon rings")
                };
                RegionBoundary {
                    code: feature.properties.shape_iso,
                    name,
                    polygons: coordinates,
                }
            })
            .collect()
    })
}

fn ring_contains(ring: &[[f64; 2]], longitude: f64, latitude: f64) -> bool {
    if ring.len() < 3 {
        return false;
    }
    let mut inside = false;
    for index in 0..ring.len() {
        let [x1, y1] = ring[index];
        let [x2, y2] = ring[(index + 1) % ring.len()];
        let cross = (longitude - x1) * (y2 - y1) - (latitude - y1) * (x2 - x1);
        if cross.abs() < 1e-10
            && longitude >= x1.min(x2) - 1e-10
            && longitude <= x1.max(x2) + 1e-10
            && latitude >= y1.min(y2) - 1e-10
            && latitude <= y1.max(y2) + 1e-10
        {
            return true;
        }
        if (y1 > latitude) != (y2 > latitude) {
            let crossing = x1 + (latitude - y1) * (x2 - x1) / (y2 - y1);
            if longitude < crossing {
                inside = !inside;
            }
        }
    }
    inside
}

pub fn resolve_region(latitude: f64, longitude: f64) -> Option<(&'static str, &'static str)> {
    if !latitude.is_finite()
        || !longitude.is_finite()
        || !(-90.0..=90.0).contains(&latitude)
        || !(-180.0..=180.0).contains(&longitude)
    {
        return None;
    }
    for region in boundaries() {
        if region.polygons.iter().any(|rings| {
            rings
                .first()
                .is_some_and(|outer| ring_contains(outer, longitude, latitude))
                && !rings
                    .iter()
                    .skip(1)
                    .any(|hole| ring_contains(hole, longitude, latitude))
        }) {
            if region.code == "KR-29" { return Some(("KR-46", "전남광주통합특별시")); }
            return Some((
                REGIONS
                    .iter()
                    .find(|(code, _)| *code == region.code)
                    .unwrap()
                    .0,
                region.name,
            ));
        }
    }
    None
}

fn from_coordinates(latitude: f64, longitude: f64) -> LocationResult {
    if !latitude.is_finite()
        || !longitude.is_finite()
        || !(-90.0..=90.0).contains(&latitude)
        || !(-180.0..=180.0).contains(&longitude)
    {
        return LocationResult::failed();
    }
    let region = resolve_region(latitude, longitude);
    LocationResult {
        latitude: Some(latitude),
        longitude: Some(longitude),
        region_code: region.map(|value| value.0.to_owned()),
        region_name: region.map(|value| value.1.to_owned()),
        status: if region.is_some() {
            "ready"
        } else {
            "outside-korea"
        },
    }
}

pub fn analyze_path(path: &Path, file_type: &str) -> LocationResult {
    if file_type == "audio" {
        return LocationResult::no_gps();
    }
    let gps = match file_type {
        "image" => match read_exif(path) {
            Ok(exif) => exif.gps_info().cloned(),
            Err(nom_exif::Error::ExifNotFound | nom_exif::Error::UnsupportedFormat) => {
                return LocationResult::no_gps()
            }
            Err(_) => return LocationResult::failed(),
        },
        "video" => match read_track(path) {
            Ok(track) => track.gps_info().cloned(),
            Err(nom_exif::Error::TrackNotFound | nom_exif::Error::UnsupportedFormat) => {
                return LocationResult::no_gps()
            }
            Err(_) => return LocationResult::failed(),
        },
        _ => return LocationResult::no_gps(),
    };
    match gps {
        Some(value) => match (value.latitude_decimal(), value.longitude_decimal()) {
            (Some(lat), Some(lon)) => from_coordinates(lat, lon),
            _ => LocationResult::failed(),
        },
        None => LocationResult::no_gps(),
    }
}

pub fn migrate(conn: &Connection) -> Result<(), String> {
    for (column, definition) in [
        ("latitude", "REAL"),
        ("longitude", "REAL"),
        ("region_code", "TEXT"),
        ("region_name", "TEXT"),
        ("location_status", "TEXT NOT NULL DEFAULT 'queued'"),
        ("location_source", "TEXT NOT NULL DEFAULT 'gps'"),
        ("district", "TEXT"),
        ("country", "TEXT"),
        ("city", "TEXT"),
    ] {
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('media') WHERE name = ?1)",
                [column],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        if !exists {
            conn.execute(
                &format!("ALTER TABLE media ADD COLUMN {column} {definition}"),
                [],
            )
            .map_err(|error| format!("위치 정보 마이그레이션 실패: {error}"))?;
        }
    }
    conn.execute("UPDATE media SET region_code='KR-46', region_name='전남광주통합특별시' WHERE region_code='KR-29'", []).map_err(|e| e.to_string())?;
    conn.execute("UPDATE media SET region_name='전남광주통합특별시' WHERE region_code='KR-46' AND region_name!='전남광주통합특별시'", []).map_err(|e| e.to_string())?;
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_media_location ON media(region_code, taken_at DESC, id DESC) WHERE file_type IN ('image', 'video');
        CREATE INDEX IF NOT EXISTS idx_media_location_status ON media(location_status) WHERE file_type IN ('image', 'video');")
        .map_err(|error| format!("위치 정보 인덱스 생성 실패: {error}"))?;
    Ok(())
}

#[cfg(test)]
pub fn save(conn: &Connection, id: i64, result: &LocationResult) -> Result<(), String> {
    conn.execute("UPDATE media SET latitude=?1, longitude=?2, region_code=?3, region_name=?4, location_status=?5 WHERE id=?6",
        params![result.latitude, result.longitude, result.region_code, result.region_name, result.status, id])
        .map_err(|error| format!("위치 정보 저장 실패: {error}"))?;
    Ok(())
}

pub fn analyze_batch(conn: &Connection, batch_size: i64) -> Result<Overview, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, file_type FROM media
             WHERE file_type IN ('image','video') AND location_status='queued' AND location_source!='manual'
             ORDER BY id LIMIT ?1",
        )
        .map_err(|error| error.to_string())?;
    let files = stmt
        .query_map([batch_size.clamp(1, 24)], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    drop(stmt);
    // Perform file I/O before taking a write lock. Commit the small batch once.
    let results: Vec<_> = files.into_iter().map(|(id, path, kind)|
        (id, analyze_path(Path::new(&path), &kind))).collect();
    if !results.is_empty() {
        let tx = conn.unchecked_transaction().map_err(|error| error.to_string())?;
        {
            let mut update = tx.prepare("UPDATE media SET latitude=?1, longitude=?2, region_code=?3,
                region_name=?4, location_status=?5 WHERE id=?6 AND location_status='queued' AND location_source!='manual'")
                .map_err(|error| error.to_string())?;
            for (id, result) in results {
                // A concurrent import/analysis may already have completed this row.
                update.execute(params![result.latitude, result.longitude, result.region_code,
                    result.region_name, result.status, id]).map_err(|error| error.to_string())?;
            }
        }
        tx.commit().map_err(|error| error.to_string())?;
    }
    overview(conn)
}

pub fn queue_failed(conn: &Connection) -> Result<Overview, String> {
    conn.execute(
        "UPDATE media SET location_status='queued' WHERE location_status='failed' AND location_source!='manual' AND file_type IN ('image','video')",
        [],
    )
    .map_err(|error| error.to_string())?;
    overview(conn)
}

// A single transaction prevents partial bulk edits. Coordinates are retained as
// original metadata; only the app's region classification is overridden.
pub fn assign_region(conn: &Connection, ids: &[i64], code: &str) -> Result<(), String> {
    let name = REGIONS.iter().find(|(region, _)| *region == code)
        .map(|(_, name)| *name).ok_or("존재하지 않는 지역입니다.")?;
    if ids.is_empty() { return Err("지역을 지정할 기록을 선택해 주세요.".into()); }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for id in ids {
        let count = tx.execute("UPDATE media SET region_code=?1, region_name=?2,
            location_source='manual', location_status='ready' WHERE id=?3 AND file_type IN ('image','video')",
            params![code, name, id]).map_err(|e| e.to_string())?;
        if count != 1 { return Err("선택한 사진이나 영상을 찾을 수 없습니다. 목록을 새로 열어 주세요.".into()); }
    }
    tx.commit().map_err(|e| e.to_string())
}

pub fn assign_place(conn: &Connection, ids: &[i64], code: &str, district: Option<&str>, country: Option<&str>, city: Option<&str>) -> Result<(), String> {
    if ids.is_empty() { return Err("기록을 선택해 주세요.".into()); }
    let overseas = code == "overseas";
    let name = if overseas { "해외" } else { REGIONS.iter().find(|(key,_)| *key == code && code != "KR-29").map(|(_,name)| *name).ok_or("지역을 선택해 주세요.")? };
    let district = district.unwrap_or("").trim();
    let country = country.unwrap_or("").trim();
    let city = city.unwrap_or("").trim();
    if district.chars().count() > 60 || country.chars().count() > 80 || city.chars().count() > 80 ||
        (overseas && (country.is_empty() || city.is_empty())) { return Err("지역 입력을 확인해 주세요.".into()); }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for id in ids {
        let count = tx.execute("UPDATE media SET region_code=?1, region_name=?2, district=?3, country=?4, city=?5,
            location_source='manual', location_status='ready' WHERE id=?6 AND file_type IN ('image','video')",
            params![code, name, if overseas { "" } else { district }, if overseas { country } else { "" }, if overseas { city } else { "" }, id]).map_err(|e| e.to_string())?;
        if count != 1 { return Err("기록을 찾지 못했습니다.".into()); }
    }
    tx.commit().map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct RegionPage {
    pub items: Vec<super::MediaItemDto>,
    pub total: i64,
    pub years: Vec<String>,
}

pub fn region_page(conn: &Connection, code: &str, offset: i64, kind: &str, year: &str, oldest: bool, district: &str) -> Result<RegionPage, String> {
    if code != "unclassified" && code != "overseas" && !REGIONS.iter().any(|(region, _)| *region == code) {
        return Err("존재하지 않는 지역입니다.".into());
    }
    if !["all", "image", "video"].contains(&kind) || (!year.is_empty() && (year.len() != 4 || !year.bytes().all(|c| c.is_ascii_digit()))) {
        return Err("필터가 올바르지 않습니다.".into());
    }
    let scope = if code == "unclassified" { UNCLASSIFIED_FILTER_SQL } else { REGION_FILTER_SQL };
    let predicate = format!("{scope} AND (?2='all' OR file_type=?2) AND (?3='' OR (taken_at >= ?3 || '-01-01' AND taken_at < ?4 || '-01-01')) AND (?5='' OR (?5='__unset__' AND COALESCE(district,'')='') OR COALESCE(district,'')=?5)");
    let next_year = year.parse::<i64>().unwrap_or(0) + 1;
    // Read count, years and the bounded page from one consistent snapshot.
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let total = tx.query_row(&format!("SELECT COUNT(*) FROM media WHERE {predicate}"), params![code, kind, year, next_year.to_string(), district], |row| row.get(0)).map_err(|e| e.to_string())?;
    let years = {
        let mut stmt = tx.prepare(&format!("SELECT DISTINCT substr(taken_at,1,4) FROM media WHERE {scope} AND taken_at GLOB '[0-9][0-9][0-9][0-9]-*' ORDER BY 1 DESC")).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([code], |row| row.get(0)).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<String>,_>>().map_err(|e| e.to_string())?
    };
    let direction = if oldest { "ASC" } else { "DESC" };
    let items = {
        let mut stmt = tx.prepare(&format!("SELECT {} FROM media WHERE {predicate} ORDER BY taken_at {direction} NULLS LAST, id {direction} LIMIT 48 OFFSET ?6", super::MEDIA_COLUMNS)).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![code, kind, year, next_year.to_string(), district, offset.max(0)], super::media_from_row).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())?
    };
    tx.commit().map_err(|e| e.to_string())?;
    Ok(RegionPage { items, total, years })
}

#[derive(Serialize)]
pub struct RegionCount {
    pub code: String,
    pub name: String,
    pub photos: i64,
    pub videos: i64,
}
#[derive(Serialize)]
pub struct Overview {
    pub total: i64,
    pub analyzed: i64,
    pub pending: i64,
    pub failed: i64,
    pub unclassified: i64,
    pub regions: Vec<RegionCount>,
}

pub fn overview(conn: &Connection) -> Result<Overview, String> {
    let (total, analyzed, pending, failed, unclassified) = conn.query_row(
        "SELECT COUNT(*), COUNT(*) FILTER (WHERE location_status != 'queued'),
            COUNT(*) FILTER (WHERE location_status = 'queued'), COUNT(*) FILTER (WHERE location_status = 'failed'),
            COUNT(*) FILTER (WHERE location_status != 'ready' AND location_status != 'queued')
         FROM media WHERE file_type IN ('image','video')", [],
        |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?)),
    ).map_err(|error| error.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT region_code, region_name,
        COUNT(*) FILTER (WHERE file_type='image'), COUNT(*) FILTER (WHERE file_type='video')
        FROM media WHERE location_status='ready' AND file_type IN ('image','video')
        GROUP BY region_code, region_name",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(RegionCount {
                code: row.get(0)?,
                name: row.get(1)?,
                photos: row.get(2)?,
                videos: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map(|regions| Overview {
            total,
            analyzed,
            pending,
            failed,
            unclassified,
            regions,
        })
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn database_failure_rolls_back_the_whole_analysis_batch_and_allows_retry() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::database::initialize(&mut conn).unwrap();
        conn.execute_batch("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'missing-a.jpg','image',1),(2,'missing-b.jpg','image',1);
            CREATE TRIGGER fail_location BEFORE UPDATE OF location_status ON media WHEN OLD.id=2 BEGIN SELECT RAISE(ABORT,'test rollback'); END;").unwrap();
        assert!(analyze_batch(&conn,24).is_err());
        assert_eq!(overview(&conn).unwrap().pending,2);
        conn.execute("DROP TRIGGER fail_location", []).unwrap();
        let result = analyze_batch(&conn,24).unwrap();
        assert_eq!(result.pending,0);
        assert_eq!(result.failed,2);
    }

    #[test]
    fn manual_region_survives_reimport_without_changing_exif() {
        let path = temp_path("jpg");
        let bytes = gps_jpeg();
        fs::write(&path, &bytes).unwrap();
        let mut conn = Connection::open_in_memory().unwrap();
        crate::database::initialize(&mut conn).unwrap();
        crate::register_file(&conn, &path).unwrap();
        let id = conn.query_row("SELECT id FROM media", [], |r| r.get(0)).unwrap();
        assign_region(&conn, &[id], "KR-49").unwrap();
        crate::register_file(&conn, &path).unwrap();
        assert_eq!(conn.query_row("SELECT region_code FROM media", [], |r| r.get::<_, String>(0)).unwrap(), "KR-49");
        assert_eq!(fs::read(&path).unwrap(), bytes);
        fs::remove_file(path).unwrap();
    }

    fn temp_path(extension: &str) -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "oraedameun-location-{}-{nonce}.{extension}",
            std::process::id()
        ))
    }

    // A tiny JPEG with a standard little-endian TIFF GPS IFD: Seoul, N 37°33'59'', E 126°58'41''.
    fn gps_jpeg() -> Vec<u8> {
        let mut tiff = b"II\x2a\x00\x08\x00\x00\x00".to_vec();
        let u16_le = |buffer: &mut Vec<u8>, value: u16| buffer.extend(value.to_le_bytes());
        let u32_le = |buffer: &mut Vec<u8>, value: u32| buffer.extend(value.to_le_bytes());
        u16_le(&mut tiff, 1);
        u16_le(&mut tiff, 0x8825);
        u16_le(&mut tiff, 4);
        u32_le(&mut tiff, 1);
        u32_le(&mut tiff, 26);
        u32_le(&mut tiff, 0);
        u16_le(&mut tiff, 4);
        for (tag, kind, count, value) in [
            (1, 2, 2, [b'N', 0, 0, 0]),
            (2, 5, 3, 80_u32.to_le_bytes()),
            (3, 2, 2, [b'E', 0, 0, 0]),
            (4, 5, 3, 104_u32.to_le_bytes()),
        ] {
            u16_le(&mut tiff, tag);
            u16_le(&mut tiff, kind);
            u32_le(&mut tiff, count);
            tiff.extend(value);
        }
        u32_le(&mut tiff, 0);
        for value in [37, 33, 59, 126, 58, 41] {
            u32_le(&mut tiff, value);
            u32_le(&mut tiff, 1);
        }
        let mut jpeg = vec![0xff, 0xd8, 0xff, 0xe1];
        jpeg.extend(((tiff.len() + 8) as u16).to_be_bytes());
        jpeg.extend(b"Exif\0\0");
        jpeg.extend(tiff);
        jpeg.extend([0xff, 0xd9]);
        jpeg
    }

    #[test]
    fn jpeg_gps_is_read_and_missing_gps_and_failed_files_do_not_interrupt_analysis() {
        let photo = temp_path("jpg");
        fs::write(&photo, gps_jpeg()).unwrap();
        let found = analyze_path(&photo, "image");
        assert_eq!(found.status, "ready");
        assert_eq!(found.region_code.as_deref(), Some("KR-11"));
        assert!((found.latitude.unwrap() - 37.56638888).abs() < 0.00001);
        assert!((found.longitude.unwrap() - 126.97805555).abs() < 0.00001);
        fs::remove_file(&photo).unwrap();

        fs::write(&photo, include_bytes!("../../tests/fixtures/pet-dog.jpg")).unwrap();
        assert_eq!(analyze_path(&photo, "image").status, "no-gps");
        fs::remove_file(&photo).unwrap();
        assert_eq!(analyze_path(&photo, "image").status, "failed");
        assert_eq!(analyze_path(&photo, "audio").status, "no-gps");
    }

    #[test]
    fn location_persists_after_reopening_and_aggregate_counts_photo_and_video_separately() {
        let db = temp_path("sqlite");
        {
            let conn = Connection::open(&db).unwrap();
            conn.execute_batch("CREATE TABLE media(id INTEGER PRIMARY KEY, file_path TEXT, file_type TEXT, taken_at TEXT);
                INSERT INTO media VALUES (1,'seoul.jpg','image','2026-05-01'), (2,'seoul.mov','video','2026-05-02'),
                  (3,'none.jpg','image','2026-05-03'), (4,'pending.jpg','image','2026-05-04');").unwrap();
            migrate(&conn).unwrap();
            save(&conn, 1, &from_coordinates(37.5665, 126.978)).unwrap();
            save(&conn, 2, &from_coordinates(37.5665, 126.978)).unwrap();
            save(&conn, 3, &LocationResult::no_gps()).unwrap();
        }
        let conn = Connection::open(&db).unwrap();
        migrate(&conn).unwrap();
        let summary = overview(&conn).unwrap();
        assert_eq!(
            (
                summary.total,
                summary.analyzed,
                summary.pending,
                summary.unclassified
            ),
            (4, 3, 1, 1)
        );
        assert_eq!(
            (summary.regions[0].photos, summary.regions[0].videos),
            (1, 1)
        );
        assert_eq!(
            conn.query_row(
                "SELECT latitude, longitude, region_code FROM media WHERE id=1",
                [],
                |row| Ok((
                    row.get::<_, f64>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, String>(2)?
                ))
            )
            .unwrap(),
            (37.5665, 126.978, "KR-11".into())
        );
        drop(conn);
        fs::remove_file(db).unwrap();
    }

    #[test]
    fn region_filter_returns_only_selected_media_with_pagination_and_separate_unclassified() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE media(id INTEGER PRIMARY KEY, file_type TEXT, taken_at TEXT);
            INSERT INTO media VALUES (1,'image','2026-05-01'),(2,'video','2026-05-02'),
                (3,'image','2026-05-03'),(4,'image','2026-05-04'),(5,'audio','2026-05-05');",
        )
        .unwrap();
        migrate(&conn).unwrap();
        for (id, result) in [
            (1, from_coordinates(33.4996, 126.5312)),
            (2, from_coordinates(33.4996, 126.5312)),
            (3, from_coordinates(37.5665, 126.9780)),
            (4, LocationResult::no_gps()),
            (5, from_coordinates(33.4996, 126.5312)),
        ] {
            save(&conn, id, &result).unwrap();
        }
        let list = |region: &str, limit: i64, offset: i64| {
            let filter = if region == "unclassified" {
                UNCLASSIFIED_FILTER_SQL
            } else {
                REGION_FILTER_SQL
            };
            let query = format!("SELECT id FROM media WHERE {filter} ORDER BY taken_at DESC, id DESC LIMIT ?2 OFFSET ?3");
            let mut stmt = conn.prepare(&query).unwrap();
            stmt.query_map(params![region, limit, offset], |row| row.get::<_, i64>(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };
        assert_eq!(list("KR-49", 48, 0), vec![2, 1]);
        assert_eq!(list("KR-49", 1, 1), vec![1]);
        assert_eq!(list("KR-11", 48, 0), vec![3]);
        assert_eq!(list("unclassified", 48, 0), vec![4]);
        assert_eq!(
            overview(&conn)
                .unwrap()
                .regions
                .iter()
                .map(|r| r.photos + r.videos)
                .sum::<i64>(),
            3
        );
    }

    #[test]
    fn background_batches_continue_after_missing_files_and_do_not_reprocess_completed_photos() {
        let gps = temp_path("jpg");
        let no_gps = temp_path("jpg");
        let missing = temp_path("jpg");
        fs::write(&gps, gps_jpeg()).unwrap();
        fs::write(&no_gps, include_bytes!("../../tests/fixtures/pet-dog.jpg")).unwrap();
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE media(id INTEGER PRIMARY KEY, file_path TEXT, file_type TEXT, taken_at TEXT);").unwrap();
        migrate(&conn).unwrap();
        for (id, path, kind) in [
            (1, &gps, "image"),
            (2, &no_gps, "image"),
            (3, &missing, "image"),
            (4, &missing, "audio"),
        ] {
            conn.execute(
                "INSERT INTO media(id,file_path,file_type) VALUES (?1,?2,?3)",
                params![id, path.to_string_lossy(), kind],
            )
            .unwrap();
        }
        let first = analyze_batch(&conn, 2).unwrap();
        assert_eq!(
            (
                first.total,
                first.analyzed,
                first.pending,
                first.unclassified
            ),
            (3, 2, 1, 1)
        );
        assert_eq!(first.regions[0].photos, 1);
        let second = analyze_batch(&conn, 2).unwrap();
        assert_eq!((second.analyzed, second.failed, second.pending), (3, 1, 0));
        fs::remove_file(&gps).unwrap();
        assert_eq!(analyze_batch(&conn, 2).unwrap().regions[0].photos, 1);
        assert_eq!(
            conn.query_row("SELECT location_status FROM media WHERE id=1", [], |row| {
                row.get::<_, String>(0)
            })
            .unwrap(),
            "ready"
        );
        fs::write(&missing, gps_jpeg()).unwrap();
        assert_eq!(queue_failed(&conn).unwrap().pending, 1);
        let retried = analyze_batch(&conn, 2).unwrap();
        assert_eq!(
            (retried.regions[0].photos, retried.failed, retried.pending),
            (2, 0, 0)
        );
        fs::remove_file(&no_gps).unwrap();
        fs::remove_file(&missing).unwrap();
    }

    #[test]
    fn seven_distant_provinces_and_outside_are_identified() {
        for (latitude, longitude, expected) in [
            (37.5665, 126.9780, "KR-11"),
            (35.1796, 129.0756, "KR-26"),
            (36.3504, 127.3845, "KR-30"),
            (33.4996, 126.5312, "KR-49"),
            (37.2636, 127.0286, "KR-41"),
            (37.8854, 127.7298, "KR-42"),
            (35.2278, 128.6811, "KR-48"),
            (36.4875, 127.2817, "KR-50"),
        ] {
            assert_eq!(resolve_region(latitude, longitude).unwrap().0, expected);
        }
        assert_eq!(resolve_region(35.68, 139.69), None);
        assert_eq!(resolve_region(f64::NAN, 126.98), None);
    }

    #[test]
    fn migration_keeps_existing_people_albums_and_edits_then_roundtrips_location() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE media (id INTEGER PRIMARY KEY, file_path TEXT NOT NULL, file_type TEXT NOT NULL, taken_at TEXT,
            title TEXT, rating INTEGER, favorite INTEGER, comment TEXT);
            INSERT INTO media VALUES (1,'original.jpg','image','2026-01-01','첫 여행',5,1,'기존 메모');
            CREATE TABLE album_item (album_id INTEGER, media_id INTEGER); INSERT INTO album_item VALUES (3,1);
            CREATE TABLE person (id INTEGER, name TEXT); INSERT INTO person VALUES (2,'가족');").unwrap();
        migrate(&conn).unwrap();
        migrate(&conn).unwrap();
        save(&conn, 1, &from_coordinates(33.4996, 126.5312)).unwrap();
        let values: (String, i64, i64, String, Option<f64>, String) = conn
            .query_row(
                "SELECT title,rating,favorite,comment,latitude,region_name FROM media",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            values,
            (
                "첫 여행".into(),
                5,
                1,
                "기존 메모".into(),
                Some(33.4996),
                "제주특별자치도".into()
            )
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM album_item", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            conn.query_row("SELECT name FROM person", [], |row| row.get::<_, String>(0))
                .unwrap(),
            "가족"
        );
        assert_eq!(overview(&conn).unwrap().regions[0].photos, 1);
    }
}

#[cfg(test)]
#[path = "location_v2_tests.rs"]
mod v2_tests;
