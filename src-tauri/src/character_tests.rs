use super::*;

fn database() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    crate::database::initialize(&mut conn).unwrap();
    conn
}
fn photo(conn: &Connection, id: i64, region: Option<&str>) {
    conn.execute("INSERT INTO media(file_path,file_type,size_bytes,location_status,region_code,gps_region_code)
        VALUES(?1,'image',1,'ready',?2,?2)", params![format!("photo-{id}.jpg"), region]).unwrap();
}

#[test]
fn gps_photos_unlock_once_and_raise_stage_at_defined_thresholds() {
    let mut conn = database();
    photo(&conn, 1, None);
    conn.execute("UPDATE media SET region_code='KR-49',location_source='manual' WHERE file_path='photo-1.jpg'",[]).unwrap();
    assert!(reconcile(&mut conn).unwrap().characters.is_empty());
    for id in 2..=61 {
        photo(&conn,id,Some("KR-49"));
        let current = reconcile(&mut conn).unwrap();
        let orange = current.characters.iter().find(|c| c.id=="orange").unwrap();
        assert_eq!(orange.growth_stage, if id < 11 {1} else if id < 31 {2} else if id < 61 {3} else {4});
        assert_eq!(orange.region_photo_count,id-1);
        assert_eq!(current.characters.len(),1);
    }
    let before = snapshot(&conn).unwrap();
    let after = reconcile(&mut conn).unwrap();
    assert_eq!(before.events.len(),4);
    assert_eq!(after.events.len(),4);
    assert_eq!(before.characters[0].affection,after.characters[0].affection);
    conn.execute("DELETE FROM media WHERE gps_region_code='KR-49'",[]).unwrap();
    let after = reconcile(&mut conn).unwrap();
    assert_eq!(after.characters[0].growth_stage,4);
    assert_eq!(after.characters[0].region_photo_count,0);
}

#[test]
fn manual_region_and_video_do_not_unlock_or_grow() {
    let mut conn = database();
    conn.execute("INSERT INTO media(file_path,file_type,size_bytes,region_code,location_source,location_status)
        VALUES('manual.jpg','image',1,'KR-42','manual','ready')",[]).unwrap();
    conn.execute("INSERT INTO media(file_path,file_type,size_bytes,gps_region_code,location_status)
        VALUES('video.mp4','video',1,'KR-42','ready')",[]).unwrap();
    assert!(reconcile(&mut conn).unwrap().characters.is_empty());
    photo(&conn,3,Some("KR-42"));
    assert_eq!(reconcile(&mut conn).unwrap().characters[0].region_photo_count,1);
}

#[test]
fn rename_main_and_click_require_owned_character() {
    let mut conn = database();
    assert!(set_main(&mut conn,"orange").is_err());
    assert!(rename(&mut conn,"orange","가짜").is_err());
    photo(&conn,1,Some("KR-42")); photo(&conn,2,Some("KR-49"));
    reconcile(&mut conn).unwrap();
    rename(&mut conn,"orange","귤이").unwrap();
    let result = set_main(&mut conn,"orange").unwrap();
    assert_eq!(result.characters.iter().filter(|c| c.is_main).count(),1);
    assert!(result.characters.iter().find(|c| c.id=="orange").unwrap().is_main);
    assert_eq!(result.characters.iter().find(|c| c.id=="orange").unwrap().custom_name.as_deref(),Some("귤이"));
    let affection = result.characters.iter().find(|c| c.id=="orange").unwrap().affection;
    interact(&mut conn,"orange").unwrap(); interact(&mut conn,"orange").unwrap();
    assert_eq!(snapshot(&conn).unwrap().characters.iter().find(|c| c.id=="orange").unwrap().affection, affection+1);
    assert!(rename(&mut conn,"orange",&"가".repeat(21)).is_err());
}

#[test]
fn migration_derives_gps_region_even_when_map_label_was_manual() {
    let mut conn = database();
    conn.execute("INSERT INTO media(file_path,file_type,size_bytes,latitude,longitude,region_code,location_source,location_status)
        VALUES('jeju.jpg','image',1,33.5,126.5,'KR-42','manual','ready')",[]).unwrap();
    migrate(&conn).unwrap();
    let cached: String = conn.query_row("SELECT gps_region_code FROM media WHERE file_path='jeju.jpg'",[],|r| r.get(0)).unwrap();
    assert_eq!(cached,"KR-49");
    assert_eq!(reconcile(&mut conn).unwrap().characters[0].id,"orange");
}
