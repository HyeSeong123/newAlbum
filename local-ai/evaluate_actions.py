"""Fixed held-out action inputs. Raw samples are never replaced by reference lines."""
import argparse
from pathlib import Path
import time
from core import HERE, read_json, write_json, registries, messages_for, valid_reply, normalized, sha256
from modeling import torch, load_model, generation_eos


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--adapter', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cases', type=Path, default=HERE/'data/gomi-actions-v2/test.json')
    parser.add_argument('--label', required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Existing comparison output cannot be overwritten')
    cases = read_json(args.cases)
    chars, actions = registries()
    model, tokenizer = load_model(args.adapter)
    model.eval()
    rows = []
    for index, row in enumerate(cases):
        torch.manual_seed(7300 + index)
        # expected meanings are kept for human review and NEVER sent to the model.
        text = tokenizer.apply_chat_template(messages_for(row,chars,actions),tokenize=False,add_generation_prompt=True,enable_thinking=False)
        inputs = tokenizer(text,return_tensors='pt',add_special_tokens=False).to('cuda')
        start = time.perf_counter()
        with torch.inference_mode():
            ids = model.generate(**inputs,max_new_tokens=80,do_sample=True,temperature=0.7,top_p=0.8,top_k=20,
                repetition_penalty=1.1,use_cache=True,eos_token_id=generation_eos(tokenizer),pad_token_id=tokenizer.eos_token_id)
        text = tokenizer.decode(ids[0,inputs.input_ids.shape[-1]:],skip_special_tokens=True).strip()
        rows.append({'id':row['id'],'input':row,'line':text,'formatValid':valid_reply(text,row.get('previous',[])),
                     'seconds':round(time.perf_counter()-start,3),'ended':ids[0,-1].item() in generation_eos(tokenizer)})
    write_json(args.output,dict(label=args.label,casesSha256=sha256(args.cases),
        promptPipelineSha256=sha256(HERE/'core.py'),seedBase=7300,temperature=0.7,samples=rows,
        formatValid=sum(x['formatValid'] for x in rows),count=len(rows),
        uniqueReplies=len({normalized(x['line']) for x in rows}),semanticQualityApproved=False))
    print({'label':args.label,'count':len(rows),'formatValid':sum(x['formatValid'] for x in rows),'output':str(args.output)},flush=True)


if __name__=='__main__':
    main()
