export interface ProtocolPhoto {
  sampleId:string; entityId:string; species:'person'|'dog'|'cat';
  view:'front'|'left'|'right'; role:'reference'|'query'; captureGroup:string;
  originId:string; sourceKey:string; rights:string; derivativeOf?:string;
  suite:'basic'|'additional';
}
export function audit800Protocol(samples:ProtocolPhoto[]) {
  const errors:string[]=[],ids=new Set<string>(),origins=new Set<string>(),sources=new Set<string>();
  const basic=samples.filter(s=>s.suite==='basic'),entities=new Map<string,ProtocolPhoto[]>();
  for(const s of samples) {
    if(!s.sampleId||!s.entityId||!s.captureGroup?.trim()||!s.originId||!s.rights?.trim()||!/^sha256:[0-9a-f]{64}$/.test(s.sourceKey)||!['person','dog','cat'].includes(s.species)||!['front','left','right'].includes(s.view)||!['reference','query'].includes(s.role)||!['basic','additional'].includes(s.suite))errors.push(`Invalid metadata: ${s.sampleId}`);
    if(ids.has(s.sampleId))errors.push(`Duplicate sample: ${s.sampleId}`);ids.add(s.sampleId);
    if(s.suite!=='basic')continue;
    if(s.derivativeOf||origins.has(s.originId)||sources.has(s.sourceKey))errors.push(`Not independent: ${s.sampleId}`);
    origins.add(s.originId);sources.add(s.sourceKey);
    const key=`${s.species}:${s.entityId}`,list=entities.get(key)??[];list.push(s);entities.set(key,list);
  }
  const counts={person:0,dog:0,cat:0};
  for(const [key,rows] of entities){counts[rows[0].species]++;
    for(const view of ['front','left','right'])for(const role of ['reference','query']){
      const required=role==='reference'?2:view==='front'?10:12,n=rows.filter(s=>s.view===view&&s.role===role).length;
      if(n!==required)errors.push(`${key} ${role}/${view}: ${n}/${required}`);
    }
    const refs=new Set(rows.filter(s=>s.role==='reference').map(s=>s.captureGroup));
    if(rows.some(s=>s.role==='query'&&refs.has(s.captureGroup)))errors.push(`Session leakage: ${key}`);
  }
  for(const species of ['person','dog','cat'] as const){const required=species==='person'?10:5;if(counts[species]!==required)errors.push(`${species} identities: ${counts[species]}/${required}`);}
  return {basicPhotos:basic.length,additionalPhotos:samples.length-basic.length,identities:counts,complete:basic.length===800&&errors.length===0,errors,
    independence:'Declared origin/session plus content SHA-256. Unmarked crops, mirrors and near-duplicates require a human provenance audit; no accuracy is inferred.'};
}
