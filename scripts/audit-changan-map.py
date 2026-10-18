"""Reproducible source-backed corrections, run after prepare-map.mjs.
Install offline tooling with: python -m pip install --target .tools/geometry -r scripts/geometry-requirements.txt
No geometry library is shipped to the browser.
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path('.tools/geometry').resolve()))
from shapely.geometry import Polygon, LineString, box
from shapely.ops import unary_union
from shapely import make_valid

def read(path): return json.loads(Path(path).read_text(encoding='utf8'))
def write(path, value): Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def poly(item): return make_valid(Polygon(item['points'], item.get('holes',[])))
def polygons(g):
    if g.geom_type=='Polygon': return [g]
    return [p for part in getattr(g,'geoms',[]) for p in polygons(part)]
def coordinates(ring): return [[round(x,4),round(z,4)] for x,z in ring.coords]
def shape(g): return {'points':coordinates(g.exterior),'holes':[coordinates(h) for h in g.interiors]}
def center(g): return [round(g.centroid.x,3),round(g.centroid.y,3)]

c=read('src/data/campus.json')
c['osmBoundary']=c['boundary'][:]
# The OSM university polygon excludes the Nanshanyuan parcel. It is included in
# the school's map. Fill only this known notch in the *display ground*, retaining
# the original university boundary separately; never expand to stray buildings.
start=c['boundary'].index([42.979,29.872]);end=c['boundary'].index([44.077,10.102])
c['boundary']=c['boundary'][:start+1]+c['boundary'][end:]
c['groundCoverageNote']='展示底座依据校方地图补入南山苑地块；原始 OSM 校界单独保留，不作为地籍边界。'
# This tiny 2022 pitch is not the verified main Haitian sports compound. Later
# construction is reported nearby, but its current footprint cannot be located.
# Retain the historical source outside the active scene until verified.
c['unverifiedHistoricalFeatures']=[g for g in c['grounds'] if g['id']=='1087520407']
c['grounds']=[g for g in c['grounds'] if g['id']!='1087520407']
ground=Polygon(c['boundary'])
removed=[];kept=[]
for b in c['buildings']:
    if poly(b).difference(ground).area>.01:
        removed.append({'id':b['id'],'name':b['name'],'reason':'footprint outside verified display parcel'})
    else: kept.append(b)
c['buildings']=kept
# Remove the tiny tracing overlap where the manually drawn teaching bridge joins
# its central block; shared boundaries remain connected without duplicate faces.
bridge=next(b for b in c['buildings'] if b['id']=='official-teaching-east-bridge')
central=next(b for b in c['buildings'] if b['id']=='official-teaching-east-central')
bridge.update(shape(poly(bridge).difference(poly(central))))
merged=[]
for prefix in ['r14477260-','r14477262-']:
    members=[b for b in c['buildings'] if b['id'].startswith(prefix)]
    g=unary_union([poly(b) for b in members])
    assert g.geom_type=='Polygon',f'{prefix} is no longer one connected footprint; review source'
    b={**members[0],**shape(g),'center':center(g),'source':'OSM 关系成员合并；保留楼翼与连接部分'}
    if prefix=='r14477260-':
        # Separate narrow connectors from the tall wings without overlapping faces.
        wings=unary_union([poly(m) for m in members if poly(m).area>.5])
        links=g.difference(wings)
        b['parts']=[{**shape(p),'height':2.6,'role':'楼翼'} for p in polygons(wings)]
        b['parts'] += [{**shape(p),'height':.7,'role':'连接体量（高度示意）'} for p in polygons(links)]
    c['buildings']=[v for v in c['buildings'] if not v['id'].startswith(prefix)]+[b]
    merged.append({'id':b['id'],'sourceMembers':len(members),'resultFootprints':1})

for b in c['buildings']:
    if b['id']=='1087520425':
        b['name']='艺术教育中心';b['kind']='public'
        b['source']='OSM 原名海天苑活动中心；校方 2025 年导览图对应艺术教育中心'
    if b['id']=='1087520424':
        b['name']='海天苑餐厅';b['height']=1.05;b['levels']=3
        b['heightSource']='迎新网2025年餐饮说明为3层；层高示意'
        b['source']='OSM轮廓；学校迎新网2025年餐饮指南确认餐厅共3层'
    if b['id']=='693572365': b['name']='南山苑国际学术交流中心'

matrix=read('research/official-supplement.json')['matrixImageXY1ToSceneXZ']
def project(p): return [round(p[0]*matrix[0][i]+p[1]*matrix[1][i]+matrix[2][i],4) for i in range(2)]
patch=read('research/changan-south-traces.json')
for b in patch['buildings']:
    g=Polygon([project(p) for p in b['imagePolygon']],[[project(p) for p in h] for h in b.get('imageHoles',[])])
    assert g.is_valid and ground.covers(g),b['id']
    c['buildings'].append({k:v for k,v in b.items() if not k.startswith('image')}|shape(g)|{'center':center(g),'heightSource':'校方图体量示意，非实测','source':'校方校园图描绘；2025 年底导览确认建筑身份，位置近似'})
for item in patch['grounds']:
    g=Polygon([project(p) for p in item['imagePolygon']])
    assert ground.covers(g)
    c['grounds'].append({k:v for k,v in item.items() if not k.startswith('image')}|{'points':coordinates(g.exterior)})

# 2026 source cross-check: old OSM geometry remains the spatial anchor. The new
# parcels are approximate reconstructions, with evidence and uncertainty on each.
additions=read('research/haitian-2026-additions.json')
for item in additions['buildings']:
    parts=[{**shape(box(*p['rect'])), 'height':p['height'],'role':p['role']} for p in item.get('rectParts',[])]
    g=unary_union([poly(p) for p in parts]) if parts else Polygon(item['polygon'])
    assert g.geom_type=='Polygon' and g.is_valid and ground.covers(g),item['id']
    b={k:v for k,v in item.items() if k not in ['rectParts','polygon']}
    b.update(shape(g));b['center']=center(g)
    if parts:b['parts']=parts
    c['buildings'].append(b)
site=additions['constructionSite']
c['grounds'].append(site)
# Historical grass polygons may overlap the confirmed construction parcel.
# Erase that patch of grass and obsolete paths, not the surrounding circulation.
site_geometry=poly(site)
grounds=[]
for g in c['grounds']:
    area=poly(g).difference(site_geometry) if g['kind'] in ['grass','garden','forest','park'] else poly(g)
    grounds += [{**g,'id':g['id']+(f'-part{i}' if i else ''),**shape(p)} for i,p in enumerate(polygons(area)) if p.area>.01]
c['grounds']=grounds

# Clip linear and area features to the display parcel instead of testing only a
# centre point (which previously admitted an off-campus building and road ends).
roads=[]
for road in c['roads']:
    g=LineString(road['points']).intersection(ground).difference(site_geometry.buffer(.05))
    segments=[g] if g.geom_type=='LineString' else [s for s in getattr(g,'geoms',[]) if s.geom_type=='LineString']
    roads += [{**road,'id':road['id']+(f'-clip{i}' if i else ''),'points':coordinates(s)} for i,s in enumerate(segments) if s.length>.03]
c['roads']=roads
for key in ['grounds','waters']:
    clipped=[]
    for feature in c[key]:
        for i,p in enumerate(polygons(poly(feature).intersection(ground))):
            if p.area>.01: clipped.append({**feature,'id':feature['id']+(f'-clip{i}' if i else ''),**shape(p)})
    c[key]=clipped

c['osmBuildingCount']=sum(not b['id'].startswith('official-') for b in c['buildings'])
c['supplementalBuildingCount']=len(c['buildings'])-c['osmBuildingCount']
c['auditVersion']='2026-10-18-haitian-2026-v2'
c['source']='© OpenStreetMap contributors · ODbL 1.0；校方地图、导览与2024—2026年实景资料人工核对补绘'
report={'removed':removed,'merged':merged,'buildings':len(c['buildings']),'outsideGround':[], 'overlaps':[], 'sportsBuildingConflicts':[], 'newBuildingRoadConflicts':[]}
for i,b in enumerate(c['buildings']):
    p=poly(b)
    if p.difference(ground).area>.01: report['outsideGround'].append(b['id'])
    for a in c['buildings'][:i]:
        area=p.intersection(poly(a)).area
        if area>.02: report['overlaps'].append({'ids':[a['id'],b['id']],'squareMetres':round(area*100,2)})
    for court in c['grounds']:
        if court['kind']=='pitch' and p.intersection(poly(court)).area>.02:
            report['sportsBuildingConflicts'].append([b['id'],court['id']])
    if b['id'] in [v['id'] for v in additions['buildings']]:
        for road in c['roads']:
            if p.intersection(LineString(road['points'])).length>.05:
                report['newBuildingRoadConflicts'].append([b['id'],road['id']])
assert not report['outsideGround'], report
assert not report['overlaps'],report
assert not report['sportsBuildingConflicts'],report
assert not report['newBuildingRoadConflicts'],report
write('src/data/campus.json',c);write('public/data/campus-map.json',c)
write('research/changan-geometry-audit.json',report)
print(json.dumps(report,ensure_ascii=False,indent=2))
