import { useRef, useState } from 'react';
import { EntityEditorDialog } from '../../components/EntityEditorDialog';
import type { Assignment } from './entityService';
import { entityCounter } from './entityLabels';
import './entities.css';

export function EntityAssignmentDialog({ kind, entries, count, unit, initialMode, onSave, onClose }: {
  kind: 'person' | 'pet'; entries: { id: number; name: string }[]; count: number; unit: string; initialMode?: 'existing' | 'new';
  onSave: (assignment: Assignment) => Promise<void>; onClose: () => void;
}) {
  const [mode, setMode] = useState<'existing' | 'new'>(initialMode ?? (entries.length ? 'existing' : 'new'));
  const [target, setTarget] = useState(''), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const noun = kind === 'person' ? '인물' : '반려동물';
  const duplicate = entries.some(entry => entry.name.trim() === name.trim());
  function close() {
    if (!busy && (!(name.trim() || target) || window.confirm('입력한 이름과 선택을 저장하지 않고 닫을까요?'))) onClose();
  }
  return <EntityEditorDialog title="이름 지정" busy={busy} onClose={close} className="entityAssignment">
    <form onSubmit={async event => {
      event.preventDefault();
      if (lock.current || !count || (mode === 'new' ? !name.trim() || duplicate : !target)) return;
      lock.current = true; setBusy(true); setError('');
      try { await onSave({ target: mode === 'existing' ? Number(target) : null, name: mode === 'new' ? name.trim() : null }); onClose(); }
      catch (reason) { setError(`${reason instanceof Error ? reason.message : String(reason)} 선택은 유지했어요. 다시 저장해 주세요.`); }
      finally { lock.current = false; setBusy(false); }
    }}>
      <div className="entityEditBody">
        <p>{unit} {count}{entityCounter(unit)}에 이름을 지정합니다. 원본 사진은 유지됩니다.</p>
        <div className="entityEditModes" role="group" aria-label="이름 지정 방법"><button type="button" disabled={busy || !entries.length} aria-pressed={mode === 'existing'} onClick={() => setMode('existing')}>기존 {noun}</button><button type="button" disabled={busy} aria-pressed={mode === 'new'} onClick={() => setMode('new')}>새 {noun}</button></div>
        {mode === 'existing' ? <label className="entityEditField">{noun} 선택<select aria-label={`${noun} 선택`} value={target} disabled={busy} required onChange={event => setTarget(event.target.value)}><option value="">선택하세요</option>{entries.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label> : <label className="entityEditField">새 {noun} 이름<input aria-label={`새 ${noun} 이름`} value={name} maxLength={80} disabled={busy} required onChange={event => setName(event.target.value)} /></label>}
        {mode === 'new' && duplicate && <p role="alert">같은 이름이 있습니다. ‘기존 {noun}’에서 선택해 주세요.</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      <footer className="peopleActions entityEditFooter" data-help-dock><button type="button" disabled={busy} onClick={close}>취소</button><button data-help={kind === "pet" ? "save-pet-assignment" : undefined} type="submit" className="primaryControl" disabled={busy || !count || (mode === 'new' ? !name.trim() || duplicate : !target)}>{busy ? '저장 중…' : '이름 지정'}</button></footer>
    </form>
  </EntityEditorDialog>;
}
