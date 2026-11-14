import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

export const ownAiNotice=`곰고미 전용 AI
이 앱의 캐릭터 행동 생성기는 프로젝트에서 직접 구현한 단어 신경망입니다.
가중치는 무작위 초기화부터 사용자 제공 고미 원문과 출처를 표시한 AI 개발 도우미의 초안으로 학습했습니다.
외부 사전학습 가중치·어댑터를 이전하지 않았습니다. 학습·앱 실행 중 외부 AI 추론 엔진과 모델 API를 호출하지 않습니다.
이전 모델의 생성 시험 결과는 새 학습 자료에 포함하지 않습니다. AI 도우미의 초안을 사람이 검토한 원문으로 표시하지 않습니다.
PC 수학 계산 도구와 학습 코드는 APK에 포함되지 않습니다.
모델은 등록된 행동의 짧은 한국어 반응용입니다. 범용 대화·문법·성격의 완전한 정확성을 보증하지 않습니다.
일반 앱 라이브러리와 사진 인식 기능의 고지는 각각 보존합니다.
이 계보 기록은 앱 전체의 상업 출시 승인이나 법률 의견이 아닙니다.
`;
export async function prepareOwnAi(root) {
  const raw=await readFile(resolve(root,'src/features/characters/ownAi/model.json'));
  const model=JSON.parse(raw);
  if(raw.length>2_000_000||model.format!=='gomgomi-own-wordnet-v2'||model.provenance?.initialization!=='random'||
     model.provenance?.pretrainedParents?.length!==0||model.provenance?.teacherModel!==null||!model.weights||'replies' in model)
    throw new Error('자체 AI 모델의 형식과 계보를 확인하지 못했습니다.');
  const directory=resolve(root,'public/character-ai');await mkdir(directory,{recursive:true});
  const manifest={id:'own-character-v1',file:'model.json',bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex'),
    initialization:'random',pretrainedParents:[],teacherModel:null,characters:model.characters,actions:model.actions};
  await writeFile(resolve(directory,'model.json'),raw);
  await writeFile(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await mkdir(resolve(root,'public/notices'),{recursive:true});
  await writeFile(resolve(root,'public/notices/companion-ai-NOTICE.txt'),ownAiNotice);
  return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  console.log(JSON.stringify(await prepareOwnAi(fileURLToPath(new URL('../',import.meta.url)))));
