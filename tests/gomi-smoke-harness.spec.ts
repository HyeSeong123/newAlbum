import assert from 'node:assert/strict';
import { test } from '@playwright/test';
import { pressAndPaint } from '../scripts/gomi-action-smoke.mjs';

test('an already quiet page and a no-op click cannot count as a completed quiet interaction',async({page})=>{
  await page.setContent('<p id="homeMessage" data-source="nonverbal" data-state="quiet" data-response-id="7">quiet</p><button class="homeMascot" style="width:100px;height:100px">고미</button>');
  await page.evaluate(()=>{Object.assign(window,{__ownAiRequests:[],__ownAiForbiddenCalls:[],__TAURI_INTERNALS__:{invoke:async()=>({characters:[{id:'gomi',affection:20}]})}});});
  await assert.rejects(pressAndPaint(page,'.homeMascot'),/No complete interaction outcome/);
});

test('the quiet probe waits for a fresh producer completion after asynchronous storage',async({page})=>{
  await page.setContent('<p id="homeMessage" data-source="nonverbal" data-state="quiet" data-response-id="7">quiet</p><button class="homeMascot" style="width:100px;height:100px">고미</button>');
  await page.evaluate(()=>{
    Object.assign(window,{__ownAiRequests:[],__ownAiForbiddenCalls:[],__TAURI_INTERNALS__:{invoke:async()=>({characters:[{id:'gomi',affection:20}]})}});
    document.querySelector('.homeMascot')!.addEventListener('click',()=>{
      const response=document.getElementById('homeMessage')!;response.dataset.state='idle';
      window.setTimeout(()=>{response.dataset.responseId='8';response.dataset.state='quiet';},75);
    });
  });
  const result=await pressAndPaint(page,'.homeMascot');
  assert.equal(result.source,'nonverbal');
  assert.equal(result.responseId,'8');
  assert.equal(result.previousResponseId,'7');
  assert.ok(result.elapsedMs>=75);
});
