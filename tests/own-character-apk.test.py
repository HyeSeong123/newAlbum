import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

source=Path(__file__).resolve().parents[1]/'scripts/verify-own-character-apk.py'
spec=importlib.util.spec_from_file_location('own_apk',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class OwnApkPolicy(unittest.TestCase):
    def make_apk(self,root,name):
        path=Path(root)/'fixture.apk'
        with zipfile.ZipFile(path,'w') as archive:archive.writestr(name,b'synthetic fixture')
        return path

    def test_frontend_embedded_in_native_binary_does_not_need_duplicate_zip_assets(self):
        with tempfile.TemporaryDirectory() as root:
            result=module.verify(self.make_apk(root,'lib/arm64-v8a/libapp.so'))
            self.assertFalse(result['externalCharacterEngineInApk'])
            self.assertIn('requires installed',result['frontendAssetIntegrity'])

    def test_external_character_weights_or_inference_libraries_are_rejected(self):
        for name in ['assets/companion/old.gguf','lib/arm64-v8a/libllama.so','lib/x86_64/libgamjassak_companion.so']:
            with self.subTest(name=name),tempfile.TemporaryDirectory() as root:
                with self.assertRaisesRegex(ValueError,'External character'):
                    module.verify(self.make_apk(root,name))

if __name__=='__main__':unittest.main()
