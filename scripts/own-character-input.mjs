const actions={터치:'touch',말걸기:'touch',산책:'walk',간식:'treat',밥:'meal',식사:'meal',쓰다듬기:'pet',놀기:'play',쉬기:'rest',추워:'cold',아파:'unwell'};
const sleeping=new Set(['잠','졸림','자는중','자고있음','sleep','sleepy']);
const exhausted=new Set(['피곤','매우피곤','많이피곤','exhausted']);
const awake=new Set(['awake','깨어있음','깸','일어남']);
export function parseOwnCommand(text,characterId='gomi',previous=[]){
 const [label,affection='45',state='awake',energy]=text.trim().split(/\s+/);
 const action=actions[label]||label,condition=['cold','unwell'].includes(action)?action:'normal';
 if(!sleeping.has(state)&&!exhausted.has(state)&&!awake.has(state))throw new Error('상태는 awake, 잠, 피곤 중 하나로 입력해 주세요.');
 const isSleeping=sleeping.has(state)||exhausted.has(state);
 return {characterId,action:condition==='normal'?action:'touch',affection:Number(affection),condition,
   sleeping:isSleeping,mood:isSleeping?'sleepy':'calm',energy:energy==null?(exhausted.has(state)?0:isSleeping?1:condition==='normal'?3:1):Number(energy),previous};
}
