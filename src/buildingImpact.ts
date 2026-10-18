import type {EventId} from './game';
import type {BuildingAction,BuildingContext,BuildingSite} from './buildingPlanning';
import {actionCells,actionKey,actionReason,evaluateBuildingPlan} from './buildingPlanning';
import type {CellResult,InfluenceField,SpatialResult} from './spatial';
import {FIELD_RADIUS} from './spatial';
import {distanceToSegment} from './mapGeometry';

export type ImpactKind='positive'|'negative'|'mixed';
export type ImpactEffect={key:string;label:string;value:number;unit?:string};
export type BuildingImpact={buildingId:string;positive:ImpactEffect[];negative:ImpactEffect[];netComfort:number;kind:ImpactKind;score:number};
export type ImpactRange=InfluenceField&{potential?:boolean};
export type ActionImpact={
  action:BuildingAction;status:'preview'|'installed'|'unavailable';plan:'A'|'B';
  reason:string|null;overBudget:number;buildings:BuildingImpact[];ranges:ImpactRange[];
  routes:string[][];routeEnergyDelta:number;idleShuttle:boolean;legacy:boolean;
};
const EPS=.005;
const exposureCache=new WeakMap<BuildingContext,Map<string,string[]>>();
function exposure(context:BuildingContext,site:BuildingSite){
  let cached=exposureCache.get(context);if(!cached){cached=new Map();exposureCache.set(context,cached);}
  if(!cached.has(site.id)){
    const ids=new Set(site.footprint.map(f=>f.cellId));
    for(const c of context.world.cells)if(site.buildings.some(b=>b.points.some((p,i)=>distanceToSegment([c.x,c.z],p,b.points[(i+1)%b.points.length])<=4)))ids.add(c.id);
    cached.set(site.id,[...ids]);
  }
  return cached.get(site.id)!;
}
const routeEnergy=(routes:string[][])=>routes.reduce((sum,path)=>sum+.45+path.length*.018,0);
const routeKey=(r:string[])=>[r.join('|'),[...r].reverse().join('|')].sort()[0];

/** A counterfactual for one action, under the same event and surrounding plan.
 * Existing actions are compared with their removal; new actions with addition.
 * Preview never writes a save, and A never borrows B's actions.
 */
export function evaluateActionImpact(context:BuildingContext,actions:BuildingAction[],event:EventId,selection:BuildingAction,plan:'A'|'B'='B',evaluated?:SpatialResult):ActionImpact{
  const installed=actions.find(a=>actionKey(a)===actionKey(selection)),action=installed||selection;
  const reason=installed?null:plan==='A'?'方案 A 未配置这项措施。返回 B 可预览新增效果。':actionReason(context,action,actions);
  const result:ActionImpact={action,status:reason?'unavailable':installed?'installed':'preview',plan,reason,overBudget:0,buildings:[],ranges:[],routes:[],routeEnergyDelta:0,idleShuttle:false,legacy:!!action.legacyCells};
  if(reason)return result;
  const shown=evaluated||evaluateBuildingPlan(context,actions,event);
  const before=installed?evaluateBuildingPlan(context,actions.filter(a=>actionKey(a)!==actionKey(action)),event):shown;
  const after=installed?shown:evaluateBuildingPlan(context,[...actions,action],event);
  result.overBudget=Math.max(0,-after.remaining);
  const oldFields=new Map(before.fields.map(f=>[`${f.kind}@${f.cellId}`,f.strength]));
  result.ranges=after.fields.filter(f=>Math.abs(f.strength-(oldFields.get(`${f.kind}@${f.cellId}`)||0))>1e-8);
  const oldRoutes=new Set(before.routes.map(routeKey));
  result.routes=after.routes.filter(r=>!oldRoutes.has(routeKey(r)));
  result.routeEnergyDelta=routeEnergy(after.routes)-routeEnergy(before.routes);
  if(action.projectId==='shuttle'){
    const targets=actionCells(context,action);
    const inactive=targets.filter(id=>!after.fields.some(f=>f.kind==='shuttle'&&f.cellId===id));
    result.idleShuttle=inactive.length===targets.length;
    result.ranges.push(...inactive.map(cellId=>({kind:'shuttle' as const,cellId,radius:FIELD_RADIUS.shuttle,strength:0,potential:true})));
  }
  const oldCells=new Map(before.cells.map(c=>[c.cellId,c])),newCells=new Map(after.cells.map(c=>[c.cellId,c]));
  const roof=action.projectId==='solar'||action.projectId==='retrofit';
  const totalEnergy=context.world.cells.reduce((sum,c)=>sum+c.energy,0);
  // A whole-building roof action never grants savings to another building that
  // happens to share a computation cell. Legacy actions retain their old scope.
  const candidates=roof&&!action.legacyCells?[context.byId.get(action.buildingId)!]:context.sites;
  for(const site of candidates){
    const ids=exposure(context,site),weight=ids.reduce((sum,id)=>sum+context.world.byId.get(id)!.demand,0)||1;
    const avg=(key:keyof Pick<CellResult,'heat'|'runoff'|'access'|'comfort'|'noise'|'ecology'|'light'|'synergy'>)=>ids.reduce((sum,id)=>sum+(newCells.get(id)![key]-oldCells.get(id)![key])*context.world.byId.get(id)!.demand,0)/weight;
    const positive:ImpactEffect[]=[],negative:ImpactEffect[]=[];
    const add=(key:string,label:string,value:number,lower=false,unit?:string)=>{if(Math.abs(value)<EPS)return;(value*(lower?-1:1)>0?positive:negative).push({key,label,value,unit});};
    if(!roof){
      add('heat','热压力',avg('heat')*100,true);add('runoff','雨水压力',avg('runoff')*100,true);
      add('access','出行便利',avg('access')*100);add('light','夜间体验',avg('light')*5);
      add('synergy','绿荫协同',avg('synergy'));
      add('noise','噪声代价',avg('noise')*10,true);add('ecology','光扰动',avg('ecology')*100,true);
      const initial=ids.reduce((sum,id)=>sum+oldCells.get(id)!.energy,0);
      const changed=ids.reduce((sum,id)=>sum+newCells.get(id)!.energy-oldCells.get(id)!.energy,0);
      add('energy','周边用能',initial>1e-6?changed/initial*100:changed*100,true,'%');
    }else{
      const ids=action.legacyCells?site.footprint.map(f=>f.cellId):actionCells(context,action);
      const change=ids.reduce((sum,id)=>sum+newCells.get(id)!.energy-oldCells.get(id)!.energy,0);
      add('energy',action.legacyCells?'旧范围排放贡献':'本措施排放贡献',change/totalEnergy*100,true);
    }
    if(!positive.length&&!negative.length)continue;
    const netComfort=roof?0:avg('comfort');
    result.buildings.push({buildingId:site.id,positive,negative,netComfort,kind:positive.length&&negative.length?'mixed':positive.length?'positive':'negative',score:Math.abs(netComfort)+[...positive,...negative].reduce((s,e)=>s+Math.abs(e.value),0)*.1});
  }
  result.buildings.sort((a,b)=>b.score-a.score||a.buildingId.localeCompare(b.buildingId));
  return result;
}
export const impactKindName:Record<ImpactKind,string>={positive:'正面影响',negative:'负面影响',mixed:'利弊并存'};
export function impactNumber(n:number){return `${n>0?'+':n<0?'−':''}${Math.abs(n)<.01&&n!==0?'<0.01':Number(Math.abs(n).toFixed(2))}`;}
