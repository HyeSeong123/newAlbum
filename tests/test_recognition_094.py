import unittest, sqlite3, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class Recognition094(unittest.TestCase):
 def test_additive_migration_retains_all_legacy_links_and_separates_automatic_direction(self):
  c=sqlite3.connect(':memory:');c.execute('PRAGMA foreign_keys=ON')
  c.executescript((ROOT/'src-tauri/database/schema.sql').read_text());c.executescript((ROOT/'src-tauri/database/pet-recognition.sql').read_text())
  c.executescript("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'original','image',1);INSERT INTO person(id,name) VALUES(42,'family');INSERT INTO detected_face(id,media_id,person_id,descriptor,thumbnail,confirmed) VALUES(91,1,42,'legacy128','thumb',1);INSERT INTO pet(id,name) VALUES(8,'pet');INSERT INTO pet_media VALUES(8,1);INSERT INTO pet_scan(media_id,engine_version,source_key) VALUES(1,'gamjassak-pets-v2','sha256:original');")
  for i,view,source in [(1,'front','cat-frontal-cascade'),(2,'left','user')]:c.execute('INSERT INTO pet_detection(id,media_id,object_index,features,pet_id) VALUES(?,1,?,?,8)',(i,i,json.dumps({'view':view,'viewSource':source})))
  snapshot=lambda:[c.execute('SELECT * FROM '+t).fetchall() for t in ['media','person','detected_face','pet','pet_media','pet_detection']]
  before=snapshot();ddl=(ROOT/'src-tauri/database/recognition-094.sql').read_text();c.executescript(ddl);c.executescript(ddl);self.assertEqual(snapshot(),before)
  self.assertEqual(c.execute('SELECT automatic_view,manual_view FROM pet_direction_observation ORDER BY detection_id').fetchall(),[('front',None),(None,'left')])
  c.execute("UPDATE pet_direction_observation SET manual_view='right' WHERE detection_id=1");c.executescript(ddl);self.assertEqual(c.execute('SELECT automatic_view,manual_view FROM pet_direction_observation WHERE detection_id=1').fetchone(),('front','right'))
  c.execute("INSERT INTO person_face_pose(face_id,automatic,manual_view) VALUES(91,?, 'right')",(json.dumps({'view':'left','yawDegrees':40}),))
  c.execute("UPDATE person_face_pose SET manual_view='front' WHERE face_id=91");self.assertEqual(json.loads(c.execute('SELECT automatic FROM person_face_pose').fetchone()[0])['view'],'left')
  self.assertEqual(snapshot(),before);self.assertEqual(c.execute('PRAGMA foreign_key_check').fetchall(),[])
  c.execute('DELETE FROM detected_face WHERE id=91');self.assertEqual(c.execute('SELECT count(*) FROM person_face_pose').fetchone()[0],0);self.assertEqual(c.execute('SELECT count(*) FROM media').fetchone()[0],1)
if __name__=='__main__':unittest.main()
