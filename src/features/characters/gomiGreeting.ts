import { gomiDialogueLines } from "./gomiAffinity";

type GreetingStorage = Pick<Storage, "getItem" | "setItem">;
const sessionDays = new Map<string, string>();

// Use the app's local calendar day; navigation and restarts must not repeat a welcome.
export function claimGomiGreeting(today: string, characterId: string, affection: number,
  storage?: GreetingStorage, random = Math.random): string | undefined {
  const key = `gamjassak:gomi-greeting:${characterId}`;
  if (sessionDays.get(key) === today) return;
  try {
    if (storage?.getItem(key) === today) return;
    storage?.setItem(key, today);
  } catch {
    // A disabled browser store still gets one welcome per day in this session.
  }
  sessionDays.set(key, today);
  const lines = gomiDialogueLines(affection, "greeting");
  return lines[Math.floor(random() * lines.length)];
}
