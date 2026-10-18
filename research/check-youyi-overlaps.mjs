import fs from 'node:fs';
import { ShapeUtils, Vector2 } from 'three';
const d=JSON.parse(fs.readFileSync('src/data/youyi.json','utf8'));
const cr=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0]},0))/2;
const bbox=p=>[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))];
const overlap=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
const strip=p=>p[0][0]===p.at(-1)[0]&&p[0][1]===p.at(-1)[1]?p.slice(0,-1):p;
const meshes=d.buildings.map(b=>{
  const contour=strip(b.points),holes=(b.holes||[]).map(strip),p=[...contour,...holes.flat()];
  const ts=ShapeUtils.triangulateShape(contour.map(q=>new Vector2(...q)),holes.map(h=>h.map(q=>new Vector2(...q)))).map(t=>t.map(i=>p[i]));
  return {b,ts:ts.map(p=>({p,bb:bbox(p)})),bb:bbox(p),area:ts.reduce((s,t)=>s+area(t),0)};
});
function intersect(a,b){
  let p=a;const sign=cr(b[0],b[1],b[2])>=0?1:-1;
  for(let i=0;i<3;i++){
    const c=b[i],e=b[(i+1)%3],q=[];
    for(let j=0;j<p.length;j++){
      const s=p[j],t=p[(j+1)%p.length],ds=sign*cr(c,e,s),dt=sign*cr(c,e,t);
      if(ds>=-1e-9)q.push(s);
      if((ds>1e-9&&dt< -1e-9)||(ds< -1e-9&&dt>1e-9)){
        const r=ds/(ds-dt);q.push([s[0]+(t[0]-s[0])*r,s[1]+(t[1]-s[1])*r]);
      }
    }
    p=q;if(p.length<3)return 0;
  }
  return area(p);
}
const overlaps=[];
for(let i=0;i<meshes.length;i++)for(let j=i+1;j<meshes.length;j++){
  const a=meshes[i],b=meshes[j];if(!overlap(a.bb,b.bb))continue;
  let sum=0;for(const x of a.ts)for(const y of b.ts)if(overlap(x.bb,y.bb))sum+=intersect(x.p,y.p);
  if(sum>0.015&&sum/Math.min(a.area,b.area)>0.1)overlaps.push({a:{id:a.b.id,name:a.b.name,area:a.area},b:{id:b.b.id,name:b.b.name,area:b.area},intersection:sum,ratioOfSmaller:sum/Math.min(a.area,b.area)});
}
overlaps.sort((a,b)=>b.ratioOfSmaller-a.ratioOfSmaller);
fs.writeFileSync('research/youyi-overlap-validation.json',JSON.stringify(overlaps,null,2));
console.log(JSON.stringify(overlaps,null,2));
