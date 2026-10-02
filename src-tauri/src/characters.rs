//! Local travel companions. All counts come from the existing EXIF-verified media rows.
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrowthConditions { pub stage1: i64, pub stage2: i64, pub stage3: i64, pub stage4: i64 }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Definition {
    pub id: String, pub region_code: String, pub growth_conditions: GrowthConditions,
    #[serde(default)]
    pub default_unlocked: bool,
}

pub fn definitions() -> &'static [Definition] {
    static DATA: OnceLock<Vec<Definition>> = OnceLock::new();
    DATA.get_or_init(|| serde_json::from_str(include_str!("../../src/features/characters/data/characterDefinitions.json"))
        .expect("bundled character definitions must be valid"))
}

pub fn stage_for(count: i64, conditions: &GrowthConditions) -> i64 {
    [conditions.stage1, conditions.stage2, conditions.stage3, conditions.stage4]
        .iter().filter(|&&threshold| count >= threshold).count() as i64
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedCharacter {
    pub id: String, pub custom_name: Option<String>, pub growth_stage: i64,
    pub region_photo_count: i64, pub affection: i64, pub is_main: bool,
    pub unlocked_at: String, pub created_at: String, pub updated_at: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterEvent { pub id: i64, pub character_id: String, pub kind: String, pub stage: i64 }
#[derive(Debug, Serialize)]
pub struct Snapshot { pub characters: Vec<OwnedCharacter>, pub events: Vec<CharacterEvent> }

pub fn migrate(conn: &Connection) -> Result<(), String> {
    // This cached region describes original GPS, independent of manual map labels.
    // Use exactly the same polygon/district resolver as normal location analysis.
    let mut stmt = conn.prepare("SELECT id,latitude,longitude FROM media WHERE file_type='image'
        AND location_status IN ('ready','outside-korea') AND latitude IS NOT NULL AND longitude IS NOT NULL")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?,r.get::<_, f64>(1)?,r.get::<_, f64>(2)?)))
        .map_err(|e| e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())?;
    drop(stmt);
    for (id, lat, lon) in rows {
        let result = super::location::from_coordinates(lat,lon);
        conn.execute("UPDATE media SET gps_region_code=?1 WHERE id=?2",params![result.region_code,id]).map_err(|e| e.to_string())?;
    }
    conn.execute_batch(include_str!("../database/characters.sql")).map_err(|e| e.to_string())
}

// Idempotent for fresh installs and upgrades. Keep names, growth, affection and the
// user's chosen main; starters never generate a travel discovery notification.
pub fn ensure_starters(conn: &Connection) -> Result<(), String> {
    for def in definitions().iter().filter(|def| def.default_unlocked) {
        conn.execute("INSERT OR IGNORE INTO owned_character(character_id,growth_stage,is_main)
            VALUES(?1,1,0)", [&def.id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM character_event WHERE character_id=?1 AND kind='unlock'", [&def.id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(first) = definitions().iter().find(|def| def.default_unlocked) {
        conn.execute("UPDATE owned_character SET is_main=1 WHERE character_id=?1
            AND NOT EXISTS(SELECT 1 FROM owned_character WHERE is_main=1)", [&first.id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn snapshot(conn: &Connection) -> Result<Snapshot, String> {
    let mut stmt = conn.prepare("SELECT c.character_id,c.custom_name,c.growth_stage,
        (SELECT COUNT(*) FROM media m WHERE m.file_type='image' AND m.gps_region_code=?1),
        c.affection,c.is_main,c.unlocked_at,c.created_at,c.updated_at FROM owned_character c WHERE c.character_id=?2")
        .map_err(|e| e.to_string())?;
    let mut characters = Vec::new();
    for def in definitions() {
        if let Some(character) = stmt.query_row(params![def.region_code,def.id], |r| Ok(OwnedCharacter {
            id:r.get(0)?,custom_name:r.get(1)?,growth_stage:r.get(2)?,region_photo_count:r.get(3)?,
            affection:r.get(4)?,is_main:r.get(5)?,unlocked_at:r.get(6)?,created_at:r.get(7)?,updated_at:r.get(8)?
        })).optional().map_err(|e| e.to_string())? { characters.push(character); }
    }
    let mut stmt = conn.prepare("SELECT id,character_id,kind,stage FROM character_event ORDER BY id").map_err(|e| e.to_string())?;
    let events = stmt.query_map([],|r| Ok(CharacterEvent {id:r.get(0)?,character_id:r.get(1)?,kind:r.get(2)?,stage:r.get(3)?}))
        .map_err(|e| e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())?;
    Ok(Snapshot { characters,events })
}

pub fn reconcile(conn: &mut Connection) -> Result<Snapshot, String> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
    ensure_starters(&tx)?;
    for def in definitions() {
        let count: i64 = tx.query_row("SELECT COUNT(*) FROM media WHERE file_type='image' AND gps_region_code=?1",
            [&def.region_code],|r| r.get(0)).map_err(|e| e.to_string())?;
        let stage = stage_for(count,&def.growth_conditions);
        if stage == 0 { continue; }
        let previous: Option<i64> = tx.query_row("SELECT growth_stage FROM owned_character WHERE character_id=?1",
            [&def.id],|r| r.get(0)).optional().map_err(|e| e.to_string())?;
        if previous.is_none() {
            tx.execute("INSERT INTO owned_character(character_id,growth_stage,is_main)
                VALUES(?1,?2,NOT EXISTS(SELECT 1 FROM owned_character WHERE is_main=1))",params![def.id,stage]).map_err(|e| e.to_string())?;
        }
        let credits = tx.execute("INSERT OR IGNORE INTO character_photo_credit(photo_key,character_id)
            SELECT CASE WHEN content_hash IS NOT NULL THEN 'hash:' || content_hash ELSE 'path:' || file_path END,?1
            FROM media WHERE file_type='image' AND gps_region_code=?2",params![def.id,def.region_code]).map_err(|e| e.to_string())?;
        if credits > 0 || previous.is_some_and(|old| stage > old) {
            tx.execute("UPDATE owned_character SET growth_stage=MAX(growth_stage,?1),affection=affection+?2,
                updated_at=CURRENT_TIMESTAMP WHERE character_id=?3",params![stage,credits as i64,def.id]).map_err(|e| e.to_string())?;
        }
        if previous.is_none() || previous.is_some_and(|old| stage > old) {
            tx.execute("INSERT INTO character_event(character_id,kind,stage) VALUES(?1,?2,?3)",
                params![def.id,if previous.is_none() {"unlock"} else {"grow"},stage]).map_err(|e| e.to_string())?;
        }
    }
    let result = snapshot(&tx)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

fn require_owned(conn: &Connection, id: &str) -> Result<(), String> {
    if !definitions().iter().any(|def| def.id==id) { return Err("존재하지 않는 새싹입니다.".into()); }
    let exists: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM owned_character WHERE character_id=?1)",[id],|r| r.get(0)).map_err(|e| e.to_string())?;
    if !exists { return Err("아직 만나지 않은 새싹입니다.".into()); }
    Ok(())
}

pub fn rename(conn: &mut Connection, id: &str, name: &str) -> Result<Snapshot, String> {
    let name = name.trim();
    if name.chars().count()>20 || name.chars().any(char::is_control) { return Err("이름은 줄바꿈 없이 20자 이내로 입력해 주세요.".into()); }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
    require_owned(&tx,id)?;
    tx.execute("UPDATE owned_character SET custom_name=NULLIF(?1,''),updated_at=CURRENT_TIMESTAMP WHERE character_id=?2",params![name,id]).map_err(|e| e.to_string())?;
    let result=snapshot(&tx)?; tx.commit().map_err(|e| e.to_string())?; Ok(result)
}
pub fn set_main(conn: &mut Connection, id: &str) -> Result<Snapshot, String> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
    require_owned(&tx,id)?;
    tx.execute("UPDATE owned_character SET is_main=0,updated_at=CURRENT_TIMESTAMP WHERE is_main=1",[]).map_err(|e| e.to_string())?;
    tx.execute("UPDATE owned_character SET is_main=1,updated_at=CURRENT_TIMESTAMP WHERE character_id=?1",[id]).map_err(|e| e.to_string())?;
    let result=snapshot(&tx)?; tx.commit().map_err(|e| e.to_string())?; Ok(result)
}
pub fn interact(conn: &mut Connection, id: &str) -> Result<Snapshot, String> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
    require_owned(&tx,id)?;
    tx.execute("UPDATE owned_character SET affection=affection+1,last_click_day=date('now','localtime'),updated_at=CURRENT_TIMESTAMP
        WHERE character_id=?1 AND (last_click_day IS NULL OR last_click_day!=date('now','localtime'))",[id]).map_err(|e| e.to_string())?;
    let result=snapshot(&tx)?; tx.commit().map_err(|e| e.to_string())?; Ok(result)
}
pub fn dismiss(conn: &mut Connection, event_id: i64) -> Result<Snapshot, String> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM character_event WHERE id=?1",[event_id]).map_err(|e| e.to_string())?;
    let result=snapshot(&tx)?; tx.commit().map_err(|e| e.to_string())?; Ok(result)
}

#[cfg(test)]
#[path="character_tests.rs"]
mod tests;
