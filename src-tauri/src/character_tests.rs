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
    assert_eq!(reconcile(&mut conn).unwrap().characters.len(), 2);
    for id in 2..=61 {
        photo(&conn,id,Some("KR-49"));
        let current = reconcile(&mut conn).unwrap();
        let orange = current.characters.iter().find(|c| c.id=="orange").unwrap();
        assert_eq!(orange.growth_stage, if id < 11 {1} else if id < 31 {2} else if id < 61 {3} else {4});
        assert_eq!(orange.region_photo_count,id-1);
        assert_eq!(current.characters.len(),3);
    }
    let before = snapshot(&conn).unwrap();
    let after = reconcile(&mut conn).unwrap();
    assert_eq!(before.events.len(),4);
    assert_eq!(after.events.len(),4);
    let orange_before = before.characters.iter().find(|c| c.id == "orange").unwrap();
    let orange_after = after.characters.iter().find(|c| c.id == "orange").unwrap();
    assert_eq!(orange_before.affection,orange_after.affection);
    conn.execute("DELETE FROM media WHERE gps_region_code='KR-49'",[]).unwrap();
    let after = reconcile(&mut conn).unwrap();
    let orange = after.characters.iter().find(|c| c.id == "orange").unwrap();
    assert_eq!(orange.growth_stage,4);
    assert_eq!(orange.region_photo_count,0);
}

#[test]
fn manual_region_and_video_do_not_unlock_or_grow() {
    let mut conn = database();
    conn.execute("INSERT INTO media(file_path,file_type,size_bytes,region_code,location_source,location_status)
        VALUES('manual.jpg','image',1,'KR-42','manual','ready')",[]).unwrap();
    conn.execute("INSERT INTO media(file_path,file_type,size_bytes,gps_region_code,location_status)
        VALUES('video.mp4','video',1,'KR-42','ready')",[]).unwrap();
    let initial = reconcile(&mut conn).unwrap();
    assert_eq!(initial.characters.len(), 2);
    let potato = initial.characters.iter().find(|c| c.id == "potato").unwrap();
    assert_eq!(potato.growth_stage, 1);
    assert_eq!(potato.region_photo_count, 0);
    assert!(initial.events.is_empty());
    photo(&conn,3,Some("KR-42"));
    assert_eq!(reconcile(&mut conn).unwrap().characters[0].region_photo_count,1);
}

#[test]
fn every_map_region_has_a_distinct_gps_companion() {
    let mut conn = database();
    let definitions = definitions();
    assert_eq!(definitions.len(), 16);
    for (index, definition) in definitions.iter().enumerate() {
        photo(&conn, index as i64, Some(&definition.region_code));
    }
    let result = reconcile(&mut conn).unwrap();
    assert_eq!(result.characters.len(), definitions.len());
    assert_eq!(result.events.len(), definitions.iter().filter(|def| !def.default_unlocked).count());
    for definition in definitions {
        let character = result.characters.iter().find(|item| item.id == definition.id).unwrap();
        assert_eq!(character.growth_stage, 1);
        assert_eq!(character.region_photo_count, 1);
    }
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
    assert!(reconcile(&mut conn).unwrap().characters.iter().any(|c| c.id=="orange"));
}

#[test]
fn starters_are_immediately_owned_without_unlock_events_and_can_be_selected() {
    let mut conn = database();
    let initial = snapshot(&conn).unwrap();
    assert_eq!(initial.characters.len(), 2);
    assert!(initial.events.is_empty());
    assert_eq!(initial.characters.iter().find(|c| c.is_main).unwrap().id, "potato");
    assert!(initial.characters.iter().all(|c| c.growth_stage == 1 && c.region_photo_count == 0));
    rename(&mut conn, "sweet-potato", "고구마 형").unwrap();
    set_main(&mut conn, "sweet-potato").unwrap();
    interact(&mut conn, "sweet-potato").unwrap();
    for _ in 0..3 { reconcile(&mut conn).unwrap(); }
    let result = snapshot(&conn).unwrap();
    let sweet = result.characters.iter().find(|c| c.id == "sweet-potato").unwrap();
    assert!(sweet.is_main);
    assert_eq!(sweet.custom_name.as_deref(), Some("고구마 형"));
    assert_eq!(sweet.affection, 1);
    assert!(result.events.is_empty());
}

#[test]
fn version_seven_upgrade_keeps_existing_progress_and_main_and_only_adds_missing_starter() {
    let mut conn = database();
    photo(&conn, 1, Some("KR-49"));
    reconcile(&mut conn).unwrap();
    set_main(&mut conn, "orange").unwrap();
    conn.execute_batch("DELETE FROM owned_character WHERE character_id='sweet-potato';
        UPDATE owned_character SET custom_name='감자 동생',growth_stage=3,affection=25 WHERE character_id='potato';
        INSERT INTO character_event(character_id,kind,stage) VALUES('potato','unlock',1),('potato','grow',3);
        PRAGMA user_version=7;").unwrap();
    crate::database::initialize(&mut conn).unwrap();
    crate::database::initialize(&mut conn).unwrap();
    let result = reconcile(&mut conn).unwrap();
    assert_eq!(result.characters.len(), 3);
    let potato = result.characters.iter().find(|c| c.id == "potato").unwrap();
    assert_eq!(potato.custom_name.as_deref(), Some("감자 동생"));
    assert_eq!(potato.growth_stage, 3);
    assert_eq!(potato.affection, 25);
    assert_eq!(result.characters.iter().find(|c| c.is_main).unwrap().id, "orange");
    assert!(result.events.iter().all(|e| e.character_id != "potato" || e.kind != "unlock"));
    assert!(result.events.iter().any(|e| e.character_id == "potato" && e.kind == "grow" && e.stage == 3));
}

#[test]
fn starters_still_grow_only_from_their_own_gps_photos() {
    let mut conn = database();
    for id in 0..10 { photo(&conn, id, Some("KR-42")); }
    let result = reconcile(&mut conn).unwrap();
    assert_eq!(result.characters.iter().find(|c| c.id == "potato").unwrap().growth_stage, 2);
    assert_eq!(result.characters.iter().find(|c| c.id == "sweet-potato").unwrap().growth_stage, 1);
    assert_eq!(result.events.len(), 1);
    assert_eq!(result.events[0].kind, "grow");
    assert_eq!(result.events[0].character_id, "potato");
    assert_eq!(reconcile(&mut conn).unwrap().events.len(), 1);
}

#[test]
fn sweet_potato_waits_for_potato_completion_then_counts_only_new_photos() {
    let mut conn = database();
    for id in 0..60 { photo(&conn, id, Some("KR-46")); }
    let waiting = reconcile(&mut conn).unwrap();
    let sweet = waiting.characters.iter().find(|c| c.id == "sweet-potato").unwrap();
    assert_eq!(sweet.growth_stage, 1);
    assert_eq!(sweet.region_photo_count, 60);
    assert_eq!(sweet.growth_photo_count, 0);
    assert!(waiting.events.is_empty());
    for id in 100..160 { photo(&conn, id, Some("KR-42")); }
    let ready = reconcile(&mut conn).unwrap();
    assert_eq!(ready.characters.iter().find(|c| c.id == "potato").unwrap().growth_stage, 4);
    let sweet = ready.characters.iter().find(|c| c.id == "sweet-potato").unwrap();
    assert_eq!(sweet.growth_stage, 1);
    assert_eq!(sweet.growth_photo_count, 0);
    // Tidying old memories must not consume credit for later imports.
    conn.execute("DELETE FROM media WHERE id IN (SELECT id FROM media WHERE gps_region_code='KR-46' ORDER BY id LIMIT 10)", []).unwrap();
    for id in 200..210 { photo(&conn, id, Some("KR-46")); }
    let grown = reconcile(&mut conn).unwrap();
    let sweet = grown.characters.iter().find(|c| c.id == "sweet-potato").unwrap();
    assert_eq!(sweet.growth_stage, 2);
    assert_eq!(sweet.growth_photo_count, 10);
    assert_eq!(sweet.region_photo_count, 60);
    assert_eq!(grown.events.iter().filter(|e| e.character_id == "sweet-potato").count(), 1);
    let repeated = reconcile(&mut conn).unwrap();
    assert_eq!(repeated.events.len(), grown.events.len());
    assert_eq!(repeated.characters.iter().find(|c| c.id == "sweet-potato").unwrap().growth_photo_count, 10);
}

#[test]
fn growth_upgrade_preserves_existing_sweet_potato_progress_and_resumes_without_a_jump() {
    let mut conn = database();
    for id in 0..30 { photo(&conn, id, Some("KR-46")); }
    conn.execute_batch("UPDATE owned_character SET growth_stage=3,custom_name='든든한 형',affection=22 WHERE character_id='sweet-potato';
        DROP TABLE character_growth_start; PRAGMA user_version=8;").unwrap();
    crate::database::initialize(&mut conn).unwrap();
    set_main(&mut conn, "sweet-potato").unwrap();
    let waiting = reconcile(&mut conn).unwrap();
    let sweet = waiting.characters.iter().find(|c| c.id == "sweet-potato").unwrap();
    assert_eq!(sweet.growth_stage, 3);
    assert_eq!(sweet.custom_name.as_deref(), Some("든든한 형"));
    assert_eq!(sweet.affection, 22);
    assert!(sweet.is_main);
    conn.execute("UPDATE owned_character SET growth_stage=4 WHERE character_id='potato'", []).unwrap();
    let resumed = reconcile(&mut conn).unwrap();
    let sweet = resumed.characters.iter().find(|c| c.id == "sweet-potato").unwrap();
    assert_eq!(sweet.growth_stage, 3);
    assert_eq!(sweet.growth_photo_count, 30);
    assert!(resumed.events.is_empty());
    for id in 100..130 { photo(&conn, id, Some("KR-46")); }
    let completed = reconcile(&mut conn).unwrap();
    assert_eq!(completed.characters.iter().find(|c| c.id == "sweet-potato").unwrap().growth_stage, 4);
}
