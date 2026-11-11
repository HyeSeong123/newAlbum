"""Merge a verified small adapter and make standalone GGUF quantization candidates."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
from core import HERE,ROOT,read_json,write_json,sha256


def required_model_license(lock):
    path=Path(lock['localPath'])/'LICENSE'
    if lock['model'].startswith('naver-hyperclovax/'):
        if not path.is_file() or 'HyperCLOVA X SEED Model License Agreement' not in path.read_text(encoding='utf-8'):
            raise ValueError('The actual HyperCLOVA X license is required; never substitute Apache-2.0')
    return path if path.is_file() else None


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--run',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    args=p.parse_args()
    report=read_json(args.run/'report.json')
    from modeling import local_base
    lock=local_base()
    license_path=required_model_license(lock)
    if report['phase']!='complete' or report['model']!=lock['model'] or report['revision']!=lock['revision']:
        raise ValueError('Run and pinned base model do not match')
    adapter=Path(report['adapterPath'])
    if sha256(adapter/'adapter_model.safetensors')!=report['adapterSha256']:
        raise ValueError('Adapter hash differs from verified run')
    args.output.mkdir(parents=True,exist_ok=False)
    from transformers import AutoModelForCausalLM,AutoTokenizer
    from peft import PeftModel
    import torch
    torch.set_num_threads(6)
    model=AutoModelForCausalLM.from_pretrained(lock['localPath'],local_files_only=True,dtype=torch.float32)
    model=PeftModel.from_pretrained(model,adapter,local_files_only=True).merge_and_unload().to(torch.float16)
    if any(not torch.isfinite(v).all() for v in model.parameters()):
        raise ValueError('Merged model has nonfinite values')
    merged=args.output/'merged-hf'
    tokenizer=AutoTokenizer.from_pretrained(lock['localPath'],local_files_only=True)
    # Some publishers' config EOS differs from their chat tokenizer's turn EOS.
    model.config.eos_token_id=tokenizer.eos_token_id
    model.generation_config.eos_token_id=tokenizer.eos_token_id
    model.save_pretrained(merged,safe_serialization=True)
    tokenizer.save_pretrained(merged)
    del model
    converter=ROOT/'.tools/llama-source/convert_hf_to_gguf.py'
    quantizer=ROOT/'.tools/llama-b12110/llama-quantize.exe'
    clova=lock['model'].startswith('naver-hyperclovax/')
    name='HyperCLOVA X Gomgomi Gomi 0.5B' if clova else 'Gomgomi Gomi Actions'
    prefix='HyperCLOVA-X-Gomgomi-Gomi-0.5B' if clova else 'gomi-actions'
    full=args.output/(prefix+'-f16.gguf')
    subprocess.run([sys.executable,str(converter),str(merged),'--outtype','f16','--outfile',str(full),'--model-name',name],check=True)
    outputs={}
    for quant in ['Q4_K_M','Q5_K_M']:
        dest=args.output/f'{prefix}-{quant}.gguf'
        subprocess.run([str(quantizer),str(full),str(dest),quant,'8'],check=True)
        outputs[quant]={'file':str(dest.resolve()),'bytes':dest.stat().st_size,'sha256':sha256(dest)}
    if license_path:
        import shutil
        shutil.copy2(license_path,args.output/'LICENSE')
    else:
        (args.output/'LICENSE-SOURCE.txt').write_text('Base model Apache-2.0: https://huggingface.co/'+lock['model']+'\n',encoding='utf-8')
    attribution='HyperCLOVA X SEED Model is licensed under the HyperCLOVA X SEED Model License Agreement, Copyright © NAVER Corp. All Rights Reserved.\nPowered by HyperCLOVA X\n' if clova else ''
    (args.output/'NOTICE.txt').write_text(attribution+'Gomgomi Gomi action-response experimental fine-tune. Base: '+lock['model']+
        '\nBase revision: '+lock['revision']+'\nLoRA merged before quantization. No external inference API.\nCharacter dialogue quality and Android deployment require separate verification.\n',encoding='utf-8')
    if clova:
        (args.output/'DERIVED-MODEL-TERMS.txt').write_text('Powered by HyperCLOVA X\nModel name: '+name+
            '\nThese model weights have been modified by Gomi action-response LoRA fine-tuning, merging and quantization.\n'+
            'Use and redistribution are subject to the attached HyperCLOVA X SEED Model License Agreement, including Section 2.3 Prohibited Use Policy. That policy is an enforceable condition of use and redistribution of these derivative files. Downstream recipients must receive the Agreement, these restrictions, modification notice and required attribution. Additional commercial terms in Section 4 also apply.\n',encoding='utf-8')
    result=dict(model=lock['model'],modelName=name,license='HyperCLOVA X SEED Model License Agreement' if clova else 'Apache-2.0',revision=lock['revision'],adapterSha256=report['adapterSha256'],
        toolRelease='llama.cpp b12110',toolCommit='cd959bae99ff4bed22bef2604f45241c09bbb8c8',
        variants=outputs,standalone=True,requiresSeparateBaseOrAdapter=False,qualityApproved=False,deployedToApp=False)
    write_json(args.output/'manifest.json',result)
    print(result,flush=True)


if __name__=='__main__':
    main()
