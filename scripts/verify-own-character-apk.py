"""Check the actual APK payload for the own-model build."""
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
        # Tauri embeds frontendDist in its native application binary. Separate
        # ZIP assets would verify an unrelated duplicate. The installed smoke
        # checks the exact bytes served to the Worker against the source SHA.
        return {'apk':str(path),'externalCharacterEngineInApk':False,
                'frontendAssetIntegrity':'requires installed served-asset verification'}

if __name__=='__main__':
    print(json.dumps(verify(Path(sys.argv[1])),ensure_ascii=False))
