const required = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('required: ' + name);
  return value;
};
const normalized = value => value.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();

export function buildRegistry(definitions, targetCount) {
  if (!Array.isArray(definitions) || !definitions.length) throw new Error('required: character definitions');
  if (!Number.isInteger(targetCount) || targetCount < definitions.length) throw new Error('invalid target count');
  const ids = new Set();
  const characters = definitions.map(definition => {
    const id = required(definition?.id, 'character id');
    if (ids.has(id)) throw new Error('duplicate character: ' + id);
    ids.add(id);
    return {
      id, name: required(definition.defaultName, 'character name'),
      personality: definition.personality?.archetype || '',
      speechTone: definition.personality?.speechTone || '',
    };
  });
  return { targetCount, registeredCount: characters.length, pendingCount: targetCount - characters.length, characters };
}

export function validateCorpus(corpus, characterIds) {
  if (!corpus || !Array.isArray(corpus.train) || !Array.isArray(corpus.validation)) throw new Error('invalid split');
  if (!corpus.train.length || !corpus.validation.length) throw new Error('empty split');
  const known = new Set(characterIds), ids = new Set(), trainKeys = new Set();
  for (const split of ['train', 'validation']) {
    for (const row of corpus[split]) {
      for (const key of ['id', 'characterId', 'group', 'prompt', 'reply', 'source']) required(row?.[key], key);
      if (!known.has(row.characterId)) throw new Error('unknown character: ' + row.characterId);
      if (ids.has(row.id)) throw new Error('duplicate example: ' + row.id);
      ids.add(row.id);
      if (Array.from(row.reply).length > 70) throw new Error('reply exceeds 70 characters: ' + row.id);
      for (const field of ['group', 'prompt', 'reply']) {
        const key = JSON.stringify([row.characterId, field, normalized(row[field])]);
        if (split === 'train') trainKeys.add(key);
        else if (trainKeys.has(key)) throw new Error('split overlap: ' + field + ' (' + row.id + ')');
      }
    }
  }
  return { valid: true, trainCount: corpus.train.length, validationCount: corpus.validation.length };
}
