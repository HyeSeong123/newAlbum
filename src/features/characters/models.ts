import definitions from "./data/characterDefinitions.json";

export type DialogueContext = "greeting" | "photoAdded" | "regionMemory" | "highAffection" | "growth" | "selectedAsMain" | "idle" | "sad";
export type CharacterPersonality = {
  archetype?: string;
  keywords: string[];
  speechTone: string;
  mood: string;
  signatureAnimation: "soft-bounce" | "slow-sway" | "quick-hop" | "playful-wiggle" | string;
  emotionalRole: string;
  visualTraits: string[];
  growthVisualTraits: string[];
};

export type CharacterDefinition = {
  id: string; type: string; regionCode: string; regionName: string; regionLabel: string;
  defaultName: string; description: string; maxStage: number; assetPath: string;
  originalAssetPath?: string;
  expressionAssetPaths?: Partial<Record<"idle" | "happy" | "sad" | "grow", string>>;
  stageAssetPaths?: string[];
  defaultUnlocked?: boolean;
  defaultMain?: boolean;
  fixedGrowthStage?: number;
  characterRole?: "guide";
  gender?: "female";
  companionRole?: "younger-brother" | "older-brother";
  growthPrerequisite?: { characterId: string; stage: number };
  growthStages: { name: string; description: string }[];
  growthConditions: { stage1: number; stage2: number; stage3: number; stage4: number; stage5: number; stage6: number };
  personality?: CharacterPersonality;
  dialogues: { all: string[]; stages: Record<string, string[]>; situations?: Partial<Record<DialogueContext, string[]>> };
};
export const characterDefinitions = (definitions as CharacterDefinition[]).slice().sort((a, b) =>
  Number(Boolean(b.defaultMain)) - Number(Boolean(a.defaultMain)) ||
  Number(Boolean(b.defaultUnlocked)) - Number(Boolean(a.defaultUnlocked)) || a.regionCode.localeCompare(b.regionCode));
export type OwnedCharacter = {
  id: string; customName: string | null; growthStage: number; regionPhotoCount: number;
  affection: number; isMain: boolean; unlockedAt: string; createdAt: string; updatedAt: string;
  growthPhotoCount?: number;
};
export type CharacterEvent = { id: number; characterId: string; kind: "unlock" | "grow"; stage: number };
export type CharacterSnapshot = { characters: OwnedCharacter[]; events: CharacterEvent[] };
export const stageNames = ["", "씨앗", "발아", "새잎", "자람", "꽃과 열매", "완성"];
export function growthStage(definition: CharacterDefinition, stage: number) {
  if (definition.fixedGrowthStage) return definition.growthStages[0];
  return definition.growthStages[Math.max(1, Math.min(definition.maxStage, stage)) - 1];
}
export function growthStageName(definition: CharacterDefinition, stage: number) {
  return growthStage(definition, stage).name;
}
export function characterAsset(definition: CharacterDefinition, stage: number, expression: "idle" | "happy" | "sad" | "grow" = "idle") {
  const current = definition.fixedGrowthStage || Math.max(1, Math.min(definition.maxStage, stage));
  return definition.expressionAssetPaths?.[expression] || definition.stageAssetPaths?.[current - 1]
    || (definition.originalAssetPath && current === definition.maxStage ? definition.originalAssetPath : `${definition.assetPath}/stage${current}-${expression}.svg`);
}
export function companionLabel(definition: CharacterDefinition) {
  if (definition.characterRole === "guide") return "처음부터 함께 · 안내 친구";
  return definition.companionRole === "younger-brother" ? "처음부터 함께 · 동생" :
    definition.companionRole === "older-brother" ? "처음부터 함께 · 형" : definition.regionLabel;
}
export function starterSnapshot(): CharacterSnapshot {
  const now = new Date().toISOString();
  const starters = characterDefinitions.filter(def => def.defaultUnlocked);
  const mainId = starters.find(def => def.defaultMain)?.id || starters[0]?.id;
  return { characters: starters.map(def => ({
    id: def.id, customName: null, growthStage: def.fixedGrowthStage || 1, regionPhotoCount: 0, growthPhotoCount: 0, affection: 0,
    isMain: def.id === mainId, unlockedAt: now, createdAt: now, updatedAt: now,
  })), events: [] };
}
export function characterName(definition: CharacterDefinition, owned?: OwnedCharacter) {
  return owned?.customName || definition.defaultName;
}
export function dialogueLines(definition: CharacterDefinition, stage: number, context: DialogueContext = "idle") {
  const contextual = definition.dialogues.situations?.[context] || [];
  const stageLines = definition.dialogues.stages[String(definition.fixedGrowthStage || stage)] || [];
  if (definition.fixedGrowthStage && context === "highAffection" && contextual.length) return contextual;
  return contextual.length ? [...contextual, ...stageLines] : [...definition.dialogues.all, ...stageLines];
}
export function nextDialogue(lines: string[], previous: number, random = Math.random): number {
  if (lines.length < 2) return 0;
  const next = Math.floor(random() * (lines.length - 1));
  return next >= previous ? next + 1 : next;
}
