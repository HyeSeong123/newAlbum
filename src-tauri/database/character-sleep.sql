-- Additive ledger: preserve all existing names, affection, growth and photo data.
CREATE TABLE IF NOT EXISTS character_sleep_day (
  character_id TEXT PRIMARY KEY REFERENCES owned_character(character_id) ON DELETE CASCADE,
  interaction_day TEXT NOT NULL,
  disturbances INTEGER NOT NULL DEFAULT 0 CHECK(disturbances BETWEEN 0 AND 3)
);
