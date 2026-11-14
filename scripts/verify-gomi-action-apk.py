"""Inspect the actual APK's standalone Gomi model and required attribution."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]

def verify(apk):
    folder=ROOT/'models/gomi-action-v3'
    spec=json.loads((folder/'runtime.json').read_text(encoding='utf-8'))
    with zipfile.ZipFile(apk) as archive:
        prefix='assets/companion/'
        stored=json.loads(archive.read(prefix+'gomi-action-v3.json').decode('utf-8-sig'))
        assert stored==spec,'Compact Gomi manifest mismatch'
        member=archive.getinfo(prefix+spec['file'])
        assert member.file_size==spec['bytes'],'Compact Gomi model size mismatch'
        digest=hashlib.sha256()
        with archive.open(member) as stream:
            while block:=stream.read(1024*1024):
                digest.update(block)
        assert digest.hexdigest()==spec['sha256'],'Compact Gomi model SHA256 mismatch'
        for file in ['LICENSE','NOTICE','DERIVED-MODEL-TERMS.txt']:
            assert archive.read(prefix+'gomi-action-v3-'+file)==(folder/file).read_bytes(),file+' differs'
    result={'apk':str(apk),'bytes':spec['bytes'],'sha256':digest.hexdigest(),'characterId':'gomi',
        'usage':'home-actions','standalone':True,'qualityApproved':False,'modelAndNoticesVerified':True}
    print(json.dumps(result,ensure_ascii=False))
    return result

if __name__=='__main__':
    for apk in sys.argv[1:]:
        verify(Path(apk))
