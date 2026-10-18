import sys
from pathlib import Path
sys.path.insert(0,str(Path('.tools/geometry').resolve()))
from PIL import Image,ImageDraw
import json,numpy as np
im=Image.open('public/reference/nwpu-changan-official-map.jpg').convert('RGB')
box=(170,480,600,1080);scale=im.width/1024
crop=im.crop(tuple(round(x*scale) for x in box));crop.thumbnail((1100,1500));crop.save('research/changan-south-plan-crop.png')
meta=json.loads(Path('research/official-supplement.json').read_text(encoding='utf8'));tr=np.array(meta['matrixImageXY1ToSceneXZ']);lin=tr[:2,:].T;off=tr[2,:]
c=json.loads(Path('src/data/campus.json').read_text(encoding='utf8'))
im=Image.open('public/reference/nwpu-changan-official-map-preview.jpg').convert('RGB');dr=ImageDraw.Draw(im,'RGBA')
for b in c['buildings']:
 pts=[tuple(np.linalg.solve(lin,np.array(p)-off)) for p in b['points']]
 dr.polygon(pts,fill=(0,100,255,65),outline=(0,70,255,220),width=1)
pts=[tuple(np.linalg.solve(lin,np.array(p)-off)) for p in c['boundary']];dr.line(pts,fill=(255,0,50,255),width=3)
im.crop(box).resize((860,1200)).save('research/changan-south-before-overlay.png')
