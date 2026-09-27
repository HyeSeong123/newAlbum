"""Reproducible synthetic SQL benchmark; never opens a user's database.

Run: python scripts/benchmark-database.py [--rows 20000]
Timings are diagnostic, not CI thresholds or end-to-end application claims.
"""
import argparse
import json
import sqlite3
import statistics
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def timed(action, repeats=5):
    samples = []
    for _ in range(repeats):
        start = time.perf_counter()
        action()
        samples.append((time.perf_counter() - start) * 1000)
    return round(statistics.median(samples), 3)


def run(rows):
    with tempfile.TemporaryDirectory(prefix="warm-journal-benchmark-") as temp:
        conn = sqlite3.connect(Path(temp) / "synthetic.sqlite")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.executescript((ROOT / "src-tauri/database/schema.sql").read_text())
        conn.executemany("INSERT INTO media(id,file_path,file_type,size_bytes,taken_at,width,height) VALUES(?,?,'image',100000,?,1200,800)",
            ((i, f"photos/{i}.jpg", f"2026-{i % 12 + 1:02}-{i % 28 + 1:02}") for i in range(1, rows + 1)))
        conn.executemany("INSERT INTO album(id,title,cover_media_id) VALUES(?,?,?)", ((i, f"album {i}", i) for i in range(1, 101)))
        conn.executemany("INSERT INTO album_item(album_id,media_id,sequence) VALUES(?,?,?)", ((i % 100 + 1, i, i) for i in range(1, rows + 1)))
        conn.execute("INSERT INTO person(id,name) VALUES(1,'가족')")
        conn.execute("INSERT INTO pet(id,name) VALUES(1,'강아지')")
        conn.execute("INSERT INTO detected_face(media_id,person_id,descriptor,thumbnail) SELECT id,1,'[]','fixture' FROM media")
        conn.execute("INSERT INTO pet_media SELECT 1,id FROM media")
        conn.commit()
        conn.execute("PRAGMA user_version=1")
        query = "SELECT id,file_path,file_type,taken_at,width,height,duration,size_bytes,rating,comment,favorite,metadata_status,view_count,title,latitude,longitude,region_code,region_name,location_status FROM media ORDER BY taken_at DESC NULLS LAST,created_at DESC"
        ordered = conn.execute(query).fetchall()
        ids = [(i,) for i in range(1, 101)]

        def delete_batch():
            conn.execute("BEGIN")
            try:
                conn.executemany("DELETE FROM media WHERE id=?", ids)
                assert conn.execute("SELECT COUNT(*) FROM media").fetchone()[0] == rows - 100
                assert not conn.execute("PRAGMA foreign_key_check").fetchall()
            finally:
                conn.rollback()

        before = {"list_ms": timed(lambda: conn.execute(query).fetchall()),
            "delete_100_ms": timed(delete_batch),
            "path_scan_ms": timed(lambda: conn.execute("SELECT id,file_path FROM media").fetchall())}
        bytes_before = conn.execute("PRAGMA page_count").fetchone()[0] * conn.execute("PRAGMA page_size").fetchone()[0]
        conn.executescript((ROOT / "src-tauri/database/performance-indexes.sql").read_text())
        after = {"list_ms": timed(lambda: conn.execute(query).fetchall()),
            "delete_100_ms": timed(delete_batch),
            "version_read_ms": timed(lambda: conn.execute("PRAGMA user_version").fetchone())}
        bytes_after = conn.execute("PRAGMA page_count").fetchone()[0] * conn.execute("PRAGMA page_size").fetchone()[0]
        # Equal dates have no defined tie order. Compare contents, then date order.
        assert sorted(conn.execute(query).fetchall()) == sorted(ordered)
        assert conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        plan = [r[3] for r in conn.execute("EXPLAIN QUERY PLAN " + query)]
        conn.close()
        return {"sqlite": sqlite3.sqlite_version, "rows": rows, "median_of": 5,
            "before": before, "after": after, "index_bytes_added": bytes_after - bytes_before, "list_plan": plan}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=int, default=20000)
    args = parser.parse_args()
    if args.rows < 100:
        parser.error("--rows must be at least 100")
    print(json.dumps(run(args.rows), indent=2, ensure_ascii=False))
