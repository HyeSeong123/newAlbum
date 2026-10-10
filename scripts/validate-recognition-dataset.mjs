import {readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
import {modelUrl} from '../tests/model-loader.mjs';
const {audit800Protocol}=await import(await modelUrl('features/ai/protocol.ts'));
const [manifestPath,photoRoot]=process.argv.slice(2);
if(!manifestPath||!photoRoot)throw new Error('Usage: node scripts/validate-recognition-dataset.mjs manifest.json photos-directory');
const root=await realpath(photoRoot),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
if(!Array.isArray(manifest.samples))throw new Error('Manifest requires samples array');
for(const sample of manifest.samples) {
 const path=await realpath(resolve(root,sample.path)),within=relative(root,path);
 if(within.startsWith('..')||isAbsolute(within))throw new Error('Photo is outside dataset root');
 const digest='sha256:'+createHash('sha256').update(await readFile(path)).digest('hex');
 if(sample.sourceKey!==digest)throw new Error(`Content fingerprint mismatch: ${sample.sampleId}`);
}
const report=audit800Protocol(manifest.samples);process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(!report.complete)process.exitCode=1;
