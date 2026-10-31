"""Verify the actual signed APK contains the exact committed Gomi adapter and notices."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

model = Path(__file__).resolve().parent.parent / 'models/gomi-lora-v4'
manifest = json.loads((model / 'runtime.json').read_text(encoding='utf-8'))

def verify(apk):
    with zipfile.ZipFile(apk) as archive:
        name = 'assets/companion/gomi-v4.gguf'
        assert archive.getinfo(name).file_size == manifest['bytes'], 'Gomi adapter size mismatch'
        digest = hashlib.sha256()
        with archive.open(name) as stream:
            while block := stream.read(1024 * 1024):
                digest.update(block)
        assert digest.hexdigest() == manifest['sha256'], 'Gomi adapter SHA256 mismatch'
        for notice in ['LICENSE', 'NOTICE']:
            assert archive.read('assets/companion/' + notice) == (model / notice).read_bytes(), notice
    print(json.dumps({'apk': str(apk), 'gomiAdapterSha256': digest.hexdigest(),
                      'bytes': manifest['bytes'], 'qualityApproved': False}))

if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit('Usage: python3 scripts/verify-gomi-apk.py APK [APK ...]')
    for path in sys.argv[1:]:
        verify(Path(path))
