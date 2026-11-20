//! Offline Android backup. Only private staging paths are derived from archive names.
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::{BTreeMap, BTreeSet}, error::Error, fs::{self, File}, io::{Read, Write}, path::Path};

pub(crate) type Result<T> = std::result::Result<T, Box<dyn Error + Send + Sync>>;
const MAGIC: &[u8] = b"GOMGOMI-BACKUP\x01";
pub(crate) const DB: &str = "album.sqlite";
pub(crate) const MEDIA: &str = "imported-media-v1";
pub(crate) const WEB: &str = "web.json";
pub(crate) type Storage = BTreeMap<String, String>;
const WEB_LIMIT: u64 = 32 * 1024 * 1024;

pub(crate) fn validate_storage(storage: &Storage) -> Result<()> {
    if storage.keys().all(|key| ["gamjassak:", "oraedameun.", "warm-journal-", "geuruteogi."].iter().any(|p| key.starts_with(p)))
        && serde_json::to_vec(storage)?.len() as u64 <= WEB_LIMIT { Ok(()) }
    else { Err("앱 기록의 형식이나 크기를 확인해 주세요.".into()) }
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub(crate) struct Counts { media: i64, albums: i64, diaries: i64, characters: i64 }
pub(crate) fn counts(c: &Connection) -> Result<Counts> {
    Ok(c.query_row("SELECT (SELECT count(*) FROM media),(SELECT count(*) FROM album),(SELECT count(*) FROM diary),(SELECT count(*) FROM owned_character)", [], |r| Ok(Counts { media:r.get(0)?, albums:r.get(1)?, diaries:r.get(2)?, characters:r.get(3)? }))?)
}

fn safe_media(name: &str) -> bool {
    let parts: Vec<_> = name.split('/').collect();
    parts.len() == 3 && parts[0] == MEDIA && parts[1].len() == 16
        && parts[1].bytes().all(|b| b.is_ascii_hexdigit())
        && !parts[2].is_empty() && !parts[2].starts_with('.') && parts[2].len() <= 255
        && !parts[2].contains(['\\', '\0']) && crate::is_supported_file(Path::new(parts[2]))
}

fn strings(c: &Connection, query: &str) -> Result<Vec<String>> {
    let mut s = c.prepare(query)?;
    let rows = s.query_map([], |r| r.get(0))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

fn paths(c: &Connection) -> Result<Vec<String>> {
    strings(c, "SELECT file_path FROM media UNION SELECT music_path FROM album WHERE coalesce(music_path,'')<>''")
}

fn replace_path(c: &Connection, from: &str, to: &str) -> Result<()> {
    for sql in ["UPDATE media SET file_path=?2 WHERE file_path=?1",
        "UPDATE album SET music_path=?2 WHERE music_path=?1",
        "UPDATE android_media_sources SET file_path=?2 WHERE file_path=?1"] {
        c.execute(sql, [from, to])?;
    }
    Ok(())
}

// A digest covers the entry name, size and payload. A final digest authenticates
// the ordered list against accidental truncation (this is not encryption).
fn transfer(r: &mut impl Read, w: &mut impl Write, size: u64, name: &str) -> Result<[u8;32]> {
    let mut digest = Sha256::new();
    digest.update((name.len() as u32).to_le_bytes()); digest.update(name); digest.update(size.to_le_bytes());
    let mut remaining = size;
    let mut buf = [0u8; 65536];
    while remaining > 0 {
        let len = remaining.min(buf.len() as u64) as usize;
        r.read_exact(&mut buf[..len])?;
        w.write_all(&buf[..len])?;
        digest.update(&buf[..len]); remaining -= len as u64;
    }
    Ok(digest.finalize().into())
}

pub(crate) fn export(c: &Connection, root: &Path, scratch: &Path, storage: &Storage, out: &mut impl Write) -> Result<()> {
    validate_storage(storage)?;
    let _access = crate::managed_import::MEDIA_ACCESS.try_write().map_err(|_| "사진을 가져오는 중입니다. 가져오기가 끝나면 다시 백업해 주세요.")?;
    let db = scratch.join(DB);
    c.execute("VACUUM INTO ?1", [db.to_str().ok_or("백업 경로 오류")?])?;
    let mut snapshot = Connection::open(&db)?;
    crate::gallery_sources::initialize(&snapshot)?;
    check(&snapshot)?;
    let tx = snapshot.transaction()?;
    let canonical_root = root.canonicalize()?;
    let mut entries = BTreeMap::new();
    for source in paths(&tx)? {
        let absolute = Path::new(&source).canonicalize().map_err(|_| "등록 파일을 찾지 못했습니다. 원본 연결을 확인한 뒤 다시 백업해 주세요.")?;
        let name = absolute.strip_prefix(&canonical_root).ok().and_then(Path::to_str)
            .filter(|s| safe_media(s)).ok_or("앱 보관 폴더 밖의 파일이 있어 전체 백업을 만들 수 없습니다.")?;
        replace_path(&tx, &source, name)?;
        entries.insert(name.to_owned(), absolute.clone());
    }
    // Unregistered documents can leave obsolete source mappings. Keep them
    // portable as well without reading any file outside the managed directory.
    for path in strings(&tx, "SELECT file_path FROM android_media_sources")? {
        if safe_media(&path) { continue; }
        if let Some((_, suffix)) = path.rsplit_once("/imported-media-v1/") {
            let name = format!("{MEDIA}/{suffix}");
            if safe_media(&name) { replace_path(&tx, &path, &name)?; continue; }
        }
        return Err("갤러리 연결 경로를 백업할 수 없습니다.".into());
    }
    let managed = root.join(MEDIA);
    if managed.is_dir() {
        for entry in walkdir::WalkDir::new(&managed).min_depth(1) {
            let entry = entry?;
            if entry.file_type().is_dir() || entry.file_name() == ".importing" { continue; }
            let path = entry.path();
            let name = path.strip_prefix(root)?.to_str().ok_or("파일 이름을 읽을 수 없습니다.")?;
            if !entry.file_type().is_file() || !safe_media(name) { return Err("보관 파일의 경로를 확인해 주세요.".into()); }
            entries.entry(name.to_owned()).or_insert_with(|| path.to_owned());
        }
    }
    tx.commit()?; drop(snapshot);
    fs::write(scratch.join(WEB), serde_json::to_vec(storage)?)?;
    entries.insert(DB.into(), db);
    entries.insert(WEB.into(), scratch.join(WEB));
    out.write_all(MAGIC)?;
    let mut manifest = Sha256::new();
    for (name, path) in entries {
        let mut file = File::open(path)?;
        let size = file.metadata()?.len();
        out.write_all(&(name.len() as u32).to_le_bytes())?;
        out.write_all(name.as_bytes())?;
        out.write_all(&size.to_le_bytes())?;
        let hash = transfer(&mut file, out, size, &name)?;
        manifest.update(hash);
        out.write_all(&hash)?;
    }
    out.write_all(&0u32.to_le_bytes())?;
    out.write_all(&manifest.finalize())?;
    out.flush()?;
    Ok(())
}

fn unpack(input: &mut impl Read, stage: &Path) -> Result<BTreeSet<String>> {
    let mut magic = vec![0; MAGIC.len()];
    input.read_exact(&mut magic)?;
    if magic != MAGIC { return Err("지원하는 곰고미 백업 파일을 선택해 주세요.".into()); }
    let mut names = BTreeSet::new();
    let mut manifest = Sha256::new();
    loop {
        let mut n = [0;4]; input.read_exact(&mut n)?;
        let n = u32::from_le_bytes(n) as usize;
        if n == 0 { break; }
        if n > 512 || names.len() >= 1_000_000 { return Err("파일 목록이 올바르지 않습니다.".into()); }
        let mut name = vec![0;n]; input.read_exact(&mut name)?;
        let name = String::from_utf8(name)?;
        if !(name == DB || name == WEB || safe_media(&name)) || !names.insert(name.clone()) { return Err("중복되거나 잘못된 파일 경로입니다.".into()); }
        let mut bytes = [0;8]; input.read_exact(&mut bytes)?;
        let size = u64::from_le_bytes(bytes);
        if name == WEB && size > WEB_LIMIT { return Err("앱 기록 크기가 올바르지 않습니다.".into()); }
        let path = stage.join(&name);
        fs::create_dir_all(path.parent().unwrap())?;
        let mut file = File::create_new(path)?;
        let hash = transfer(input, &mut file, size, &name)?;
        let mut expected = [0;32]; input.read_exact(&mut expected)?;
        if expected != hash { return Err("백업 파일이 손상되었습니다.".into()); }
        manifest.update(hash);
        file.sync_all()?;
    }
    let mut end = [0;32]; input.read_exact(&mut end)?;
    if end[..] != manifest.finalize()[..] || input.read(&mut [0])? != 0 || !names.remove(DB) || !names.remove(WEB) {
        return Err("백업 파일의 끝이나 필수 기록이 손상되었습니다.".into());
    }
    Ok(names)
}

fn tables(c: &Connection) -> Result<BTreeSet<String>> {
    Ok(strings(c, "SELECT name FROM pragma_table_list WHERE schema='main' AND type='table' AND name NOT LIKE 'sqlite_%'")?.into_iter().collect())
}
fn ident(s: &str) -> Result<String> {
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_alphanumeric() || b==b'_') { return Err("지원하지 않는 DB 이름입니다.".into()); }
    Ok(format!("\"{s}\""))
}
fn check(c: &Connection) -> Result<()> {
    if strings(c, "PRAGMA integrity_check(1)")? != ["ok"] || c.prepare("PRAGMA foreign_key_check")?.exists([])? {
        return Err("기록 또는 사진 연결이 손상되었습니다.".into());
    }
    Ok(())
}

// Copy values only. All live tables, constraints, indexes and triggers come from
// the installed app, never from SQL supplied by a document provider.
pub(crate) fn prepare(input: &mut impl Read, live: &Connection, root: &Path, stage: &Path) -> Result<Counts> {
    let files = unpack(input, stage)?;
    validate_storage(&serde_json::from_slice(&fs::read(stage.join(WEB))?)?)?;
    let raw = stage.join("source.sqlite");
    fs::rename(stage.join(DB), &raw)?;
    let src = Connection::open_with_flags(&raw, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    src.execute_batch("PRAGMA trusted_schema=OFF; PRAGMA query_only=ON")?;
    let version: i64 = src.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version != crate::database::VERSION { return Err("이 백업의 DB 버전을 지원하지 않습니다. 호환되는 곰고미 버전에서 복원해 주세요.".into()); }
    // Reject virtual tables, views and generated columns before accessing any values.
    if src.prepare("SELECT 1 FROM pragma_table_list WHERE type NOT IN ('table')")?.exists([])? { return Err("백업 DB 구조가 올바르지 않습니다.".into()); }
    live.execute("VACUUM INTO ?1", [stage.join(DB).to_str().ok_or("복원 경로 오류")?])?;
    let mut dest = Connection::open(stage.join(DB))?;
    crate::gallery_sources::initialize(&dest)?;
    let allowed = tables(&dest)?;
    if tables(&src)? != allowed { return Err("백업과 설치된 앱의 DB 구성이 다릅니다. 현재 기록은 보존됩니다.".into()); }
    dest.execute_batch("PRAGMA foreign_keys=OFF")?;
    let tx = dest.transaction()?;
    for table in &allowed { tx.execute(&format!("DELETE FROM {}", ident(table)?), [])?; }
    let mut ordered: Vec<String> = allowed.into_iter().collect();
    ordered.sort_by_key(|t| if t == "native_ai_model" { 0 } else { 1 });
    ordered.push("sqlite_sequence".into());
    for name in ordered {
        if name == "sqlite_sequence" { tx.execute("DELETE FROM sqlite_sequence", [])?; }
        let table = ident(&name)?;
        let columns = strings(&tx,&format!("SELECT name FROM pragma_table_info('{name}') ORDER BY name"))?;
        if strings(&src,&format!("SELECT name FROM pragma_table_xinfo('{name}') WHERE hidden=0 ORDER BY name"))? != columns ||
            src.prepare("SELECT 1 FROM pragma_table_xinfo(?1) WHERE hidden<>0")?.exists([&name])? {
            return Err("백업의 필드 구성이 설치된 앱과 다릅니다.".into());
        }
        let list = columns.iter().map(|s| ident(s)).collect::<Result<Vec<_>>>()?.join(",");
        let placeholders = vec!["?";columns.len()].join(",");
        let mut read = src.prepare(&format!("SELECT {list} FROM {table}"))?;
        let mut rows = read.query([])?;
        let mut insert = tx.prepare(&format!("INSERT INTO {table} ({list}) VALUES ({placeholders})"))?;
        while let Some(row) = rows.next()? {
            let values = (0..columns.len()).map(|i| row.get_ref(i).map(rusqlite::types::ToSqlOutput::Borrowed)).collect::<rusqlite::Result<Vec<_>>>()?;
            insert.execute(rusqlite::params_from_iter(values))?;
        }
    }
    let names: BTreeSet<_> = paths(&tx)?.into_iter().collect();
    if !names.is_subset(&files) { return Err("등록 기록과 보관 파일 목록이 일치하지 않습니다.".into()); }
    let root = root.canonicalize()?;
    for name in names.into_iter().chain(strings(&tx,"SELECT file_path FROM android_media_sources")?).collect::<BTreeSet<_>>() {
        if !safe_media(&name) { return Err("등록된 파일 경로가 올바르지 않습니다.".into()); }
        replace_path(&tx,&name,root.join(&name).to_str().ok_or("복원 경로 오류")?)?;
    }
    tx.commit()?;
    check(&dest)?;
    drop(src); fs::remove_file(raw)?;
    fs::create_dir_all(stage.join(MEDIA))?;
    Ok(counts(&dest)?)
}

pub(crate) fn reset_dir(path: &Path) -> Result<()> {
    if path.exists() { fs::remove_dir_all(path)?; }
    fs::create_dir(path)?;
    Ok(())
}

pub(crate) fn storage_at(dir: &Path) -> Result<Storage> {
    Ok(serde_json::from_slice(&fs::read(dir.join(WEB))?)?)
}

// A confirmed restore is applied on a fresh Android process, before App mounts.
// Each rename is replayable after process death. Keep old files through the
// WebView acknowledgment, including the case where its storage quota is full.
pub(crate) fn install(root: &Path, work: &Path) -> Result<()> {
    let old = work.join("previous");
    fs::create_dir_all(&old)?;
    for name in [DB, MEDIA] {
        let live = root.join(name);
        let new = work.join("stage").join(name);
        if new.exists() {
            if live.exists() && !old.join(name).exists() { fs::rename(&live,old.join(name))?; }
            fs::rename(new,live)?;
        }
    }
    Ok(())
}
pub(crate) fn undo(root: &Path, work: &Path) -> Result<()> {
    for name in [DB, MEDIA] {
        let old = work.join("previous").join(name);
        if old.exists() {
            let live = root.join(name);
            if live.exists() { fs::rename(&live,work.join("discard").join(name))?; }
            fs::rename(old,live)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
            fs::create_dir(&root).unwrap(); Self(root)
        }
        fn dir(&self, p: &str) -> PathBuf {
            let path = self.0.join(p); fs::create_dir_all(&path).unwrap(); path
        }
    }
    impl Drop for Fixture { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }

    #[test]
    fn round_trip_reject_corruption_and_repeat_without_changing_originals() {
        let f = Fixture::new();
        let root = f.dir("source");
        let sample = "imported-media-v1/123456789abcdef0/고미.jpg";
        fs::create_dir_all(root.join(sample).parent().unwrap()).unwrap();
        fs::write(root.join(sample),b"photo fixture").unwrap();
        let mut source = Connection::open(root.join(DB)).unwrap();
        crate::database::initialize(&mut source).unwrap();
        source.execute("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(9,?1,'image',13)",[root.join(sample).to_str().unwrap()]).unwrap();
        source.execute_batch("INSERT INTO album(id,title,cover_media_id) VALUES(4,'가족',9);
            INSERT INTO diary(id,entry_date,title,body,mood,weather,album_id) VALUES(5,'2026-11-20','고미','기록','기쁨','맑음',4);
            INSERT INTO diary_photo VALUES(5,9,0);").unwrap();
        source.execute("UPDATE sqlite_sequence SET seq=99 WHERE name='diary'",[]).unwrap();
        let storage = Storage::from([("oraedameun.dayNotes".into(),"달력 기록".into())]);
        let mut archive = vec![];
        export(&source,&root,&f.dir("export"),&storage,&mut archive).unwrap();
        let target = f.dir("other");
        let mut live = Connection::open(target.join(DB)).unwrap();
        crate::database::initialize(&mut live).unwrap();
        for i in 0..2 {
            let stage = f.dir(&format!("sandbox-{i}"));
            let n = prepare(&mut &archive[..],&live,&target,&stage).unwrap();
            assert_eq!((n.media,n.albums,n.diaries),(1,1,1));
            assert_eq!(storage_at(&stage).unwrap(),storage);
            assert_eq!(fs::read(stage.join(sample)).unwrap(),b"photo fixture");
            let c = Connection::open(stage.join(DB)).unwrap();
            assert_eq!(c.query_row("SELECT count(*) FROM sqlite_sequence WHERE name='diary' AND seq=99",[],|r| r.get::<_,i64>(0)).unwrap(),1);
            c.execute("INSERT INTO diary(entry_date,title,body,mood,weather) VALUES('2026-11-20','추가','','기쁨','맑음')",[]).unwrap();
            assert_eq!(c.last_insert_rowid(),100);
            assert_eq!(strings(&c,"SELECT file_path FROM diary_photo JOIN media ON media.id=diary_photo.media_id").unwrap(),[target.join(sample).to_str().unwrap()]);
        }
        let mut changed=archive.clone(); let pos = changed.iter().position(|&b| b==b'G').unwrap(); changed[pos]^=1;
        for (i, bad) in [&changed[..], &archive[..archive.len()-1]].into_iter().enumerate() {
            assert!(prepare(&mut &bad[..],&live,&target,&f.dir(&format!("bad-{i}"))).is_err());
        }
        assert_eq!(counts(&live).unwrap().media,0);
        assert_eq!(fs::read(root.join(sample)).unwrap(),b"photo fixture");
        assert!(!safe_media("imported-media-v1/123456789abcdef0/../album.sqlite"));
        assert!(!safe_media("imported-media-v1/123456789abcdef0/.importing"));
    }

    #[test]
    fn interrupted_install_and_rollback_replay_the_same_renames() {
        let f=Fixture::new(); let root=f.dir("live"); let work=f.dir("maintenance");
        fs::write(root.join(DB),b"old").unwrap(); fs::create_dir(root.join(MEDIA)).unwrap();
        fs::write(root.join(MEDIA).join("old"),b"old photo").unwrap();
        let stage=f.dir("maintenance/stage"); fs::write(stage.join(DB),b"new").unwrap();
        fs::create_dir(stage.join(MEDIA)).unwrap();
        let prev=f.dir("maintenance/previous"); fs::rename(root.join(DB),prev.join(DB)).unwrap();
        install(&root,&work).unwrap(); install(&root,&work).unwrap();
        assert_eq!(fs::read(root.join(DB)).unwrap(),b"new");
        f.dir("maintenance/discard");
        fs::rename(root.join(DB),work.join("discard").join(DB)).unwrap();
        undo(&root,&work).unwrap(); undo(&root,&work).unwrap();
        assert_eq!(fs::read(root.join(DB)).unwrap(),b"old");
        assert_eq!(fs::read(root.join(MEDIA).join("old")).unwrap(),b"old photo");
    }
}
