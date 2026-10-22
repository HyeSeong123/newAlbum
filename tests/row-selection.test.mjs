import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Exercise the real pointer handlers with deterministic tile geometry. No browser,
// image model, app database, or duplicate implementation of the selection algorithm.
const source=fs.readFileSync(new URL('../src/hooks/useRowSelection.ts',import.meta.url),'utf8').replace(/import[^;]+;/, 'const useRef = value => ({current:value});');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {useRowSelection}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
function fixture() {
  const selected=new Set(), captures=new Set();
  const tiles=Array.from({length:6},(_,i)=>({dataset:{selectionId:String(i+1)},matches:()=>false,querySelector:()=>null,getBoundingClientRect:()=>({left:(i%3)*100,right:(i%3)*100+90,top:Math.floor(i/3)*100,bottom:Math.floor(i/3)*100+90})}));
  const grid={querySelectorAll:()=>tiles,setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
  const event=(x,y,type='touch',tile=tiles[0])=>({clientX:x,clientY:y,pointerId:1,pointerType:type,button:0,currentTarget:grid,target:{closest:()=>tile}});
  const handlers=useRowSelection(true,id=>selected.has(id)?selected.delete(id):selected.add(id),id=>selected.has(id));
  return {selected,tiles,grid,event,handlers};
}
test('vertical touch swipe leaves selection unchanged and preserves native pan',()=>{
  const f=fixture();f.handlers.onPointerDown(f.event(30,30));f.handlers.onPointerMove(f.event(34,160));f.handlers.onPointerUp(f.event(34,160));
  assert.deepEqual([...f.selected],[]);assert.equal(f.handlers.style.touchAction,'pan-y pinch-zoom');
});
test('horizontal touch brush selects each tile once and suppresses its trailing click',()=>{
  const f=fixture();f.handlers.onPointerDown(f.event(30,30));f.handlers.onPointerMove(f.event(240,32));f.handlers.onPointerMove(f.event(140,32));f.handlers.onPointerUp(f.event(140,32));
  assert.deepEqual([...f.selected],['1','2','3']);let prevented=false,stopped=false;
  f.handlers.onClickCapture({detail:1,preventDefault:()=>prevented=true,stopPropagation:()=>stopped=true});
  assert.equal(prevented,true);assert.equal(stopped,true);
});
test('touch brush starting on a selected tile deselects the whole range',()=>{
  const f=fixture();['1','2','3'].forEach(id=>f.selected.add(id));f.handlers.onPointerDown(f.event(30,30));f.handlers.onPointerMove(f.event(240,30));
  assert.equal(f.selected.size,0);
});
test('mouse row crossing includes the full row band and skips disabled tiles',()=>{
  const f=fixture();f.tiles[1].matches=()=>true;f.handlers.onPointerDown(f.event(20,20,'mouse'));f.handlers.onPointerMove(f.event(220,140,'mouse'));f.handlers.onPointerUp(f.event(220,140,'mouse'));
  assert.deepEqual([...f.selected],['1','3','4','5','6']);
});
test('a touch tap and a cancelled touch gesture do not preselect the starting tile',()=>{
  const f=fixture();f.handlers.onPointerDown(f.event(20,20));f.handlers.onPointerUp(f.event(20,20));assert.equal(f.selected.size,0);
  f.handlers.onPointerDown(f.event(20,20));f.handlers.onPointerCancel(f.event(20,20));f.handlers.onPointerMove(f.event(240,20));assert.equal(f.selected.size,0);
});
test('touch capture transferred from a tile keeps dragging until the grid loses capture',()=>{
  const f=fixture();f.handlers.onPointerDown(f.event(30,30));f.handlers.onPointerMove(f.event(45,30));
  // Touch begins with implicit capture on the tile. Moving capture to the
  // grid dispatches a bubbling lostpointercapture from that child first.
  f.handlers.onLostPointerCapture({pointerId:1,target:f.tiles[0],currentTarget:f.grid});
  f.handlers.onPointerMove(f.event(140,30));assert.deepEqual([...f.selected],['1','2']);
  f.handlers.onLostPointerCapture({pointerId:1,target:f.grid,currentTarget:f.grid});
  f.handlers.onPointerMove(f.event(240,30));assert.deepEqual([...f.selected],['1','2']);
});
