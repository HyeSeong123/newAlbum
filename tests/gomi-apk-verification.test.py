import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
import zipfile

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('gomi_apk', root / 'scripts/verify-gomi-apk.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)

class ApkVerification(unittest.TestCase):
    def check_apk(self, change=None):
        with tempfile.TemporaryDirectory(prefix='gomgomi-apk-check-') as directory:
            apk = Path(directory) / 'fixture.apk'
            with zipfile.ZipFile(apk, 'w') as archive:
                for name in ['gomi-v4.gguf', 'LICENSE', 'NOTICE']:
                    data = (root / 'models/gomi-lora-v4' / name).read_bytes()
                    archive.writestr('assets/companion/' + name, change(name, data) if change else data)
            with contextlib.redirect_stdout(io.StringIO()):
                checker.verify(apk)

    def test_committed_asset_and_notices_pass(self):
        self.check_apk()

    def test_same_length_tampered_weights_fail(self):
        with self.assertRaisesRegex(AssertionError, 'SHA256'):
            self.check_apk(lambda name, data: bytes([data[0] ^ 1]) + data[1:] if name.endswith('.gguf') else data)

    def test_truncated_weights_fail(self):
        with self.assertRaisesRegex(AssertionError, 'size'):
            self.check_apk(lambda name, data: data[:-1] if name.endswith('.gguf') else data)

    def test_removed_notice_fails(self):
        with self.assertRaisesRegex(AssertionError, 'NOTICE'):
            self.check_apk(lambda name, data: b'' if name == 'NOTICE' else data)

if __name__ == '__main__':
    unittest.main()
