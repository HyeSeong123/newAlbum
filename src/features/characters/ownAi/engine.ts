// Gomgomi-owned neural inference. No external model, tokenizer or AI engine.
export type OwnInput = {
  characterId: string; action: string; affection: number; mood?: string; energy?: number;
  sleeping?: boolean; condition?: "normal" | "cold" | "unwell"; previous?: string[];
};
type Matrix = { rows: number; cols: number; values: Float32Array };
type Packed = { shape: number[]; values: string; scales: string };
export type OwnModel = {
  vocab: string[]; features: Map<string, number>; characters: string[]; actions: string[];
  embedding: number; hidden: number; weights: Record<string, Matrix>;
  nextTokens: Array<Set<number>>;
};
const invalid = () => new Error("AI_OWN_MODEL_INVALID");
function unpack(item: Packed | undefined, shape: number[]): Matrix {
  if (!item || JSON.stringify(item.shape) !== JSON.stringify(shape) || typeof item.values !== "string" || typeof item.scales !== "string") throw invalid();
  const raw = Uint8Array.from(atob(item.values), x => x.charCodeAt(0));
  const scales = Uint8Array.from(atob(item.scales), x => x.charCodeAt(0));
  const rows = shape[0], cols = shape.length > 1 ? shape[1] : 1;
  if (raw.length !== rows * cols || scales.length !== rows * 4) throw invalid();
  const view = new DataView(scales.buffer), signed = new Int8Array(raw.buffer), values = new Float32Array(raw.length);
  for (let r = 0; r < rows; r++) {
    const scale = view.getFloat32(r * 4, true);
    if (!Number.isFinite(scale) || scale <= 0 || scale > 100) throw invalid();
    for (let c = 0; c < cols; c++) values[r * cols + c] = signed[r * cols + c] * scale;
  }
  return { rows, cols, values };
}
export function loadOwnModel(raw: unknown): OwnModel {
  const m = raw as { format?: string; context?: number; embedding?: number; hidden?: number;
    vocab?: string[]; features?: string[]; characters?: string[]; actions?: string[]; nextTokens?: number[][];
    weights?: Record<string, Packed>; provenance?: { initialization?: string; pretrainedParents?: string[]; teacherModel?: string | null } };
  if (!m || m.format !== "gomgomi-own-wordnet-v2" || m.context !== 4 || m.embedding !== 24 || m.hidden !== 112 ||
      !Array.isArray(m.vocab) || m.vocab.length < 10 || m.vocab.length > 5000 || m.vocab.slice(0,4).join() !== "<bos>,<eos>,<pad>,<unk>" ||
      new Set(m.vocab).size !== m.vocab.length || !Array.isArray(m.features) || !Array.isArray(m.characters) || !Array.isArray(m.actions) ||
      m.vocab[4]!=="<next>" ||
      m.provenance?.initialization !== "random" || m.provenance.pretrainedParents?.length !== 0 || m.provenance.teacherModel !== null) throw invalid();
  const v = m.vocab.length, f = m.features.length, weights: Record<string, Matrix> = {};
  if(!Array.isArray(m.nextTokens)||m.nextTokens.length!==v||m.nextTokens.some(row=>!Array.isArray(row)||row.some(id=>!Number.isInteger(id)||id<1||id>=v)))throw invalid();
  const shapes: Record<string, number[]> = { "tokens.weight":[v,24], "features.weight":[f,24], "feature_bias.weight":[f,v],
    "hidden.weight":[112,120], "hidden.bias":[112], "output.weight":[v,112], "output.bias":[v] };
  for (const [key,shape] of Object.entries(shapes)) weights[key] = unpack(m.weights?.[key],shape);
  return { vocab:m.vocab, features:new Map(m.features.map((name,i) => [name,i])), characters:m.characters, actions:m.actions,
    embedding:24, hidden:112, weights, nextTokens:m.nextTokens.map(row=>new Set(row)) };
}
export function ownFeatureNames(input: OwnInput, clause=0): string[] {
  const tier = input.affection >= 60 ? "close" : input.affection >= 30 ? "familiar" : "distant";
  const state = input.sleeping ? input.action === "rest" ? "asleep-quiet" : "asleep-disturbed" : "awake";
  return ["character:"+input.characterId, "action:"+input.action, "tier:"+tier, "state:"+state,
    "condition:"+(input.condition || "normal"), "mood:"+(input.mood || "calm"), "energy:"+((input.energy ?? 3) <= 1 ? "low" : "normal"), "clause:"+clause];
}
function conditioned(model: OwnModel, input: OwnInput, clause=0) {
  if (!model.characters.includes(input.characterId)) throw new Error("AI_CHARACTER_UNTRAINED");
  if (!model.actions.includes(input.action)) throw new Error("AI_ACTION_UNTRAINED");
  if (!Number.isFinite(input.affection) || input.affection < 0 || input.affection > 100) throw new Error("AI_STATE_INVALID");
  const ids = ownFeatureNames(input,clause).map(name => {
    const id = model.features.get(name);
    if (id == null) throw new Error("AI_STATE_UNTRAINED:"+name);
    return id;
  });
  const emb = new Float32Array(24), bias = new Float32Array(model.vocab.length);
  for (const id of ids) {
    const e = model.weights["features.weight"].values, b = model.weights["feature_bias.weight"].values;
    for (let j = 0; j < emb.length; j++) emb[j] += e[id * 24 + j] / ids.length;
    for (let j = 0; j < bias.length; j++) bias[j] += b[id * bias.length + j] / ids.length;
  }
  const hiddenBase = new Float32Array(112), hw = model.weights["hidden.weight"].values, hb = model.weights["hidden.bias"].values;
  for (let h = 0; h < 112; h++) {
    let value = hb[h];
    for (let j = 0; j < 24; j++) value += emb[j] * hw[h * 120 + 96 + j];
    hiddenBase[h] = value;
  }
  return { bias, hiddenBase };
}
function logits(model: OwnModel, history: number[], state: ReturnType<typeof conditioned>) {
  const hidden = new Float32Array(112), embed = model.weights["tokens.weight"].values;
  const hw = model.weights["hidden.weight"].values, ow = model.weights["output.weight"].values, ob = model.weights["output.bias"].values;
  for (let h = 0; h < 112; h++) {
    let value = state.hiddenBase[h];
    for (let p = 0; p < 4; p++) for (let j = 0; j < 24; j++) value += embed[history[p] * 24 + j] * hw[h * 120 + p * 24 + j];
    hidden[h] = Math.tanh(value);
  }
  const output = new Float32Array(model.vocab.length);
  for (let word = 0; word < output.length; word++) {
    let value = ob[word] + state.bias[word];
    for (let h = 0; h < 112; h++) value += hidden[h] * ow[word * 112 + h];
    output[word] = value;
  }
  return output;
}
const punctuation = /^[.!?…]$/;
const normalized = (text: string) => text.normalize("NFKC").replace(/[\p{P}\p{S}\s]/gu, "");
function prohibited(input: OwnInput, token: string): boolean {
  if (/[<>{}]|(?:집사|사용자)에게|고미는|건드지/.test(token)) return true;
  if(input.characterId==="gomi"&&(!input.condition||input.condition==="normal")&&/걱정|추워|춥|아파|아프|아픈/.test(token))return true;
  if (input.sleeping) {
    if(!["touch","pet"].includes(input.action)&&/쓰다듬|만지|손길|손대/.test(token))return true;
    if(input.action==="rest"&&/깨워|깨우|자꾸/.test(token))return true;
    if(input.mood!=="irritated"&&/자꾸/.test(token))return true;
    return /산책|간식|먹을|먹자|놀자|출발|나가자|깨워줄/.test(token);
  }
  if(input.characterId==="gomi"&&input.action==="pet"&&input.affection<30&&/좋아|괜찮|더.*쓰다듬/.test(token))return true;
  if (input.condition === "cold" || input.condition === "unwell") return /안아줄|안아줄게|안아줄까|내가.*안아/.test(token);
  if(input.action==="treat"){
    if(input.characterId==="gomi"&&/햇살|햇빛/.test(token))return true;
    if(input.characterId!=="gomi"&&/간식|먹을|먹어|한입|한 입|내몫|내 몫/.test(token))return true;
  }
  const foreign: Record<string, RegExp> = {
    touch:/산책|간식|먹을|먹자|출발|나가자/,
    walk:/간식|먹을|먹자|쓰다듬|잘게|자게|놀자/,
    treat:/산책|쓰다듬|잘게|자게|놀자|출발|나가자|줄게|줄까|주겠/,
    pet:/산책|간식|먹을|먹자|출발|나가자|놀자/,
    play:/간식|먹을|먹자|쓰다듬|잘게|자게|산책/,
    rest:/산책|간식|먹을|먹자|출발|나가자|놀자|신났/,
  };
  return Boolean(foreign[input.action]?.test(token));
}
function acceptable(input: OwnInput, line: string): boolean {
  if (!/[가-힣]/.test(line) || Array.from(line).length < 4 || Array.from(line).length > 50) return false;
  const flat = normalized(line);
  if ((input.previous || []).some(previous => normalized(previous) === flat)) return false;
  const sentences=line.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)||[];
  if(sentences.length>1){
    const first=sentences[0]!,second=sentences.slice(1).join(" ");
    if(input.action==="pet"&&/쓰다듬지|만지지|손.*치워|지금은.*멈춰|거기까지만/.test(first)&&/더.*쓰다듬|조금만 더|한 번 더/.test(second))return false;
    if(/내 옆|네 옆|곁에 있어/.test(first)&&/떨어져|멀리|혼자.*있/.test(second))return false;
    if(normalized(first)===normalized(second))return false;
  }
  if (input.condition === "cold" || input.condition === "unwell") return /안아줘|안고/.test(line);
  if (input.sleeping) return /잘|자게|자고|졸|조용|깨우|쉬/.test(line);
  const cues: Record<string, RegExp> = { walk:/산책|걸|나가|나갈|밖|먼저|빨리|기다|문 앞/,
    treat:/간식|먹|놓아|하나|내 몫|더 줘|먼저 줘|나 줘|빨리 줘|받을/,
    pet:/쓰다듬|손|만지|살살|누르|거기|그만|세게|멈춰|어색/,
    play:/놀|놀이|먼저|차례|시작|같이|한 번/,
    rest:/쉬|조용|옆|자리|편|기대|서두|있어|있을/ };
  if(input.action==="treat"&&input.characterId!=="gomi")return /햇살|햇빛|빛|따뜻|포근|선물/.test(line)&&!/간식|먹을|먹어/.test(line);
  return !cues[input.action] || cues[input.action].test(line);
}
export function generateOwnLine(model: OwnModel, input: OwnInput, seed = Date.now(), cancelled = () => false): string {
  if (cancelled()) throw new Error("AI_CANCELLED");
  const states = [conditioned(model,input,0),conditioned(model,input,1)], started = performance.now();
  let randomState = (seed | 0) || 1;
  const random = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 4294967296; };
  for (let attempt = 0; attempt < 16; attempt++) {
    let history = [0,0,0,0];
    let clause = 0;
    let ended = false;
    const words: string[] = [];
    for (let step = 0; step < 22; step++) {
      if (cancelled()) throw new Error("AI_CANCELLED");
      if (performance.now()-started > 700) throw new Error("AI_OWN_TIMEOUT");
      const scores = logits(model,history,states[clause]), candidates: Array<{id:number; score:number}> = [];
      for (let id = 1; id < scores.length; id++) {
        if(!model.nextTokens[history[3]].has(id))continue;
        const token = model.vocab[id];
        if(id===4&&(clause!==0||!words.length||!punctuation.test(words.at(-1)!)))continue;
        if (id === 2 || id === 3 || (id === 1 && words.length < 2) || (punctuation.test(token) && (!words.length || punctuation.test(words.at(-1)!))) ||
            (id > 4 && prohibited(input,token)) || (id>4 && !punctuation.test(token) && words.slice(-2).includes(token))) continue;
        const score = scores[id];
        let position = candidates.findIndex(item => score > item.score);
        if (position < 0) position = candidates.length;
        if (position < 8) { candidates.splice(position,0,{id,score}); if (candidates.length > 8) candidates.pop(); }
      }
      if (!candidates.length) break;
      const temperature = attempt < 6 ? 0.68 : 0.82;
      const weights = candidates.map(item => Math.exp((item.score-candidates[0].score)/temperature));
      let draw = random() * weights.reduce((sum,value) => sum+value,0), chosen = candidates[0].id;
      for (let i = 0; i < candidates.length; i++) { draw -= weights[i]; if (draw <= 0) { chosen = candidates[i].id; break; } }
      if (chosen === 1) {ended=true;break;}
      if(chosen===4){clause=1;history=[0,0,0,0];continue;}
      words.push(model.vocab[chosen]); history = [...history.slice(1),chosen];
      const current = words.join(" ").replace(/\s+([.!?…])/g,"$1");
      if(words.filter(word=>/^[.!?]$/.test(word)).length>=2){ended=true;break;}
      if (current.length >= 44 && /[.!?…]$/.test(current)) {ended=true;break;}
      if (current.length > 50) { words.pop(); break; }
    }
    if(!ended) continue;
    let line = words.join(" ").replace(/\s+([.!?…])/g,"$1").trim();
    if (!/[.!?…]$/.test(line)) line += ".";
    if (acceptable(input,line)) return line;
  }
  throw new Error("AI_OWN_NO_VALID_LINE");
}
