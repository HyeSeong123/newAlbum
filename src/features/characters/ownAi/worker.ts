import {generateOwnLine, loadOwnModel, type OwnInput} from "./engine";

// This URL is an APK/Vite-owned asset, never a remote model service.
const loadStarted = performance.now();
const loaded = fetch(new URL("/character-ai/manifest.json", self.location.origin),{cache:"no-store"}).then(async manifestResponse => {
  if (!manifestResponse.ok) throw new Error("AI_OWN_MODEL_MISSING");
  const manifest=await manifestResponse.json();
  if (manifest.id!=="own-character-v3"||manifest.file!=="model.json"||manifest.bytes>2_000_000||!/^[0-9a-f]{64}$/.test(manifest.sha256)) throw new Error("AI_OWN_MODEL_INVALID");
  const response=await fetch(new URL("/character-ai/model.json",self.location.origin),{cache:"no-store"});
  if (!response.ok) throw new Error("AI_OWN_MODEL_MISSING");
  const bytes = await response.text();
  if (bytes.length > 2_000_000) throw new Error("AI_OWN_MODEL_INVALID");
  const encoded=new TextEncoder().encode(bytes);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",encoded)),x=>x.toString(16).padStart(2,"0")).join("");
  if(encoded.length!==manifest.bytes||digest!==manifest.sha256) throw new Error("AI_OWN_MODEL_INVALID");
  const model = loadOwnModel(JSON.parse(bytes));
  self.postMessage({type:"ready", bytes:new TextEncoder().encode(bytes).length, loadMs:performance.now()-loadStarted});
  return model;
});
loaded.catch(error => self.postMessage({type:"load-error",error:String(error)}));
self.onmessage = async (event: MessageEvent<{id:number;input:OwnInput;seed:number}>) => {
  const {id,input,seed} = event.data;
  try {
    const model = await loaded, started = performance.now();
    const line = generateOwnLine(model,input,seed);
    self.postMessage({id,type:"reply",line,generationMs:performance.now()-started});
  } catch (error) { self.postMessage({id,type:"error",error:String(error)}); }
};
