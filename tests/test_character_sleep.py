import pathlib
import sqlite3
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'src-tauri' / 'database'

def sql(name):
    path = ROOT / name
    return path.read_text() if path.exists() else ''

class SleepAffection(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = pathlib.Path(self.temp.name) / 'album.sqlite'
        self.db = sqlite3.connect(self.path)
        self.db.executescript("CREATE TABLE media(id INTEGER PRIMARY KEY,gps_region_code TEXT,file_type TEXT,file_path TEXT);")
        self.db.executescript(sql('characters.sql'))
        self.db.execute("INSERT INTO owned_character(character_id,custom_name,growth_stage,affection,is_main,last_click_day) VALUES('gomi','우리 고미',6,20,1,'2026-01-01')")
        self.db.execute("INSERT INTO media VALUES(5,'KR-11','image','original.jpg')")
        self.db.executescript(sql('character-sleep.sql'))

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def disturb(self):
        self.db.executescript('BEGIN IMMEDIATE;\n' + sql('character-sleep-penalty.sql') + '\nCOMMIT;')

    def test_additive_storage_preserves_existing_character_and_photo(self):
        self.assertIsNotNone(self.db.execute("SELECT name FROM sqlite_schema WHERE name='character_sleep_day'").fetchone())
        self.assertEqual(self.db.execute('SELECT custom_name,growth_stage,affection,last_click_day FROM owned_character').fetchone(), ('우리 고미',6,20,'2026-01-01'))
        self.assertEqual(self.db.execute('SELECT file_path FROM media').fetchone()[0], 'original.jpg')

    def test_penalty_stops_at_three_and_does_not_spend_the_awake_greeting(self):
        for _ in range(10): self.disturb()
        self.assertEqual(self.db.execute('SELECT affection,last_click_day FROM owned_character').fetchone(), (17,'2026-01-01'))

    def test_affection_cannot_drop_below_zero(self):
        self.db.execute('UPDATE owned_character SET affection=1')
        for _ in range(5): self.disturb()
        self.assertEqual(self.db.execute('SELECT affection FROM owned_character').fetchone()[0], 0)

    def test_background_character_is_untouched(self):
        self.db.execute('UPDATE owned_character SET is_main=0')
        self.disturb()
        self.assertEqual(self.db.execute('SELECT affection FROM owned_character').fetchone()[0], 20)

    def test_limit_survives_reopen_and_resets_on_a_new_day(self):
        for _ in range(3): self.disturb()
        self.db.close()
        self.db = sqlite3.connect(self.path)
        self.disturb()
        self.assertEqual(self.db.execute('SELECT affection FROM owned_character').fetchone()[0], 17)
        self.db.execute("UPDATE character_sleep_day SET interaction_day='2000-01-01'")
        self.disturb()
        self.assertEqual(self.db.execute('SELECT affection FROM owned_character').fetchone()[0], 16)

if __name__ == '__main__': unittest.main()
