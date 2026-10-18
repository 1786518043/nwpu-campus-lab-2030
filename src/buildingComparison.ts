import type {EventId} from './game';
import type {BuildingAction,BuildingContext} from './buildingPlanning';
import {actionKey,actionSignature,evaluateBuildingPlan} from './buildingPlanning';
import {buildingExposure} from './buildingImpact';
import type {SpatialResult,CellResult} from './spatial';

export const COMPARISON_EPS=.005;
export type ComparisonMetric='overall'|'comfort'|'costs'|'heat'|'runoff'|'access'|'roof';
export const COMPARISON_METRICS:{id:ComparisonMetric;name:string;hint:string}[]=[
  {id:'overall',name:'综合利弊',hint:'逐项比较收益与代价，不合成一个胜负分数'},
  {id:'comfort',name:'体验净变化',hint:'体验越高越好；其他代价仍在建筑明细中显示'},
  {id:'costs',name:'负面代价',hint:'分别比较噪声、光扰动与照明用能，越低越好'},
  {id:'heat',name:'热压力',hint:'热压力越低越好，数值不是摄氏温度'},
  {id:'runoff',name:'雨水压力',hint:'雨水压力越低越好，不代表真实排水能力'},
  {id:'access',name:'出行便利',hint:'出行便利越高越好，按完整路网与站点重算'},
  {id:'roof',name:'本栋改造减排贡献',hint:'本栋节能与光伏贡献越高越好；全校排放指数点'}
];
export type ComparisonKind='positive'|'negative'|'mixed'|'neutral';
export const comparisonKindName:Record<ComparisonKind,string>={positive:'B 改善更多',negative:'B 表现更差',mixed:'各有取舍',neutral:'无明显差异'};
export type ComparisonValue={key:string;label:string;a:number;b:number;delta:number;lower:boolean;unit?:string};
export type ComparedBuilding={buildingId:string;values:ComparisonValue[];added:BuildingAction[];removed:BuildingAction[];legacy:boolean};
export type ComparisonDisplay=ComparedBuilding&{kind:ComparisonKind;score:number;positive:ComparisonValue[];negative:ComparisonValue[];value:number|null};
export type PlanComparison={event:EventId;a:SpatialResult;b:SpatialResult;buildings:ComparedBuilding[];routeEnergyA:number;routeEnergyB:number;identical:boolean};
const roofAction=(a:BuildingAction)=>a.projectId==='solar'||a.projectId==='retrofit';
const energy=(r:SpatialResult)=>r.cells.reduce((s,c)=>s+c.energy,0);
const routeEnergy=(r:SpatialResult)=>r.routes.reduce((s,path)=>s+.45+path.length*.018,0);

// This is a full-plan comparison, not a sum of single-action predictions.
// The public function owns both evaluations so the event and budget cannot differ.
export function compareBuildingPlans(context:BuildingContext,actionsA:BuildingAction[],actionsB:BuildingAction[],event:EventId):PlanComparison{
  const a=evaluateBuildingPlan(context,actionsA,event),b=evaluateBuildingPlan(context,actionsB,event);
  const aCells=new Map(a.cells.map(c=>[c.cellId,c])),bCells=new Map(b.cells.map(c=>[c.cellId,c]));
  const baselineEnergy=context.world.cells.reduce((s,c)=>s+c.energy,0);
  const aSignatures=new Set(actionsA.map(actionSignature)),bSignatures=new Set(actionsB.map(actionSignature));
  const identical=aSignatures.size===bSignatures.size&&[...aSignatures].every(s=>bSignatures.has(s));
  // Attribute a roof measure only to the building that owns it. Comparing each
  // plan with removal of this building's roof measures preserves legacy scopes,
  // caps and interaction with the complete plan without crediting nearby roofs.
  const roofContribution=(actions:BuildingAction[],result:SpatialResult,id:string)=>{
    if(!actions.some(p=>p.buildingId===id&&roofAction(p)))return 0;
    const without=evaluateBuildingPlan(context,actions.filter(p=>p.buildingId!==id||!roofAction(p)),event);
    return Math.max(0,(energy(without)-energy(result))/baselineEnergy*100);
  };
  const buildings=context.sites.map(site=>{
    const ids=buildingExposure(context,site),weight=ids.reduce((s,id)=>s+context.world.byId.get(id)!.demand,0)||1;
    const avg=(cells:Map<string,CellResult>,key:'comfort'|'heat'|'runoff'|'access'|'noise'|'ecology'|'light'|'synergy')=>ids.reduce((s,id)=>s+cells.get(id)![key]*context.world.byId.get(id)!.demand,0)/weight;
    const values:ComparisonValue[]=[];
    const add=(key:string,label:string,av:number,bv:number,lower=false,unit?:string)=>values.push({key,label,a:av,b:bv,delta:bv-av,lower,unit});
    add('comfort','周边体验',avg(aCells,'comfort'),avg(bCells,'comfort'));
    add('heat','热压力',avg(aCells,'heat')*100,avg(bCells,'heat')*100,true);
    add('runoff','雨水压力',avg(aCells,'runoff')*100,avg(bCells,'runoff')*100,true);
    add('access','出行便利',avg(aCells,'access')*100,avg(bCells,'access')*100);
    add('light','夜间体验增益',avg(aCells,'light')*5,avg(bCells,'light')*5);
    add('synergy','绿荫协同增益',avg(aCells,'synergy'),avg(bCells,'synergy'));
    add('noise','噪声代价',avg(aCells,'noise')*10,avg(bCells,'noise')*10,true);
    add('ecology','光扰动',avg(aCells,'ecology')*100,avg(bCells,'ecology')*100,true);
    add('lightingEnergy','照明用能指数',avg(aCells,'light')*1.2,avg(bCells,'light')*1.2,true);
    const roofA=roofContribution(actionsA,a,site.id),roofB=identical?roofA:roofContribution(actionsB,b,site.id);
    add('roof','本栋改造减排贡献',roofA,roofB,false,'全校指数点');
    const owned=(actions:BuildingAction[])=>actions.filter(p=>p.buildingId===site.id).sort((x,y)=>actionKey(x).localeCompare(actionKey(y)));
    return {buildingId:site.id,values,added:owned(actionsB).filter(p=>!aSignatures.has(actionSignature(p))),removed:owned(actionsA).filter(p=>!bSignatures.has(actionSignature(p))),legacy:[...owned(actionsA),...owned(actionsB)].some(p=>!!p.legacyCells)};
  });
  return {event,a,b,buildings,routeEnergyA:routeEnergy(a),routeEnergyB:routeEnergy(b),identical};
}
export function matchesComparisonMetric(key:string,metric:ComparisonMetric){
  return metric==='overall'||(metric==='costs'?['noise','ecology','lightingEnergy'].includes(key):key===metric);
}
export function comparisonDisplay(building:ComparedBuilding,metric:ComparisonMetric):ComparisonDisplay{
  const values=building.values.filter(v=>matchesComparisonMetric(v.key,metric));
  const positive=values.filter(v=>Math.abs(v.delta)>=COMPARISON_EPS&&(v.lower?-v.delta:v.delta)>0);
  const negative=values.filter(v=>Math.abs(v.delta)>=COMPARISON_EPS&&(v.lower?-v.delta:v.delta)<0);
  const kind=positive.length&&negative.length?'mixed':positive.length?'positive':negative.length?'negative':'neutral';
  return {...building,kind,positive,negative,score:Math.max(0,...values.map(v=>Math.abs(v.delta))),value:values.length===1?values[0].delta:null};
}
export function comparisonBuildings(comparison:PlanComparison,metric:ComparisonMetric){
  return comparison.buildings.map(b=>comparisonDisplay(b,metric)).filter(b=>b.kind!=='neutral'||b.added.length||b.removed.length).sort((a,b)=>b.score-a.score||a.buildingId.localeCompare(b.buildingId));
}
