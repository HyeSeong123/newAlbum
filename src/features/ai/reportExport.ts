import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
export function reportCSV(report:unknown):string {
  const rows=[['metric','value']];
  const walk=(value:unknown,path:string)=>{
    if(value!==null&&typeof value==='object'){for(const [k,v] of Object.entries(value))walk(v,path?`${path}.${k}`:k);}
    else rows.push([path,value===null?'unmeasured':String(value)]);
  };walk(report,'');
  const cell=(s:string)=>`"${(/^[=+\-@\t\r]/.test(s)?"'":"")+s.replaceAll('"','""')}"`;
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
export async function exportRecognitionReport(report:unknown,domain:string,format:'json'|'csv') {
  const destination=await save({title:'인식 검증 결과 저장',defaultPath:`gamjassak-${domain}-results.${format}`,filters:[{name:'검증 결과',extensions:[format]}]});
  if(destination)await invoke('export_recognition_report',{destination,content:format==='csv'?reportCSV(report):JSON.stringify(report,null,2)});
}
