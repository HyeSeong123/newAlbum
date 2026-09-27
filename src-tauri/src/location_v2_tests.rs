use super::*;

fn fixture() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    crate::database::initialize(&mut conn).unwrap();
    conn.execute_batch("INSERT INTO media(id,file_path,file_type,size_bytes,taken_at,location_status,region_code,region_name,latitude,longitude)
        VALUES(1,'a.jpg','image',1,'2025-08-12','ready','KR-11','서울특별시',37.5,127),
        (2,'b.jpg','image',1,'2026-08-13','no-gps',NULL,NULL,NULL,NULL),
        (3,'c.mp4','video',1,'2025-08-14','failed',NULL,NULL,NULL,NULL),
        (4,'d.mp3','audio',1,'2025-08-15','no-gps',NULL,NULL,NULL,NULL),
        (5,'e.jpg','image',1,NULL,'queued',NULL,NULL,NULL,NULL);").unwrap();
    conn
}

#[test]
fn manual_assignment_overrides_gps_preserves_coordinates_and_is_atomic() {
    let conn = fixture();
    assign_region(&conn, &[1,2,3], "KR-49").unwrap();
    assert_eq!(overview(&conn).unwrap().regions.iter().find(|r| r.code == "KR-49").unwrap().photos, 2);
    let row: (String,String,f64,f64) = conn.query_row("SELECT region_code,location_source,latitude,longitude FROM media WHERE id=1", [], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).unwrap();
    assert_eq!(row, ("KR-49".into(),"manual".into(),37.5,127.0));
    assert!(assign_region(&conn, &[1,999], "KR-26").is_err());
    assert!(assign_region(&conn, &[1,4], "KR-26").is_err());
    assert!(assign_region(&conn, &[1], "not-a-region").is_err());
    assert!(assign_region(&conn, &[], "KR-11").is_err());
    assert_eq!(region_page(&conn,"KR-49",0,"all","",false).unwrap().total, 3);
}

#[test]
fn manual_values_survive_failed_retry_and_even_a_stale_queued_status() {
    let conn = fixture();
    assign_region(&conn, &[1,2,3], "KR-49").unwrap();
    conn.execute("UPDATE media SET location_status='failed' WHERE id=1", []).unwrap();
    conn.execute("UPDATE media SET location_status='queued' WHERE id=2", []).unwrap();
    queue_failed(&conn).unwrap();
    analyze_batch(&conn, 24).unwrap();
    let mut stmt = conn.prepare("SELECT region_code,location_source FROM media WHERE id<=3 ORDER BY id").unwrap();
    let mut rows = stmt.query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).unwrap();
    assert!(rows.all(|row| row.unwrap() == ("KR-49".into(), "manual".into())));
}

#[test]
fn region_queries_filter_year_type_sort_and_bound_pages_without_file_io() {
    let conn = fixture();
    assert_eq!(region_page(&conn,"unclassified",0,"all","",false).unwrap().total,2);
    assign_region(&conn, &[1,2,3,5], "KR-49").unwrap();
    let page = region_page(&conn,"KR-49",0,"all","",false).unwrap();
    assert_eq!(page.years, vec!["2026","2025"]);
    assert_eq!(page.items.iter().map(|m| m.id).collect::<Vec<_>>(), vec![2,3,1,5]);
    let page = region_page(&conn,"KR-49",0,"all","2025",true).unwrap();
    assert_eq!(page.items.iter().map(|m| m.id).collect::<Vec<_>>(), vec![1,3]);
    assert_eq!(region_page(&conn,"KR-49",0,"video","2025",true).unwrap().items[0].id,3);
    assert_eq!(region_page(&conn,"KR-49",0,"image","2025",false).unwrap().total,1);
    assert_eq!(region_page(&conn,"KR-49",0,"all","2024",false).unwrap().total,0);
    assert!(region_page(&conn,"KR-49",0,"all","2025 OR 1",false).is_err());
    assert!(region_page(&conn,"KR-49",0,"audio","",false).is_err());
    for id in 6..106 { conn.execute("INSERT INTO media(id,file_path,file_type,size_bytes,location_status,region_code) VALUES(?1,?2,'image',1,'ready','KR-49')", params![id,format!("{id}.jpg")]).unwrap(); }
    let a = region_page(&conn,"KR-49",0,"all","",false).unwrap();
    let b = region_page(&conn,"KR-49",48,"all","",false).unwrap();
    assert_eq!(a.total,104); assert_eq!(a.items.len(),48); assert_eq!(b.items.len(),48);
    assert!(!a.items.iter().any(|left| b.items.iter().any(|right| left.id==right.id)));
}
