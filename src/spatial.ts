import type {CampusConfig,CampusId,Building} from './campusTypes';
import type {EventId,ProjectId} from './game';
import {EVENTS,parseSaved} from './game';
import {boundsOf,pointInside,distanceToSegment} from './mapGeometry';
import {createRoadNetwork,isVehicleRoad,roadRoute} from './roadNetwork';
import type {RoadNetwork,RoadRoute} from './roadNetwork';

export const SPATIAL_VERSION='spatial-grid-40m-v1';
export const CELL_SIZE=4; // The supplied map projection uses approximately 10 m per scene unit.
// Shared by the calculation and its continuous, non-grid visual explanation.
export const FIELD_RADIUS={garden:3,walk:2,shuttle:2.5,feeder:1.5,lighting:2} as const;
export type InfluenceField={kind:keyof typeof FIELD_RADIUS;cellId:string;radius:number;strength:number};
export type Placement={projectId:ProjectId;cellId:string};
export type Cell={
  id:string;row:number;col:number;x:number;z:number;name:string;
  roof:number;water:number;green:number;protected:boolean;construction:boolean;
  road:boolean;vehicleRoad:boolean;roadName:string;buildingId?:string;kind:string;height:number;
  impervious:number;demand:number;energy:number;heat:number;runoff:number;sun:number;dorm:number;
};
export type World={campusId:CampusId;version:string;cells:Cell[];byId:Map<string,Cell>;neighbors:Map<string,string[]>;roadGraph:Map<string,string[]>;transitNetwork:RoadNetwork;bounds:ReturnType<typeof boundsOf>};
export const MEASURES:{id:ProjectId;name:string;symbol:string;color:string;cost:number;description:string;rule:string}[]=[
  {id:'retrofit',name:'建筑节能改造',symbol:'改',color:'#627fad',cost:16,description:'改造所选网格内的建筑，提高围护与设备效率。高负荷建筑收益更大。',rule:'仅已建建筑；成本随建筑覆盖和体量变化。同地块先节能再计算光伏，避免重复抵扣。'},
  {id:'solar',name:'屋顶光伏',symbol:'光',color:'#c6923b',cost:18,description:'利用所选地块的屋顶发电。周围建筑遮挡和降雨会降低产出。',rule:'仅已建屋顶；光照来自相邻楼高的简化遮挡，非实测日照。减排不超过该网格剩余用能。'},
  {id:'garden',name:'雨水花园',symbol:'园',color:'#4b9762',cost:12,description:'降低周边约 120 米范围的热压力与雨水压力，越近效果越强。',rule:'绿地或开放地表充足的混合网格，在建筑外实施；不占道路、水体、球场和施工区。邻近慢行设施获得绿荫协同。'},
  {id:'walk',name:'慢行路段',symbol:'行',color:'#c17b58',cost:8,description:'逐格改善已有道路。相连路段比孤立改造更有效，也能补足接驳末端。',rule:'只能沿道路布设；相邻路段形成网络，重复服务同一范围的收益不会直接叠加。'},
  {id:'shuttle',name:'接驳站点',symbol:'站',color:'#478b9a',cost:12,description:'至少两个站点沿现有道路连通后产生接驳服务。需要考虑周边需求。',rule:'道路节点；过近站点不能形成线路。车辆运行增加用能，站点近宿舍产生噪声代价。'},
  {id:'lighting',name:'夜间照明节点',symbol:'灯',color:'#9a7dab',cost:6,description:'改善周边夜间步行体验，同时增加少量运行用能。',rule:'道路或开放地块；附近绿地、水体受到光扰动，需权衡照明与生态安静。'},
];
const clamp=(n:number,min=0,max=1)=>Math.min(max,Math.max(min,n));
const round=(n:number)=>Math.round(n*10)/10;
const distance=(a:Cell,b:Cell)=>Math.hypot(a.x-b.x,a.z-b.z)/CELL_SIZE;
const kernel=(a:Cell,b:Cell,radius:number)=>Math.max(0,1-distance(a,b)/radius);
const key=(row:number,col:number)=>`r${row}c${col}`;
export const placementKey=(p:Placement)=>`${p.projectId}@${p.cellId}`;
export const measure=(id:ProjectId)=>MEASURES.find(m=>m.id===id)!;
const insideBuilding=(p:number[],b:Building)=>pointInside(p,b.points)&&!b.holes?.some(h=>pointInside(p,h));

export function createWorld(config:CampusConfig):World {
  const data=config.data,bounds=boundsOf(data.boundary),cells:Cell[]=[];
  const buildings=data.buildings.map(b=>({b,bounds:boundsOf(b.points)}));
  for(let row=Math.floor(bounds.minZ/CELL_SIZE);row<Math.ceil(bounds.maxZ/CELL_SIZE);row++)for(let col=Math.floor(bounds.minX/CELL_SIZE);col<Math.ceil(bounds.maxX/CELL_SIZE);col++){
    const x=(col+.5)*CELL_SIZE,z=(row+.5)*CELL_SIZE;
    if(!pointInside([x,z],data.boundary))continue;
    const nearby=buildings.filter(({bounds:b})=>b.minX<x+2&&b.maxX>x-2&&b.minZ<z+2&&b.maxZ>z-2);
    let roof=0,water=0,green=0,sport=0,construction=0,samples=0;
    const counts=new Map<Building,number>();
    for(const dx of [-1.33,0,1.33])for(const dz of [-1.33,0,1.33]){
      const p=[x+dx,z+dz];if(!pointInside(p,data.boundary))continue;samples++;
      const b=nearby.find(({b})=>insideBuilding(p,b))?.b;
      if(b){roof++;counts.set(b,(counts.get(b)||0)+1);if(b.status==='under-construction')construction++;}
      if(data.waters.some(w=>pointInside(p,w.points)&&!w.holes?.some(h=>pointInside(p,h))))water++;
      for(const g of data.grounds)if(pointInside(p,g.points)){
        if(['park','grass','garden'].includes(g.kind))green++;
        if(['pitch','track'].includes(g.kind))sport++;
        if(g.kind==='construction')construction++;
      }
    }
    const building=[...counts].sort((a,b)=>b[1]-a[1]||a[0].id.localeCompare(b[0].id))[0]?.[0];
    let nearestRoad:typeof data.roads[number]|undefined,roadDistance=Infinity,vehicleDistance=Infinity;
    for(const road of data.roads)for(let i=1;i<road.points.length;i++){
      const d=distanceToSegment([x,z],road.points[i-1],road.points[i]);if(d<roadDistance){nearestRoad=road;roadDistance=d;}if(isVehicleRoad(road.kind))vehicleDistance=Math.min(vehicleDistance,d);
    }
    roof/=samples;water/=samples;green=clamp(green/samples);
    const road=roadDistance<CELL_SIZE*.72&&water<.34&&construction===0&&roof<.56;
    const vehicleRoad=road&&vehicleDistance<CELL_SIZE*.72;
    const open=clamp(1-roof-water-green),vegetation=clamp(green*.9+open*.18);
    const impervious=clamp(roof*.95+(road?.25:0)+open*.4+sport/samples*.4);
    const height=building?.height||0,kind=building?.kind||'open';
    const activity=kind==='dining'?1.5:kind==='dorm'?1.25:kind==='library'?1.35:kind==='academic'?1:.65;
    cells.push({id:key(row,col),row,col,x,z,name:(building?(roof<.34?`${building.name}周边`:building.name):'')||nearestRoad&&road&&(nearestRoad.name||'校内道路')||(green>.2?'绿地':'开放地块'),roof,water,green,protected:sport>0,construction:construction>0,road,vehicleRoad,roadName:nearestRoad?.name||'校内道路',buildingId:building?.id,kind,height,impervious,demand:roof*activity*Math.min(2.5,height/1.5+.5),energy:.02+roof*(.6+height*.5)*activity,heat:clamp(.3+impervious*.65-vegetation*.3-water*.25),runoff:clamp(.18+impervious*.7-vegetation*.3),sun:1,dorm:kind==='dorm'?roof:0});
  }
  // Activity and sunlight are explicitly teaching proxies derived from geometry, not measured campus data.
  const seeds=cells.map(c=>c.demand);
  const demands=cells.map(c=>cells.reduce((sum,n,i)=>sum+seeds[i]*kernel(c,n,3),0));
  const sorted=[...demands].sort((a,b)=>a-b),scale=sorted[Math.floor(sorted.length*.9)]||1;
  cells.forEach((c,i)=>{
    c.demand=.05+clamp(demands[i]/scale)*.95;
    const shade=cells.reduce((v,n)=>n.z>c.z&&n.height>c.height?Math.max(v,kernel(c,n,3)*(n.height-c.height)*.18*n.roof):v,0);
    c.sun=clamp(1-shade,.2,1);
  });
  const byId=new Map(cells.map(c=>[c.id,c])),neighbors=new Map<string,string[]>(),roadGraph=new Map<string,string[]>();
  cells.forEach(c=>{
    const ns:string[]=[];
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc){
      const n=byId.get(key(c.row+dr,c.col+dc));if(!n)continue;
      // Do not connect diagonally across a water/outside corner.
      if(dr&&dc){const a=byId.get(key(c.row+dr,c.col)),b=byId.get(key(c.row,c.col+dc));if(!a||!b||a.water>=.34||b.water>=.34)continue;}
      ns.push(n.id);
    }
    neighbors.set(c.id,ns);if(c.road)roadGraph.set(c.id,ns.filter(id=>byId.get(id)!.road));
  });
  const transitNetwork=createRoadNetwork(data.roads,cells.filter(c=>c.vehicleRoad).map(c=>({id:c.id,point:[c.x,c.z]})));
  return {campusId:config.id,version:SPATIAL_VERSION,cells,byId,neighbors,roadGraph,transitNetwork,bounds};
}
export function suitability(world:World,projectId:ProjectId,cellId:string):string|null {
  const c=world.byId.get(cellId);if(!c)return '该网格不在当前校区范围内。';
  if(c.construction)return '施工地块暂不开放改造。';
  if(c.water>=.34)return '不能在水体网格建设该措施。';
  if(projectId==='solar'||projectId==='retrofit')return c.roof>=.1?null:'该网格缺少可用的已建建筑屋顶。';
  if(c.protected)return '保留运动场用途，不能占用球场或跑道。';
  if(projectId==='shuttle')return c.vehicleRoad?null:'接驳需沿可通行车辆的道路布设，不能使用步道或台阶。';
  if(projectId==='walk')return c.road?null:'请沿地图中的已有道路布设。';
  if(c.roof>.22)return '建筑覆盖较多，请选择附近开放地块。';
  if(projectId==='garden'&&c.road)return '不能用花园占用道路，试试道路旁的网格。';
  return null;
}
export function placementCost(world:World,p:Placement){
  const c=world.byId.get(p.cellId);if(!c)return 0;
  const base=measure(p.projectId).cost;
  return p.projectId==='retrofit'||p.projectId==='solar'?Math.max(6,Math.round(base*(.45+c.roof*.7+Math.min(c.height,5)*.06))):base;
}
// Preserve the previous straight-road energy scale, now based on road length.
export const shuttleRouteEnergy=(routes:readonly RoadRoute[])=>routes.reduce((sum,r)=>sum+.45+(r.length/CELL_SIZE+1)*.018,0);
export type Interaction={kind:'positive'|'negative'|'note';name:string;detail:string;cells:string[]};
export type CellResult={cellId:string;energy:number;heat:number;runoff:number;access:number;comfort:number;initialComfort:number;noise:number;ecology:number;light:number;synergy:number;served:boolean};
export function evaluateSpatial(world:World,input:readonly Placement[],event:EventId,buildingInput?:{energySavings:Record<string,number>;cost:number;problems:string[]}){
  const placements=[...input].sort((a,b)=>placementKey(a).localeCompare(placementKey(b)));
  const problems:string[]=[...(buildingInput?.problems||[])];const seen=new Set<string>();
  for(const p of placements){const k=placementKey(p),reason=suitability(world,p.projectId,p.cellId);if(reason)problems.push(reason);if(seen.has(k))problems.push('同一网格不能重复实施同一种措施。');seen.add(k);}
  const valid=placements.filter((p,i)=>!suitability(world,p.projectId,p.cellId)&&placements.findIndex(q=>placementKey(q)===placementKey(p))===i);
  const groups=Object.fromEntries(MEASURES.map(m=>[m.id,valid.filter(p=>p.projectId===m.id).map(p=>world.byId.get(p.cellId)!)])) as Record<ProjectId,Cell[]>;
  const interactions:Interaction[]=[],routes:RoadRoute[]=[],activeStops=new Set<string>();
  // Deterministic shortest-path spanning forest; a disconnected component never receives invented roads.
  const edges:{a:Cell;b:Cell;path:RoadRoute}[]=[];
  groups.shuttle.forEach((a,i)=>groups.shuttle.slice(i+1).forEach(b=>{const path=roadRoute(world.transitNetwork,a.id,b.id);if(path&&path.length>=3*CELL_SIZE)edges.push({a,b,path});}));
  edges.sort((a,b)=>a.path.length-b.path.length||a.a.id.localeCompare(b.a.id)||a.b.id.localeCompare(b.b.id));
  const roots=new Map(groups.shuttle.map(c=>[c.id,c.id]));
  const root=(id:string):string=>{while(roots.get(id)!==id)id=roots.get(id)!;return id;};
  for(const edge of edges)if(root(edge.a.id)!==root(edge.b.id)){roots.set(root(edge.a.id),root(edge.b.id));routes.push(edge.path);activeStops.add(edge.a.id);activeStops.add(edge.b.id);}
  for(const c of groups.shuttle)if(!activeStops.has(c.id))interactions.push({kind:'negative',name:'接驳站尚未连成服务',detail:'需另设一个沿车辆道路连通、沿路距离至少约 120 米的站点；当前站点不产生出行收益。',cells:[c.id]});
  if(routes.length)interactions.push({kind:'positive',name:'接驳线路已连通',detail:`沿地图已有车辆道路生成 ${routes.length} 段连接，合计约 ${Math.round(routes.reduce((sum,r)=>sum+r.length,0)*10)} 米；服务范围围绕站点，沿线空白处不会被当成站点。`,cells:[...activeStops]});
  const walkIds=new Set(groups.walk.map(c=>c.id)),connectedWalk=new Set<string>(),feeder=new Set<string>();
  for(const c of groups.walk){
    if((world.roadGraph.get(c.id)||[]).some(id=>walkIds.has(id)))connectedWalk.add(c.id);
    if(groups.shuttle.some(s=>activeStops.has(s.id)&&distance(c,s)<=1.5))feeder.add(c.id);
  }
  const queue=[...feeder];for(let i=0;i<queue.length;i++)for(const n of world.roadGraph.get(queue[i])||[])if(walkIds.has(n)&&!feeder.has(n)){feeder.add(n);queue.push(n);}
  if(connectedWalk.size)interactions.push({kind:'positive',name:'连续慢行网络',detail:'相连路段获得完整服务系数；孤立路段按 55% 计算。',cells:[...connectedWalk]});
  if(feeder.size)interactions.push({kind:'positive',name:'慢行 × 接驳',detail:'与已启用站点相连的慢行路段扩大末端接入范围，同时改善换乘体验。',cells:[...feeder]});
  for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++){
    const p=valid[i],q=valid[j],a=world.byId.get(p.cellId)!,b=world.byId.get(q.cellId)!,pair=[p.projectId,q.projectId];
    if(pair.includes('garden')&&pair.includes('walk')&&distance(a,b)<3)interactions.push({kind:'positive',name:'花园 × 慢行绿荫',detail:'在重叠覆盖区增加步行舒适度，高温情境下协同更强。',cells:[a.id,b.id]});
    if(pair.includes('garden')&&pair.includes('lighting')&&distance(a,b)<5)interactions.push({kind:'negative',name:'花园 × 照明光扰动',detail:'照明覆盖新增花园时产生额外光扰动，体验计算会扣除这项局部代价。',cells:[a.id,b.id]});
    if(p.projectId===q.projectId&&['garden','lighting'].includes(p.projectId)&&distance(a,b)<3)interactions.push({kind:'note',name:'重复覆盖递减',detail:'同类覆盖取较强值，不把重叠地块的全部收益重复相加；两个选址仍分别花费预算。',cells:[a.id,b.id]});
    if(a.id===b.id&&pair.includes('retrofit')&&pair.includes('solar'))interactions.push({kind:'note',name:'节能 × 光伏共同上限',detail:'先降低建筑用能，再用光伏抵扣剩余用能，避免重复计算同一份排放。',cells:[a.id]});
  }
  const maxField=(cell:Cell,points:Cell[],radius:number,factor:(c:Cell)=>number=()=>1)=>points.reduce((n,p)=>Math.max(n,kernel(cell,p,radius)*factor(p)),0);
  const baselineEnergy=world.cells.reduce((n,c)=>n+c.energy,0),weight=world.cells.reduce((n,c)=>n+c.demand,0);
  const energyMultiplier=event==='heat'?1.2:1;
  let totalEnergy=0,totalComfort=0,totalHeat=0,totalRunoff=0,totalEcology=0,totalServed=0,baseComfort=0;
  let baselineHeat=0,baselineRunoff=0;
  const cells:CellResult[]=world.cells.map(c=>{
    const garden=maxField(c,groups.garden,FIELD_RADIUS.garden),walk=maxField(c,groups.walk,FIELD_RADIUS.walk,p=>connectedWalk.has(p.id)?1:.55);
    const stop=maxField(c,groups.shuttle.filter(s=>activeStops.has(s.id)),FIELD_RADIUS.shuttle),firstMile=maxField(c,groups.walk.filter(w=>feeder.has(w.id)),FIELD_RADIUS.feeder)*.75;
    const transit=Math.max(stop,firstMile),light=maxField(c,groups.lighting,FIELD_RADIUS.lighting);
    const noise=maxField(c,groups.shuttle.filter(s=>activeStops.has(s.id)),2)*c.dorm;
    const ecology=light*clamp(c.green+c.water+garden*.4)*.55;
    const initialHeat=clamp(c.heat+(event==='heat'?.22:0)),initialRunoff=clamp(c.runoff+(event==='rain'?.32:0));
    const heat=clamp(initialHeat-garden*.38),runoff=clamp(initialRunoff-garden*.5);
    const access=1-(1-walk*.65)*(1-transit*.85); // Saturation prevents double counting modal coverage.
    let energy=c.energy*energyMultiplier;
    if(seen.has(`retrofit@${c.id}`))energy*=event==='heat'?.55:.65;
    if(seen.has(`solar@${c.id}`))energy=Math.max(0,energy-c.energy*.8*c.sun*(event==='rain'?.42:event==='heat'?.92:1));
    energy=Math.max(0,energy-(buildingInput?.energySavings[c.id]||0));
    energy=Math.max(0,energy-c.demand*(walk*.09+transit*.18)*(1-walk*transit*.3));
    energy+=light*.012;
    const initialComfort=50-(event==='heat'?initialHeat*11:0)-(event==='rain'?initialRunoff*13:0);
    const synergy=garden*walk*(event==='heat'?9:4);
    const comfort=clamp(initialComfort+(initialHeat-heat)*22+(initialRunoff-runoff)*15+access*12+light*5+synergy-noise*10-ecology*5,0,100);
    const served=comfort-initialComfort>=1||energy<c.energy*energyMultiplier*.92;
    totalEnergy+=energy;totalComfort+=comfort*c.demand;baseComfort+=initialComfort*c.demand;totalHeat+=heat*c.demand;totalRunoff+=runoff*c.demand;totalEcology+=ecology*c.demand;
    baselineHeat+=initialHeat*c.demand;baselineRunoff+=initialRunoff*c.demand;if(served)totalServed+=c.demand;
    return {cellId:c.id,energy,heat,runoff,access,comfort,initialComfort,noise,ecology,light,synergy,served};
  });
  // Each connected service consumes energy even when its demand is low.
  const routeEnergy=shuttleRouteEnergy(routes);totalEnergy+=routeEnergy;
  for(const c of groups.shuttle)if(activeStops.has(c.id)&&world.cells.some(n=>n.dorm>0&&distance(c,n)<2))interactions.push({kind:'negative',name:'接驳站 × 宿舍噪声',detail:'站点运行影响周围宿舍网格；可以后退一格，比较服务覆盖与安静程度的变化。',cells:[c.id]});
  for(const c of groups.lighting)if(world.cells.some(n=>(n.green>.15||n.water>.1)&&distance(c,n)<2))interactions.push({kind:'negative',name:'照明 × 生态光扰动',detail:'光照覆盖绿地或水边产生局部生态扰动，并扣减该地块体验；照明也消耗能源。',cells:[c.id]});
  const cost=buildingInput?.cost??placements.reduce((n,p)=>n+placementCost(world,p),0),budget=EVENTS.find(e=>e.id===event)!.budget;
  const carbon=round(totalEnergy/baselineEnergy*100),baselineCarbon=round(energyMultiplier*100),comfort=round(totalComfort/weight),baselineComfort=round(baseComfort/weight),coverage=round(totalServed/weight*100);
  const reduction=round((1-carbon/baselineCarbon)*100),comfortGain=round(comfort-baselineComfort),feasible=!problems.length&&cost<=budget;
  const fields:InfluenceField[]=[
    ...groups.garden.map(c=>({kind:'garden' as const,cellId:c.id,radius:FIELD_RADIUS.garden,strength:1})),
    ...groups.walk.map(c=>({kind:'walk' as const,cellId:c.id,radius:FIELD_RADIUS.walk,strength:connectedWalk.has(c.id)?1:.55})),
    ...[...activeStops].map(cellId=>({kind:'shuttle' as const,cellId,radius:FIELD_RADIUS.shuttle,strength:1})),
    ...[...feeder].map(cellId=>({kind:'feeder' as const,cellId,radius:FIELD_RADIUS.feeder,strength:.75})),
    ...groups.lighting.map(c=>({kind:'lighting' as const,cellId:c.id,radius:FIELD_RADIUS.lighting,strength:1})),
  ];
  return {cost,budget,remaining:budget-cost,carbon,comfort,coverage,reduction,comfortGain,baselineCarbon,baselineComfort,heat:round(totalHeat/weight*100),runoff:round(totalRunoff/weight*100),baselineHeat:round(baselineHeat/weight*100),baselineRunoff:round(baselineRunoff/weight*100),ecology:round(totalEcology/weight*100),routeEnergy:round(routeEnergy),feasible,problems,success:feasible&&reduction>=2&&comfortGain>=1&&coverage>=12,cells,interactions,routes,fields};
}
export type SpatialResult=ReturnType<typeof evaluateSpatial>;
export type SpatialState={version:2;gridVersion:string;campusId:CampusId;placements:Placement[];event:EventId;snapshot:{placements:Placement[];savedAt:string}|null;migrated?:boolean};
export const emptySpatial=(id:CampusId):SpatialState=>({version:2,gridVersion:SPATIAL_VERSION,campusId:id,placements:[],event:'normal',snapshot:null});
export function addPlacement(world:World,state:SpatialState,p:Placement):{state:SpatialState;error?:string}{
  const error=suitability(world,p.projectId,p.cellId);if(error)return {state,error};
  if(state.placements.some(q=>placementKey(p)===placementKey(q)))return {state,error:'此处已经实施了这项措施。'};
  const next={...state,placements:[...state.placements,{...p}]};
  if(!evaluateSpatial(world,next.placements,next.event).feasible)return {state,error:'预算不足，请先移除其他投入或更换地点。'};
  return {state:next};
}
export function readSpatial(raw:string|null,world:World,config:CampusConfig):SpatialState {
  const empty=emptySpatial(config.id);
  try{
    const s=JSON.parse(raw||'null');if(!s)return empty;
    if(s.version===1){
      const old=parseSaved(raw);
      const migrate=(ids:ProjectId[])=>ids.flatMap(projectId=>{
        const p=config.projects.find(p=>p.id===projectId)!;
        const c=world.cells.filter(c=>!suitability(world,projectId,c.id)).sort((a,b)=>Math.hypot(a.x-p.location[0],a.z-p.location[1])-Math.hypot(b.x-p.location[0],b.z-p.location[1])||a.id.localeCompare(b.id))[0];
        return c?[{projectId,cellId:c.id}]:[];
      });
      return {...empty,placements:migrate(old.selected),event:old.event,snapshot:old.snapshot?{placements:migrate(old.snapshot.ids),savedAt:old.snapshot.savedAt}:null,migrated:true};
    }
    const valid=(v:unknown):v is Placement[]=>Array.isArray(v)&&v.length<=100&&v.every(p=>p&&MEASURES.some(m=>m.id===p.projectId)&&typeof p.cellId==='string'&&!suitability(world,p.projectId,p.cellId))&&new Set(v.map(placementKey)).size===v.length;
    if(s.version!==2||s.gridVersion!==SPATIAL_VERSION||s.campusId!==config.id||!valid(s.placements)||!EVENTS.some(e=>e.id===s.event))return empty;
    if(s.snapshot!==null&&(!s.snapshot||!valid(s.snapshot.placements)||typeof s.snapshot.savedAt!=='string'))return empty;
    return {...empty,placements:s.placements.map((p:Placement)=>({...p})),event:s.event,snapshot:s.snapshot?{placements:s.snapshot.placements.map((p:Placement)=>({...p})),savedAt:s.snapshot.savedAt}:null,migrated:s.migrated===true};
  }catch{return empty;}
}
