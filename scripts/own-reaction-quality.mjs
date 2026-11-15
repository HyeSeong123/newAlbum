// Development semantic checks authored independently of the decoder's learned
// word support. Passing is not a proof of perfect Korean or human approval.
export function reactionIssues(input,line){
 const issues=[];
 if(!/[가-힣]/.test(line)||Array.from(line).length>50)issues.push('invalid-short-Korean');
 if(/[<>{}]|고미는|사용자|assistant|system|건드지/.test(line))issues.push('role-or-wording-error');
 if(input.characterId!=='gomi'){
  if(input.action==='treat'&&!input.sleeping&&(!/햇살|빛|따뜻|포근|선물/.test(line)||/간식|먹을|먹어/.test(line)))issues.push('plant-gift-mismatch');
  return issues;
 }
 if(input.condition==='cold'||input.condition==='unwell'){
  if(/내가.*안아줄|너를.*안아/.test(line))issues.push('hug-role-mismatch');
  return issues;
 }
 if(/추워|춥|아파|아프|몸이 안|걱정/.test(line))issues.push('unprovided-illness-or-worry');
 if(input.sleeping&&['treat','meal'].includes(input.action)){
  if(/같이.*해볼까|놀자|놀이|시작|차례|산책|햇살/.test(line))issues.push('food-play-hybrid');
  if((input.energy??3)>0){
   if(!/먹|간식|밥|갈게|가고|가서|줘|놓아|기다려/.test(line))issues.push('missing-food-approach');
   if(/계속 잘|너무.*피곤|나중에 먹|더 잘래|먹으러 못/.test(line))issues.push('sleepy-treated-as-exhausted');
  }else{
   if(!/잘|자고|자게|자도|잠|졸|피곤|나중|이따|일어나면|깨면|깬 다음|못 일어나|조금 뒤|옆에 놔둬|밥은 놔둬|간식은 놔둬/.test(line))issues.push('missing-continued-sleep');
   if(/먹으러 갈게|지금 먹을래|일어날게|먹자/.test(line))issues.push('exhausted-wakes-to-eat');
  }
 }else if(input.sleeping){
  if(['touch','pet','rest'].includes(input.action)&&/간식|밥|산책|놀자|놀이|시작|차례|해볼까/.test(line))issues.push('sleep-action-mismatch');
 }else{
  // An implicit short response such as '천천히 해' can be natural for petting;
  // requiring the button's keyword would penalize normal Korean ellipsis.
  const clashes={touch:/산책|간식|밥|먹|쓰다듬|놀이|놀자|목줄/,
   walk:/간식|밥|먹|쓰다듬|놀이|놀자/,treat:/산책|목줄|쓰다듬|놀이|놀자|밥/,
   meal:/산책|목줄|쓰다듬|놀이|놀자|간식/,pet:/산책|목줄|간식|밥|먹|놀자|놀이/,
   play:/산책|목줄|간식|밥|먹|쓰다듬/,rest:/산책|목줄|간식|밥|먹|놀자|놀이|쓰다듬/};
  if(clashes[input.action]?.test(line))issues.push('action-mismatch');
  if(input.action==='pet'&&/(?:손.*치워|지금은.*멈춰|쓰다듬지 마)[^.!?]*[.!?].*(?:더 쓰다듬어|만져줘|조금만 더)/.test(line))issues.push('petting-stance-contradiction');
 }
 return issues;
}
