const field = (id) => document.getElementById(id);
const value = (id) => field(id).value;
const text = (id, content) => { field(id).textContent = content; };
const drafts = { shared: [], dorongi: [] };
const target = () => field('character').selectedOptions[0].dataset.target;
const currentDraft = () => drafts[target()];
const targetName = { shared: '친구들이 함께 쓰는 AI', dorongi: '도롱이 전용 AI' };
const everyday = { sleeping: false, energy: 3, condition: 'normal', mood: 'calm' };
const scenes = [
  { label: '평소처럼 깨어 있을 때', settings: everyday },
  { label: '깨어 있지만 졸릴 때', settings: { ...everyday, energy: 1, mood: 'sleepy' } },
  { label: '자고 있을 때', settings: { ...everyday, sleeping: true, energy: 1, mood: 'sleepy' } },
  { label: '너무 피곤해서 계속 잘 때', settings: { ...everyday, sleeping: true, energy: 0, mood: 'sleepy' } },
  { label: '추울 때', settings: { ...everyday, condition: 'cold' } },
  { label: '몸이 아플 때', settings: { ...everyday, condition: 'unwell' } },
];
// Representatives fall inside the same relationship bands used by the trainer.
const relationships = [
  { min: 0, value: 10, label: '아직 낯선 사이' },
  { min: 20, value: 25, label: '아직 서먹한 사이', gomiOnly: true },
  { min: 30, value: 45, label: '서로 익숙한 사이' },
  { min: 60, value: 75, label: '가까운 사이' },
  { min: 90, value: 95, label: '아주 친한 사이', gomiOnly: true },
];
const jobLabels = {
  starting: '학습 준비 중', running: '학습 중', stopping: '중지하는 중',
  stopped: '학습 중지됨', failed: '학습 실패', completed: '학습 완료', interrupted: '학습 중단됨',
};
let state;
let lastJob;
let sending = false;
let adding = false;
let comparisonRevision = 0;

function saveDraft() {
  try {
    sessionStorage.setItem('gomgomi-studio', JSON.stringify({ drafts, target: target(), character: value('character') }));
  } catch {
    // Training can still use examples held by the current page.
  }
}

function restoreDraft() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('gomgomi-studio'));
    if (saved && Object.hasOwn(drafts, saved.target)) {
      for (const model of Object.keys(drafts)) {
        if (Array.isArray(saved.drafts?.[model])) drafts[model] = saved.drafts[model];
      }
      const characters = state.characters[saved.target];
      field('character').value = Object.hasOwn(characters, saved.character)
        ? saved.character : Object.keys(characters)[0];
    }
  } catch {
    // A new page can start with an empty draft.
  }
}

async function request(path, payload) {
  const response = await fetch(path, payload === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gomgomi-Token': state.token },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

function feedback(id, message = '', error = false) {
  text(id, message);
  field(id).classList.toggle('error', error);
}

function option(id, label) {
  return new Option(label, id);
}

function relationshipBands(character) {
  return relationships.filter((band) => !band.gomiOnly || character === 'gomi');
}

function updateRelationships() {
  const bands = relationshipBands(value('character'));
  const exact = value('relationship') === 'custom';
  const amount = field('affection').valueAsNumber;
  field('relationship').replaceChildren(
    ...bands.map((band) => option(band.value, band.label)), option('custom', '숫자로 직접 입력'),
  );
  const band = bands.filter((item) => amount >= item.min).at(-1);
  field('relationship').value = exact || !band ? 'custom' : String(band.value);
  field('affection-field').hidden = value('relationship') !== 'custom';
  if (field('affection-field').hidden) field('affection').value = value('relationship');
}

function chooseScene() {
  const custom = value('scene') === 'custom';
  field('custom-scene').hidden = !custom;
  if (!custom) {
    for (const [key, setting] of Object.entries(scenes[Number(value('scene'))].settings)) {
      field(key).value = String(setting);
    }
  }
  updateContext();
}

function sceneLabel(row) {
  const preset = scenes.find(({ settings }) =>
    Object.entries(settings).every(([key, setting]) => row[key] === setting));
  if (preset) return preset.label;
  const label = (id, selection) => Array.from(field(id).options)
    .find((opt) => opt.value === String(selection))?.label;
  const fatigue = row.energy === 0 ? '몹시 지침' : row.energy === 1 ? '졸림' : '';
  return [row.sleeping ? '자는 중' : '깨어 있음', fatigue,
    row.condition !== 'normal' && label('condition', row.condition), label('mood', row.mood)]
    .filter(Boolean).join(' · ');
}

function contextLabel(row) {
  const name = state.characters[target()][row.characterId];
  const band = relationshipBands(row.characterId).filter((item) => row.affection >= item.min).at(-1);
  return [name, actionLabel(row.action, row.characterId), sceneLabel(row), band?.label].filter(Boolean).join(' · ');
}

function actionLabel(id, character) {
  if (id === 'treat') return character === 'gomi' ? '간식 주기' : '햇살 선물 주기';
  return state.labels[id] ?? id;
}

function quietGomi(row) {
  return row.characterId === 'gomi' && row.affection < 60 && row.condition === 'normal';
}

function updateContext() {
  const row = conditions();
  const quiet = quietGomi(row);
  field('quiet-hint').hidden = !quiet;
  field('add').disabled = quiet || adding;
  text('compare-context', contextLabel(row));
  clearComparison();
}

function actions() {
  const select = field('action');
  const oldAction = select.value;
  const defaultActions = state.actions[target()][value('character')] ?? [];
  const draftActions = currentDraft().filter((row) => row.characterId === value('character')).map((row) => row.action);
  const ids = [...new Set([...defaultActions, ...draftActions])];
  select.replaceChildren(...ids.map((id) => option(id, actionLabel(id, value('character')))), option('+new', '새 행동 입력…'));
  if (ids.includes(oldAction)) select.value = oldAction;
  changeAction();
}

function changeAction() {
  const custom = value('action') === '+new';
  field('custom-field').hidden = !custom;
  field('custom').required = custom;
  updateContext();
}

function changeCharacter() {
  saveDraft();
  updateRelationships();
  actions();
  renderQueue();
  feedback('examples-feedback');
  feedback('import-feedback');
}

function conditions() {
  return {
    characterId: value('character'),
    action: value('action') === '+new' ? value('custom').trim() : value('action'),
    affection: field('affection').valueAsNumber,
    mood: value('mood'),
    energy: Number(value('energy')),
    sleeping: value('sleeping') === 'true',
    condition: value('condition'),
  };
}

function renderQueue() {
  const rows = currentDraft();
  text('queue-heading', '추가한 대사 ' + rows.length.toLocaleString('ko-KR') + '개');
  const scope = target() === 'dorongi' ? '도롱이만 학습해요.' : '도롱이를 제외한 친구들이 함께 쓰는 AI를 학습해요.';
  text('training-scope', scope + (rows.length ? ' 기본 예시에 내 대사 ' + rows.length.toLocaleString('ko-KR') + '개를 더해요.' : ' 기본 예시로 시작해요.'));
  field('empty').hidden = rows.length > 0;
  field('queue').replaceChildren(...rows.map((row, index) => {
    const item = document.createElement('li');
    const content = document.createElement('div');
    const context = document.createElement('p');
    context.className = 'muted';
    context.textContent = contextLabel(row);
    const reply = document.createElement('p');
    reply.textContent = row.reply;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary';
    remove.textContent = '빼기';
    remove.setAttribute('aria-label', (index + 1) + '번 예시 빼기');
    remove.addEventListener('click', () => {
      rows.splice(index, 1);
      saveDraft();
      renderQueue();
      actions();
      const next = field('queue').children[index] ?? field('queue').lastElementChild;
      (next?.querySelector('button') ?? field('import')).focus();
      feedback('import-feedback', '목록에서 대사를 뺐어요.');
    });
    content.append(context, reply);
    item.append(content, remove);
    return item;
  }));
}

function verifyRows(rows) {
  if (rows.some(quietGomi)) {
    throw new Error('평소 고미는 가까운 사이가 되기 전에는 말없이 반응해요. 파일에서 해당 예시의 친한 정도(affection)를 60 이상으로 바꾸거나 몸 상태를 확인해 주세요.');
  }
}

function appendRows(model, rows) {
  verifyRows(rows);
  if (drafts[model].length + rows.length > 5000) throw new Error('추가 학습 예시는 최대 5,000건까지 넣을 수 있어요.');
  drafts[model].push(...rows);
  saveDraft();
  if (target() === model) {
    renderQueue();
    actions();
  }
}

function jobActive(job) {
  return ['starting', 'running', 'stopping'].includes(job?.status);
}

function renderJob(job) {
  if (job?.status === 'completed' && field('character').selectedOptions.length &&
      job.target === target() && (lastJob?.id !== job.id || lastJob?.status !== 'completed')) {
    clearComparison();
  }
  lastJob = job;
  field('start').disabled = sending || !state.numpy || jobActive(job);
  field('stop').disabled = sending || !jobActive(job) || job.status === 'stopping';
  const title = job ? jobLabels[job.status] : '학습 대기';
  if (field('job-status').textContent !== title) text('job-status', title);
  const ratio = job ? job.epoch / job.epochs : 0;
  const complete = job?.status === 'completed';
  field('metrics-details').hidden = !job;
  const percent = complete ? 100 : Math.min(99, Math.floor(ratio * 100));
  field('progress').value = percent / 100;
  text('percent', percent + '%');
  text('epoch', job ? job.epoch + ' / ' + job.epochs : '—');
  text('loss', job?.loss == null ? '—' : job.loss.toFixed(5));
  text('seconds', job?.epoch ? job.seconds.toFixed(1) + '초' : '—');
  const detail = complete ? '예시 ' + job.rows.toLocaleString('ko-KR') + '개로 학습했어요. 아래에서 같은 상황의 대사를 비교해 보세요.'
    : (job?.error ?? (job?.status === 'stopped' ? '중지했습니다. 학습 시작을 눌러 처음부터 다시 학습할 수 있어요.'
      : '추가 예시 ' + job?.added + '건'));
  text('job-detail', job ? targetName[job.target] + ' · ' + detail : '학습 시작을 누르면 진행 상황을 볼 수 있어요.');
  field('result').hidden = !complete;
  if (complete) {
    text('result-dir', job.directory);
    field('download').href = '/api/result/' + job.target;
  }
}

function preset(epochs) {
  field('epochs').value = epochs;
  updatePreset();
}

function updatePreset() {
  field('quick').setAttribute('aria-pressed', value('epochs') === '1');
  field('standard').setAttribute('aria-pressed', value('epochs') === '180');
}

function clearComparison() {
  comparisonRevision++;
  text('before', '—');
  text('after', '—');
  feedback('compare-feedback');
}

function updateReplyHint() {
  const length = Array.from(value('reply').trim()).length;
  text('count', length + ' / 50자');
  field('pending-reply').hidden = length === 0;
}

function comparisonText(result) {
  if (!result) return '학습을 한 번 마치면 여기서 새 대사를 볼 수 있어요.';
  if (result.status === 'ok') return result.line;
  if (result.status === 'nonverbal') return '고미가 말없이 눈길을 돌려요.';
  if (/AI_(CHARACTER|ACTION|STATE|SCENE)_UNTRAINED/.test(result.code)) return '이 행동 또는 상태의 대사를 학습하지 않았어요.';
  return '대사를 생성하지 못했어요. (' + result.code + ')';
}

function connection(message = '') {
  field('connection').hidden = !message;
  text('connection', message);
}

async function refresh() {
  try {
    state = await request('/api/state');
    renderJob(state.job);
    connection(state.numpy ? '' : 'NumPy 설치가 필요해요. 저장소의 PC 학습실 실행 안내를 확인해 주세요.');
  } catch {
    connection('학습실에 연결할 수 없어요. PC에서 학습실 실행 창이 열려 있는지 확인해 주세요.');
    field('start').disabled = true;
    field('stop').disabled = true;
  }
}

async function main() {
  await refresh();
  if (!state) return;
  for (const [model, characters] of Object.entries(state.characters)) {
    for (const [id, name] of Object.entries(characters)) {
      const item = option(id, name);
      item.dataset.target = model;
      field('character').add(item);
    }
  }
  field('scene').replaceChildren(...scenes.map((scene, i) => option(i, scene.label)), option('custom', '상황 직접 설정'));
  restoreDraft();
  changeCharacter();
  field('character').addEventListener('change', changeCharacter);
  field('scene').addEventListener('change', chooseScene);
  field('relationship').addEventListener('change', () => {
    const custom = value('relationship') === 'custom';
    field('affection-field').hidden = !custom;
    if (!custom) field('affection').value = value('relationship');
    updateContext();
  });
  field('action').addEventListener('change', changeAction);
  field('quick').addEventListener('click', () => preset(1));
  field('standard').addEventListener('click', () => preset(180));
  field('epochs').addEventListener('input', updatePreset);
  field('reply').addEventListener('input', updateReplyHint);
  for (const id of ['custom', 'affection', 'mood', 'energy', 'sleeping', 'condition']) {
    field(id).addEventListener('input', updateContext);
  }

  field('example-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const model = target();
    const row = { ...conditions(), reply: value('reply'), meaning: value('meaning').trim() || 'user-added' };
    adding = true;
    field('add').disabled = true;
    try {
      const example = await request('/api/example', { target: model, row });
      appendRows(model, [example]);
      if (target() === model && value('character') === row.characterId) {
        field('action').value = row.action;
        changeAction();
        if (value('reply') === row.reply) {
          field('reply').value = '';
          updateReplyHint();
          field('reply').focus();
        }
      }
      if (target() === model) feedback('examples-feedback', '학습할 대사 목록에 추가했어요.');
    } catch (error) {
      feedback('examples-feedback', error.message, true);
    } finally {
      adding = false;
      field('add').disabled = quietGomi(conditions());
    }
  });

  field('import').addEventListener('click', () => field('file').click());
  field('file').addEventListener('change', async () => {
    const file = field('file').files[0];
    if (!file) return;
    const model = target();
    field('import').disabled = true;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('2MB 이하의 JSONL 파일을 선택해 주세요.');
      const rows = await request('/api/import', { target: model, text: await file.text() });
      appendRows(model, rows);
      if (target() === model) feedback('import-feedback', targetName[model] + '에 ' + rows.length + '건을 가져왔습니다.');
    } catch (error) {
      if (target() === model) feedback('import-feedback', error.message, true);
    } finally {
      field('file').value = '';
      field('import').disabled = false;
    }
  });

  async function updateJob(path, payload) {
    sending = true;
    renderJob(lastJob);
    if (path === '/api/start') text('job-status', '학습 요청 중');
    feedback('training-feedback');
    try {
      renderJob(await request(path, payload));
    } catch (error) {
      feedback('training-feedback', error.message, true);
    } finally {
      sending = false;
      renderJob(lastJob);
    }
  }
  field('start').addEventListener('click', () => {
    if (!field('epochs').checkValidity()) {
      field('epochs-details').open = true;
      field('epochs').reportValidity();
      return;
    }
    updateJob('/api/start', {
      target: target(), epochs: field('epochs').valueAsNumber, rows: currentDraft(),
    });
  });
  field('stop').addEventListener('click', () => updateJob('/api/stop', {}));

  field('compare').addEventListener('click', async () => {
    for (const id of ['character', 'action', 'custom', 'affection']) {
      if (!field(id).reportValidity()) return;
    }
    const payload = { target: target(), row: conditions() };
    const revision = comparisonRevision;
    field('compare').disabled = true;
    feedback('compare-feedback', '대사를 생성하고 있어요.');
    try {
      const result = await request('/api/compare', payload);
      if (revision === comparisonRevision) {
        text('before', comparisonText(result.standard));
        text('after', comparisonText(result.candidate));
        feedback('compare-feedback');
      }
    } catch (error) {
      if (revision === comparisonRevision) feedback('compare-feedback', error.message, true);
    } finally {
      field('compare').disabled = false;
    }
  });

  async function poll() {
    if (!sending) await refresh();
    setTimeout(poll, 1000);
  }
  setTimeout(poll, 1000);
}

main();
