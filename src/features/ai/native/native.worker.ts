import { SyntheticSession } from './session';
const session = new SyntheticSession();
let loaded: string | undefined;
self.onmessage = async (event: MessageEvent) => {
  const { id, pixels, width, height, modelText, sha256 } = event.data;
  try {
    if (loaded !== sha256) { await session.load(modelText, sha256); loaded = sha256; }
    const result = session.run({ width, height, channels: 3, data: new Uint8Array(pixels) });
    self.postMessage({ id, result });
  } catch (error) {
    session.dispose(); loaded = undefined;
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
