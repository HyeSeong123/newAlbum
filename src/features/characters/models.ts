import definitions from "./data/characterDefinitions.json";

export type DialogueContext = "greeting" | "photoAdded" | "regionMemory" | "highAffection" | "growth" | "selectedAsMain" | "idle" | "sad";
export type CharacterPersonality = {
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
  growthConditions: { stage1: number; stage2: number; stage3: number; stage4: number };
  personality?: CharacterPersonality;
  dialogues: { all: string[]; stages: Record<string, string[]>; situations?: Partial<Record<DialogueContext, string[]>> };
};
export const characterDefinitions = (definitions as CharacterDefinition[]).slice().sort((a, b) => a.regionCode.localeCompare(b.regionCode));
export type OwnedCharacter = {
  id: string; customName: string | null; growthStage: number; regionPhotoCount: number;
  affection: number; isMain: boolean; unlockedAt: string; createdAt: string; updatedAt: string;
};
export type CharacterEvent = { id: number; characterId: string; kind: "unlock" | "grow"; stage: number };
export type CharacterSnapshot = { characters: OwnedCharacter[]; events: CharacterEvent[] };
export const stageNames = ["", "씨앗", "새싹", "어린싹", "다 자란 새싹"];
export function characterName(definition: CharacterDefinition, owned?: OwnedCharacter) {
  return owned?.customName || definition.defaultName;
}
export function dialogueLines(definition: CharacterDefinition, stage: number, context: DialogueContext = "idle") {
  const contextual = definition.dialogues.situations?.[context] || [];
  const stageLines = definition.dialogues.stages[String(stage)] || [];
  return contextual.length ? [...contextual, ...stageLines] : [...definition.dialogues.all, ...stageLines];
}
export function nextDialogue(lines: string[], previous: number, random = Math.random): number {
  if (lines.length < 2) return 0;
  const next = Math.floor(random() * (lines.length - 1));
  return next >= previous ? next + 1 : next;
}
