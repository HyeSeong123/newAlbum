import {useEffect,useState} from 'react';
import type {MediaItem} from '../../types/media';
import {emptyFaceIndex,loadFaceIndex,type FaceIndex} from '../people/faceService';
import {loadPets,type Pet} from '../pets/petService';
import {PersonEvaluationPanel} from '../people/PersonEvaluationPanel';
import {PetEvaluationPanel} from '../pets/PetEvaluationPanel';
export function RecognitionEvaluation({photos}:{photos:MediaItem[]}) {
 const [kind,setKind]=useState('person'),[index,setIndex]=useState<FaceIndex>(emptyFaceIndex),[pets,setPets]=useState<Pet[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;void Promise.all([loadFaceIndex(),loadPets()]).then(([i,p])=>{if(live){setIndex(i??emptyFaceIndex);setPets(p??[]);}}).catch(()=>{if(live)setError('인식 검증은 감자싹 앱에서 사용할 수 있습니다.');});return()=>{live=false;};},[]);
 return <section><h3>인식 검증 · 고급</h3><p>사진 정리에는 필요하지 않습니다. 촬영 세션과 사용 권리가 확인된 별도 평가 자료로 성능을 확인합니다.</p><p>사람: 기존 128차원 사용 · 신규 512차원 미설치<br/>반려동물: 기존 1024차원 사용 · 좌우 자동 모델 미설치<br/>좌측과 우측은 사진을 보는 사람 기준입니다. 800장 독립 평가와 실제 휴대폰 성능은 미측정입니다.</p><label>평가 대상<select aria-label="인식 검증 대상" disabled={busy} value={kind} onChange={e=>setKind(e.target.value)}><option value="person">사람</option><option value="pet">강아지·고양이</option></select></label><p role="status">{error}</p>{kind==='person'?<PersonEvaluationPanel photos={photos} index={index} disabled={false} onBusy={setBusy}/>:<PetEvaluationPanel photos={photos} pets={pets}/>}</section>;
}
