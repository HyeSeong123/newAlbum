import characters from "../../../local-ai/characters.json";
import actions from "../../../local-ai/actions.json";
import contract from "../../../local-ai/prompt-contract.json";
import policy from "../../../local-ai/reaction-policy.json";

export type GomiActionInput = {
  characterId: string; action: string; affection?: number; mood?: string; energy?: number;
  sleeping?: boolean; previous?: string[]; repair?: string;
};
type ActionSpec = { label: string; description: string; characterDescriptions?: Record<string, string>;
  characterIntents?: Record<string, string>; characterGoals?: Record<string, Record<string, string>> };
const clean = (text: string) => text.replace(/<\|[^>]*\|>/g, "").replace(/<\/?think>/gi, "");
const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
const finite = (value: number, maximum: number) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) throw new Error("Invalid Gomi action state");
  return value;
};

/** The same small registries and template used by local-ai/core.py; Home state only. */
export function buildGomiActionMessages(input: GomiActionInput) {
  if (input.characterId !== "gomi" || !Object.hasOwn(actions,input.action) || input.action === "scene") throw new Error("Invalid Gomi action scope");
  const action = (actions as Record<string, ActionSpec>)[input.action], character = characters.gomi;
  const affection = finite(input.affection ?? 45, 100), energy = finite(input.energy ?? 3, 5);
  const mood = input.mood ?? "calm";
  if (!Object.hasOwn(contract.moods, mood) || (input.sleeping != null && typeof input.sleeping !== "boolean")) throw new Error("Invalid Gomi action state");
  if (input.previous != null && (!Array.isArray(input.previous) || !input.previous.every(line => typeof line === "string"))) throw new Error("Invalid Gomi history");
  const relation = contract.relations.find(([threshold]) => affection >= Number(threshold))![1];
  const system = fill(contract.system, { name: character.name, persona: character.persona });
  let user = fill(contract.state, { action:input.action, label:action.label, description:action.characterDescriptions?.gomi ?? action.description,
    relation, affection, mood:(contract.moods as Record<string, string>)[mood], energy, sleep:input.sleeping ? contract.asleep : contract.awake });
  if (input.sleeping && mood === "irritated") user += contract.disturbedNote;
  const goals = action.characterGoals?.gomi;
  const band = affection >= 60 ? "close" : affection >= 30 ? "familiar" : "distant";
  let intent = goals?.[mood] ?? goals?.[band] ?? goals?.default ?? action.characterIntents?.gomi;
  if (input.sleeping) {
    const kind = mood === "irritated" ? "irritated" : input.action === "rest" ? "rest" : "other";
    intent = fill(contract.sleepGoals[kind], { name:character.name });
  }
  if (intent) user += contract.directionPrefix + intent;
  if (input.previous?.length) user += contract.previousPrefix + input.previous.slice(-3).map(clean).join(" / ");
  if (input.repair) user += policy.repairPrefix + clean(input.repair);
  user += contract.closing;
  return [{role:"system",content:system}, {role:"user",content:user}];
}
export function buildGomiActionPrompt(input: GomiActionInput) {
  return buildGomiActionMessages(input).map(message => contract.chat.start + message.role + "\n" + message.content + contract.chat.end).join("") + contract.chat.assistant;
}

export function gomiReactionIssue(input: Pick<GomiActionInput,"action"|"sleeping">, line: string) {
  for (const rule of policy.rules) {
    if (rule.actions && !rule.actions.includes(input.action)) continue;
    if (rule.whenSleeping && !input.sleeping) continue;
    if (new RegExp(rule.pattern,"u").test(line) && !(rule.unlessPattern && new RegExp(rule.unlessPattern,"u").test(line))) {
      return {id:rule.id,reason:rule.reason};
    }
  }
  return undefined;
}
export const gomiRetryReason = (repeated: boolean) => repeated ? policy.repeatRepair : policy.formatRepair;
