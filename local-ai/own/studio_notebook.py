"""Persistent, PC-only authoring settings and reviews of actual model output."""
from contextlib import closing
import hashlib
import json
import sqlite3
from personality import validate_profile


class Notebook:
    def __init__(self, directory):
        directory.mkdir(exist_ok=True, parents=True)
        self.path = directory / 'studio.sqlite3'
        with closing(self.connect()) as db, db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS profiles (
                  character TEXT PRIMARY KEY, revision INTEGER NOT NULL, content TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS drafts (
                  target TEXT PRIMARY KEY, revision INTEGER NOT NULL, content TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS reviews (
                  id TEXT PRIMARY KEY, run TEXT NOT NULL, character TEXT NOT NULL,
                  scene TEXT NOT NULL, line TEXT NOT NULL, score INTEGER, updated TEXT);
                CREATE INDEX IF NOT EXISTS rated_character ON reviews(character, updated);
            """)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def profiles(self):
        with closing(self.connect()) as db:
            return {r['character']: {**json.loads(r['content']), 'revision': r['revision']}
                    for r in db.execute('SELECT * FROM profiles')}

    def drafts(self):
        with closing(self.connect()) as db:
            return {r['target']: {'rows': json.loads(r['content']), 'revision': r['revision']}
                    for r in db.execute('SELECT * FROM drafts')}

    def save_draft(self, target, rows, revision):
        if type(revision) is not int or revision < 0:
            raise ValueError('기대 대사 목록을 새로고침해 주세요.')
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT revision FROM drafts WHERE target=?', (target,)).fetchone()
            if (old[0] if old else 0) != revision:
                raise ValueError('다른 창에서 목록을 바꿨어요. 새로고침 후 다시 추가해 주세요.')
            db.execute('INSERT OR REPLACE INTO drafts VALUES (?,?,?)',
                       (target, revision + 1, json.dumps(rows, ensure_ascii=False)))
        return {'revision': revision + 1}

    def save_profile(self, character, profile, revision):
        profile = validate_profile(profile)
        if type(revision) is not int or revision < 0:
            raise ValueError('성격 설정을 새로고침해 주세요.')
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT revision FROM profiles WHERE character=?', (character,)).fetchone()
            if (old[0] if old else 0) != revision:
                raise ValueError('다른 창에서 성격을 수정했어요. 새로고침해서 최근 설정을 확인해 주세요.')
            db.execute('INSERT OR REPLACE INTO profiles VALUES (?,?,?)',
                       (character, revision + 1, json.dumps(profile, ensure_ascii=False)))
        return {**profile, 'revision': revision + 1}

    def generated(self, run, scene, line):
        data = json.dumps(scene, ensure_ascii=False, sort_keys=True)
        key = hashlib.sha256(json.dumps([run, data, line], ensure_ascii=False).encode()).hexdigest()
        with closing(self.connect()) as db, db:
            db.execute('INSERT OR IGNORE INTO reviews(id,run,character,scene,line) VALUES (?,?,?,?,?)',
                       (key, run, scene['characterId'], data, line))
            score = db.execute('SELECT score FROM reviews WHERE id=?', (key,)).fetchone()[0]
        return {'id': key, 'score': score}

    def rate(self, key, score):
        if not isinstance(key, str) or type(score) is not int or not 1 <= score <= 5:
            raise ValueError('생성한 대사와 1~5 사이의 평점을 선택해 주세요.')
        with closing(self.connect()) as db, db:
            changed = db.execute("UPDATE reviews SET score=?, updated=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", (score, key))
            if not changed.rowcount:
                raise ValueError('평가할 대사를 다시 생성해 주세요.')
        return {'id': key, 'score': score}

    def history(self, character):
        with closing(self.connect()) as db:
            return [{**dict(row), 'scene': json.loads(row['scene'])} for row in db.execute(
                'SELECT id,run,scene,line,score,updated FROM reviews WHERE character=? AND score IS NOT NULL '
                'ORDER BY updated DESC, rowid DESC LIMIT 30', (character,))]
