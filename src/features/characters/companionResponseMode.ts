// On an Android CPU a 4B model can take tens of seconds before its first token.
// All characters default to the real on-device generator when installed;
// instant local lines remain an explicit user choice for low-power situations.
export type CompanionResponseMode = "instant" | "generate";
const PREFIX = "gamjassak:companion-response-mode:v1:";
const session = new Map<string, CompanionResponseMode>();

function getStore(): Pick<Storage, "getItem" | "setItem"> | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; }
  catch { return undefined; }
}
export function readCompanionResponseMode(id: string, store = getStore()): CompanionResponseMode {
  if (!id) return "generate";
  try {
    const saved = store?.getItem(PREFIX + encodeURIComponent(id));
    if (saved === "instant" || saved === "generate") {
      session.set(id, saved);
      return saved;
    }
  } catch { /* A blocked storage API must not delay a reaction. */ }
  return session.get(id) || "generate";
}
export function saveCompanionResponseMode(id: string, mode: CompanionResponseMode, store = getStore()): void {
  if (!id || (mode !== "instant" && mode !== "generate")) return;
  session.set(id, mode);
  try { store?.setItem(PREFIX + encodeURIComponent(id), mode); }
  catch { /* Keep the choice for this app session. */ }
}
