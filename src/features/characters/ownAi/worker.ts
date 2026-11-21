import {generateOwnLine, loadOwnModel, type OwnInput} from "./engine";

type Weights = {file:string;bytes:number;sha256:string};
async function loadWeights(asset: Weights | undefined, filename: "model.json" | "dorongi.json") {
  if (!asset || asset.file!==filename || asset.bytes>2_000_000 || !/^[0-9a-f]{64}$/.test(asset.sha256)) throw new Error("AI_OWN_MODEL_INVALID");
  const response=await fetch(new URL("/character-ai/"+filename,self.location.origin),{cache:"no-store"});
  if (!response.ok) throw new Error("AI_OWN_MODEL_MISSING");
  const bytes = await response.text();
  if (bytes.length > 2_000_000) throw new Error("AI_OWN_MODEL_INVALID");
  const encoded=new TextEncoder().encode(bytes);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",encoded)),x=>x.toString(16).padStart(2,"0")).join("");
  if(encoded.length!==asset.bytes||digest!==asset.sha256) throw new Error("AI_OWN_MODEL_INVALID");
  return loadOwnModel(JSON.parse(bytes));
}

// The manifest and both weight files are APK/Vite-owned assets.
const loadStarted = performance.now();
const loaded = fetch(new URL("/character-ai/manifest.json", self.location.origin),{cache:"no-store"}).then(async response => {
  if (!response.ok) throw new Error("AI_OWN_MODEL_MISSING");
  const manifest=await response.json();
  if (manifest.id!=="own-character-v3") throw new Error("AI_OWN_MODEL_INVALID");
  const model=await loadWeights(manifest,"model.json");
  self.postMessage({type:"ready", bytes:manifest.bytes, loadMs:performance.now()-loadStarted});
  return {model,dorongi:manifest.dorongi as Weights | undefined};
});
loaded.catch(error => self.postMessage({type:"load-error",error:String(error)}));
let dorongiLoaded: ReturnType<typeof loadWeights> | undefined;
self.onmessage = async (event: MessageEvent<{id:number;input:OwnInput;seed:number}>) => {
  const {id,input,seed} = event.data;
  try {
    const base = await loaded, started = performance.now();
    const model = input.characterId==="apple"
      ? await (dorongiLoaded ??= loadWeights(base.dorongi,"dorongi.json").catch(error => {
          dorongiLoaded = undefined;
          throw error;
        }))
      : base.model;
    const line = generateOwnLine(model,input,seed);
    self.postMessage({id,type:"reply",line,generationMs:performance.now()-started});
  } catch (error) { self.postMessage({id,type:"error",error:String(error)}); }
};
