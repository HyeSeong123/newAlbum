"""Exercise the production SQLite schema without a running Tauri application."""

from pathlib import Path
import sqlite3
import unittest


SCHEMA = (Path(__file__).resolve().parents[1] / "src-tauri/database/schema.sql").read_text()


class AlbumStorageTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(SCHEMA)
        self.db.executemany(
            "INSERT INTO media(id, file_path, file_type, size_bytes) VALUES (?, ?, 'image', 100)",
            [(i, f"photo-{i}.jpg") for i in range(1, 5)],
        )
        self.db.executemany(
            "INSERT INTO album(id, title, cover_media_id, cover_color) VALUES (?, ?, ?, ?)",
            [(1, "가을 기록", 1, "#E5E1D5"), (2, "함께한 날", 1, "#D8DDCB")],
        )
        self.db.executemany(
            "INSERT INTO album_item(album_id, media_id, sequence) VALUES (?, ?, ?)",
            [(1, 1, 0), (1, 3, 5), (1, 2, 9), (2, 1, 0), (2, 4, 1)],
        )
        self.db.commit()

    def tearDown(self):
        try:
            self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])
        finally:
            self.db.close()

    def covers(self):
        return self.db.execute("SELECT id, cover_media_id FROM album ORDER BY id").fetchall()

    def test_cover_removal_uses_each_albums_saved_sequence(self):
        self.db.execute("DELETE FROM media WHERE id = 1")
        self.assertEqual(self.covers(), [(1, 3), (2, 4)])
        self.assertEqual(
            self.db.execute("SELECT media_id FROM album_item WHERE album_id = 1 ORDER BY sequence").fetchall(),
            [(3,), (2,)],
        )

    def test_non_cover_removal_keeps_existing_covers(self):
        self.db.execute("DELETE FROM media WHERE id = 3")
        self.assertEqual(self.covers(), [(1, 1), (2, 1)])

    def test_clearing_media_preserves_album_names_and_colors(self):
        self.db.execute("DELETE FROM media")
        self.assertEqual(self.covers(), [(1, None), (2, None)])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM album_item").fetchone()[0], 0)
        self.assertEqual(
            self.db.execute("SELECT title, cover_color FROM album ORDER BY id").fetchall(),
            [("가을 기록", "#E5E1D5"), ("함께한 날", "#D8DDCB")],
        )

    def test_schema_upgrade_preserves_existing_albums_and_is_repeatable(self):
        self.db.execute("DROP TRIGGER update_album_cover_before_media_delete")
        self.db.commit()
        self.db.executescript(SCHEMA)
        self.db.executescript(SCHEMA)
        self.assertEqual(self.covers(), [(1, 1), (2, 1)])
        self.db.execute("DELETE FROM media WHERE id = 1")
        self.assertEqual(self.covers(), [(1, 3), (2, 4)])

    def test_rollback_restores_covers_and_album_membership(self):
        with self.assertRaisesRegex(RuntimeError, "cancel transaction"):
            with self.db:
                self.db.execute("DELETE FROM media WHERE id = 1")
                self.assertEqual(self.covers(), [(1, 3), (2, 4)])
                raise RuntimeError("cancel transaction")
        self.assertEqual(self.covers(), [(1, 1), (2, 1)])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM media").fetchone()[0], 4)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM album_item").fetchone()[0], 5)


if __name__ == "__main__":
    unittest.main()
