-- Called inside an IMMEDIATE transaction after verifying the selected adult Gomi.
UPDATE owned_character
SET affection=MAX(0,affection-1),updated_at=CURRENT_TIMESTAMP
WHERE character_id='gomi' AND is_main=1
  AND COALESCE((SELECT disturbances FROM character_sleep_day
    WHERE character_id='gomi' AND interaction_day=date('now','localtime')),0)<3;

INSERT INTO character_sleep_day(character_id,interaction_day,disturbances)
SELECT character_id,date('now','localtime'),1 FROM owned_character
WHERE character_id='gomi' AND is_main=1
ON CONFLICT(character_id) DO UPDATE SET
  interaction_day=excluded.interaction_day,
  disturbances=CASE WHEN character_sleep_day.interaction_day=excluded.interaction_day
    THEN MIN(3,character_sleep_day.disturbances+1) ELSE 1 END;
