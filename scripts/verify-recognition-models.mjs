// Removal guard only: no model registry, downloads, decryption or ONNX loader.
import { checkRelease } from './release/check-ai-assets.mjs';
const errors = await checkRelease(undefined, { verifyAssets: false });
if (errors.length) throw new Error(errors.join('\n'));
