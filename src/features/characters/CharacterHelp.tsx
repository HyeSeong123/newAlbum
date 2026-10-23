import { createContext, useContext, type ReactNode } from 'react';
import { CharacterVisual } from './CharacterVisual';
import { characterDefinitions, characterName, type OwnedCharacter } from './models';
import './character-help.css';

/** The app supplies its live main character, including name and growth changes. */
export const HelpCharacterContext = createContext<OwnedCharacter | undefined>(undefined);

export function useHelpCharacter() {
  const owned = useContext(HelpCharacterContext);
  const definition = characterDefinitions.find(item => item.id === owned?.id)
    ?? characterDefinitions.find(item => item.defaultMain)!;
  return { definition, name: characterName(definition, owned),
    stage: owned?.growthStage ?? definition.fixedGrowthStage ?? 1,
    affection: owned?.affection ?? 0 };
}

export function HelpCharacterAvatar() {
  const { definition, stage, affection } = useHelpCharacter();
  return <CharacterVisual definition={definition} stage={stage} affection={affection} />;
}

/** Guidance itself is the character's dialogue, rather than a decorative portrait. */
export function CharacterSpeech({ children }: { children: ReactNode }) {
  const { name } = useHelpCharacter();
  return <div className="characterHelp" aria-label={`${name}의 안내`}>
    <div className="characterHelpPortrait" aria-hidden="true"><HelpCharacterAvatar /></div>
    <div className="characterHelpSpeech"><strong className="characterHelpName">{name}</strong><div className="characterHelpLines">{children}</div></div>
  </div>;
}
