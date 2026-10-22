import re
import sqlite3
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class EntityMigration(unittest.TestCase):
    def test_existing_manual_and_face_memberships_survive_cover_addition(self):
        db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
        schema=(ROOT/'src-tauri/database/schema.sql').read_text().replace('  cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,\n','',1)
        db.executescript(schema)
        db.executescript("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'original','image',1); INSERT INTO person(id,name,profile_type) VALUES(9,'가족','manual'); INSERT INTO person_photo VALUES(9,1); INSERT INTO detected_face(id,media_id,person_id,descriptor,thumbnail,confirmed) VALUES(18,1,9,'[]','face',1);")
        before=[db.execute('SELECT * FROM '+table).fetchall() for table in ['media','person_photo','detected_face']]
        source=(ROOT/'src-tauri/src/database.rs').read_text()
        migration=re.search(r'tx.execute_batch\("(ALTER TABLE person ADD COLUMN cover_media_id[^"\n]+)"\)',source).group(1)
        db.executescript(migration)
        self.assertEqual(before,[db.execute('SELECT * FROM '+table).fetchall() for table in ['media','person_photo','detected_face']])
        self.assertEqual(db.execute('SELECT id,name,cover_media_id FROM person').fetchone(),(9,'가족',None))
        db.execute('UPDATE person SET cover_media_id=1 WHERE id=9');db.execute('DELETE FROM media WHERE id=1')
        self.assertEqual(db.execute('SELECT id,name,cover_media_id FROM person').fetchone(),(9,'가족',None))
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
    def test_unknown_manual_pet_photos_are_additive_and_never_delete_originals(self):
        db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON');db.executescript((ROOT/'src-tauri/database/schema.sql').read_text())
        db.executescript("INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'original','image',1); INSERT INTO pet(id,name) VALUES(7,'보리'); INSERT INTO pet_media VALUES(7,1);")
        before=[db.execute('SELECT * FROM '+table).fetchall() for table in ['media','pet','pet_media']]
        ddl=(ROOT/'src-tauri/database/unidentified-pet-photos.sql').read_text();db.executescript(ddl);db.executescript(ddl)
        self.assertEqual(before,[db.execute('SELECT * FROM '+table).fetchall() for table in ['media','pet','pet_media']])
        db.execute('INSERT INTO unidentified_pet_photo VALUES(1)');db.execute('DELETE FROM unidentified_pet_photo')
        self.assertEqual(db.execute('SELECT COUNT(*) FROM media').fetchone()[0],1)
        db.execute('INSERT INTO unidentified_pet_photo VALUES(1)');db.execute('DELETE FROM media WHERE id=1')
        self.assertEqual(db.execute('SELECT COUNT(*) FROM unidentified_pet_photo').fetchone()[0],0)
        self.assertEqual(db.execute('SELECT name FROM pet WHERE id=7').fetchone()[0],'보리')
if __name__=='__main__':unittest.main()
