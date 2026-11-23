const field = (id) => document.getElementById(id);
const value = (id) => field(id).value;
const text = (id, content) => { field(id).textContent = content; };
const drafts = { shared: [], dorongi: [] };
const target = () => value('target');
const currentDraft = () => drafts[target()];
const targetName = { shared: '공유 모델', dorongi: '도롱이 전용 모델' };
const jobLabels = {
  starting: '학습 준비 중', running: '학습 중', stopping: '중지하는 중',
  stopped: '학습 중지됨', failed: '학습 실패', completed: '학습 완료', interrupted: '학습 중단됨',
};
let state;
let lastJob;
let sending = false;

function saveDraft() {
  try {
    sessionStorage.setItem('gomgomi-studio', JSON.stringify({ drafts, target: target() }));
  } catch {
    // Training can still use examples held by the current page.
  }
}

function restoreDraft() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('gomgomi-studio'));
    if (saved && Object.hasOwn(drafts, saved.target)) {
      for (const model of Object.keys(drafts)) drafts[model] = saved.drafts[model];
      field('target').value = saved.target;
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

function actions() {
  const select = field('action');
  const oldAction = select.value;
  const defaultActions = state.actions[target()][value('character')] ?? [];
  const draftActions = currentDraft().filter((row) => row.characterId === value('character')).map((row) => row.action);
  const ids = [...new Set([...defaultActions, ...draftActions])];
  select.replaceChildren(...ids.map((id) => option(id, state.labels[id] ?? id)), option('+new', '새 행동 입력…'));
  if (ids.includes(oldAction)) select.value = oldAction;
  changeAction();
}

function changeAction() {
  const custom = value('action') === '+new';
  field('custom-field').hidden = !custom;
  field('custom').required = custom;
  clearComparison();
}

function changeTarget() {
  saveDraft();
  field('character').replaceChildren(...Object.entries(state.characters[target()]).map(([id, name]) => option(id, name)));
  actions();
  renderQueue();
  feedback('examples-feedback');
}

function conditions() {
  return {
    characterId: value('character'),
    action: value('action') === '+new' ? value('custom').trim() : value('action'),
    affection: field('affection').valueAsNumber,
    mood: value('mood'),
    energy: field('energy').valueAsNumber,
    sleeping: value('sleeping') === 'true',
    condition: value('condition'),
  };
}

function renderQueue() {
  const rows = currentDraft();
  text('queue-heading', '추가 예시 ' + rows.length.toLocaleString('ko-KR') + '건');
  field('empty').hidden = rows.length > 0;
  field('queue').replaceChildren(...rows.map((row, index) => {
    const item = document.createElement('li');
    const content = document.createElement('div');
    const context = document.createElement('p');
    context.className = 'muted';
    context.textContent = [
      state.characters[target()][row.characterId], state.labels[row.action] ?? row.action,
      '친밀도 ' + row.affection, row.sleeping ? '자는 중' : '깨어 있음', '활력 ' + row.energy,
    ].join(' · ');
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
      (field('queue').children[index]?.querySelector('button') ?? field('add')).focus();
      feedback('examples-feedback', '목록에서 예시를 뺐습니다.');
    });
    content.append(context, reply);
    item.append(content, remove);
    return item;
  }));
}

function verifyRows(rows) {
  if (rows.some((row) => row.characterId === 'gomi' && row.affection < 60 && row.condition === 'normal')) {
    throw new Error('평소 고미는 친밀도 60 미만에서 말없이 반응해요. 예시의 친밀도 또는 몸 상태를 확인해 주세요.');
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
  lastJob = job;
  field('start').disabled = sending || !state.numpy || jobActive(job);
  field('stop').disabled = sending || !jobActive(job) || job.status === 'stopping';
  const title = job ? jobLabels[job.status] : '학습 대기';
  if (field('job-status').textContent !== title) text('job-status', title);
  const ratio = job ? job.epoch / job.epochs : 0;
  const complete = job?.status === 'completed';
  const percent = complete ? 100 : Math.min(99, Math.floor(ratio * 100));
  field('progress').value = percent / 100;
  text('percent', percent + '%');
  text('epoch', job ? job.epoch + ' / ' + job.epochs : '—');
  text('loss', job?.loss == null ? '—' : job.loss.toFixed(5));
  text('seconds', job?.epoch ? job.seconds.toFixed(1) + '초' : '—');
  const detail = complete ? '예시 ' + job.rows.toLocaleString('ko-KR') + '건으로 학습한 모델을 저장했습니다.'
    : (job?.error ?? (job?.status === 'stopped' ? '중지했습니다. 학습 시작을 눌러 처음부터 다시 학습할 수 있어요.'
      : '추가 예시 ' + job?.added + '건'));
  text('job-detail', job ? targetName[job.target] + ' · ' + detail : '학습을 시작하면 진행 상황이 여기에 표시돼요.');
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
  text('before', '—');
  text('after', '—');
  feedback('compare-feedback');
}

function comparisonText(result) {
  if (!result) return '선택한 모델의 완료된 학습이 없어요.';
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
  restoreDraft();
  changeTarget();
  field('target').addEventListener('change', changeTarget);
  field('character').addEventListener('change', actions);
  field('action').addEventListener('change', changeAction);
  field('quick').addEventListener('click', () => preset(1));
  field('standard').addEventListener('click', () => preset(180));
  field('epochs').addEventListener('input', updatePreset);
  field('reply').addEventListener('input', () => text('count', Array.from(value('reply').trim()).length + ' / 50자'));
  for (const id of ['custom', 'affection', 'mood', 'energy', 'sleeping', 'condition']) {
    field(id).addEventListener('input', clearComparison);
  }

  field('example-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const model = target();
    const row = { ...conditions(), reply: value('reply'), meaning: value('meaning').trim() || 'user-added' };
    field('add').disabled = true;
    try {
      const example = await request('/api/example', { target: model, row });
      appendRows(model, [example]);
      if (target() === model && value('character') === row.characterId) {
        field('action').value = row.action;
        changeAction();
        if (value('reply') === row.reply) {
          field('reply').value = '';
          text('count', '0 / 50자');
          field('reply').focus();
        }
      }
      feedback('examples-feedback', '예시를 추가했습니다.');
    } catch (error) {
      feedback('examples-feedback', error.message, true);
    } finally {
      field('add').disabled = false;
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
      feedback('examples-feedback', targetName[model] + '에 ' + rows.length + '건을 가져왔습니다.');
    } catch (error) {
      feedback('examples-feedback', error.message, true);
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
    if (field('epochs').reportValidity()) updateJob('/api/start', {
      target: target(), epochs: field('epochs').valueAsNumber, rows: currentDraft(),
    });
  });
  field('stop').addEventListener('click', () => updateJob('/api/stop', {}));

  field('compare').addEventListener('click', async () => {
    if (!field('example-form').reportValidity()) return;
    const payload = { target: target(), row: conditions() };
    field('compare').disabled = true;
    feedback('compare-feedback', '대사를 생성하고 있어요.');
    try {
      const result = await request('/api/compare', payload);
      if (JSON.stringify(payload) === JSON.stringify({ target: target(), row: conditions() })) {
        text('before', comparisonText(result.standard));
        text('after', comparisonText(result.candidate));
        feedback('compare-feedback');
      }
    } catch (error) {
      feedback('compare-feedback', error.message, true);
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
