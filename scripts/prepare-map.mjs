import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const data = JSON.parse(fs.readFileSync('research/osm-campus-full.json','utf8'));
const all = new Map(data.elements.map(e=>[`${e.type}/${e.id}`,e]));
const project = n => [+( (n.lon-108.7601)*92290/10).toFixed(3),+(-(n.lat-34.0298)*111320/10).toFixed(3)];
const points = ids => ids.map(id=>all.get(`node/${id}`)).filter(Boolean).map(project);
const ways = data.elements.filter(e=>e.type==='way');
const geometry = w => points(w.nodes);
function join(members) {
  const segments = members.map(m=>all.get(`way/${m.ref}`)?.nodes).filter(Boolean).map(a=>[...a]);
  const rings=[];
  while(segments.length){
    let chain=segments.shift(), changed=true;
    while(changed && chain[0]!==chain.at(-1)){
      changed=false;
      for(let i=0;i<segments.length;i++){
        const s=segments[i];
        if(chain.at(-1)===s[0]) chain.push(...s.slice(1));
        else if(chain.at(-1)===s.at(-1)) chain.push(...s.slice(0,-1).reverse());
        else if(chain[0]===s.at(-1)) chain.unshift(...s.slice(0,-1));
        else if(chain[0]===s[0]) chain.unshift(...s.slice(1).reverse());
        else continue;
        segments.splice(i,1);changed=true;break;
      }
    }
    if(chain.length>=4 && chain[0]===chain.at(-1)) rings.push(points(chain));
  }
  return rings;
}
const inside = p => p[0]>-60 && p[0]<55 && p[1]>-110 && p[1]<110;
const center = p => [p.reduce((s,n)=>s+n[0],0)/p.length,p.reduce((s,n)=>s+n[1],0)/p.length];
function contains(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
const category = name => /图书/.test(name)?'library':/体育|训练馆|游泳/.test(name)?'sport':/餐厅|食堂/.test(name)?'dining':/苑.*[A-H座]|宿舍|公寓/.test(name)?'dorm':/服务|南山|保安|活动/.test(name)?'public':'academic';
const buildings=[];
function add(id,tags,poly,holes=[]){
  if(!inside(center(poly))) return;
  const name=tags.name || (tags.amenity==='library'?'长安校区图书馆':'校园建筑');
  const kind=category(name);
  const level=Number(tags['building:levels']);
  buildings.push({id:String(id),name,kind,points:poly,holes,center:center(poly).map(x=>+x.toFixed(2)),height:level?level*.35:kind==='library'?4.8:kind==='dorm'?2.6:kind==='sport'?2.3:kind==='dining'?1.5:2.0,heightSource:level?'OSM 楼层标签估算':'表现性高度，非实测'});
}
ways.filter(w=>w.tags?.building).forEach(w=>add(w.id,w.tags,geometry(w)));
data.elements.filter(e=>e.type==='relation'&&e.tags?.building).forEach(r=>{
  const outers=join(r.members.filter(m=>m.type==='way'&&m.role!=='inner'));
  const holes=join(r.members.filter(m=>m.type==='way'&&m.role==='inner'));
  outers.forEach((p,i)=>add(`r${r.id}-${i}`,r.tags,p,holes.filter(h=>contains(h[0],p))));
});
const waters=ways.filter(w=>w.tags?.natural==='water').map(w=>({id:String(w.id),name:w.tags.name||'水域',points:geometry(w),holes:[]}));
data.elements.filter(e=>e.type==='relation'&&e.tags?.natural==='water').forEach(r=>join(r.members.filter(m=>m.role==='outer')).forEach((p,i)=>waters.push({id:`r${r.id}-${i}`,name:r.tags.name||'水域',points:p,holes:join(r.members.filter(m=>m.role==='inner'))})));
const roads=ways.filter(w=>w.tags?.highway && !['construction','proposed'].includes(w.tags.highway)).map(w=>({id:String(w.id),name:w.tags.name||'',kind:w.tags.highway,points:geometry(w)})).filter(w=>w.points.some(inside));
const grounds=ways.filter(w=>['pitch','track','park','garden'].includes(w.tags?.leisure)||['grass','forest'].includes(w.tags?.landuse)).map(w=>({id:String(w.id),name:w.tags.name||'',kind:w.tags.leisure||w.tags.landuse,sport:w.tags.sport,points:geometry(w)})).filter(w=>w.points.length>3&&inside(center(w.points)));
const boundary=geometry(all.get('way/273391732'));
const osmBuildingCount=buildings.length;
if(fs.existsSync('research/official-supplement.json')){
  const supplemental=JSON.parse(fs.readFileSync('research/official-supplement.json','utf8'));
  buildings.push(...supplemental.buildings);
}
fs.mkdirSync('src/data',{recursive:true});
fs.writeFileSync('src/data/campus.json',JSON.stringify({source:'© OpenStreetMap contributors · ODbL 1.0；校方地图人工对齐近似补充',retrieved:'2026-10-18',osmBuildingCount,supplementalBuildingCount:buildings.length-osmBuildingCount,projection:'local equirectangular, origin 108.7601E 34.0298N, one scene unit ≈ 10 metres',boundary,buildings,waters,roads,grounds},null,2));
fs.mkdirSync('public/data',{recursive:true});
// Always rebuild from the raw snapshot, then apply the source-backed geometry audit.
const audit=spawnSync(process.env.PYTHON||'python',['scripts/audit-changan-map.py'],{stdio:'inherit'});
if(audit.status!==0)process.exit(audit.status||1);
