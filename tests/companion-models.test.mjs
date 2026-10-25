import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('Android model policy keeps legacy files usable and validates the optional upgrade',()=>{
 const at=path=>fileURLToPath(new URL(path,import.meta.url));
 const result=spawnSync('java',[at('./fixtures/RunCompanionModelChecks.java'),at('../src-tauri/android/CompanionModelRegistry.java'),at('./fixtures/CompanionModelPolicyChecks.java')],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.error?.message);
 assert.match(result.stdout,/17 companion model policy checks passed/);
});
