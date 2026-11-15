import {modelUrl} from './ts-module-loader.mjs';
const {gomiCanSpeak}=await import(await modelUrl(new URL('../src/features/characters/gomiBehavior.ts',import.meta.url)));

// PC and evaluation use the same bond threshold as Home. The user's existing
// cold/unwell comfort examples remain available in the explicit PC commands.
export function ownReplyMode(input){
 return input.characterId==='gomi'&&!gomiCanSpeak(input.affection)&&!['cold','unwell'].includes(input.condition)?'nonverbal':'spoken';
}
