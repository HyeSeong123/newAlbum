"""Run the held-out action prompts directly through the native GGUF executable."""
import argparse
from pathlib import Path
import subprocess
import tempfile
import time
from core import HERE,ROOT,read_json,write_json,registries,messages_for,valid_reply,sha256
from modeling import local_base
from transformers import AutoTokenizer


def write_native_prompt(path,prompt):
    Path(path).write_bytes(prompt.encode('utf-8'))


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--model',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--cases',type=Path,default=HERE/'data/gomi-actions-v2/test.json')
    p.add_argument('--limit',type=int,default=0)
    args=p.parse_args()
    if args.output.exists():
        raise ValueError('Cannot overwrite a comparison')
    chars,actions=registries()
    tok=AutoTokenizer.from_pretrained(local_base()['localPath'],local_files_only=True)
    cases=read_json(args.cases)
    if isinstance(cases,dict):
        actions={**actions,**cases.get('actions',{})}
        cases=cases['cases']
    profile=read_json(HERE/'prompt-contract.json')['generation']
    if args.limit:
        cases=cases[:args.limit]
    rows=[]
    binary=ROOT/'.tools/llama-b12110/llama-completion.exe'
    with tempfile.TemporaryDirectory(prefix='gomi-prompts-') as folder:
        for index,row in enumerate(cases):
            prompt=tok.apply_chat_template(messages_for(row,chars,actions),tokenize=False,add_generation_prompt=True,enable_thinking=False)
            path=Path(folder)/'prompt.txt'
            write_native_prompt(path,prompt)
            start=time.perf_counter()
            result=subprocess.run([str(binary),'-m',str(args.model),'-f',str(path),'-n',str(profile['maxNewTokens']),'-c','1024','-t','6','-tb','6',
                '--temp',str(profile['temperature']),'--top-p',str(profile['topP']),'--top-k',str(profile['topK']),
                '--min-p','0','--repeat-penalty',str(profile['repetitionPenalty']),'--seed',str(7300+index),
                '--no-display-prompt','--no-warmup','--no-conversation'],capture_output=True,encoding='utf-8',errors='replace',
                timeout=90,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            if result.returncode:
                raise RuntimeError(result.stderr[-2000:])
            # llama-completion prints its end-of-text marker outside generated tokens.
            raw=result.stdout
            line=raw.replace('[end of text]','').strip()
            rows.append({'id':row['id'],'input':row,'line':line,'rawStdout':raw,'formatValid':valid_reply(line,row.get('previous',[])),
                'seconds':round(time.perf_counter()-start,3)})
            print(row['id']+' | '+line,flush=True)
    write_json(args.output,dict(model=str(args.model),modelSha256=sha256(args.model),casesSha256=sha256(args.cases),
        generation=profile,promptContractSha256=sha256(HERE/'prompt-contract.json'),
        samples=rows,count=len(rows),formatValid=sum(r['formatValid'] for r in rows),
        semanticQualityApproved=False,comparisonNote='Native and Transformers RNG samplers differ; compare meanings, not byte identity.'))


if __name__=='__main__':
    main()
