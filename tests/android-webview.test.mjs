import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
const source=new URL('../scripts/android-webview.mjs',import.meta.url);
test('Android reconnect can select the real process instead of an inferred package label',()=>assert.ok(existsSync(source)));
if(existsSync(source)){
 const {parseAppProcessIds,selectAppWebView}=await import(source);
 test('only valid pidof output identifies a running app process',()=>{
  assert.deepEqual(parseAppProcessIds('2656 3010\n'),[2656,3010]);
  for(const invalid of ['', 'pidof: not found','2656 message',null])assert.deepEqual(parseAppProcessIds(invalid),[]);
 });
 test('a recreated app WebView is found even when Playwright mislabels its package',()=>{
  const wrong={pid:()=>12656,pkg:()=>'com.oraedameun.album.next'};
  const recreated={pid:()=>2656,pkg:()=>'com.android.webview:sandboxed_process0'};
  assert.equal(selectAppWebView([wrong,recreated],[2656]),recreated);
  assert.equal(selectAppWebView([wrong],[2656]),undefined);
  assert.equal(selectAppWebView([wrong,recreated],[]),undefined);
 });
 test('the newest view from the exact app process wins without a restart',()=>{
  const old={pid:()=>2656},latest={pid:()=>2656};
  assert.equal(selectAppWebView([old,latest],[2656]),latest);
 });
}
