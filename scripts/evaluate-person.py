"""Offline evaluation of local, consented, independently labeled face features.
No images, features, names or per-photo results are emitted in the report.
Run: python3 scripts/evaluate-person.py dataset.json --output report.json
"""
import argparse,json,math,statistics
MODEL='face-api-1.7.15-ssd-68-resnet-v1'
CATEGORIES=['front','expression','left','right','lookalikes','group','small','glasses','dark','occluded','unregistered','person-pet']
def valid(row):
 vector=row.get('descriptor',[])
 return row.get('modelVersion')==MODEL and len(vector)==128 and all(isinstance(x,(int,float)) and math.isfinite(x) for x in vector)
def distance(a,b):return math.sqrt(sum((x-y)**2 for x,y in zip(a,b)))
def rank(query,refs,robust=False):
 scores={}
 for ref in refs:
  if valid(ref):scores.setdefault(ref['personId'],[]).append(distance(query['descriptor'],ref['descriptor']))
 return sorted([(person,sorted(values)[1 if robust and len(values)>=3 else 0]) for person,values in scores.items()],key=lambda x:(x[1],str(x[0])))
def evaluate(data):
 refs=data['references'];queries=data['queries']
 if not queries:raise ValueError('No evaluation photos; accuracy cannot be measured')
 for row in refs+queries:
  if not row.get('sourceKey') or not row.get('session'):raise ValueError('Content fingerprint and shooting session required')
  if row in refs and (not valid(row) or not row.get('personId')):raise ValueError('Invalid reference/model')
 for query in queries:
  if not isinstance(query.get('detected'),bool):raise ValueError('Ground truth detection outcome required separately from descriptor compatibility')
  if query.get('category') not in CATEGORIES:raise ValueError('Unknown evaluation category')
  if any(ref['sourceKey']==query['sourceKey'] or (ref['personId']==query.get('expectedPersonId') and ref['session']==query['session']) for ref in refs):raise ValueError('Reference/query leakage: use different photos and shooting sessions')
 report={'modelVersion':MODEL,'photos':len({q['sourceKey'] for q in queries}),'labeledFaces':len(queries),'referenceFaces':len(refs),'referencePeople':len({r['personId'] for r in refs}),'conditions':{}}
 for label,subset in [('all',queries)]+[(c,[q for q in queries if q['category']==c]) for c in CATEGORIES]:
  result={'samples':len(subset),'detectionRecall':None,'analysisFailureRate':None,'featureCompatibilityRate':None,'baseline':{},'improved':{}}
  if subset:
   result['detectionRecall']=sum(q['detected'] for q in subset)/len(subset)
   result['featureCompatibilityRate']=sum(q['detected'] and valid(q) for q in subset)/len(subset)
   result['analysisFailureRate']=sum(bool(q.get('failed')) for q in subset)/len(subset)
  for engine in ['baseline','improved']:
   known=[q for q in subset if q.get('expectedPersonId') is not None];novel=[q for q in subset if q.get('expectedPersonId') is None]
   correct=wrong=novel_wrong=auto_count=0
   occupied={}
   for query in subset:
    if not query['detected'] or not valid(query):continue
    confirmed={r['personId'] for r in refs if r.get('confirmed')}
    references=refs if engine=='baseline' else [r for r in refs if r.get('confirmed') or (r.get('seed') and r['personId'] not in confirmed)]
    if engine=='improved':
     photos=set();counts={};bounded=[]
     for ref in reversed(references):
      person=ref['personId'];key=(person,ref['sourceKey'])
      if key not in photos and counts.get(person,0)<32:bounded.append(ref);photos.add(key);counts[person]=counts.get(person,0)+1
     references=bounded
    candidates=rank(query,references,engine=='improved')
    target=candidates[0][0] if candidates else None
    if query.get('expectedPersonId') is not None and target==query['expectedPersonId']:correct+=1
    # New automatic policy only uses frozen seeds; confirmed multi-reference
    # ranking is a review aid, never permission to add automatic links.
    seeds=refs if engine=='baseline' else [r for r in refs if r.get('seed') and r.get('quality')!='review']
    used=occupied.setdefault(query['sourceKey'],set())
    auto_candidates=rank(query,[r for r in seeds if r['personId'] not in used])
    auto=auto_candidates and auto_candidates[0][1]<0.45 and (len(auto_candidates)<2 or auto_candidates[1][1]-auto_candidates[0][1]>0.06)
    auto=bool(auto and (engine=='baseline' or query.get('quality')=='usable'))
    if auto:
     auto_count+=1;used.add(auto_candidates[0][0])
     if auto_candidates[0][0]!=query.get('expectedPersonId'):wrong+=1
     if query.get('expectedPersonId') is None:novel_wrong+=1
   result[engine]={'top1Known':correct/len(known) if known else None,'falseLinkPerLabeledFace':wrong/len(subset) if subset else None,'falseLinkPerAutoLink':wrong/auto_count if auto_count else None,'unknownFalseAccept':novel_wrong/len(novel) if novel else None,'autoLinks':auto_count}
  times=[q['elapsedMs'] for q in subset if isinstance(q.get('elapsedMs'),(int,float)) and math.isfinite(q['elapsedMs'])]
  memory=[q['tensorBytes'] for q in subset if isinstance(q.get('tensorBytes'),int)]
  result['medianElapsedMs']=statistics.median(times) if times else None;result['maxTensorBytes']=max(memory) if memory else None
  report['conditions'][label]=result
 report['limitations']=['Tensor bytes exclude native, JS, decoder and WASM heap capacity.','Unrepresented conditions remain unmeasured.','Reported results apply only to the supplied consented dataset.']
 return report
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('dataset');parser.add_argument('--output',required=True);args=parser.parse_args()
 with open(args.dataset,encoding='utf8') as f:report=evaluate(json.load(f))
 with open(args.output,'w',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
