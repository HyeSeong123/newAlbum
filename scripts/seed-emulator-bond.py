"""Set affection in a stopped, disposable CI installation for offline speech tests."""
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
from tempfile import TemporaryDirectory


def adb(*args, data=None):
    return subprocess.run(["adb", *args], input=data, capture_output=True,
                          timeout=45, check=True).stdout


def main(package):
    if os.environ.get("GITHUB_ACTIONS") != "true" or not re.fullmatch(rb"emulator-\d+", adb("get-serialno").strip()):
        raise RuntimeError("Requires a disposable CI emulator")
    if not re.fullmatch(r"[a-z][a-z0-9_.]+", package):
        raise ValueError("Invalid test package")
    processes = adb("shell", "ps", "-A", "-o", "NAME").decode().splitlines()
    if any(name.strip() == package or name.strip().startswith(package + ":") for name in processes):
        raise RuntimeError("Test app must be stopped before seeding")
    def private(*args):
        return adb("exec-out", "run-as", package, *args)
    db = private("find", ".", "-type", "f", "-name", "album.sqlite").decode().strip()
    if not re.fullmatch(r"\./(?:[A-Za-z0-9_-]+/)*album\.sqlite", db):
        raise RuntimeError("Expected exactly one private album.sqlite")
    for suffix in ("-wal", "-journal"):
        if private("find", ".", "-name", "album.sqlite" + suffix, "-size", "+0c").strip():
            raise RuntimeError("Fixture database has a live journal")
    with TemporaryDirectory() as folder:
        snapshot = Path(folder) / "fixture.sqlite"
        snapshot.write_bytes(private("cat", db))
        conn = sqlite3.connect(snapshot)
        try:
            with conn:
                changed = conn.execute("UPDATE owned_character SET affection=95 WHERE character_id='gomi'")
                if changed.rowcount != 1 or conn.execute("PRAGMA integrity_check").fetchone() != ("ok",):
                    raise RuntimeError("Invalid fixture database")
        finally:
            conn.close()
        payload = snapshot.read_bytes()
        candidate = db + ".bonded-fixture"
        adb("shell", "-T", "run-as", package, "tee", candidate, data=payload)
        if private("cat", candidate) != payload:
            raise RuntimeError("Incomplete fixture transfer")
        private("mv", candidate, db)


if __name__ == "__main__":
    main(sys.argv[1])
