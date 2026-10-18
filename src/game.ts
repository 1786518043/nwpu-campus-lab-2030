export const RULES_VERSION = 'green-campus-0.1';
export type EventId = 'normal' | 'heat' | 'rain' | 'budget';
export type ProjectId = 'retrofit' | 'shuttle' | 'walk' | 'lighting' | 'solar' | 'garden';
export type Project = {
  id: ProjectId; name: string; short: string; site: string; cost: number;
  carbon: number; comfort: number; heatShield: number; rainShield: number;
  description: string; tradeoff: string; location: [number,number]; buildingIds: string[];
};
export const PROJECTS: Project[] = [
  {id:'retrofit',name:'建筑节能改造',short:'节能改造',site:'长安校区图书馆',cost:35,carbon:22,comfort:4,heatShield:10,rainShield:0,description:'改善围护结构与空调运行，在高温情境中降低额外用能。',tradeoff:'前期投入较高，对出行体验改善有限。',location:[5.45,-25.75],buildingIds:['r14477264-0']},
  {id:'shuttle',name:'绿色接驳线路',short:'绿色接驳',site:'生活区—教学区',cost:30,carbon:12,comfort:18,heatShield:0,rainShield:10,description:'沿银河路、长安大道探索生活区至教学区的接驳方案，降雨时维持出行便利。',tradeoff:'概念路线不代表实际校车服务，对建筑用能帮助有限。',location:[10,-65],buildingIds:['362977206','363081241']},
  {id:'walk',name:'步行与骑行改善',short:'慢行网络',site:'校园主干道',cost:20,carbon:6,comfort:10,heatShield:0,rainShield:4,description:'完善连续的步行、骑行空间与遮雨节点。',tradeoff:'减排收益相对温和，仍受天气条件影响。',location:[3,-8],buildingIds:[]},
  {id:'lighting',name:'按需智能照明',short:'智能照明',site:'教学西楼',cost:15,carbon:8,comfort:4,heatShield:3,rainShield:0,description:'按使用时段与空间需求调节照明，减少空置时的用能。',tradeoff:'投入较小，但无法独立解决总体排放问题。',location:[-12,-38],buildingIds:['363091532','363091533','363091534','363091535']},
  {id:'solar',name:'屋顶光伏试点',short:'光伏试点',site:'实验大楼',cost:40,carbon:28,comfort:1,heatShield:0,rainShield:0,description:'在选定屋顶开展清洁能源教学试点，减少常态排放指数。',tradeoff:'持续降雨时，本模型设定减排收益减少 10 点。',location:[-14.76,-20.96],buildingIds:['363081285']},
  {id:'garden',name:'雨水花园与绿荫',short:'雨水花园',site:'启真湖周边',cost:25,carbon:4,comfort:7,heatShield:5,rainShield:12,description:'增加雨水滞蓄与休憩绿荫，改善高温和降雨时的校园体验。',tradeoff:'直接减排收益较低，需要与其他措施组合。',location:[8,0],buildingIds:[]}
];
export const EVENTS: {id:EventId;name:string;tag:string;description:string;budget:number;carbon:number;comfort:number}[] = [
  {id:'normal',name:'常态运行',tag:'规划基准',description:'天气与资源保持稳定。先提出你的第一份绿色校园方案。',budget:100,carbon:0,comfort:0},
  {id:'heat',name:'持续高温',tag:'环境考验',description:'额外用能使排放指数增加 20 点；建筑改造、照明与绿荫可缓解这一变化。',budget:100,carbon:20,comfort:0},
  {id:'rain',name:'连续降雨',tag:'环境考验',description:'体验指数降低 18 点；接驳、慢行设施与雨水花园可缓解影响，光伏收益减少。',budget:100,carbon:0,comfort:-18},
  {id:'budget',name:'预算收紧',tag:'资源考验',description:'可用预算降至 80 点。已有方案会保留，请重新审视投入优先级。',budget:80,carbon:0,comfort:0}
];
export type Contribution = {name:string;carbon:number;comfort:number};
export function evaluate(ids: readonly ProjectId[], eventId: EventId) {
  const projects = PROJECTS.filter(p=>ids.includes(p.id));
  const event = EVENTS.find(e=>e.id===eventId)!;
  const cost = projects.reduce((n,p)=>n+p.cost,0);
  const contributions: Contribution[] = projects.map(p=>({name:p.name,carbon:-p.carbon,comfort:p.comfort}));
  if(eventId==='heat') {
    contributions.push({name:'高温带来的额外用能',carbon:20,comfort:0});
    const relief=projects.reduce((s,p)=>s+p.heatShield,0);
    if(relief) contributions.push({name:'所选措施缓解高温',carbon:-Math.min(20,relief),comfort:0});
  }
  if(eventId==='rain') {
    contributions.push({name:'持续降雨影响',carbon:0,comfort:-18});
    const relief=projects.reduce((s,p)=>s+p.rainShield,0);
    if(relief) contributions.push({name:'所选措施缓解降雨',carbon:0,comfort:Math.min(18,relief)});
    if(ids.includes('solar')) contributions.push({name:'降雨下光伏收益减少',carbon:10,comfort:0});
  }
  const carbon=Math.max(0,100+contributions.reduce((s,p)=>s+p.carbon,0));
  const comfort=Math.min(100,Math.max(0,50+contributions.reduce((s,p)=>s+p.comfort,0)));
  return {cost,budget:event.budget,remaining:event.budget-cost,carbon,comfort,contributions,feasible:cost<=event.budget,carbonMet:carbon<=65,comfortMet:comfort>=75,success:cost<=event.budget&&carbon<=65&&comfort>=75};
}
export type SavedPlan = {ids:ProjectId[];savedAt:string};
export type GameState = {version:1;selected:ProjectId[];event:EventId;snapshot:SavedPlan|null};
export const EMPTY_STATE:GameState = {version:1,selected:[],event:'normal',snapshot:null};
export function validIds(value:unknown):value is ProjectId[] {
  return Array.isArray(value)&&value.length<=PROJECTS.length&&new Set(value).size===value.length&&value.every(x=>PROJECTS.some(p=>p.id===x));
}
export function parseSaved(raw:string|null):GameState {
  try {
    const s=JSON.parse(raw||'null');
    if(s?.version!==1||!validIds(s.selected)||!EVENTS.some(e=>e.id===s.event))return {...EMPTY_STATE};
    if(s.snapshot!==null&&(!s.snapshot||!validIds(s.snapshot.ids)||typeof s.snapshot.savedAt!=='string'))return {...EMPTY_STATE};
    return {version:1,selected:s.selected,event:s.event,snapshot:s.snapshot};
  }catch{return {...EMPTY_STATE};}
}
export function toggleProject(state:GameState,id:ProjectId):{state:GameState;error?:string} {
  if(state.selected.includes(id))return {state:{...state,selected:state.selected.filter(x=>x!==id)}};
  const next=[...state.selected,id];
  if(!evaluate(next,state.event).feasible)return {state,error:'预算不足，请先移除其他措施，再加入这项投入。'};
  return {state:{...state,selected:next}};
}
