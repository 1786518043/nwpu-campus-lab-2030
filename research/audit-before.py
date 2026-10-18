import sys,json
from pathlib import Path
sys.path.insert(0,str(Path('.tools/geometry').resolve()))
from shapely.geometry import Polygon
c=json.loads(Path('src/data/campus.json').read_text(encoding='utf8'))
ground=Polygon(c['boundary'])
errors=[]
for b in c['buildings']:
 p=Polygon(b['points'],b.get('holes',[]))
 if not p.is_valid: errors.append({'id':b['id'],'name':b['name'],'invalid':True});continue
 out=p.difference(ground).area
 if out>.0001:errors.append({'id':b['id'],'name':b['name'],'outside_m2':round(out*100,1),'outside_percent':round(out/p.area*100,1)})
print(json.dumps(errors,ensure_ascii=False,indent=2))
Path('research/changan-before-audit.json').write_text(json.dumps({'unsupportedBuildings':errors,'groundTop':-.05,'buildingBase':.18,'floatingGapMetres':2.3},ensure_ascii=False,indent=2),encoding='utf8')
