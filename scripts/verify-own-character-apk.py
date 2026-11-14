"""Check the actual APK payload for the own-model build."""
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile

def verify(path):
    with zipfile.ZipFile(path) as apk:
        names=apk.namelist()
        forbidden=[name for name in names if re.search(r'\.gguf$|lib(?:gamjassak_companion|llama|ggml)[^/]*\.so$',name,re.I)]
        if forbidden:
            raise ValueError('External character weights/engine remain in APK: '+repr(forbidden))
        def find(suffix):
            matches=[name for name in names if name.endswith(suffix)]
            if len(matches)!=1:raise ValueError('Expected one APK asset: '+suffix)
            return apk.read(matches[0])
        raw=find('/character-ai/model.json')
        manifest=json.loads(find('/character-ai/manifest.json'))
        if len(raw)!=manifest['bytes'] or hashlib.sha256(raw).hexdigest()!=manifest['sha256']:
            raise ValueError('Own-model APK integrity mismatch')
        model=json.loads(raw)
        if model['provenance']['initialization']!='random' or model['provenance']['pretrainedParents'] or model['provenance']['teacherModel'] is not None:
            raise ValueError('Own-model provenance mismatch')
        notice=find('/notices/companion-ai-NOTICE.txt').decode('utf-8')
        if '곰고미 전용 AI' not in notice or 'HyperCLOVA' in notice or 'Qwen' in notice:
            raise ValueError('Own-model notice mismatch')
        return {'apk':str(path),'ownModelBytes':len(raw),'sha256':manifest['sha256'],
                'pretrainedParents':[],'externalCharacterEngineInApk':False,'noticeVerified':True}

if __name__=='__main__':
    print(json.dumps(verify(Path(sys.argv[1])),ensure_ascii=False))
