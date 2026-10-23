import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';
import { EntityEditorDialog } from './EntityEditorDialog';
import { CharacterSpeech } from '../features/characters/CharacterHelp';
import './function-help.css';

/** Keep guidance beside its action, without covering the photo list by default. */
export function FunctionHelp({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="functionHelpTrigger" aria-label={`${title} 도움말`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><CircleHelp size={16} aria-hidden="true" />도움말</button>
    {open && createPortal(<EntityEditorDialog title={`${title} 도움말`} busy={false} onClose={() => setOpen(false)} className="functionHelpDialog">
      <div className="entityEditBody functionHelpCopy"><CharacterSpeech>{children}</CharacterSpeech></div>
      <footer className="peopleActions functionHelpFooter"><button type="button" onClick={() => setOpen(false)}>확인</button></footer>
    </EntityEditorDialog>, document.fullscreenElement ?? document.body)}
  </>;
}

