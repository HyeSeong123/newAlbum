import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/features/help/helpTarget.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {keepHelpTargetInView,helpTargetViewport,visibleHelpTargetRect,helpLayerRect}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const viewport={x:0,y:0,width:393,height:800};
const rect=(x,y,width,height)=>({x,y,width,height,left:x,top:y,right:x+width,bottom:y+height});
const pane=(x,y,width,height,overflowX='visible',overflowY='auto',parentElement=null)=>({tagName:'DIV',parentElement,clientLeft:0,clientTop:0,clientWidth:width,clientHeight:height,style:{overflowX,overflowY},getBoundingClientRect:()=>rect(x,y,width,height)});

test('an inner scrolled control is revealed even while its box is inside the window',()=>{
  const previous=globalThis.getComputedStyle;globalThis.getComputedStyle=element=>element.style;
  try{
    let bounds=rect(12,80,120,44),scrolls=0;
    const target={parentElement:pane(0,300,393,300),getBoundingClientRect:()=>bounds,scrollIntoView:()=>{scrolls++;bounds=rect(12,350,120,44);}};
    keepHelpTargetInView(target,viewport);
    assert.equal(scrolls,1);
    assert.deepEqual(visibleHelpTargetRect(target,viewport),{x:12,y:350,width:120,height:44});
    keepHelpTargetInView(target,viewport);assert.equal(scrolls,1,'a settled target must not keep scrolling');
  }finally{globalThis.getComputedStyle=previous;}
});

test('nested vertical and horizontal scroll ports constrain the highlight',()=>{
  const previous=globalThis.getComputedStyle;globalThis.getComputedStyle=element=>element.style;
  try{
    const body=pane(0,-600,393,1600,'hidden','hidden');body.tagName='BODY';
    const outer=pane(20,200,350,420,'hidden','auto',body);
    const inner=pane(30,250,250,100,'auto','hidden',outer);
    const target={parentElement:inner,getBoundingClientRect:()=>rect(260,260,100,44)};
    assert.deepEqual(helpTargetViewport(target,viewport,120),{x:30,y:250,width:250,height:100});
    assert.deepEqual(visibleHelpTargetRect(target,viewport,120),{x:260,y:260,width:20,height:44});
  }finally{globalThis.getComputedStyle=previous;}
});

test('offset visual viewport, pinned header and layer origin share one coordinate system',()=>{
  const target={parentElement:null,getBoundingClientRect:()=>rect(35,90,120,44),scrollIntoView:()=>{target.scrolled=true;}};
  const shifted={x:15,y:75,width:360,height:420};
  keepHelpTargetInView(target,shifted,160);assert.equal(target.scrolled,true);
  assert.deepEqual(helpLayerRect({x:35,y:220,width:120,height:44},{x:15,y:75}),{x:20,y:145,width:120,height:44});
  assert.deepEqual(helpLayerRect(shifted,{x:15,y:75}),{x:0,y:0,width:360,height:420});
});
