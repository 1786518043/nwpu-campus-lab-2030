import type {Building,CampusConfig,CampusId} from './campusTypes';
import type {EventId,ProjectId} from './game';
import {EVENTS} from './game';
import {boundsOf,distanceToSegment} from './mapGeometry';
import {CELL_SIZE,MEASURES,createWorld,evaluateSpatial,measure,placementCost,placementKey,readSpatial,suitability} from './spatial';
import type {Cell,Placement,SpatialResult,World} from './spatial';

export const BUILDING_VERSION='building-plan-v1';
export type BuildingAction={buildingId:string;projectId:ProjectId;legacyCells?:string[]};
export type BuildingState={version:3;rulesVersion:string;campusId:CampusId;actions:BuildingAction[];event:EventId;snapshot:{actions:BuildingAction[];savedAt:string}|null;migrated?:boolean};
type Footprint={cellId:string;area:number;energy:number};
export type BuildingSite={id:string;name:string;buildings:Building[];buildingIds:string[];center:number[];height:number;area:number;kind:string;construction:boolean;footprint:Footprint[];targets:Partial<Record<ProjectId,string[]>>};
export type BuildingContext={config:CampusConfig;world:World;sites:BuildingSite[];byId:Map<string,BuildingSite>;byBuildingId:Map<string,BuildingSite>};
export const actionKey=(a:BuildingAction)=>`${a.projectId}@${a.buildingId}`;
export const actionSignature=(a:BuildingAction)=>`${actionKey(a)}:${a.legacyCells?[...a.legacyCells].sort().join(','):'whole-building'}`;
export const emptyBuildingState=(id:CampusId):BuildingState=>({version:3,rulesVersion:BUILDING_VERSION,campusId:id,actions:[],event:'normal',snapshot:null});

const polygonArea=(points:number[][])=>Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
// Clip the real footprint against each internal cell. Courtyards are subtracted,
// and small buildings remain selectable even when a sampling point missed them.
export function clippedArea(points:number[][],minX:number,minZ:number,maxX:number,maxZ:number){
  let out=points;
  for(const [axis,edge,sign] of [[0,minX,1],[0,maxX,-1],[1,minZ,1],[1,maxZ,-1]]){
    const input=out;out=[];if(!input.length)break;
    let previous=input.at(-1)!,previousInside=(previous[axis]-edge)*sign>=0;
    for(const next of input){const inside=(next[axis]-edge)*sign>=0;
      if(inside!==previousInside){const t=(edge-previous[axis])/(next[axis]-previous[axis]);out.push([previous[0]+t*(next[0]-previous[0]),previous[1]+t*(next[1]-previous[1])]);}
      if(inside)out.push(next);previous=next;previousInside=inside;
    }
  }
  return polygonArea(out);
}
function distanceToBuilding(c:Cell,site:BuildingSite){
  return Math.min(...site.buildings.flatMap(b=>b.points.map((p,i)=>distanceToSegment([c.x,c.z],p,b.points[(i+1)%b.points.length]))));
}
export function createBuildingContext(config:CampusConfig):BuildingContext{
  const base=createWorld(config),groups=new Map<string,Building[]>();
  const compounds=new Set(config.data.buildings.filter(b=>b.name.includes(' · ')).map(b=>b.name.split(' · ')[0]));
  for(const b of config.data.buildings){
    const relation=b.id.match(/^(r\d+)-\d+$/)?.[1];
    const namedCompound=compounds.has(b.name.split(' · ')[0])?b.name.split(' · ')[0]:null;
    const group=namedCompound?`compound:${namedCompound}`:relation?`${relation}:${b.name}`:b.id;groups.set(group,[...(groups.get(group)||[]),b]);
  }
  let anonymous=0;
  const sites:BuildingSite[]=[...groups.values()].map(buildings=>{
    const first=buildings[0],box=boundsOf(buildings.flatMap(b=>b.points)),center=[box.cx,box.cz];
    const name=first.name==='校园建筑'?`${center[1]<base.bounds.cz?'北':'南'}区${center[0]<base.bounds.cx?'西':'东'}侧建筑 ${String(++anonymous).padStart(2,'0')}`:buildings.length>1?first.name.split(' · ')[0]:first.name;
    const footprint:Footprint[]=[];
    for(const c of base.cells){
      if(c.x+2<box.minX||c.x-2>box.maxX||c.z+2<box.minZ||c.z-2>box.maxZ)continue;
      let area=0,energy=0;
      for(const b of buildings){
        const occupied=Math.max(0,clippedArea(b.points,c.x-2,c.z-2,c.x+2,c.z+2)-(b.holes||[]).reduce((s,h)=>s+clippedArea(h,c.x-2,c.z-2,c.x+2,c.z+2),0));
        const activity=b.kind==='dining'?1.5:b.kind==='dorm'?1.25:b.kind==='library'?1.35:b.kind==='academic'?1:.65;
        area+=occupied;energy+=occupied/(CELL_SIZE**2)*(.6+b.height*.5)*activity;
      }
      if(area>.00001)footprint.push({cellId:c.id,area,energy});
    }
    return {id:first.id,name,buildings,buildingIds:buildings.map(b=>b.id),center,height:Math.max(...buildings.map(b=>b.height)),area:footprint.reduce((s,f)=>s+f.area,0),kind:first.kind,construction:buildings.some(b=>b.status==='under-construction'),footprint,targets:{}};
  });
  // Keep the existing land/road analysis; replace only building energy with
  // footprint-weighted contributions, so neighbouring buildings sharing a cell
  // do not receive each other's retrofit/solar savings.
  const energy=new Map<string,number>();
  for(const site of sites)for(const f of site.footprint)energy.set(f.cellId,(energy.get(f.cellId)||0)+f.energy);
  const cells=base.cells.map(c=>({...c,energy:.02+(energy.get(c.id)||0)}));
  const world:World={...base,cells,byId:new Map(cells.map(c=>[c.id,c]))};
  for(const site of sites){
    for(const projectId of ['garden','walk','shuttle','lighting'] as const){
      const limit=projectId==='shuttle'?8:projectId==='garden'?6:7;
      const nearby=cells.filter(c=>!suitability(world,projectId,c.id)).map(c=>({c,distance:distanceToBuilding(c,site)})).filter(c=>c.distance<=limit).sort((a,b)=>a.distance-b.distance||a.c.id.localeCompare(b.c.id));
      if(!nearby.length)continue;
      const anchor=nearby[0].c;site.targets[projectId]=[anchor.id];
      if(projectId==='walk'){
        const eligible=new Set(nearby.map(n=>n.c.id)),frontage=[anchor.id];
        for(let i=0;i<frontage.length&&frontage.length<4;i++)for(const n of world.roadGraph.get(frontage[i])||[])if(eligible.has(n)&&!frontage.includes(n)&&frontage.length<4)frontage.push(n);
        site.targets.walk=frontage;
      }
    }
  }
  return {config,world,sites,byId:new Map(sites.map(s=>[s.id,s])),byBuildingId:new Map(sites.flatMap(s=>s.buildingIds.map(id=>[id,s] as const)))};
}
export function actionCells(context:BuildingContext,a:BuildingAction){
  const site=context.byId.get(a.buildingId);if(!site)return [];
  return a.legacyCells||(a.projectId==='solar'||a.projectId==='retrofit'?site.footprint.map(f=>f.cellId):site.targets[a.projectId]||[]);
}
export function actionCost(context:BuildingContext,a:BuildingAction){
  if(a.legacyCells)return a.legacyCells.reduce((s,cellId)=>s+placementCost(context.world,{projectId:a.projectId,cellId}),0);
  const site=context.byId.get(a.buildingId);if(!site)return 0;
  if(a.projectId==='walk')return measure(a.projectId).cost*Math.max(1,site.targets.walk?.length||0);
  return ['solar','retrofit'].includes(a.projectId)?Math.max(6,Math.round(measure(a.projectId).cost*(.45+Math.sqrt(site.area/16)*.55+site.height*.06))):measure(a.projectId).cost;
}
export function actionReason(context:BuildingContext,a:BuildingAction,existing:BuildingAction[]=[]):string|null{
  const site=context.byId.get(a.buildingId);if(!site)return '请选择当前校区的建筑。';
  if(site.construction)return '这栋建筑仍在施工，暂不开放措施实施。';
  if(!actionCells(context,a).length)return ['solar','retrofit'].includes(a.projectId)?'该建筑缺少可计算的完整轮廓。':a.projectId==='garden'?'建筑附近暂无符合条件的开放地表，不能占用道路、球场或水体。':a.projectId==='shuttle'?'建筑附近没有适合车辆接驳的道路。':'建筑附近暂无符合条件的实施位置。';
  if(existing.some(p=>actionKey(p)===actionKey(a)))return '这栋建筑已实施该措施。';
  if(!['solar','retrofit'].includes(a.projectId)){
    const cells=actionCells(context,a),other=existing.find(p=>p.projectId===a.projectId&&cells.every(id=>actionCells(context,p).includes(id)));
    if(other)return `附近同一设施已由${context.byId.get(other.buildingId)!.name}配置，可以共享服务，无需重复投入。`;
  }
  return null;
}
export function evaluateBuildingPlan(context:BuildingContext,actions:BuildingAction[],event:EventId){
  const inputs=new Map<string,Placement>(),problems:string[]=[],energySavings:Record<string,number>={};
  const ordered=[...actions].sort((a,b)=>actionKey(a).localeCompare(actionKey(b))),seen:BuildingAction[]=[];
  for(const a of ordered){
    const reason=actionReason(context,a,seen);if(reason)problems.push(reason);seen.push(a);
    if(a.legacyCells||!['solar','retrofit'].includes(a.projectId))for(const cellId of actionCells(context,a)){const p={projectId:a.projectId,cellId};inputs.set(placementKey(p),p);}
  }
  for(const site of context.sites){
    const retrofit=ordered.some(a=>a.buildingId===site.id&&a.projectId==='retrofit'&&!a.legacyCells),solar=ordered.some(a=>a.buildingId===site.id&&a.projectId==='solar'&&!a.legacyCells);
    if(site.construction||!retrofit&&!solar)continue;
    for(const f of site.footprint){
      const initial=f.energy*(event==='heat'?1.2:1),afterRetrofit=initial*(retrofit?(event==='heat'?.55:.65):1);
      const afterSolar=Math.max(0,afterRetrofit-(solar?f.energy*.8*context.world.byId.get(f.cellId)!.sun*(event==='rain'?.42:event==='heat'?.92:1):0));
      energySavings[f.cellId]=(energySavings[f.cellId]||0)+initial-afterSolar;
    }
  }
  const result=evaluateSpatial(context.world,[...inputs.values()],event,{energySavings,cost:actions.reduce((s,a)=>s+actionCost(context,a),0),problems});
  for(const site of context.sites)if(actions.some(a=>a.buildingId===site.id&&a.projectId==='solar')&&actions.some(a=>a.buildingId===site.id&&a.projectId==='retrofit'))result.interactions.push({kind:'note',name:'节能 × 光伏共同上限',detail:'整栋建筑先减少用能，再用屋顶光伏抵扣剩余用能；相邻建筑分别计算，不重复抵扣。',cells:site.footprint.map(f=>f.cellId)});
  return result;
}
export function addBuildingAction(context:BuildingContext,state:BuildingState,a:BuildingAction){
  const error=actionReason(context,a,state.actions);if(error)return {state,error};
  const next={...state,actions:[...state.actions,a]};
  if(!evaluateBuildingPlan(context,next.actions,state.event).feasible)return {state,error:'预算不足，请先移除其他投入或选择另一栋建筑。'};
  return {state:next,error:undefined};
}
export function nearestSite(context:BuildingContext,cellId:string){
  const c=context.world.byId.get(cellId);return c?context.sites.filter(s=>!s.construction).sort((a,b)=>distanceToBuilding(c,a)-distanceToBuilding(c,b)||a.id.localeCompare(b.id))[0]:undefined;
}
export function siteSummary(context:BuildingContext,site:BuildingSite,result:SpatialResult){
  const ids=new Set([...site.footprint.map(f=>f.cellId),...context.world.cells.filter(c=>distanceToBuilding(c,site)<=4).map(c=>c.id)]);
  const selected=result.cells.filter(c=>ids.has(c.cellId)),weight=selected.reduce((s,c)=>s+context.world.byId.get(c.cellId)!.demand,0)||1;
  const avg=(key:'heat'|'runoff'|'comfort'|'initialComfort')=>selected.reduce((s,c)=>s+c[key]*context.world.byId.get(c.cellId)!.demand,0)/weight;
  return {heat:Math.round(avg('heat')*100),runoff:Math.round(avg('runoff')*100),gain:avg('comfort')-avg('initialComfort'),demand:Math.round(selected.reduce((s,c)=>s+context.world.byId.get(c.cellId)!.demand,0)/Math.max(1,selected.length)*100),sun:Math.round(site.footprint.reduce((s,f)=>s+f.area*context.world.byId.get(f.cellId)!.sun,0)/(site.area||1)*100)};
}
export function readBuildingState(raw:string|null,context:BuildingContext):BuildingState{
  const empty=emptyBuildingState(context.config.id);
  try{
    const s=JSON.parse(raw||'null');if(!s)return empty;
    if(s.version===1||s.version===2){
      const previous=readSpatial(raw,context.world,context.config);
      const convert=(placements:Placement[])=>{
        const grouped=new Map<string,BuildingAction>();
        for(const p of placements){const site=nearestSite(context,p.cellId);if(!site)continue;const key=actionKey({projectId:p.projectId,buildingId:site.id});const item=grouped.get(key)||{projectId:p.projectId,buildingId:site.id,legacyCells:[]};item.legacyCells!.push(p.cellId);grouped.set(key,item);}
        return [...grouped.values()];
      };
      return {...empty,actions:convert(previous.placements),event:previous.event,snapshot:previous.snapshot?{actions:convert(previous.snapshot.placements),savedAt:previous.snapshot.savedAt}:null,migrated:true};
    }
    const valid=(v:unknown):v is BuildingAction[]=>Array.isArray(v)&&v.length<=200&&v.every(a=>a&&context.byId.has(a.buildingId)&&MEASURES.some(m=>m.id===a.projectId)&&(!a.legacyCells||Array.isArray(a.legacyCells)&&a.legacyCells.length>0&&a.legacyCells.every((id:unknown)=>typeof id==='string'&&context.world.byId.has(id))&&new Set(a.legacyCells).size===a.legacyCells.length))&&new Set(v.map(actionKey)).size===v.length;
    if(s.version!==3||s.rulesVersion!==BUILDING_VERSION||s.campusId!==context.config.id||!valid(s.actions)||!EVENTS.some(e=>e.id===s.event)||s.snapshot!==null&&(!s.snapshot||!valid(s.snapshot.actions)||typeof s.snapshot.savedAt!=='string'))return empty;
    return {...empty,actions:structuredClone(s.actions),event:s.event,snapshot:structuredClone(s.snapshot),migrated:s.migrated===true};
  }catch{return empty;}
}
