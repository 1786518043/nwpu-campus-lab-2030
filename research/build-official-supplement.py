"""Trace small campus supplements for the prototype; all traces are approximate."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
campus = json.loads((ROOT / 'src/data/campus.json').read_text(encoding='utf-8'))
items = {b['id']: b for key in ['buildings','grounds'] for b in campus[key]}

def centroid(p):
    a = cx = cy = 0
    for (x,y),(u,v) in zip(p,p[1:]+p[:1]):
        s=x*v-u*y; a+=s;cx+=(x+u)*s;cy+=(y+v)*s
    return [cx/(3*a),cy/(3*a)]

# Source image coordinates are manually identified area centroids, rounded to pixels.
# Destination area centroids are calculated from existing OSM scene polygons.
anchor_specs = [
    ('362977204','云天苑田径场',[574,190]),
    ('363081279','星天苑田径场',[257,406]),
    ('r14477264-0','长安校区图书馆',[422,481]),
    ('693572365','南山苑',[547,677]),
    ('r14477261-0','军工素质教育实践中心',[367,926]),
]
source=np.array([[*p,1] for _,_,p in anchor_specs],dtype=float)
destination=np.array([centroid(items[i]['points']) for i,_,_ in anchor_specs])
transform=np.linalg.lstsq(source,destination,rcond=None)[0]
residuals=source @ transform-destination

def project(p): return [round(v,3) for v in (np.array([*p,1]) @ transform)]
def source_points(points,box,size):
    x,y,w,h=box
    return [[x+u/size[0]*w,y+v/size[1]*h] for u,v in points]

buildings=[]
traces=[]
def add(id,name,poly,holes,box,size,height=2.2,kind='academic'):
    p=source_points(poly,box,size)
    hs=[source_points(h,box,size) for h in holes]
    points=[project(v) for v in p]
    building={
        'id':'official-'+id,'name':name,'kind':kind,
        'points':points,'holes':[[project(v) for v in h] for h in hs],
        'center':[round(v,2) for v in centroid(points)],
        'height':height,'heightSource':'表现性高度，非实测',
        'source':'校方地图人工对齐近似轮廓',
    }
    buildings.append(building)
    traces.append({'id':building['id'],'imagePolygon':p,'imageHoles':hs})

east_box=(440,317,88,80); east_size=(681,619)
add('teaching-east-west','教学东楼 · 西翼',[
    [70,60],[285,66],[280,153],[250,153],[250,126],[113,123],
    [109,213],[77,212],[75,298],[223,302],[222,343],[58,337],[62,211]
],[],east_box,east_size,2.5)
add('teaching-east-central','教学东楼 · 中庭',[
    [229,192],[440,200],[438,343],[225,336]
],[[[283,235],[382,237],[381,297],[283,295]]],east_box,east_size,2.5)
add('teaching-east-east','教学东楼 · 东翼',[
    [443,189],[608,197],[606,324],[600,325],[596,470],[382,462],
    [382,383],[443,382],[444,406],[552,409],[555,323],[591,323],
    [591,235],[439,227]
],[],east_box,east_size,2.5)
add('teaching-east-southwest','教学东楼 · 西南翼',[
    [194,373],[237,375],[237,435],[344,443],[343,482],[282,482],
    [282,506],[341,510],[340,555],[155,549],[155,507],[186,507]
],[],east_box,east_size,2.3)
add('teaching-east-bridge','教学东楼 · 连廊',[
    [224,334],[241,335],[238,376],[221,375]
],[],east_box,east_size,1.1)

q_box=(380,775,80,68);q_size=(620,526)
add('qixiang-main','启翔楼',[
    [123,90],[436,104],[436,134],[445,153],[462,161],[449,327],
    [455,327],[451,396],[225,389],[224,348],[194,346],[196,322],
    [161,321],[161,325],[96,321],[99,258],[147,259],[153,123],[123,121]
],[[[162,164],[399,174],[393,324],[196,316],[165,313],[168,260],[157,259]]],q_box,q_size,2.7)
add('qixiang-entrance','启翔楼 · 入口',[
    [463,190],[497,192],[497,268],[460,265]
],[],q_box,q_size,1.4)

h_box=(350,590,100,126);h_size=(776,977)
add('haitian-east','海天苑大楼 · 东翼',[
    [471,143],[643,150],[644,161],[652,161],[696,210],[696,222],
    [710,224],[704,417],[717,418],[719,597],[709,666],[680,666],
    [679,850],[667,865],[667,887],[607,925],[381,914],[384,839],
    [575,848],[613,811],[623,664],[534,654],[534,626],[521,626],
    [525,588],[600,592],[604,483],[527,477],[528,410],[646,414],
    [644,251],[628,250],[609,217],[473,212]
],[],h_box,h_size,3.2)
add('haitian-northwest','海天苑大楼 · 西北翼',[
    [185,128],[461,140],[460,207],[431,205],[430,238],[456,239],
    [456,310],[447,310],[446,327],[456,333],[457,383],[378,380],
    [384,237],[416,237],[418,204],[265,196],[260,172],[252,173],
    [247,312],[342,317],[331,594],[184,593],[176,558],[180,478],
    [191,476],[192,444],[306,452],[319,378],[177,374]
],[[[228,483],[295,487],[291,552],[226,550]]],h_box,h_size,3.0)
add('haitian-southwest','海天苑大楼 · 西南翼',[
    [210,651],[310,657],[308,596],[327,597],[328,655],[339,657],
    [339,676],[362,677],[363,659],[442,661],[441,719],[363,716],
    [363,705],[337,705],[331,716],[275,711],[273,849],[329,852],
    [333,910],[213,907],[210,875],[203,871]
],[],h_box,h_size,2.9)

metadata={
    'source':'西北工业大学官网校园地图，发展规划处；建筑身份对照 2025 国际学生招生指南',
    'sourceUrl':'https://www.nwpu.edu.cn/info/1047/1051.htm',
    'imageUrl':'https://peixun.nwpu.edu.cn/changanxiaoquditu.jpg',
    'referenceSize':[1024,1213],
    'projection':campus['projection'],
    'method':'5 manually matched area-centroid anchors, least-squares 2D affine fit, manually traced roof outlines with courtyard holes',
    'matrixImageXY1ToSceneXZ':transform.tolist(),
    'anchors':[
        {'osmId':i,'name':n,'sourceImagePx':p,'destinationSceneCentroid':destination[k].tolist(),
         'residualSceneUnits':round(float(np.linalg.norm(residuals[k])),3)}
        for k,(i,n,p) in enumerate(anchor_specs)
    ],
    'rmsResidualSceneUnits':round(float(np.sqrt(np.mean(np.sum(residuals**2,axis=1)))),3),
    'caution':'官方旧总图有简化与规划成分；对齐及轮廓均为人工近似，不能当作实测、现状竣工图或精确位置。高度为表现性设置。',
    'buildings':buildings,
}
(ROOT/'research/official-supplement.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'research/official-supplement-traces.json').write_text(json.dumps(traces,ensure_ascii=False,indent=2),encoding='utf-8')

# Inspection overlay only: blue OSM / orange supplement / magenta anchor matches.
im=Image.open(ROOT/'public/reference/nwpu-changan-official-map-preview.jpg').convert('RGBA')
draw=ImageDraw.Draw(im,'RGBA')
linear=transform[:2,:].T;offset=transform[2,:]
def inverse(p): return tuple(np.linalg.solve(linear,np.array(p)-offset))
for b in campus['buildings']:
    poly=[inverse(p) for p in b['points']]
    draw.polygon(poly,fill=(30,100,255,60),outline=(20,80,255,220),width=2)
for b in buildings:
    poly=[inverse(p) for p in b['points']]
    draw.polygon(poly,fill=(255,110,20,140),outline=(200,65,0,255),width=2)
    for h in b['holes']:
        draw.line([inverse(p) for p in h]+[inverse(h[0])],fill=(200,65,0,255),width=2)
for _,_,p in anchor_specs:
    x,y=p;draw.ellipse((x-4,y-4,x+4,y+4),fill=(200,0,160,255))
im.convert('RGB').save(ROOT/'research/official-supplement-overlay.jpg',quality=94)
print(json.dumps({'count':len(buildings),'rmsScene':metadata['rmsResidualSceneUnits'],'anchors':metadata['anchors']},ensure_ascii=False))

def cross(a,b,c):
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def crossing(a,b,c,e):
    return cross(a,b,c)*cross(a,b,e)<-1e-7 and cross(c,e,a)*cross(c,e,b)<-1e-7
def inside(p,poly):
    x,y=p; odd=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if ((a[1]>y)!=(b[1]>y)) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]: odd=not odd
    return odd
errors=[]
for b in buildings:
    for ring in [b['points']]+b['holes']:
        n=len(ring)
        for i in range(n):
            for j in range(i+2,n):
                if i==0 and j==n-1: continue
                if crossing(ring[i],ring[(i+1)%n],ring[j],ring[(j+1)%n]):errors.append((b['id'],i,j))
    for h in b['holes']:
        if not all(inside(p,b['points']) for p in h):errors.append((b['id'],'hole-outside'))
print('Polygon errors:',errors)
if errors: raise ValueError(errors)
