import json, sqlite3, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class PetStorage(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript((ROOT/'src-tauri/database/schema.sql').read_text())
        self.db.executescript("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'photo.jpg','image',123);INSERT INTO pet(id,name) VALUES(1,'보리');INSERT INTO pet_media VALUES(1,1);INSERT INTO person(id,name) VALUES(1,'가족');INSERT INTO detected_face(id,media_id,person_id,descriptor,thumbnail) VALUES(1,1,1,'[]','face');")
    def snapshot(self):
        return [self.db.execute('SELECT * FROM '+table).fetchall() for table in ['media','pet','pet_media','person','detected_face','album','diary'] if self.db.execute('SELECT 1 FROM sqlite_master WHERE name=?',(table,)).fetchone()]
    def test_upgrade_preserves_manual_pets_people_photos(self):
        before=self.snapshot()
        ddl=(ROOT/'src-tauri/database/pet-recognition.sql').read_text()
        self.db.executescript(ddl)
        self.db.executescript(ddl)
        self.assertEqual(self.snapshot(),before)
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
    def test_delete_photo_cascades_scans_detections_and_owned_links(self):
        self.db.executescript((ROOT/'src-tauri/database/pet-recognition.sql').read_text())
        self.db.executescript("INSERT INTO pet_scan(media_id,engine_version,source_key) VALUES(1,'v1','photo');INSERT INTO pet_detection(media_id,object_index,features,pet_id) VALUES(1,0,'{}',1),(1,1,'{}',NULL);INSERT INTO pet_recognition_link VALUES(1,1);")
        self.db.execute('DELETE FROM media WHERE id=1')
        for table in ['pet_scan','pet_detection','pet_recognition_link','pet_media','detected_face']:
            self.assertEqual(self.db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0],0)
        self.assertEqual(self.db.execute('SELECT name FROM pet').fetchone()[0],'보리')
    def test_delete_pet_retains_photo_scan_as_unconfirmed(self):
        self.db.executescript((ROOT/'src-tauri/database/pet-recognition.sql').read_text())
        self.db.executescript("INSERT INTO pet_scan(media_id,engine_version,source_key) VALUES(1,'v1','photo');INSERT INTO pet_detection(media_id,object_index,features,pet_id) VALUES(1,0,'{}',1);")
        self.db.execute('DELETE FROM pet WHERE id=1')
        self.assertIsNone(self.db.execute('SELECT pet_id FROM pet_detection').fetchone()[0])
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM media').fetchone()[0],1)
if __name__=='__main__':unittest.main()
