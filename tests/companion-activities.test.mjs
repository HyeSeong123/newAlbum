import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext };
const asUrl = source => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, { compilerOptions }).outputText).toString("base64");
const affinityUrl = asUrl(readFileSync(new URL("../src/features/characters/gomiAffinity.ts", import.meta.url), "utf8"));
const activitySource = readFileSync(new URL("../src/features/characters/companionActivities.ts", import.meta.url), "utf8")
  .replace('from "./gomiAffinity"', "from " + JSON.stringify(affinityUrl));
const activityUrl = asUrl(activitySource);
const { COMPANION_ACTIONS, companionActionLabel, companionDisturbsSleep, emptyCompanionMemory, performCompanionActivity, readCompanionMemory,
  saveCompanionMemory, buildCompanionPrompt } = await import(activityUrl);
const llmSource = readFileSync(new URL("../src/features/characters/companionLlm.ts", import.meta.url), "utf8")
  .replace('from "./companionActivities"', "from " + JSON.stringify(activityUrl));
const { generateCompanionLine, cleanCompanionGeneratedText } = await import(asUrl(llmSource));
const definitions = JSON.parse(readFileSync(new URL("../src/features/characters/data/characterDefinitions.json", import.meta.url), "utf8"));
const owned = definition => ({
  id: definition.id, customName: null, affection: 10, growthStage: 6, regionPhotoCount: 0,
  isMain: true, unlockedAt: "", createdAt: "", updatedAt: "",
});

test("all 17 distinct personalities react to each of the five shared Home actions", () => {
  assert.equal(definitions.length, 17);
  assert.equal(COMPANION_ACTIONS.length, 5);
  for (const action of COMPANION_ACTIONS) {
    const lines = definitions.map(definition => {
      const reply = performCompanionActivity(definition, emptyCompanionMemory(), action, 10, "2026-10-25");
      assert.ok(reply.line.length >= 2, definition.type);
      assert.equal(reply.memory.history.length, 1);
      assert.equal(reply.memory.history[0].action, action);
      return reply.line;
    });
    assert.equal(new Set(lines).size, 17, "character-specific: " + action);
  }
  assert.equal(companionActionLabel(definitions[0], "treat"), "간식 주기");
  assert.equal(companionActionLabel(definitions[1], "treat"), "물 주기");
});

test("each friend has fitting choices and authored actions retain the saved activity keys", () => {
  for (const def of definitions.filter(friend => friend.id !== "gomi")) {
    const special = Object.entries(def.specialActivities ?? {});
    assert.ok(special.length >= 2, def.id);
    const labels = COMPANION_ACTIONS.map(action => companionActionLabel(def, action));
    assert.equal(new Set(labels).size, COMPANION_ACTIONS.length, def.id);
    for (const [action, activity] of special) {
      assert.ok(activity.label.length <= 12, activity.label);
      const previous = emptyCompanionMemory();
      const first = performCompanionActivity(def, previous, action, 10, "2026-11-22");
      assert.deepEqual(first.memory.history, [{action, day:"2026-11-22"}]);
      assert.deepEqual(previous.history, []);
      assert.equal(companionActionLabel(def, action), activity.label);
      if (!activity.replies) {
        assert.equal(def.id, "apple");
        assert.notEqual(first.authored, true);
        continue;
      }
      assert.equal(first.authored, true);
      assert.equal(first.line, activity.replies[0]);
      assert.notEqual(performCompanionActivity(def, first.memory, action, 10, "2026-11-22").line, first.line);
    }
  }
});

test("regional gifts and reactions describe the current character artwork", () => {
  for (const [id, action, phrase] of [
    ["apple","pet","모자"], ["ginkgo","pet","뚜껑"], ["camellia","treat","새우 과자"],
    ["pear","pet","지느러미"], ["jujube","pet","호두 껍데기"], ["chestnut","treat","잔뿌리"], ["persimmon","rest","꽃잎"],
  ]) {
    const def=definitions.find(character=>character.id===id);
    const reply=performCompanionActivity(def,emptyCompanionMemory(),action,10,"2026-11-21");
    assert.ok(reply.line.includes(phrase), id);
    assert.ok(buildCompanionPrompt(def,owned(def),emptyCompanionMemory(),action).system.includes(def.appearance));
  }
  assert.equal(companionActionLabel(definitions.find(def=>def.id==="camellia"),"treat"),"새우 과자 주기");
  assert.equal(companionActionLabel(definitions.find(def=>def.id==="chestnut"),"treat"),"물 주기");
});

test("Gomi stays guarded at low affection and affectionate at high affection", () => {
  const gomi = definitions[0];
  for (const action of COMPANION_ACTIONS) {
    const cold = performCompanionActivity(gomi, emptyCompanionMemory(), action, 0, "2026-10-25");
    const warm = performCompanionActivity(gomi, emptyCompanionMemory(), action, 90, "2026-10-25");
    assert.notEqual(cold.line, warm.line);
  }
});

test("Gomi wants to go outside at every affection tier and stays bossy after repeated walks", () => {
  const gomi = definitions[0];
  for (const affection of [0, 20, 30, 60, 90]) {
    const start = performCompanionActivity(gomi, emptyCompanionMemory(), "walk", affection, "2026-11-01");
    assert.doesNotMatch(start.line, /나가기 싫어|한 바퀴만|산책.*귀찮|걷기.*귀찮/);
    assert.match(start.line, /산책|나가|준비|기다리|갈 거|길 고/);
    const repeated = performCompanionActivity(gomi, start.memory, "walk", affection, "2026-11-01");
    assert.match(repeated.line, /나가|목줄|준비/);
    assert.equal(repeated.memory.history.length, 2);
  }
});

test("sleeping Gomi stays sleepy or irritated instead of accepting awake activities", () => {
  const gomi = definitions[0];
  for (const action of ["walk", "pet", "play"]) {
    const reply = performCompanionActivity(gomi, emptyCompanionMemory(), action, 20, "2026-10-25", { sleeping:true });
    assert.equal(reply.memory.mood, "irritated", action);
    assert.equal(reply.memory.history.at(-1).action, action);
    assert.notEqual(reply.line, performCompanionActivity(gomi, emptyCompanionMemory(), action, 20, "2026-10-25").line);
  }
  const rest = performCompanionActivity(gomi, emptyCompanionMemory(), "rest", 20, "2026-10-25", { sleeping:true });
  assert.equal(rest.memory.mood, "sleepy");
});
test("offering food wakes drowsy Gomi gently but does not feed or energize an exhausted sleeper",()=>{
 const gomi=definitions[0];
 const drowsy=performCompanionActivity(gomi,{...emptyCompanionMemory(),energy:1},'treat',75,'2026-11-15',{sleeping:true});
 assert.equal(drowsy.memory.mood,'curious');assert.equal(drowsy.memory.energy,1);
 const tired=performCompanionActivity(gomi,{...emptyCompanionMemory(),energy:0},'treat',75,'2026-11-15',{sleeping:true});
 assert.equal(tired.memory.mood,'sleepy');assert.equal(tired.memory.energy,0);
 assert.equal(companionDisturbsSleep('treat',true),false);
 assert.equal(companionDisturbsSleep('pet',true),true);
 assert.equal(companionDisturbsSleep('rest',true),false);
});

test("actions vary when repeated and only change their own bounded memory", () => {
  const def = definitions[1];
  let state = emptyCompanionMemory();
  let previous = "";
  for (let i = 0; i < 20; i++) {
    const reply = performCompanionActivity(def, state, "walk", 80, "2026-10-25");
    if (i === 1) assert.notEqual(reply.line, previous);
    assert.equal(reply.memory.history.length, Math.min(12, i + 1));
    assert.equal(reply.memory.energy, Math.max(0, 3 - i - 1));
    previous = reply.line; state = reply.memory;
  }
  assert.equal(state.mood, "curious");
  assert.equal(state.energy, 0);
  assert.equal(performCompanionActivity(def, state, "rest", 80, "2026-10-25").memory.energy, 2);
  assert.equal(def.growthConditions.stage6, 60);
});

test("per-character storage survives reuse; corrupt input never breaks Home", () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
  const friend = "companion-memory-unit-test";
  const newMemory = performCompanionActivity(definitions[3], emptyCompanionMemory(), "play", 50, "2026-10-25").memory;
  assert.equal(saveCompanionMemory(friend, newMemory, storage), true);
  assert.deepEqual(readCompanionMemory(friend, storage), newMemory);
  const other = readCompanionMemory("companion-memory-other-test", storage);
  assert.deepEqual(other, emptyCompanionMemory());
  const badKey = "gamjassak:companion:v1:companion-memory-corrupted-test";
  data.set(badKey, '{"version":1,"energy":"NaN"}');
  assert.deepEqual(readCompanionMemory("companion-memory-corrupted-test", storage), emptyCompanionMemory());
});

test("language model prompt contains personality and recent Home actions, not photos or GPS data", () => {
  const def = definitions[2];
  const memory = performCompanionActivity(def, emptyCompanionMemory(), "play", 60, "2026-10-25").memory;
  const prompt = buildCompanionPrompt(def, { ...owned(def), affection: 90, customName: "우리 새싹" }, memory, "walk");
  assert.match(prompt.system, /우리 새싹/);
  assert.match(prompt.system, /장난기/);
  assert.match(prompt.system, /2026-10-25/);
  assert.match(prompt.user, /함께 산책/);
  assert.match(prompt.system, /GPS/);
});

test("LLM adapter never claims on-device generation without a native generator", async () => {
  const def = definitions[2];
  const memory = emptyCompanionMemory();
  const result = await generateCompanionLine(def, owned(def), memory, "walk", "기존 대사");
  assert.deepEqual(result, { source: "local-rules", line: "기존 대사" });
  const mocked = await generateCompanionLine(def, owned(def), memory, "walk", "기존 대사",
    async prompt => { assert.ok(prompt.system.includes(def.personality.archetype)); return "<think>internal</think>형이 같이 가 줄게!"; });
  assert.deepEqual(mocked, { source: "on-device", line: "형이 같이 가 줄게!" });
  const invalid = await generateCompanionLine(def, owned(def), memory, "walk", "기존 대사", async () => "");
  assert.equal(invalid.source, "local-rules");
  assert.equal(cleanCompanionGeneratedText("<|im_start|>assistant\n안녕!<|im_end|>user: 다음 질문"), "안녕!");
});
