import test from 'node:test';
import assert from 'node:assert/strict';
import { modelUrl } from './model-loader.mjs';
const {retainFaceDetection} = await import(await modelUrl('features/people/engine/detectionPolicy.ts'));
test('turned-face recall preserves original detections and excludes the measured small dog false positive', () => {
  assert.equal(retainFaceDetection({score:0.4106475,box:{width:45.8775,height:77.3889}}),false);
  assert.equal(retainFaceDetection({score:0.4,box:{width:90,height:120}}),true);
  assert.equal(retainFaceDetection({score:0.65,box:{width:30,height:35}}),true);
  assert.equal(retainFaceDetection({score:0.349,box:{width:150,height:150}}),false);
  assert.equal(retainFaceDetection({score:NaN,box:{width:150,height:150}}),false);
});
