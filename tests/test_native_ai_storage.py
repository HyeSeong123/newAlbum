import sqlite3
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

class NativeAIStorage(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(':memory:')
        self.c.execute('PRAGMA foreign_keys=ON')
        for name in ['schema.sql', 'pet-recognition.sql']:
            self.c.executescript((ROOT / 'src-tauri/database' / name).read_text())
        self.c.executescript("""INSERT INTO media(id,file_path,file_type,size_bytes) VALUES(1,'photo','image',10);
          INSERT INTO person(id,name) VALUES(42,'family');
          INSERT INTO detected_face(id,media_id,person_id,descriptor,thumbnail,confirmed) VALUES(9,1,42,'[0.1]','thumb',1);
          INSERT INTO pet(id,name) VALUES(8,'pet'); INSERT INTO pet_media VALUES(8,1);
          INSERT INTO album(id,title,cover_media_id) VALUES(3,'album',1);
          INSERT INTO album_item(album_id,media_id,sequence) VALUES(3,1,0);""")
        self.ddl = (ROOT / 'src-tauri/database/native-ai.sql').read_text()
    def snapshot(self):
        return [self.c.execute('SELECT * FROM '+t).fetchall() for t in ['media','person','detected_face','pet','pet_media','album','album_item']]
    def register(self, key='own-v1', task='person', kind='identity', dim=512, state='trained-reviewed'):
        self.c.execute('INSERT INTO native_ai_model VALUES(?,?,?,?,?,?,?,?)', (key,task,kind,dim,'a'*64,'preprocess-v1',state,'{}'))
    def feature(self, key='own-v1', source='sha256:old', view='front', task='person', kind='identity', dim=512):
        self.c.execute('INSERT INTO native_ai_feature(media_id,region_key,model_key,task,kind,dimensions,source_key,view,descriptor) VALUES(1,?,?,?,?,?,?,?,?)', ('region-1',key,task,kind,dim,source,view,'[1,0]'))
    def test_additive_idempotent_schema_preserves_all_existing_data(self):
        before = self.snapshot(); self.c.executescript(self.ddl); self.c.executescript(self.ddl)
        self.assertEqual(self.snapshot(),before)
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM native_ai_model').fetchone()[0],0)
        self.assertEqual(self.c.execute('PRAGMA foreign_key_check').fetchall(),[])
    def test_versions_sources_and_rollback_keep_legacy_confirmations(self):
        self.c.executescript(self.ddl); before=self.snapshot()
        self.register(); self.register('own-v2'); self.c.commit()
        self.feature(); self.feature(source='sha256:new'); self.feature(key='own-v2'); self.c.commit()
        rows = self.c.execute("SELECT model_key,source_key FROM native_ai_feature WHERE model_key='own-v1' AND source_key='sha256:new'").fetchall()
        self.assertEqual(rows,[('own-v1','sha256:new')]); self.assertEqual(self.snapshot(),before)
        self.c.execute('BEGIN'); self.c.execute('DELETE FROM native_ai_feature'); self.c.rollback()
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM native_ai_feature').fetchone()[0],3)
        self.c.execute('DROP TABLE native_ai_feature'); self.c.execute('DROP TABLE native_ai_model')
        self.assertEqual(self.snapshot(),before)
    def test_untrained_synthetic_dimension_rear_and_version_mutation_rejected(self):
        self.c.executescript(self.ddl); self.register(state='synthetic')
        with self.assertRaises(sqlite3.IntegrityError): self.feature()
        with self.assertRaises(sqlite3.IntegrityError): self.c.execute("UPDATE native_ai_model SET state='trained-reviewed'")
        self.register('reviewed')
        with self.assertRaises(sqlite3.IntegrityError): self.feature(key='reviewed',dim=128)
        with self.assertRaises(sqlite3.IntegrityError): self.feature(key='reviewed',view='rear')
        self.register('pet-body','pet','identity',512)
        with self.assertRaises(sqlite3.IntegrityError): self.feature('pet-body',view='rear',task='pet')
        self.register('rear','pet','color-shape',10)
        self.feature('rear',view='rear',task='pet',kind='color-shape',dim=10)
