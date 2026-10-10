export type View = 'front' | 'left' | 'right';
export const VIEW_PAIRS = [['front','front'],['front','left'],['front','right'],['left','right'],['left','left'],['right','right']] as const;
export function rate(correct:number,total:number) {
  if(!Number.isInteger(correct)||!Number.isInteger(total)||correct<0||total<correct)throw new Error('Invalid metric counts');
  if(!total)return {correct,total,rate:null,wilson95:null};
  const z=1.959963984540054,p=correct/total,d=1+z*z/total,c=(p+z*z/(2*total))/d,h=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;
  return {correct,total,rate:p,wilson95:[Math.max(0,c-h),Math.min(1,c+h)]};
}
export function pairKey(a:View,b:View) {const order=['front','left','right'];return order.indexOf(a)<=order.indexOf(b)?`${a}-${b}`:`${b}-${a}`;}
export function sampleTimes(values:number[]) {if(values.some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid elapsed time');const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;return {samples:n,meanMs:n?values.reduce((a,b)=>a+b,0)/n:null,medianMs:n?(sorted[Math.floor(n/2)]+sorted[Math.floor((n-1)/2)])/2:null};}
