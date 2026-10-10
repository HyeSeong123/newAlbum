import sqlite3,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class PersonMigration(unittest.TestCase):
 def test_legacy_ids_assignments_and_pet_data_survive_migration(self):
  c=sqlite3.connect(':memory:');c.execute('PRAGMA foreign_keys=ON')
  c.executescript((ROOT/'src-tauri/database/schema.sql').read_text())
  c.executescript("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'photo','image',1);INSERT INTO person(id,name) VALUES(42,'가족');INSERT INTO face_scan VALUES(1,'legacy-model','2026-01-01');INSERT INTO detected_face(id,media_id,person_id,descriptor,thumbnail,confirmed) VALUES(91,1,42,'[0.1]','jpeg',1),(92,1,42,'[0.2]','jpeg2',0);INSERT INTO pet(id,name) VALUES(8,'보리');INSERT INTO pet_media VALUES(8,1);")
  snapshot=lambda:tuple(c.execute('SELECT * FROM '+t).fetchall() for t in ['media','person','face_scan','detected_face','pet','pet_media'])
  before=snapshot();ddl=(ROOT/'src-tauri/database/person-engine.sql').read_text()
  c.executescript(ddl);c.executescript(ddl);self.assertEqual(snapshot(),before)
  self.assertEqual(c.execute('SELECT reference_kind FROM person_face_metadata ORDER BY face_id').fetchall(),[('seed',),('auto',)])
  c.execute("INSERT INTO person_analysis_job(media_id,state) VALUES(1,'paused')");c.execute('DELETE FROM detected_face WHERE id=91');self.assertEqual(c.execute('SELECT COUNT(*) FROM person_face_metadata').fetchone()[0],1)
  self.assertEqual(c.execute('SELECT COUNT(*) FROM media').fetchone()[0],1);self.assertEqual(c.execute('PRAGMA foreign_key_check').fetchall(),[])
if __name__=='__main__':unittest.main()
