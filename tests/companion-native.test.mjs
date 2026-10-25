import assert from 'node:assert/strict';
import test from 'node:test';
import { configureCompanionGradle } from '../scripts/prepare-android.mjs';
const template='android {\n    compileSdk = 36\n    defaultConfig { targetSdk = 36 }\n}';
test('Android preparation wires the real JNI build exactly once',()=>{
  assert.equal(typeof configureCompanionGradle,'function');
  const result=configureCompanionGradle(template);
  assert.match(result,/externalNativeBuild/);
  assert.match(result,/src\/main\/cpp\/companion\/CMakeLists.txt/);
  assert.equal(configureCompanionGradle(result),result);
});
