"""Disposable CI emulator upgrade using the two published phone APKs."""
import hashlib
import os
from pathlib import Path
import sqlite3
import subprocess
import time

app = "com.oraedameun.album.next"
photo = Path("tests/fixtures/exif-seoul.jpg").read_bytes()
def adb(*args, data=None):
    return subprocess.run(["adb", *args], input=data, capture_output=True, timeout=80, check=True).stdout
def shell(*args):
    return adb("shell", *args).decode().strip()
def launch(version):
    assert f"versionName={version}" in shell("dumpsys", "package", app)
    assert "Status: ok" in shell("am", "start", "-W", "-n", app + "/.MainActivity")
    for _ in range(80):
        db = shell("run-as", app, "find", ".", "-type", "f", "-name", "album.sqlite")
        if db and shell("pidof", app):
            break
        time.sleep(1)
    assert db in ("./album.sqlite", "./files/album.sqlite"), db
    time.sleep(3)
    assert shell("pidof", app)
    shell("am", "force-stop", app)
    return db
def download_db(remote, path):
    assert not shell("run-as", app, "find", ".", "-name", "album.sqlite-wal", "-size", "+0c"), "unexpected non-empty WAL"
    path.write_bytes(adb("exec-out", "run-as", app, "cat", remote))
def push_private(path, data):
    adb("shell", "-T", "run-as", app, "tee", path, data=data)
assert os.environ.get("GITHUB_ACTIONS") == "true"
assert adb("get-serialno").decode().strip().startswith("emulator-")
print("Emulator ABIs", shell("getprop", "ro.product.cpu.abilist"), flush=True)
assert not shell("pm", "list", "packages", app), "fixture requires a fresh emulator"
for version in ("0.9.58", "0.9.59"):
    apk = next(Path("apk-" + version).rglob("*.apk"))
    installed = adb("install", "-r", str(apk)).decode()
    assert "Success" in installed, installed
    remote = launch(version)
    local = Path(f"fixture-{version}.sqlite")
    download_db(remote, local)
    parent = str(Path(remote).parent)
    managed = f"{parent}/imported-media-v1/0000000000000001/test.jpg"
    external = "/sdcard/Pictures/gomgomi-qa-original.jpg"
    conn = sqlite3.connect(local)
    assert conn.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    if version == "0.9.58":
        assert conn.execute("select count(*) from media").fetchone() == (0,)
        app_root = shell("run-as", app, "pwd")
        absolute = os.path.normpath(f"{app_root}/{managed}")
        conn.execute("pragma foreign_keys=on")
        conn.execute("insert into media(id,file_path,file_type,size_bytes,title) values(701,?,'image',?,'QA photo')",(absolute,len(photo)))
        conn.execute("insert into album(id,title,cover_media_id) values(702,'QA album',701)")
        conn.execute("insert into album_item(album_id,media_id,sequence) values(702,701,0)")
        conn.execute("insert into diary(id,entry_date,title,body,mood,weather,album_id) values(703,'2026-11-19','QA diary','body','calm','sunny',702)")
        conn.execute("insert into diary_photo values(703,701,0)")
        conn.execute("update owned_character set custom_name='QA Gomi', affection=95 where character_id='gomi'")
        conn.execute("insert into pet(id,name,cover_media_id) values(704,'QA pet',701)")
        conn.execute("insert into pet_media values(704,701)")
        assert conn.execute("pragma foreign_key_check").fetchall() == []
        conn.commit()
        conn.close()
        push_private(remote,local.read_bytes())
        shell("run-as",app,"mkdir","-p",str(Path(managed).parent))
        push_private(managed,photo)
        shell("mkdir","-p","/sdcard/Pictures")
        adb("push","tests/fixtures/exif-seoul.jpg",external)
    else:
        assert conn.execute("select title,cover_media_id from album where id=702").fetchone()==("QA album",701)
        assert conn.execute("select album_id,media_id from album_item").fetchall()==[(702,701)]
        assert conn.execute("select title,body,album_id from diary where id=703").fetchone()==("QA diary","body",702)
        assert conn.execute("select diary_id,media_id from diary_photo").fetchall()==[(703,701)]
        assert conn.execute("select custom_name,affection from owned_character where character_id='gomi'").fetchone()==("QA Gomi",95)
        assert conn.execute("select pet_id,media_id from pet_media").fetchall()==[(704,701)]
        assert conn.execute("select title from media where id=701").fetchone()==("QA photo",)
        assert conn.execute("pragma foreign_key_check").fetchall()==[]
        assert adb("exec-out","run-as",app,"cat",managed)==photo
        assert adb("exec-out","cat",external)==photo
        print("PASS in-place update, synthetic media/album/diary/character/pet links and original/copy bytes",hashlib.sha256(photo).hexdigest())
        conn.close()
