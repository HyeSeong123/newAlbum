use super::*;
use rusqlite::types::Value;
use std::{fs, sync::{Arc, Barrier}, time::{SystemTime, UNIX_EPOCH}};

fn temp_db() -> std::path::PathBuf {
    std::env::temp_dir().join(format!("warm-journal-db-{}-{}.sqlite", std::process::id(),
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()))
}

fn snapshot(conn: &Connection) -> Vec<Vec<Vec<Value>>> {
    ["media", "album", "album_item", "album_page", "tag", "media_tag", "person",
        "media_person", "detected_face", "face_scan", "excluded_face", "pet", "pet_media"]
        .iter().filter(|table| table_exists(conn, table).unwrap()).map(|table| {
            let mut statement = conn.prepare(&format!("SELECT * FROM {table} ORDER BY rowid")).unwrap();
            let count = statement.column_count();
            statement.query_map([], |row| (0..count).map(|column| row.get(column)).collect())
                .unwrap().collect::<Result<Vec<_>, _>>().unwrap()
        }).collect()
}

#[test]
fn existing_library_survives_migration_reopen_and_read_only_fast_path() {
    let path = temp_db();
    let mut conn = Connection::open(&path).unwrap();
    conn.execute_batch(include_str!("../database/schema.sql")).unwrap();
    conn.execute_batch(include_str!("test_fixtures/legacy-unused-tables.sql")).unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;
        INSERT INTO media(id,file_path,file_type,size_bytes,title,rating,comment,favorite,view_count,
            latitude,longitude,region_code,region_name,location_status)
            VALUES(1,'photo.jpg','image',123,'제주 여행',5,'기존 댓글',1,9,33.5,126.5,'KR-49','제주특별자치도','ready'),
            (2,'video.mp4','video',456,'영상',3,'',0,2,NULL,NULL,NULL,NULL,'no-gps');
        INSERT INTO album(id,title,cover_media_id,music_path) VALUES(1,'우리 가족',1,'music.mp3');
        INSERT INTO album_item(album_id,media_id,sequence) VALUES(1,1,0),(1,2,2);
        INSERT INTO album_page(id,album_id,kind,title,body,sequence) VALUES('page',1,'TEXT','여행','기억할 날',1);
        INSERT INTO tag(id,name) VALUES(1,'가족');
        INSERT INTO media_tag VALUES(1,1);
        INSERT INTO person(id,name) VALUES(1,'가족');
        INSERT INTO detected_face(id,media_id,person_id,descriptor,thumbnail) VALUES(1,1,1,'[]','face');
        UPDATE person SET cover_face_id=1 WHERE id=1;
        INSERT INTO media_person VALUES(1,1,0.99,1);
        INSERT INTO face_scan(media_id,model_version) VALUES(1,'v1');
        INSERT INTO excluded_face VALUES(1);
        INSERT INTO pet(id,name,cover_media_id) VALUES(1,'강아지',1);
        INSERT INTO pet_media VALUES(1,1);").unwrap();
    let before = snapshot(&conn);
    let mut expected = before.clone();
    // The district backfill is the sole change to an existing GPS photo.
    expected[0][0][21] = Value::Text("제주시".into());
    initialize(&mut conn).unwrap();
    assert_eq!(snapshot(&conn), expected);
    assert_eq!(version(&conn).unwrap(), VERSION);
    drop(conn);
    let mut reopened = Connection::open(&path).unwrap();
    // A current schema must not attempt any write, DDL, or full-path normalization.
    reopened.pragma_update(None, "query_only", true).unwrap();
    initialize(&mut reopened).unwrap();
    assert_eq!(snapshot(&reopened), expected);
    assert_eq!(reopened.query_row("PRAGMA foreign_keys", [], |r| r.get::<_, i64>(0)).unwrap(), 1);
    assert_eq!(reopened.query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0)).unwrap(), "ok");
    assert!(reopened.prepare("PRAGMA foreign_key_check").unwrap().query([]).unwrap().next().unwrap().is_none());
    drop(reopened);
    fs::remove_file(path).unwrap();
}

#[test]
fn failed_upgrade_rolls_back_columns_and_version_then_can_retry() {
    let mut conn = Connection::open_in_memory().unwrap();
    let legacy = include_str!("../database/schema.sql").replace("\r\n", "\n")
        .replacen("  title TEXT NOT NULL DEFAULT '',\n", "", 1)
        .replace("  view_count INTEGER NOT NULL DEFAULT 0,\n", "")
        .replace("  latitude REAL,\n", "").replace("  longitude REAL,\n", "")
        .replace("  region_code TEXT,\n", "").replace("  region_name TEXT,\n", "")
        .replace("  location_status TEXT NOT NULL DEFAULT 'queued',\n", "");
    conn.execute_batch(&legacy).unwrap();
    conn.execute_batch("INSERT INTO media(file_path,file_type,size_bytes,comment,rating,favorite)
        VALUES('original.jpg','image',42,'그대로',4,1);
        CREATE TABLE idx_media_chronology (id INTEGER);").unwrap();
    assert!(initialize(&mut conn).is_err());
    assert_eq!(version(&conn).unwrap(), 0);
    assert!(conn.prepare("SELECT title FROM media").is_err());
    conn.execute("DROP TABLE idx_media_chronology", []).unwrap();
    initialize(&mut conn).unwrap();
    let row: (String,i64,i64,String,String) = conn.query_row(
        "SELECT comment,rating,favorite,title,location_status FROM media", [],
        |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).unwrap();
    assert_eq!(row, ("그대로".into(),4,1,"".into(),"queued".into()));
}

#[test]
fn future_schema_is_rejected_without_downgrading() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.pragma_update(None,"user_version", VERSION + 1).unwrap();
    assert!(initialize(&mut conn).is_err());
    assert_eq!(version(&conn).unwrap(), VERSION + 1);
    assert!(conn.prepare("SELECT * FROM media").is_err());
}

#[test]
fn simultaneous_startup_connections_share_one_committed_migration() {
    let path = temp_db();
    let barrier = Arc::new(Barrier::new(2));
    let workers: Vec<_> = (0..2).map(|_| {
        let path = path.clone(); let barrier = barrier.clone();
        std::thread::spawn(move || {
            let mut conn = Connection::open(path).unwrap();
            barrier.wait();
            initialize(&mut conn).unwrap();
            assert_eq!(version(&conn).unwrap(), VERSION);
        })
    }).collect();
    for worker in workers { worker.join().unwrap(); }
    fs::remove_file(path).unwrap();
}

#[test]
fn bulk_delete_is_atomic_and_repairs_covers_and_relationships() {
    let mut conn = Connection::open_in_memory().unwrap();
    initialize(&mut conn).unwrap();
    conn.execute_batch("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'a','image',1),(2,'b','image',1),(3,'c','image',1);
        INSERT INTO album(id,title,cover_media_id) VALUES(1,'앨범',1);
        INSERT INTO album_item(album_id,media_id,sequence) VALUES(1,1,0),(1,2,1),(1,3,2);
        INSERT INTO pet(id,name,cover_media_id) VALUES(1,'강아지',1);
        INSERT INTO pet_media VALUES(1,1),(1,3);
        CREATE TRIGGER stop_delete BEFORE DELETE ON media WHEN OLD.id=2 BEGIN SELECT RAISE(ABORT,'test rollback'); END;").unwrap();
    let before = snapshot(&conn);
    assert!(delete_media(&mut conn, &[1,2]).is_err());
    assert_eq!(snapshot(&conn), before);
    conn.execute("DROP TRIGGER stop_delete", []).unwrap();
    delete_media(&mut conn, &[1,2,1,999]).unwrap();
    assert_eq!(conn.query_row("SELECT cover_media_id FROM album", [], |r| r.get::<_, i64>(0)).unwrap(),3);
    assert_eq!(conn.query_row("SELECT COUNT(*) FROM media", [], |r| r.get::<_, i64>(0)).unwrap(),1);
    assert_eq!(conn.query_row("SELECT media_id FROM pet_media", [], |r| r.get::<_, i64>(0)).unwrap(),3);
    assert_eq!(conn.query_row("SELECT cover_media_id FROM pet", [], |r| r.get::<_, Option<i64>>(0)).unwrap(),None);
    assert!(conn.prepare("PRAGMA foreign_key_check").unwrap().query([]).unwrap().next().unwrap().is_none());
}

#[test]
fn list_and_reverse_relationship_queries_use_indexes() {
    let mut conn = Connection::open_in_memory().unwrap();
    initialize(&mut conn).unwrap();
    for (query, index) in [
        ("SELECT id FROM media ORDER BY taken_at DESC NULLS LAST, created_at DESC", "idx_media_chronology"),
        ("SELECT id FROM album_item WHERE media_id=1", "idx_album_item_media"),
        ("SELECT id FROM detected_face WHERE media_id=1", "idx_detected_face_media"),
        ("SELECT pet_id FROM pet_media WHERE media_id=1", "idx_pet_media_media"),
    ] {
        let mut stmt = conn.prepare(&format!("EXPLAIN QUERY PLAN {query}")).unwrap();
        let plan = stmt.query_map([], |row| row.get::<_, String>(3)).unwrap()
            .collect::<Result<Vec<_>, _>>().unwrap().join("\n");
        assert!(plan.contains(index), "{plan}");
        assert!(!plan.contains("TEMP B-TREE"), "{plan}");
    }
}

#[test]
fn fresh_and_empty_legacy_databases_omit_unused_tables_and_indexes() {
    let mut fresh = Connection::open_in_memory().unwrap();
    initialize(&mut fresh).unwrap();
    let mut legacy = Connection::open_in_memory().unwrap();
    legacy.execute_batch(include_str!("../database/schema.sql")).unwrap();
    legacy.execute_batch(include_str!("test_fixtures/legacy-unused-tables.sql")).unwrap();
    legacy.execute_batch("CREATE INDEX idx_media_tag_tag ON media_tag(tag_id);
        CREATE INDEX idx_media_person_person ON media_person(person_id);
        PRAGMA user_version=5;").unwrap();
    initialize(&mut legacy).unwrap();
    for conn in [&fresh, &legacy] {
        for name in ["tag", "media_tag", "media_person", "idx_media_tag_tag", "idx_media_person_person"] {
            let exists: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE name=?1)",
                [name], |row| row.get(0)).unwrap();
            assert!(!exists, "{name} should not exist in an empty library");
        }
        assert_eq!(version(conn).unwrap(), VERSION);
    }
    legacy.pragma_update(None, "query_only", true).unwrap();
    initialize(&mut legacy).unwrap();
}

#[test]
fn populated_legacy_tag_group_is_retained_while_empty_person_links_are_removed() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(include_str!("../database/schema.sql")).unwrap();
    conn.execute_batch(include_str!("test_fixtures/legacy-unused-tables.sql")).unwrap();
    conn.execute_batch("INSERT INTO tag(id,name) VALUES(1,'보존할 태그'); PRAGMA user_version=5;").unwrap();
    initialize(&mut conn).unwrap();
    assert_eq!(conn.query_row("SELECT name FROM tag", [], |row| row.get::<_, String>(0)).unwrap(), "보존할 태그");
    assert!(table_exists(&conn, "media_tag").unwrap());
    assert!(!table_exists(&conn, "media_person").unwrap());
    let index: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE type='index' AND name='idx_media_tag_tag')",
        [], |row| row.get(0)).unwrap();
    assert!(index);
}

#[test]
fn failed_unused_table_cleanup_rolls_back_drops_and_version_before_retry() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(include_str!("../database/schema.sql")).unwrap();
    conn.execute_batch(include_str!("test_fixtures/legacy-unused-tables.sql")).unwrap();
    conn.execute_batch("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'original.jpg','image',1);
        INSERT INTO person(id,name) VALUES(1,'가족'); INSERT INTO media_person VALUES(1,1,0.9,1);
        CREATE TABLE idx_media_person_person(id INTEGER); PRAGMA user_version=5;").unwrap();
    let before = snapshot(&conn);
    assert!(initialize(&mut conn).is_err());
    assert_eq!(snapshot(&conn), before);
    assert_eq!(version(&conn).unwrap(), 5);
    assert!(table_exists(&conn, "tag").unwrap());
    conn.execute("DROP TABLE idx_media_person_person", []).unwrap();
    initialize(&mut conn).unwrap();
    assert!(!table_exists(&conn, "tag").unwrap());
    assert!(table_exists(&conn, "media_person").unwrap());
    assert_eq!(conn.query_row("SELECT confirmed FROM media_person", [], |row| row.get::<_, i64>(0)).unwrap(), 1);
    delete_media(&mut conn, &[1]).unwrap();
    assert_eq!(conn.query_row("SELECT COUNT(*) FROM media_person", [], |row| row.get::<_, i64>(0)).unwrap(), 0);
    assert!(conn.prepare("PRAGMA foreign_key_check").unwrap().query([]).unwrap().next().unwrap().is_none());
}

#[test]
fn version_one_database_upgrades_and_persists_manual_regions_on_reopen() {
    let path = temp_db();
    let mut conn = Connection::open(&path).unwrap();
    let legacy = include_str!("../database/schema.sql").replace("  location_source TEXT NOT NULL DEFAULT 'gps',\n", "");
    conn.execute_batch(&legacy).unwrap();
    conn.execute_batch("PRAGMA user_version=1;
        INSERT INTO media(id,file_path,file_type,size_bytes,region_code,region_name,location_status) VALUES(1,'a.jpg','image',1,'KR-11','서울특별시','ready');
        INSERT INTO album(id,title) VALUES(1,'기존 앨범');
        INSERT INTO album_item(album_id,media_id,sequence) VALUES(1,1,0);
        INSERT INTO album_page(id,album_id,kind,title,body,sequence) VALUES('chapter',1,'CHAPTER','시작','첫 여행',1);").unwrap();
    initialize(&mut conn).unwrap();
    assert_eq!(conn.query_row("SELECT location_source FROM media", [], |r| r.get::<_,String>(0)).unwrap(), "gps");
    crate::location::assign_region(&conn,&[1],"KR-49").unwrap();
    let saved = snapshot(&conn);
    drop(conn);
    let mut reopened = Connection::open(&path).unwrap();
    initialize(&mut reopened).unwrap();
    assert_eq!(snapshot(&reopened), saved);
    let albums = crate::read_albums(&reopened).unwrap();
    assert_eq!(albums[0].items[0].region_code.as_deref(),Some("KR-49"));
    assert_eq!(albums[0].items[0].location_source,"manual");
    assert_eq!(albums[0].contents.len(),2);
    drop(reopened);
    fs::remove_file(path).unwrap();
}
