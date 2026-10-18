import json
from pathlib import Path
from collections import Counter
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
d=json.loads((ROOT/'src/data/youyi.json').read_text(encoding='utf-8'))
raw=json.loads((ROOT/'research/osm-youyi-full.json').read_text(encoding='utf-8'))

def area(p):return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]+p[:1])))/2
def inside(p,poly):
    x,y=p;odd=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if ((a[1]>y)!=(b[1]>y)) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:odd=not odd
    return odd
def signature(p):
    ps=p[:-1] if p[0]==p[-1] else p
    return tuple(sorted(tuple(q) for q in ps))
groups={}
for b in d['buildings']: groups.setdefault(signature(b['points']),[]).append(b['id'])
duplicates=[v for v in groups.values() if len(v)>1]
outside=[b['id'] for b in d['buildings'] if not inside(b['center'],d['boundary'])]
areaCounts=Counter('under10m2' if area(b['points'])<.1 else '10to100m2' if area(b['points'])<1 else '100to1000m2' if area(b['points'])<10 else 'over1000m2' for b in d['buildings'])
partIds=[e['id'] for e in raw['elements'] if e.get('tags',{}).get('building:part')]
memberIds={str(m['ref']) for e in raw['elements'] if e['type']=='relation' and e.get('tags',{}).get('building') for m in e['members'] if m['type']=='way'}
retainedMembers=[b['id'] for b in d['buildings'] if b['id'] in memberIds]
groundById={g['id']:g for g in d['grounds']}
mainTrack=groundById['333840994'];innerField=groundById['988902348']
report={'buildingCount':len(d['buildings']),'duplicatePolygonSignatures':duplicates,'buildingPartIds':partIds,'retainedRelationMemberWays':retainedMembers,'centroidsOutsideCampus':outside,'areaDistribution':dict(areaCounts),'innerFootballPitchInsideTrack':all(inside(p,mainTrack['points']) for p in innerField['points'])}
(ROOT/'research/youyi-data-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')

im=Image.new('RGB',(1400,1150),'#f3f7f5');dr=ImageDraw.Draw(im)
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',16)
def xy(p):return(p[0]*12+700,p[1]*12+560)
dr.polygon([xy(p) for p in d['boundary']],fill='#dfece2',outline='#6e8e82',width=3)
for g in d['grounds']:dr.polygon([xy(p) for p in g['points']],fill='#b6d2af',outline='#91ae8e')
for r in d['roads']:dr.line([xy(p) for p in r['points']],fill='#ffffff',width=4)
for b in d['buildings']:
    dr.polygon([xy(p) for p in b['points']],fill='#acbcb5',outline='#6c8579')
    for h in b['holes']:dr.polygon([xy(p) for p in h],fill='#dfece2',outline='#6c8579')
selected=['988902352','1267628489','1267628278','1267629807','1267629749','1267629789','1267628305','1267629040','1267629390','r17405495-0']
for b in d['buildings']:
    if b['id'] not in selected:continue
    x,y=xy(b['center']);dr.ellipse((x-3,y-3,x+3,y+3),fill='#d67731');dr.text((x+6,y-20),b['name'],font=font,fill='#143d31',stroke_width=2,stroke_fill='#ffffff')
dr.text((35,25),'友谊校区 OSM 主校园范围 / 北向上 / 实际数据轮廓，模型高度为估计',font=font,fill='#143d31')
im.save(ROOT/'research/youyi-map-inspection.png')
print(json.dumps(report,ensure_ascii=False))
