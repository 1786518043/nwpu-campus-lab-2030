import type {CampusId} from './campusTypes';
import type {EventId,ProjectId} from './game';
import {EVENTS} from './game';
import type {BuildingAction,BuildingContext,BuildingSite,BuildingState} from './buildingPlanning';
import {BUILDING_VERSION,actionCells,evaluateBuildingPlan,readBuildingState} from './buildingPlanning';
import {buildingExposure} from './buildingImpact';
import type {CellResult,SpatialResult} from './spatial';
import {CELL_SIZE} from './spatial';

export const PLAY_VERSION=1;
export type MissionId='cool'|'shade'|'connect'|'balance';
export type DiscoveryId='shade'|'walk-network'|'shuttle-network'|'last-mile';
export const MISSIONS:{id:MissionId;title:string;subtitle:string;brief:string;hint:string}[]=[
  {id:'cool',title:'一处清凉',subtitle:'从楼旁的一片绿荫开始',brief:'为一栋建筑配置雨水花园，让它周边的热压力比同情境空白方案降低至少 1 点。',hint:'试着选择有活动需求的建筑。热压力是教学指数，不是摄氏温度。'},
  {id:'shade',title:'绿荫上学路',subtitle:'发现设施之间的配合',brief:'让花园与慢行路段在空间上配合，触发「花园 × 慢行绿荫」协同。',hint:'可以从同一栋楼的两项措施开始。只买齐两种设施还不够，它们的作用范围需要相遇。'},
  {id:'connect',title:'接驳连起来',subtitle:'让孤立站点成为服务',brief:'配置至少两个有效站点，沿已有车辆道路形成一段接驳连接。',hint:'站点需要沿路连通并保持间距。连通后也要留意宿舍噪声与线路运行用能。'},
  {id:'balance',title:'2030 综合挑战',subtitle:'在有限预算里做出取舍',brief:'完成原有教学挑战：同情境减排至少 2%，体验提高至少 1，模拟活动需求覆盖至少 12%。',hint:'保存 A，再调整 B，找到适合当前情境的组合。切换任务会保留你的建筑措施。'},
];
export const DISCOVERIES:{id:DiscoveryId;name:string;trigger:string;projects:ProjectId[];recipe:string;benefit:string;tradeoff:string}[]=[
  {id:'shade',name:'绿荫步道',trigger:'花园 × 慢行绿荫',projects:['garden','walk'],recipe:'在相邻范围配置花园与慢行路段。',benefit:'在重叠范围增加步行舒适度，高温时协同更强。',tradeoff:'需要两类投入；同类设施重复覆盖不会获得全部叠加收益。'},
  {id:'walk-network',name:'步步相连',trigger:'连续慢行网络',projects:['walk'],recipe:'让改造的已有道路形成相连路段；一栋楼的整段慢行也可能满足。',benefit:'相连路段获得完整服务系数，孤立路段按 55% 计算。',tradeoff:'按实际覆盖路段计价，路段更长也需要更多预算。'},
  {id:'shuttle-network',name:'两站成线',trigger:'接驳线路已连通',projects:['shuttle'],recipe:'至少两个站点沿车辆道路连通，且保持适当间距。',benefit:'启用站点周围的接驳服务。',tradeoff:'线路运行增加用能，靠近宿舍的站点可能产生噪声。'},
  {id:'last-mile',name:'最后一段路',trigger:'慢行 × 接驳',projects:['walk','shuttle'],recipe:'让慢行路段接入已经连通的接驳站点。',benefit:'扩大末端接入范围并改善换乘体验。',tradeoff:'需要先启用接驳线路，仍需承担站点与线路的代价。'},
];

// Verified starting points, not automatic placements or a prescribed solution.
// Names always come from the existing map. Geometry and scoring stay untouched.
const STARTS:Record<CampusId,Record<MissionId,BuildingAction[]>>={
  changan:{
    cool:[{buildingId:'362977206',projectId:'garden'}],
    shade:[{buildingId:'362977206',projectId:'garden'},{buildingId:'362977206',projectId:'walk'}],
    connect:[{buildingId:'177231713',projectId:'shuttle'},{buildingId:'177231719',projectId:'shuttle'}],
    balance:[{buildingId:'r14477260-0',projectId:'solar'},{buildingId:'362977206',projectId:'garden'}],
  },
  youyi:{
    cool:[{buildingId:'1267628381',projectId:'garden'}],
    shade:[{buildingId:'1267628381',projectId:'garden'},{buildingId:'1267628381',projectId:'walk'}],
    connect:[{buildingId:'1267628305',projectId:'shuttle'},{buildingId:'1267628489',projectId:'shuttle'}],
    balance:[{buildingId:'1267628460',projectId:'solar'},{buildingId:'1267628245',projectId:'garden'}],
  },
};
export const missionStarts=(context:BuildingContext,id:MissionId)=>STARTS[context.config.id][id].filter(a=>context.byId.has(a.buildingId));
export const playStorageKey=(id:CampusId)=>`campus2030:play:v1:${id}`;
export type PlayEvidence={at:string;event:EventId;rulesVersion:string;actions:BuildingAction[]};
export type PlayProgress={version:1;campusId:CampusId;activeMission:MissionId|null;completed:Partial<Record<MissionId,PlayEvidence>>;discoveries:Partial<Record<DiscoveryId,PlayEvidence>>};
export const emptyPlayProgress=(id:CampusId):PlayProgress=>({version:PLAY_VERSION,campusId:id,activeMission:'cool',completed:{},discoveries:{}});
export type MissionGoal={label:string;detail:string;met:boolean;ratio:number};
export type MissionStatus={id:MissionId;goals:MissionGoal[];ready:boolean};
export type ActiveDiscovery={id:DiscoveryId;buildingIds:string[]};

function neighborhood(context:BuildingContext,site:BuildingSite,result:SpatialResult,baseline:SpatialResult){
  const now=new Map(result.cells.map(c=>[c.cellId,c])),before=new Map(baseline.cells.map(c=>[c.cellId,c]));
  const ids=buildingExposure(context,site),weight=ids.reduce((sum,id)=>sum+context.world.byId.get(id)!.demand,0)||1;
  const avg=(cells:Map<string,CellResult>,key:'heat'|'runoff'|'access'|'comfort'|'noise'|'ecology'|'light')=>ids.reduce((sum,id)=>sum+(cells.get(id)?.[key]||0)*context.world.byId.get(id)!.demand,0)/weight;
  return {heat:(avg(before,'heat')-avg(now,'heat'))*100,runoff:(avg(before,'runoff')-avg(now,'runoff'))*100,access:(avg(now,'access')-avg(before,'access'))*100,comfort:avg(now,'comfort')-avg(before,'comfort'),noise:(avg(now,'noise')-avg(before,'noise'))*10,ecology:(avg(now,'ecology')-avg(before,'ecology'))*100,light:(avg(now,'light')-avg(before,'light'))*5};
}
export function activeDiscoveries(context:BuildingContext,actions:BuildingAction[],result:SpatialResult):ActiveDiscovery[]{
  return DISCOVERIES.flatMap(d=>{
    const hits=result.interactions.filter(i=>i.kind==='positive'&&i.name===d.trigger);
    if(!hits.length)return [];
    const cells=new Set(hits.flatMap(i=>i.cells));
    if(d.id==='last-mile'){
      // Include only the shuttle component serving these feeder walks, not an
      // unrelated active route elsewhere on campus.
      const walks=[...cells].map(id=>context.world.byId.get(id)!);
      const stops=new Set(result.fields.filter(f=>f.kind==='shuttle'&&walks.some(w=>{const s=context.world.byId.get(f.cellId)!;return Math.hypot(w.x-s.x,w.z-s.z)/CELL_SIZE<=1.5;})).map(f=>f.cellId));
      let changed=true;
      while(changed){changed=false;for(const route of result.routes){const a=route.from,b=route.to;if(stops.has(a)&&!stops.has(b)){stops.add(b);changed=true;}if(stops.has(b)&&!stops.has(a)){stops.add(a);changed=true;}}}
      stops.forEach(id=>cells.add(id));
    }
    const buildingIds=[...new Set(actions.filter(a=>d.projects.includes(a.projectId)&&actionCells(context,a).some(id=>cells.has(id))).map(a=>a.buildingId))].sort();
    return [{id:d.id,buildingIds}];
  });
}
export function evaluateMissions(context:BuildingContext,actions:BuildingAction[],result:SpatialResult,baseline:SpatialResult):MissionStatus[]{
  const gardens=actions.filter(a=>a.projectId==='garden');
  const cooling=Math.max(0,...gardens.map(a=>context.byId.get(a.buildingId)).filter((s):s is BuildingSite=>!!s).map(s=>neighborhood(context,s,result,baseline).heat));
  const has=(name:string)=>result.interactions.some(i=>i.kind==='positive'&&i.name===name);
  const goal=(label:string,value:number,target:number,detail:string):MissionGoal=>({label,detail,met:value>=target,ratio:Math.max(0,Math.min(1,value/target))});
  const feasible:MissionGoal={label:'预算内且布局有效',detail:`已用 ${result.cost} / ${result.budget} 建设点${result.problems.length?' · 存在布局冲突':''}`,met:result.feasible,ratio:result.feasible?1:0};
  const goals:Record<MissionId,MissionGoal[]>={
    cool:[goal('配置一处雨水花园',gardens.length,1,`${gardens.length} 处已配置`),goal('花园所属楼周边热压力下降 ≥1',cooling,1,`最大下降 ${cooling.toFixed(2)} 点 · 同情境空白方案为基线`)],
    shade:[goal('触发花园与慢行绿荫协同',Number(has('花园 × 慢行绿荫')),1,has('花园 × 慢行绿荫')?'作用范围已形成协同':'等待花园与慢行的作用范围相遇')],
    connect:[goal('启用至少两个接驳站点',result.fields.filter(f=>f.kind==='shuttle').length,2,`${result.fields.filter(f=>f.kind==='shuttle').length} 个有效站点`),goal('形成至少一段道路连接',result.routes.length,1,`${result.routes.length} 段已连通`)],
    balance:[goal('同情境减排 ≥2%',result.reduction,2,`当前 ${result.reduction}%`),goal('体验提高 ≥1',result.comfortGain,1,`当前 +${result.comfortGain}`),goal('模拟需求覆盖 ≥12%',result.coverage,12,`当前 ${result.coverage}%`)],
  };
  return MISSIONS.map(m=>{const checks=[...goals[m.id],feasible];return {id:m.id,goals:checks,ready:checks.every(g=>g.met)};});
}
const evidence=(state:BuildingState,at:string):PlayEvidence=>({at,event:state.event,rulesVersion:BUILDING_VERSION,actions:structuredClone(state.actions)});
export function discoverFromPlan(progress:PlayProgress,context:BuildingContext,state:BuildingState,result:SpatialResult,at:string):PlayProgress{
  if(progress.campusId!==state.campusId||state.campusId!==context.config.id||!result.feasible)return progress;
  const fresh=activeDiscoveries(context,state.actions,result).filter(d=>!progress.discoveries[d.id]);
  if(!fresh.length)return progress;
  return {...progress,discoveries:{...progress.discoveries,...Object.fromEntries(fresh.map(d=>[d.id,evidence(state,at)]))}};
}
export function completeMission(progress:PlayProgress,context:BuildingContext,state:BuildingState,id:MissionId,at:string):PlayProgress{
  if(progress.campusId!==state.campusId||context.config.id!==state.campusId)return progress;
  const result=evaluateBuildingPlan(context,state.actions,state.event),baseline=evaluateBuildingPlan(context,[],state.event);
  if(!evaluateMissions(context,state.actions,result,baseline).find(m=>m.id===id)?.ready)return progress;
  return {...progress,completed:{...progress.completed,[id]:evidence(state,at)}};
}

/** Optional learning history has its own key; corrupt history cannot erase a plan.
 * Evidence is re-evaluated on load, including old action scopes and feasibility. */
export function readPlayProgress(raw:string|null,context:BuildingContext):PlayProgress{
  const empty=emptyPlayProgress(context.config.id);
  try{
    const data=JSON.parse(raw||'null');
    if(!data||data.version!==PLAY_VERSION||data.campusId!==context.config.id)return empty;
    const activeMission=data.activeMission===null?null:MISSIONS.find(m=>m.id===data.activeMission)?.id||'cool';
    const readEvidence=(item:unknown):{record:PlayEvidence;state:BuildingState;result:SpatialResult}|null=>{
      if(!item||typeof item!=='object')return null;
      const e=item as PlayEvidence;
      if(typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at))||e.rulesVersion!==BUILDING_VERSION||!EVENTS.some(x=>x.id===e.event)||!Array.isArray(e.actions)||!e.actions.length)return null;
      const state=readBuildingState(JSON.stringify({version:3,rulesVersion:e.rulesVersion,campusId:context.config.id,event:e.event,actions:e.actions,snapshot:null}),context);
      if(!state.actions.length)return null;
      const result=evaluateBuildingPlan(context,state.actions,state.event);
      return result.feasible?{record:evidence(state,e.at),state,result}:null;
    };
    const completed:PlayProgress['completed']={},discoveries:PlayProgress['discoveries']={};
    for(const m of MISSIONS){const e=readEvidence(data.completed?.[m.id]);if(e&&evaluateMissions(context,e.state.actions,e.result,evaluateBuildingPlan(context,[],e.state.event)).find(s=>s.id===m.id)?.ready)completed[m.id]=e.record;}
    for(const d of DISCOVERIES){const e=readEvidence(data.discoveries?.[d.id]);if(e&&activeDiscoveries(context,e.state.actions,e.result).some(a=>a.id===d.id))discoveries[d.id]=e.record;}
    return {...empty,activeMission,completed,discoveries};
  }catch{return empty;}
}

export type CampusVoice={id:string;character:'student'|'teacher'|'staff';role:string;tone:'wish'|'positive'|'tradeoff';quote:string;evidence:string};
export function campusVoices(context:BuildingContext,actions:BuildingAction[],event:EventId,result:SpatialResult,baseline:SpatialResult,siteId:string|null):CampusVoice[]{
  const site=siteId?context.byId.get(siteId):undefined;
  if(!site)return [{id:'welcome',character:'student',role:'虚拟同学 · 校园观察员',tone:'wish',quote:'选一栋熟悉的楼吧。我们会根据方案里的变化，说说这里的收获和烦恼。',evidence:'选择建筑后，反馈采用当前查看方案的完整计算结果。'}];
  const n=neighborhood(context,site,result,baseline),voices:CampusVoice[]=[];
  const add=(id:string,role:string,tone:CampusVoice['tone'],quote:string,proof:string)=>voices.push({id,character:role.includes('老师')?'teacher':role.includes('职工')?'staff':'student',role,tone,quote,evidence:proof});
  if(event==='rain'&&n.runoff>=.01)add('rain','虚拟老师 · 校园观察','positive','花园缓解了楼旁的雨水压力，下雨天的方案也值得继续研究。',`周边雨水压力下降 ${n.runoff.toFixed(2)} 点`);
  else if(n.heat>=.01)add('cool','虚拟同学 · 日常通勤','positive','楼旁多了绿荫，走过这里时，热压力比原来缓和了一些。',`周边热压力下降 ${n.heat.toFixed(2)} 点`);
  if(n.access>=.01)add('access','虚拟同学 · 日常通勤','positive','楼旁的出行条件有改善，试着沿地图看看哪些路和站点连起来了。',`周边出行便利提高 ${n.access.toFixed(2)} 点`);
  else if(n.light>=.01)add('light','虚拟同学 · 晚间活动','positive','这附近的夜间照明带来了体验改善，也想知道它会不会打扰周围。',`周边夜间体验增益 ${n.light.toFixed(2)} 点`);
  if(!voices.length&&actions.some(a=>a.buildingId===site.id&&['solar','retrofit'].includes(a.projectId))){
    const without=evaluateBuildingPlan(context,actions.filter(a=>a.buildingId!==site.id||!['solar','retrofit'].includes(a.projectId)),event);
    const saving=without.carbon-result.carbon;
    if(saving>=.01)add('energy','虚拟职工 · 后勤维护','positive','这栋楼的屋顶或节能改造贡献了减排，我们可以再看看周边体验怎么改善。',`本栋改造边际贡献约 ${saving.toFixed(2)} 个全校排放指数点`);
  }
  // Costs remain separate, even when net comfort improves.
  if(n.noise>=.005)add('noise','虚拟同学 · 住宿观察','tradeoff','站点启用后，这片区域里的宿舍受到了噪声影响，便利和安静都需要考虑。',`周边噪声代价 ${n.noise.toFixed(2)} 点`);
  if(n.ecology>=.005)add('ecology','虚拟老师 · 生态观察','tradeoff','照明的影响落到了周边绿地或水边，亮起来的同时，也增加了光扰动。',`周边光扰动 ${n.ecology.toFixed(2)} 点`);
  const ownedStops=actions.filter(a=>a.buildingId===site.id&&a.projectId==='shuttle').flatMap(a=>actionCells(context,a));
  if(ownedStops.length&&!result.fields.some(f=>f.kind==='shuttle'&&ownedStops.includes(f.cellId)))add('idle','虚拟同学 · 等车的人','wish','这里已经有站点了，但还没连成服务。沿车辆道路再找一个合适的站点吧。','本楼配置的站点尚未启用，没有接驳出行收益。');
  if(!voices.length)add('wish',site.kind==='dorm'?'虚拟同学 · 住宿观察':site.kind==='dining'?'虚拟职工 · 后勤维护':'虚拟老师 · 校园观察','wish','这里还没有明显的体验变化。看看楼旁能否增加花园，或改善通行条件？',`周边体验较同情境空白方案 ${n.comfort>=0?'+':''}${n.comfort.toFixed(2)} 点`);
  return voices;
}
