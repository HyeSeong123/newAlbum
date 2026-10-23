"""Prepare 100 dog + 100 cat test images. Originals never enter the APK/artifacts."""
import sys,json,hashlib,tarfile,urllib.request,io
from pathlib import Path
from collections import defaultdict
from PIL import Image,ImageOps
cache=Path(sys.argv[1]);output=Path('public/evaluation/oxford-200');cache.mkdir(parents=True,exist_ok=True);output.mkdir(parents=True,exist_ok=True)
resources={'images.tar.gz':'5c4f3ee8e5d25df40f4fd59a7f44e54c','annotations.tar.gz':'95a8c909bbe2e81eed6a22bccdf3f68f'}
for name,digest in resources.items():
 path=cache/name
 if not path.is_file():
  url='https://www.robots.ox.ac.uk/~vgg/data/pets/data/'+name
  with urllib.request.urlopen(url,timeout=180) as response,path.open('wb') as target:
   while data:=response.read(1024*1024):target.write(data)
 h=hashlib.md5()
 with path.open('rb') as source:
  while data:=source.read(1024*1024):h.update(data)
 if h.hexdigest()!=digest:raise RuntimeError('Official archive checksum mismatch: '+name)
 print('Verified archive:',name,flush=True)
with tarfile.open(cache/'annotations.tar.gz','r:gz') as annotations:
 lines=annotations.extractfile('annotations/test.txt').read().decode().splitlines()
 groups=defaultdict(list);species={}
 for line in lines:
  name,breed,kind,_=line.split();groups[(kind,breed)].append(name);species[name]='cat' if kind=='1' else 'dog'
 chosen=[];masks={};excluded=[]
 for kind in ['1','2']:
  breeds=[sorted(names) for (k,b),names in sorted(groups.items()) if k==kind]
  offsets=[0]*len(breeds);index=0;accepted=0
  while accepted<100:
   breed=index%len(breeds);index+=1
   if offsets[breed]>=len(breeds[breed]):raise RuntimeError('Insufficient valid annotated test photos')
   name=breeds[breed][offsets[breed]];offsets[breed]+=1
   raw=annotations.extractfile('annotations/trimaps/'+name+'.png').read();mask=Image.open(io.BytesIO(raw));histogram=mask.histogram()
   if histogram[1]+histogram[3]==0:
    excluded.append({'id':name,'reason':'official trimap has no foreground/boundary pixels'});continue
   chosen.append(name);masks[name]=raw;accepted+=1
 wanted=set(chosen)

samples=[];seen=set()
with tarfile.open(cache/'images.tar.gz','r|gz') as images:
 for member in images:
  name=Path(member.name).stem
  if name not in wanted or not member.isfile() or not member.name.endswith('.jpg'):continue
  raw=images.extractfile(member).read();sha=hashlib.sha256(raw).hexdigest()
  if sha in seen:raise RuntimeError('Duplicate image contents: '+name)
  seen.add(sha)
  image=Image.open(io.BytesIO(raw));orientation=image.getexif().get(274,1)
  mask=Image.open(io.BytesIO(masks[name]));exif=mask.getexif();exif[274]=orientation;mask.info['exif']=exif.tobytes()
  image=ImageOps.exif_transpose(image).convert('RGB');mask=ImageOps.exif_transpose(mask)
  if image.size!=mask.size:raise RuntimeError('Mask dimensions differ: '+name)
  foreground=Image.new('L',mask.size);foreground.putdata([255 if v in (1,3) else 0 for v in mask.getdata()]);box=foreground.getbbox()
  if not box:raise RuntimeError('Missing segmentation: '+name)
  w,h=image.size;x0,y0,x1,y1=box
  image.thumbnail((640,640),Image.Resampling.BILINEAR);image.save(output/(name+'.jpg'),quality=95)
  samples.append({'id':name,'kind':species[name],'sha256':sha,'box':[x0/w,y0/h,(x1-x0)/w,(y1-y0)/h],'url':'/evaluation/oxford-200/'+name+'.jpg'})
assert len(samples)==200 and sum(s['kind']=='dog' for s in samples)==100 and sum(s['kind']=='cat' for s in samples)==100
manifest={'dataset':'Oxford-IIIT Pet official test split','source':'https://www.robots.ox.ac.uk/~vgg/data/pets/','license':'CC-BY-SA-4.0','attribution':'O. M. Parkhi, A. Vedaldi, A. Zisserman, C. V. Jawahar. Cats and Dogs, CVPR 2012. Image copyrights remain with original owners.','archiveMd5':resources,'excludedBeforeInference':excluded,'independentFileHashes':True,'individualIdentityLabelsAvailable':False,'captureViewLabelsAvailable':False,'trainingOverlapAudited':False,'transform':'EXIF orientation, longest side <=640, bilinear, JPEG quality 95; same pixels for both policies.','samples':sorted(samples,key=lambda s:s['id'])}
Path('benchmark-results').mkdir(exist_ok=True);Path('benchmark-results/oxford-manifest.json').write_text(json.dumps(manifest,indent=2));print('Prepared 100 dog and 100 cat test images.')
