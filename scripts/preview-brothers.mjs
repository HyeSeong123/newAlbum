import { build } from 'esbuild'; // Already supplied by the locked Vite toolchain.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(process.argv[2]||resolve(root,'preview-results/brothers-v2.html'));
const dataUrl=async path=>'data:image/png;base64,'+(await readFile(resolve(root,'public',path))).toString('base64');
const replacements=new Map(await Promise.all([
  '/characters/brothers-v2/potato-atlas.png','/characters/brothers-v2/sweet-potato-atlas.png',
  '/characters/portraits/potato-source.png','/characters/portraits/sweet-potato.png',
].map(async path=>[path,await dataUrl(path.slice(1))])));
const result=await build({entryPoints:[resolve(root,'scripts/brothers-preview.tsx')],bundle:true,write:false,
  outfile:'preview.js',format:'iife',minify:true,target:'es2022',jsx:'automatic',loader:{'.png':'dataurl'},
  plugins:[{name:'embed-character-art',setup(builder){
    builder.onLoad({filter:/(?:brothersArt|characterPortraits)\.ts$/},async args=>{
      let contents=await readFile(args.path,'utf8');
      for(const [path,value] of replacements)contents=contents.replaceAll(JSON.stringify(path),JSON.stringify(value));
      return {contents,loader:'ts'};
    });
  }}]});
const js=result.outputFiles.find(file=>file.path.endsWith('.js')).text.replaceAll('</script','<\\/script');
const css=result.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'';
const layout=`:root{--text:#4d4239;--muted:#817469;--surface:#fffdf8;--border:#e6dfd3;color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#faf7ef;color:var(--text);font-family:'Malgun Gothic',sans-serif}main{max-width:1100px;margin:auto;padding:44px 32px}header{display:flex;justify-content:space-between;gap:24px;align-items:center;margin-bottom:28px}.eyebrow{font-size:12px;letter-spacing:.06em;color:#8d795c}h1{font-size:32px;letter-spacing:-.04em;margin:12px 0}.intro{font-size:15px;color:#817469;line-height:1.7}.gomiReference{display:grid;justify-items:center;gap:5px;flex:none;font-size:11px;color:#948573}.gomiReference img{height:110px;width:110px;object-fit:contain}.previewPair{display:grid;grid-template-columns:1fr 1fr;gap:20px}.previewCard{padding:24px;border:1px solid #e4dccd;border-radius:24px;background:#f7efd9}.previewCard.sweet-potato{background:#f1e8ed;border-color:#e1d6df}.cardHeading{display:flex;justify-content:space-between;align-items:center;gap:10px}h2{font-size:18px;margin:0}.cardHeading span{font-size:12px;color:#8b7b68}.previewArt{display:grid;place-items:center;min-height:300px;padding:20px 40px}.previewArt .characterVisual{width:250px;max-width:100%}.sampleLine{font-size:14px;text-align:center;margin:8px 0 15px;line-height:1.8}.currentPose{display:block;text-align:center;font-size:11px;color:#887865}.controls{background:#fffdf8;border:1px solid #e7e0d5;border-radius:20px;margin-top:22px;padding:22px}.controlHeading{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:18px}.controlHeading h2{font-size:15px}.controlHeading>div{display:flex;gap:8px}button{font:inherit;cursor:pointer;border:1px solid #dcd3c4;color:#675543;background:#fffdf8;border-radius:20px;padding:9px 14px;font-size:12px}.textButton{border:0;background:transparent}.pauseButton{background:#ece7dc}.poseChoices{display:flex;gap:8px;flex-wrap:wrap}.poseChoices button[aria-pressed=true]{background:#6b7758;border-color:#6b7758;color:white}.expressions{margin-top:38px}.expressions>p{font-size:13px;color:#817469;line-height:1.8}.sheetPair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;padding:16px;border-radius:18px;background:#fffdf8;border:1px solid #e7e0d5}figure img{display:block;width:100%}figcaption{font-size:12px;text-align:center;margin-top:12px;color:#8d7c69}footer{font-size:11px;color:#9b8c78;margin:28px 0 0;text-align:center}@media(max-width:650px){main{padding:24px 16px}h1{font-size:23px}.intro{font-size:13px}.gomiReference img{width:75px;height:75px}.gomiReference{font-size:9px}.previewPair{gap:10px}.previewCard{padding:15px 10px;border-radius:18px}.cardHeading{display:block}.cardHeading span{font-size:10px;display:block;margin-top:6px}.previewArt{min-height:190px;padding:12px 6px}.previewArt .characterVisual{width:170px}.sampleLine{font-size:11px;min-height:40px}.controlHeading{display:block}.controlHeading>div{margin-top:12px}.controls{padding:16px}.poseChoices{gap:6px}button{font-size:11px;padding:8px 11px}.sheetPair{grid-template-columns:1fr}}`;
const sizing='h1{word-break:keep-all}.previewPair{grid-template-columns:repeat(2,minmax(0,1fr))}.previewCard,.previewArt{min-width:0}.previewArt{grid-template-columns:minmax(0,1fr)}';
await mkdir(dirname(output),{recursive:true});
await writeFile(output,'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>감자와 고구마 · 새 모습과 움직임</title><style>'+css+'\n'+layout+sizing+'</style><div id="root"></div><script>'+js+'</script></html>');
console.log(output);
