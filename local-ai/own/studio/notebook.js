// PC authoring drafts are keyed by character so switching friends keeps unsaved edits.
const field = (id) => document.getElementById(id);
const ratingLabels = ['최악임', '마음에 안 듦', '보통', '마음에 듦', '최고'];

export function personalityEditor(request, data, busyWriting) {
  const drafts = new Map();
  const controls = new Map();
  let character;
  let attachmentUrl;
  let pendingSave = Promise.resolve();

  function draft(id) {
    if (!drafts.has(id)) {
      const stored = data.profiles[id];
      drafts.set(id, {
        description: stored?.description ?? data.defaults[id]?.description ?? '',
        traits: { ...Object.fromEntries(Object.keys(data.traits).map((key) => [key, 5])), ...data.defaults[id]?.traits, ...stored?.traits },
        attachment: stored?.attachment ?? null,
        revision: stored?.revision ?? 0, dirty: false, edit: 0,
      });
    }
    return drafts.get(id);
  }

  function status(message) { field('profile-status').textContent = message; }
  function changed() {
    const profile = draft(character);
    profile.dirty = true;
    profile.edit++;
    status('저장할 변경 사항이 있어요.');
  }
  function show(id) {
    character = id;
    const profile = draft(id);
    field('profile-description').value = profile.description;
    if (attachmentUrl) URL.revokeObjectURL(attachmentUrl);
    attachmentUrl = null;
    field('attachment').hidden = !profile.attachment;
    if (profile.attachment) {
      attachmentUrl = URL.createObjectURL(new Blob([profile.attachment.content], { type: 'text/plain;charset=utf-8' }));
      const link = field('attachment-download');
      link.href = attachmentUrl;
      link.download = link.textContent = profile.attachment.filename;
    }
    for (const [key, {slider, output}] of controls) {
      slider.value = profile.traits[key];
      output.value = slider.value;
    }
    status(profile.dirty ? '저장할 변경 사항이 있어요.' : profile.revision ? '저장된 성격' : '기본 성격');
  }

  for (const [key, label] of Object.entries(data.traits)) {
    const wrapper = document.createElement('div');
    wrapper.className = 'trait';
    const caption = document.createElement('label');
    caption.textContent = label;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = caption.htmlFor = 'trait-' + key;
    slider.min = '1';
    slider.max = '10';
    const output = document.createElement('output');
    output.htmlFor.add(slider.id);
    slider.addEventListener('input', () => {
      draft(character).traits[key] = Number(slider.value);
      output.value = slider.value;
      changed();
    });
    controls.set(key, {slider, output});
    wrapper.append(caption, slider, output);
    field('traits').append(wrapper);
    field('style-trait').add(new Option(label, key));
  }

  function save(ids) {
    const task = async () => {
      for (const id of ids) {
        const current = draft(id);
        if (!current.dirty) continue;
        const edit = current.edit;
        const profile = { description: current.description, traits: { ...current.traits }, attachment: current.attachment };
        const saved = await request('/api/profile', { characterId: id, revision: current.revision, profile });
        current.revision = saved.revision;
        if (edit === current.edit) current.dirty = false;
        if (character === id && !current.dirty) status('이 PC에 저장했어요.');
      }
    };
    pendingSave = pendingSave.catch(() => {}).then(task);
    return pendingSave;
  }

  field('attachment-remove').addEventListener('click', () => {
    draft(character).attachment = null;
    changed();
    show(character);
  });
  field('profile-description').addEventListener('input', () => {
    draft(character).description = field('profile-description').value;
    changed();
  });
  field('profile-save').addEventListener('click', () => {
    save([character]).catch((error) => status(error.message));
  });
  field('profile-import').addEventListener('click', () => field('profile-file').click());
  field('profile-file').addEventListener('change', async () => {
    const file = field('profile-file').files[0];
    if (!file) return;
    const id = character;
    const current = draft(id);
    const edit = current.edit;
    busyWriting(1);
    try {
      if (file.size > 128 * 1024) throw new Error('128KB 이하의 UTF-8 TXT, MD 또는 JSON 파일을 선택해 주세요.');
      const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
      const imported = await request('/api/profile-import', { filename: file.name, content, current });
      if (edit !== current.edit) throw new Error('설정이 바뀌었어요. 파일을 다시 골라 주세요.');
      Object.assign(current, imported, { dirty: true, edit: edit + 1 });
      if (character === id) {
        show(id);
        status(file.name + ' 불러옴 · 확인 후 저장하세요.');
      }
    } catch (error) {
      if (character === id) status(error instanceof TypeError ? 'UTF-8로 저장한 파일을 선택해 주세요.' : error.message);
    } finally {
      field('profile-file').value = '';
      busyWriting(-1);
    }
  });
  return { show, save };
}

export function reviewPanel(request, contextLabel) {
  let selected;
  let character;
  let revision = 0;
  let saving = false;

  async function history(id) {
    character = id;
    const version = ++revision;
    field('ratings').replaceChildren();
    try {
      const rows = await request('/api/ratings', { characterId: id });
      if (version !== revision) return;
      if (!rows.length) {
        const item = document.createElement('li');
        item.textContent = '아직 평가한 대사가 없어요.';
        field('ratings').append(item);
      }
      for (const row of rows) {
        const item = document.createElement('li');
        const line = document.createElement('span');
        line.textContent = row.line;
        const details = document.createElement('small');
        details.textContent = contextLabel(row.scene) + ' · ' + new Date(row.updated).toLocaleString('ko-KR');
        const score = document.createElement('select');
        score.setAttribute('aria-label', row.line + ' 평점 변경');
        ratingLabels.forEach((name, index) => score.add(new Option((index + 1) + ' · ' + name, String(index + 1))));
        score.value = row.score;
        score.addEventListener('change', async () => {
          score.disabled = true;
          try {
            const saved = await request('/api/rating', { id: row.id, score: Number(score.value) });
            if (selected?.id === row.id) show(saved);
            if (character === id) await history(id);
          } catch (error) {
            score.value = row.score;
            field('rating-feedback').textContent = error.message;
          } finally { score.disabled = false; }
        });
        item.append(line, details, score);
        field('ratings').append(item);
      }
    } catch (error) {
      if (version === revision) field('ratings').textContent = error.message;
    }
  }

  function show(review) {
    selected = review;
    field('review').hidden = !review;
    field('rating-feedback').textContent = review?.score ? ratingLabels[review.score - 1] + ' · 저장됨' : '';
    for (const button of field('rating-options').children) {
      button.setAttribute('aria-pressed', String(Number(button.value) === review?.score));
      button.disabled = saving;
    }
  }
  ratingLabels.forEach((label, index) => {
    const button = document.createElement('button');
    button.className = 'secondary';
    button.type = 'button';
    button.value = String(index + 1);
    button.textContent = (index + 1) + ' · ' + label;
    button.addEventListener('click', async () => {
      if (!selected || saving) return;
      const id = selected.id;
      const owner = character;
      saving = true;
      show(selected);
      try {
        const saved = await request('/api/rating', { id, score: index + 1 });
        if (selected?.id === id) selected = saved;
        if (character === owner) await history(owner);
      } catch (error) {
        if (selected?.id === id) field('rating-feedback').textContent = error.message;
      } finally {
        saving = false;
        for (const btn of field('rating-options').children) {
          btn.disabled = false;
          btn.setAttribute('aria-pressed', String(Number(btn.value) === selected?.score));
        }
        if (selected?.id === id && selected.score === index + 1) show(selected);
      }
    });
    field('rating-options').append(button);
  });
  return { show, history };
}
