import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('native Home session reuses one model across characters, releases it, recovers failed loads and separates budgets',{skip:process.platform==='win32'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'companion-session-'));
 try {
  const binary=join(dir,'session');
  const compile=spawnSync('g++',['-std=c++17','-Wall','-Wextra','-Werror','-I','src-tauri/android/companion','tests/fixtures/companion-session.cpp','-o',binary],{encoding:'utf8'});
  assert.equal(compile.status,0,compile.stderr);
  const run=spawnSync(binary,[],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Android preview builds optimize inference kernels even when the APK variant is Debug',{skip:process.platform==='win32'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'companion-build-'));
 try{
  const vendor=join(dir,'vendor');mkdirSync(vendor);
  writeFileSync(join(vendor,'CMakeLists.txt'),'cmake_minimum_required(VERSION 3.22)\nproject(fixture)\nadd_library(llama STATIC stub.cpp)\n');
  writeFileSync(join(vendor,'stub.cpp'),'int fixture(){return 0;}');
  const configured=spawnSync('cmake',['-S','src-tauri/android/companion','-B',join(dir,'build'),'-DANDROID=ON','-DCMAKE_BUILD_TYPE=Debug','-DCMAKE_EXPORT_COMPILE_COMMANDS=ON',`-DFETCHCONTENT_SOURCE_DIR_LLAMA_CPP=${vendor}`],{encoding:'utf8'});
  assert.equal(configured.status,0,configured.stderr||configured.error?.message);
  const commands=JSON.parse(readFileSync(join(dir,'build','compile_commands.json'),'utf8'));
  assert.ok(commands.length>=2);
  for(const row of commands)assert.match(row.command,/(?:^|\s)-O[23](?:\s|$)/,row.file);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
