import {useEffect,useMemo,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {Leaf,MapPin,Undo2,RotateCcw,X,Download,Info,Bookmark,ArrowUpRight,Check,Target,Building2,ScanSearch} from 'lucide-react';
import CampusMap from './CampusMap';
import ImpactSummary from './ImpactSummary';
import {evaluateActionImpact} from './buildingImpact';
import ComparisonSummary from './ComparisonSummary';
import {compareBuildingPlans} from './buildingComparison';
import type {ComparisonMetric} from './buildingComparison';
import {CAMPUSES,CAMPUS_IDS,storageKey,parseCampusId} from './campuses';
import type {CampusConfig,CampusId} from './campusTypes';
import type {EventId,ProjectId} from './game';
import {MEASURES,measure} from './spatial';
import {BUILDING_VERSION,createBuildingContext,emptyBuildingState,readBuildingState,evaluateBuildingPlan,addBuildingAction,actionReason,actionCost,actionKey,actionSignature,actionCells,nearestSite,siteSummary} from './buildingPlanning';
import type {BuildingState,BuildingAction,BuildingContext} from './buildingPlanning';

const conditions:{id:EventId;name:string;description:string}[]=[
  {id:'normal',name:'常态运行',description:'以相同建筑和活动需求为基线，观察布局的空间收益。'},
  {id:'heat',name:'持续高温',description:'用能上升、热压力增强。建筑节能和花园—慢行协同更重要。'},
  {id:'rain',name:'连续降雨',description:'雨水压力增强、光伏产出降低。楼旁花园改善邻近硬化区域。'},
  {id:'budget',name:'预算收紧',description:'预算从 100 降为 80。保留布局并标出超支，A/B 采用同一预算。'},
];
const descriptions:Record<ProjectId,{description:string;rule:string;scope:string}>={
  retrofit:{scope:'整栋建筑',description:'改善整栋建筑的围护和设备效率，体量与用能决定投入和收益。',rule:'覆盖整栋建筑的实际轮廓。楼群的关联体块一起改造，不能重复抵扣光伏收益。'},
  solar:{scope:'整栋屋顶',description:'在这栋建筑的可用屋顶配置光伏，楼体越大，可利用的屋顶越多。',rule:'按完整建筑轮廓计算，扣除中庭。日照遮挡、天气和本栋剩余用能共同限制产出。'},
  garden:{scope:'建筑周边',description:'在楼旁可用空地配置雨水花园，改善周边热压力和雨水压力。',rule:'自动匹配邻近开放地表，不占用道路、水体、球场或施工区。靠近慢行设施时获得绿荫协同。'},
  walk:{scope:'楼前道路',description:'改善楼前相连的步行路段，与周边建筑和接驳设施形成联系。',rule:'根据附近已有道路确定实施路段，连续慢行和站点接入都会影响服务效果。'},
  shuttle:{scope:'入口附近道路',description:'在这栋建筑附近的车辆道路设置站点，与其他建筑的站点形成接驳服务。',rule:'至少两个站点沿道路连通且保持一定间距。靠近宿舍会增加噪声，线路运行另计用能。'},
  lighting:{scope:'建筑周边',description:'补足楼旁夜间照明，提高周边活动体验，同时考虑用能与光扰动。',rule:'选择附近可用地表，不占水体和保护场地。对绿地、水边及新增花园的影响参与计算。'},
};
const kindName:Record<string,string>={academic:'教学科研',dorm:'学生住宿',library:'图书阅览',dining:'餐饮服务',sport:'体育设施',public:'公共建筑'};
const delta=(n:number)=>`${n>0?'+':''}${Math.round(n*10)/10}`;
const publicDetail=(text:string)=>text.replace('至少相隔三个网格步长','保持适当服务间距').replace('可以后退一格','可以改选邻近建筑').replaceAll('网格','区域').replaceAll('本格','本栋建筑').replaceAll('地块','区域');
function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
  return <dialog ref={ref} className="dialog spatial-dialog" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="dialog-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭弹窗"><X size={20}/></button></div><div className="dialog-body">{children}</div></dialog>;
}
function initial(config:CampusConfig,context:BuildingContext){
  let raw:string|null;try{raw=localStorage.getItem(storageKey(config.id));}catch{return emptyBuildingState(config.id);}
  try{if(raw&&!localStorage.getItem(`${storageKey(config.id)}:before-building`))localStorage.setItem(`${storageKey(config.id)}:before-building`,raw);}catch{/* Preserve readable progress when storage is full. */}
  return readBuildingState(raw,context);
}
export default function App(){
  const [id,setId]=useState<CampusId>(()=>{try{return parseCampusId(localStorage.getItem('campus2030:active-campus'));}catch{return 'changan';}});
  return <CampusGame key={id} config={CAMPUSES[id]} onCampusChange={id=>{setId(id);try{localStorage.setItem('campus2030:active-campus',id);}catch{/* optional persistence */}}}/>;
}
function CampusGame({config,onCampusChange}:{config:CampusConfig;onCampusChange:(id:CampusId)=>void}){
  const context=useMemo(()=>createBuildingContext(config),[config]);
  const [state,setState]=useState<BuildingState>(()=>initial(config,context)),[history,setHistory]=useState<BuildingState[]>([]);
  const [tool,setTool]=useState<ProjectId>('solar'),[selected,setSelected]=useState<string|null>(null),[search,setSearch]=useState(''),[focusRequest,setFocusRequest]=useState(0);
  const [tab,setTab]=useState<'projects'|'events'|'compare'>('projects'),[showA,setShowA]=useState(false);
  const [impactInspection,setImpactInspection]=useState<{id:string;serial:number}|null>(null);
  const [showCompare,setShowCompare]=useState(false),[comparisonMetric,setComparisonMetric]=useState<ComparisonMetric>('overall');
  const [comparisonSelected,setComparisonSelected]=useState<string|null>(null),[comparisonFocus,setComparisonFocus]=useState(0);
  const [modal,setModal]=useState<'help'|'sources'|'rules'|'reset'|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[storageError,setStorageError]=useState(false);
  const current=useMemo(()=>evaluateBuildingPlan(context,state.actions,state.event),[context,state.actions,state.event]);
  const baseline=useMemo(()=>evaluateBuildingPlan(context,[],state.event),[context,state.event]);
  const a=useMemo(()=>state.snapshot?evaluateBuildingPlan(context,state.snapshot.actions,state.event):null,[context,state.snapshot,state.event]);
  const comparison=useMemo(()=>state.snapshot?compareBuildingPlans(context,state.snapshot.actions,state.actions,state.event):null,[context,state.snapshot,state.actions,state.event]);
  const chosen=selected?context.byId.get(selected):null,definition=measure(tool),description=descriptions[tool];
  const proposed:BuildingAction|null=selected?{buildingId:selected,projectId:tool}:null;
  const existing=state.actions.find(p=>p.buildingId===selected&&p.projectId===tool);
  const reason=proposed?actionReason(context,proposed,state.actions):'先在三维校园或建筑列表中选择一栋建筑。';
  const candidate=useMemo(()=>proposed&&!reason&&!showA?evaluateBuildingPlan(context,[...state.actions,proposed],state.event):null,[context,state.actions,state.event,selected,tool,reason,showA]);
  const shown=showA&&!showCompare&&a?a:current,shownActions=showA&&!showCompare&&state.snapshot?state.snapshot.actions:state.actions;
  const impact=useMemo(()=>selected&&!showCompare?evaluateActionImpact(context,shownActions,state.event,{buildingId:selected,projectId:tool},showA?'A':'B',shown):null,[context,shownActions,state.event,selected,tool,showA,shown,showCompare]);
  const local=chosen?siteSummary(context,chosen,shown):null,localBase=chosen?siteSummary(context,chosen,baseline):null;
  const nextLocal=chosen&&candidate?siteSummary(context,chosen,candidate):null;
  const condition=conditions.find(c=>c.id===state.event)!;
  const feedback=useMemo(()=>{
    const seen=new Set<string>();
    return shown.interactions.map(effect=>({effect,sites:[...new Set(effect.cells.map(id=>shownActions.find(a=>actionCells(context,a).includes(id))?.buildingId||nearestSite(context,id)?.id).filter((id):id is string=>!!id))]})).filter(({effect,sites})=>{const key=effect.name+sites.join('|');if(seen.has(key))return false;seen.add(key);return true;});
  },[context,shown,shownActions]);
  const buildings=useMemo(()=>context.sites.filter(s=>s.name.includes(search.trim())||s.id===selected).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')),[context,search,selected]);
  useEffect(()=>{try{localStorage.setItem(storageKey(config.id),JSON.stringify(state));setStorageError(false);}catch{setStorageError(true);}},[state,config.id]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(timer);},[notice]);
  useEffect(()=>{if(!state.snapshot)setShowCompare(false);},[state.snapshot]);
  function update(next:BuildingState){setHistory(h=>[...h.slice(-24),state]);setState(next);setError('');}
  function selectBuilding(id:string,zoom=false,open=true){const site=context.byId.get(id)||context.byBuildingId.get(id);if(!site)return;setShowCompare(false);setSelected(site.id);if(zoom)setFocusRequest(n=>n+1);if(open)setTab('projects');setError('');}
  function chooseTool(id:ProjectId){setShowCompare(false);setTool(id);setError('');}
  function inspectComparison(id:string|null,focus=false){if(!id){setComparisonSelected(null);return;}const site=context.byId.get(id)||context.byBuildingId.get(id);if(!site)return;setComparisonSelected(site.id);if(focus)setComparisonFocus(n=>n+1);}
  function openComparison(){if(!comparison)return;setShowCompare(true);setShowA(false);setTab('compare');}
  function place(){if(!proposed)return;const next=addBuildingAction(context,state,proposed);if(next.error){setError(next.error);return;}update(next.state);setShowA(false);setNotice(`${chosen!.name}已配置${definition.name}，周边影响已更新。`);}
  function remove(action:BuildingAction){update({...state,actions:state.actions.filter(p=>actionKey(p)!==actionKey(action))});setShowA(false);}
  function saveA(){if(!current.feasible||!state.actions.length)return;update({...state,snapshot:{actions:structuredClone(state.actions),savedAt:new Date().toISOString()}});setNotice('方案 A 已保存，包括每栋建筑的措施。');}
  function exportPlan(){
    const describe=(actions:BuildingAction[])=>actions.map(p=>({...p,building:context.byId.get(p.buildingId)!.name,scope:descriptions[p.projectId].scope,cost:actionCost(context,p),internalCells:actionCells(context,p)}));
    const report={title:`2030 校园实验室 · ${config.name}`,campus:config.id,rulesVersion:BUILDING_VERSION,exportedAt:new Date().toISOString(),event:state.event,notice:'建筑和道路来自公开地图；建筑高度、周边候选位置、人流、用能及日照均为教学估算。后台空间单元仅用于计算，不代表实际建设边界。',planA:state.snapshot?{actions:describe(state.snapshot.actions),result:a}:null,planB:{actions:describe(state.actions),result:current},buildingComparison:comparison,internalGrid:context.world.cells,mapSource:'© OpenStreetMap contributors · ODbL 1.0，校方公开资料补绘'};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),anchor=document.createElement('a');anchor.href=url;anchor.download=`2030-${config.id}-建筑方案.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const differences=state.snapshot?[...state.snapshot.actions.filter(p=>!state.actions.some(q=>actionSignature(q)===actionSignature(p))).map(p=>({p,added:false})),...state.actions.filter(p=>!state.snapshot!.actions.some(q=>actionSignature(q)===actionSignature(p))).map(p=>({p,added:true}))]:[];
  return <>
    <header className="topbar"><a className="brand" href="#" onClick={e=>e.preventDefault()}><span className="brand-symbol"><Leaf size={24}/></span><div><strong>2030 <span>校园实验室</span></strong><small>SPATIAL CAMPUS LAB</small></div></a><nav aria-label="主导航"><button className="nav-active" onClick={()=>{setShowCompare(false);setTab('projects');}}>校园工作台</button><button onClick={()=>setModal('help')}>玩法指南</button><button onClick={()=>setModal('sources')}>地图与依据 ↗</button></nav><div className="edition"><span/>建筑规划 <em>V 0.6</em></div></header>
    <main className="spatial-main building-main">
      <section className="mission-heading"><div><div className="eyebrow">LOCATION MATTERS <span/> 绿色校园</div><h1>{config.name}<span>从一栋建筑，改变校园</span></h1><p>点击真实校园中的建筑，配置措施，观察它与周边的相互影响。</p></div><div className="mission-target"><Target size={21}/><div><small>较同情境空白方案 · 教学挑战</small><strong>减排 2% · 体验 +1 · 覆盖 12%</strong></div><button aria-label="查看空间规则" onClick={()=>setModal('rules')}><Info size={17}/></button></div></section>
      <section className="campus-selector"><div className="campus-switch">{CAMPUS_IDS.map(id=><button key={id} aria-pressed={config.id===id} className={config.id===id?'active':''} onClick={()=>onCampusChange(id)}><MapPin size={14}/><strong>{CAMPUSES[id].name}</strong><small>{CAMPUSES[id].english}</small></button>)}</div><p>{condition.name}<span>校区独立存档 · A/B 共同情境</span></p></section>
      {state.migrated&&<div className="migration-banner">旧方案的实施范围与 A/B 已保留，并归入邻近建筑。标注“旧范围”的措施可先移除，再按整栋建筑重新配置；原始存档另存备份。<button onClick={()=>update({...state,migrated:false})}>知道了</button></div>}
      <div className="workspace spatial-workspace"><section className="map-column">
        <div className="metric-strip spatial-metrics">{[{title:'剩余预算',value:current.remaining,test:'remaining',note:`已用 ${current.cost} / ${current.budget}`,ok:current.feasible},{title:'排放指数',value:current.carbon,test:'carbon',note:`同情境减排 ${current.reduction}%`,ok:current.reduction>=2},{title:'校园体验',value:current.comfort,test:'comfort',note:`较基线 ${delta(current.comfortGain)}`,ok:current.comfortGain>=1},{title:'有效服务覆盖',value:`${current.coverage}%`,test:'coverage',note:'按模拟活动需求加权',ok:current.coverage>=12}].map(m=><div key={m.test} className={`metric ${m.test==='remaining'&&!m.ok?'invalid':''}`}><div className="metric-label">{m.title}<span className={m.ok?'good':'neutral'}>{m.ok?'✓':'○'}</span></div><div className="metric-reading"><strong data-testid={m.test}>{m.value}</strong></div><small className={m.ok?'good':'neutral'}>{m.note}</small></div>)}</div>
        <div className="spatial-toolbar building-toolbar"><span><Building2 size={16}/>精细三维校园 <small>{showCompare?'点击楼体查看 A/B 差值':'点击楼体选址'}</small></span>{chosen&&!showCompare&&<button className="secondary-button" onClick={()=>setFocusRequest(n=>n+1)}><ScanSearch size={14}/>近看所选建筑</button>}{a&&<div className="segmented"><button aria-pressed={!showA&&!showCompare} className={!showA&&!showCompare?'active':''} onClick={()=>{setShowCompare(false);setShowA(false);}}>B 当前</button><button aria-pressed={showA&&!showCompare} className={showA&&!showCompare?'active':''} onClick={()=>{setShowCompare(false);setShowA(true);}}>A 留存</button><button aria-pressed={showCompare} className={showCompare?'active':''} onClick={openComparison}>A/B 差异</button></div>}</div>
        <div className="map-shell building-map-shell"><CampusMap config={config} selected={[]} focused={null} event={state.event} onFocus={chooseTool} onClearFocus={()=>{}} onSources={()=>setModal('sources')} comparison={showCompare&&comparison?{data:comparison,metric:comparisonMetric,onMetric:setComparisonMetric,selectedId:comparisonSelected,focusRequest:comparisonFocus,onSelect:inspectComparison,onExit:()=>setShowCompare(false),condition:condition.name}:undefined} planning={{context,actions:shownActions,result:shown,selectedId:showCompare?null:selected,focusRequest,onSelect:id=>selectBuilding(id),impact,impactInspection}}/></div>
        <div className="map-caption"><span><i/>{showCompare?'A/B 差异 · 以 B 为底图':showA?'方案 A':'当前 B'} · {shownActions.length} 项建筑措施</span><span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors · ODbL</a></span><button onClick={()=>setModal('rules')}>查看计算依据 <Info size={12}/></button></div>
        {showCompare&&comparison?<ComparisonSummary context={context} comparison={comparison} metric={comparisonMetric} onInspect={id=>{inspectComparison(id,true);document.querySelector('.building-map-shell')?.scrollIntoView({behavior:'smooth',block:'center'});}}/>:<ImpactSummary context={context} impact={impact} onInspect={id=>{setImpactInspection(previous=>({id,serial:(previous?.serial||0)+1}));document.querySelector('.building-map-shell')?.scrollIntoView({behavior:'smooth',block:'center'});}}/>}
        <section className="spatial-feedback"><div><h3>建筑之间的影响</h3><span>热压力 {shown.heat} · 雨水压力 {shown.runoff} · 光扰动 {shown.ecology}</span></div>{!feedback.length?<p>选择两栋建筑配置接驳站，或在楼前慢行路段旁配置花园。这里会解释实际参与计算的协同与代价。</p>:<div className="interaction-list">{feedback.map(({effect,sites},i)=>{
          return <button className={`interaction ${effect.kind}`} key={i} onClick={()=>{if(sites[0])selectBuilding(sites[0],true);}}><b>{effect.kind==='positive'?'＋':effect.kind==='negative'?'−':'≈'} {effect.name}</b><span>{publicDetail(effect.detail)}</span><small>{sites.slice(0,2).map(id=>context.byId.get(id)!.name).join(' · ')} ↗</small></button>;
        })}</div>}</section>
      </section>
      <aside id="building-controls" className="control-panel spatial-panel building-panel" aria-label="建筑方案控制台"><div className="panel-top"><div><span className="eyebrow">DESIGN THE RELATIONSHIPS</span><h2>{tab==='projects'?'选一栋楼，开始改变':tab==='events'?'同一布局，不同情境':'比较两份建筑方案'}</h2></div><div className="panel-history"><button aria-label="撤销上一步" disabled={!history.length} onClick={()=>{setState(history.at(-1)!);setHistory(h=>h.slice(0,-1));setError('');}}><Undo2 size={16}/></button><button aria-label="重新开始实验" onClick={()=>setModal('reset')}><RotateCcw size={16}/></button></div></div>
        <div className="panel-tabs">{([['projects','建筑措施'],['events','情境变化'],['compare','A/B 对照']] as const).map(([id,label])=><button key={id} aria-pressed={tab===id} className={tab===id?'active':''} onClick={()=>{setTab(id);if(id==='compare')openComparison();else if(id==='projects')setShowCompare(false);}}>{label}</button>)}</div>
        {error&&<div className="inline-error" role="alert">{error}</div>}{!current.feasible&&<div className="inline-error" role="alert">{current.remaining<0?`当前 B 超出预算 ${-current.remaining} 点，不能保存为可行方案 A。`:current.problems[0]}</div>}
        <div className="panel-content">
          {tab==='compare'&&comparison&&<div className="comparison-map-entry"><strong>把两份方案放到同一张校园地图上</strong><p>查看哪些建筑改善更多，哪些地方代价增加。地图点击只查看差值，不修改措施。</p><button className="secondary-button" onClick={openComparison}>{showCompare?'正在显示三维 A/B 差异':'在三维地图查看 A/B 差异'}</button></div>}
          {tab==='projects'&&<>
            <p className="spatial-step">01 / 选择建筑 <span>也可直接点击三维楼体</span></p>
            <input className="building-search" aria-label="搜索建筑" placeholder="搜索建筑名称，如海天苑、图书馆" value={search} onChange={e=>setSearch(e.target.value)}/>
            <select className="site-select" aria-label="选择建筑" value={selected||''} onChange={e=>selectBuilding(e.target.value,true)}><option value="">选择一栋建筑</option>{buildings.map(s=><option value={s.id} key={s.id}>{s.name}{s.construction?'（在建）':''}</option>)}</select>
            {chosen&&local?<section className="cell-inspector building-summary" aria-label="建筑详情"><div><strong>{chosen.name}</strong><span>{chosen.construction?'在建':kindName[chosen.kind]||'校园建筑'}</span></div><dl><div><dt>实施单位</dt><dd>{chosen.buildings.length>1?'完整楼群':'整栋建筑'}</dd></div><div><dt>模拟需求</dt><dd>{local.demand}</dd></div><div><dt>日照估算</dt><dd>{local.sun}</dd></div><div><dt>已有措施</dt><dd>{shownActions.filter(p=>p.buildingId===chosen.id).length} 项</dd></div></dl><p className="fine-print">屋顶与节能作用于整栋建筑；花园、照明、慢行和站点配置于附近可用位置。周边位置为教学估算。</p><div className="local-results"><span>{showA?'A':'B'} 周边热压力 <b>{local.heat}</b><small>基线 {localBase!.heat}</small></span><span>雨水压力 <b>{local.runoff}</b><small>基线 {localBase!.runoff}</small></span><span>周边体验变化 <b>{delta(local.gain)}</b></span></div></section>:<div className="empty-site"><Building2 size={28}/><p>选择一栋楼，查看它适合哪些措施，以及对邻近区域的影响。</p></div>}
            <p className="spatial-step">02 / 为这栋建筑配置措施</p>
            <div className="measure-picker">{MEASURES.map(m=><button key={m.id} aria-pressed={tool===m.id} className={tool===m.id?'active':''} onClick={()=>chooseTool(m.id)}><i style={{background:m.color}}>{m.symbol}</i><span>{m.name}<small>{chosen?`${actionCost(context,{projectId:m.id,buildingId:chosen.id})} 建设点 · `:''}{descriptions[m.id].scope}</small></span></button>)}</div>
            <p className="measure-description">{description.description}</p><p className="placement-rule">{description.rule}</p>
            {showA?<div className="callout">正在查看留存方案 A。<button className="secondary-button" onClick={()=>setShowA(false)}>返回当前 B 编辑</button></div>:<>
              {reason&&chosen&&!existing&&<p className="placement-warning">{reason}</p>}
              {candidate&&<div className="placement-preview"><strong>配置到{chosen!.name}的预计变化</strong><div><span>投入 <b>{actionCost(context,proposed!)} 点</b></span><span>全校排放 <b>{delta(candidate.carbon-current.carbon)}</b></span><span>全校体验 <b>{delta(candidate.comfort-current.comfort)}</b></span></div><small>周边热压力 {local!.heat} → {nextLocal!.heat} · 雨水压力 {local!.runoff} → {nextLocal!.runoff}</small><small>已包含与现有措施的相互影响。</small>{!candidate.feasible&&<p className="bad">预算不足，还差 {-candidate.remaining} 点。</p>}</div>}
              {existing?<><p className="placement-rule">已配置{existing.legacyCells?'（保留旧方案的实施范围）':''}。移除可退回 {actionCost(context,existing)} 点。</p><button className="primary-button place-button" onClick={()=>remove(existing)}>移除这栋建筑的{definition.name}</button></>:<button className="primary-button place-button" disabled={!candidate?.feasible} onClick={place}>确认配置{definition.name}</button>}
            </>}
            <div className="placed-heading"><h3>{showA?'方案 A':'当前 B'} · {shownActions.length} 项措施</h3><span>按建筑管理</span></div><div className="placements-list">{shownActions.map(p=><div key={actionKey(p)}><button onClick={()=>{setTool(p.projectId);selectBuilding(p.buildingId,true);}}><i style={{background:measure(p.projectId).color}}>{measure(p.projectId).symbol}</i><span>{measure(p.projectId).name}<small>{context.byId.get(p.buildingId)!.name}{p.legacyCells?' · 旧范围':''}</small></span></button><span>{actionCost(context,p)}</span>{!showA&&<button aria-label={`移除${context.byId.get(p.buildingId)!.name}的${measure(p.projectId).name}`} onClick={()=>remove(p)}><X size={14}/></button>}</div>)}</div>
          </>}
          {tab==='events'&&<><p className="section-intro">天气改变建筑用能与周边环境。每次都从相同初始状态重算，布局保持不变。</p><div className="event-list">{conditions.map(c=><button key={c.id} aria-pressed={state.event===c.id} className={`event-card ${state.event===c.id?'active':''}`} onClick={()=>update({...state,event:c.id})}><div><strong>{c.name}</strong><p>{c.description}</p></div><span className="radio-mark">{state.event===c.id&&<i/>}</span></button>)}</div><div className="callout spatial-callout">当前空白方案：排放 {baseline.carbon}，体验 {baseline.comfort}。A/B 均与同一情境比较。</div></>}
          {tab==='compare'&&<>{a?<><div className="comparison-condition"><strong>{condition.name}</strong><span>共同预算 {current.budget} 点</span></div><div className="compare-head"><span>指标</span><b>方案 A</b><b>当前 B</b><span>B − A</span></div>{([{label:'投入',key:'cost',lower:true},{label:'排放',key:'carbon',lower:true},{label:'体验',key:'comfort',lower:false},{label:'覆盖 %',key:'coverage',lower:false},{label:'热压力',key:'heat',lower:true},{label:'雨水压力',key:'runoff',lower:true}] as const).map(row=><div key={row.key} className="compare-row"><span>{row.label}</span><strong>{a[row.key]}</strong><strong>{current[row.key]}</strong><span className={(row.lower?current[row.key]<a[row.key]:current[row.key]>a[row.key])?'good':'neutral'}>{delta(current[row.key]-a[row.key])}</span></div>)}<div className="compare-status"><span className={!a.feasible?'bad':''}>A：{a.success?'挑战达标':!a.feasible?'超出预算或布局冲突':'尚未全部达标'}</span><span className={!current.feasible?'bad':''}>B：{current.success?'挑战达标':!current.feasible?'超出预算或布局冲突':'尚未全部达标'}</span></div><h3 className="small-heading">建筑措施的变化</h3><div className="spatial-differences">{differences.length?differences.map(({p,added})=><button key={`${added}-${actionKey(p)}`} onClick={()=>{setShowA(!added);selectBuilding(p.buildingId,true,false);}}>{added?'＋':'−'} {measure(p.projectId).name}<small>{context.byId.get(p.buildingId)!.name}</small></button>):<p>两份方案配置相同。尝试把措施安排到另一栋建筑。</p>}</div><div className="compare-actions"><button className="secondary-button" onClick={()=>{update({...state,actions:structuredClone(state.snapshot!.actions)});setShowA(false);}}>恢复 A 到 B</button><button className="secondary-button" onClick={exportPlan}><Download size={14}/>导出建筑对照</button></div></>:<div className="empty-compare"><Bookmark size={32}/><h3>先保存一份建筑方案</h3><p>方案 A 记录每栋建筑的措施。调整当前 B，在同一情境下比较。</p><button className="secondary-button" onClick={()=>{setShowCompare(false);setTab('projects');}}>开始配置</button></div>}</>}
        </div><div className="panel-footer"><button className="save-button" onClick={saveA} disabled={!current.feasible||!state.actions.length}><Bookmark size={16}/>{state.snapshot?'更新方案 A':'保存方案 A'}</button><button className="primary-button" onClick={()=>setModal('rules')}>计算与复盘 ↗</button></div>
      </aside></div>
      <footer className="page-footer"><div><span className="prototype-dot"/>空间教学模型 · 非实测人流、工程排水或碳核算</div><button onClick={()=>setModal('rules')}>规则与参数 <ArrowUpRight size={12}/></button><span>{storageError?'本机保存不可用，请导出方案':`${config.name}方案已在本机保存`}</span></footer>
    </main>{notice&&<div className="toast" role="status"><Check size={16}/>{notice}</div>}
    {modal&&<Modal title={modal==='help'?'从建筑开始规划':modal==='sources'?'公开地图与模型边界':modal==='rules'?'空间引擎 · 计算与复盘':'重新开始实验？'} onClose={()=>setModal(null)}>
      {modal==='help'&&<><ol className="help-steps"><li><b>点击建筑</b><p>在精细三维校园中点击楼体，也可搜索建筑名称。选择后整栋楼会高亮，可近看立面与楼群。</p></li><li><b>配置措施</b><p>光伏和节能改造覆盖整栋建筑。花园、慢行、照明和接驳站由系统匹配楼旁可用位置，先预览成本与影响，再确认。</p></li><li><b>观察建筑之间的关系</b><p>选中措施后，蓝色光晕显示作用范围。绿色轮廓表示正面影响，红色表示负面影响，琥珀色表示利弊并存。点击影响标签可定位邻楼、查看分项，不改变原选址；已配置措施显示相对移除它的贡献。</p></li><li><b>保存 A，调整 B</b><p>调整 B 后点击地图上方「A/B 差异」。绿色表示 B 更优，红色表示 B 更差，琥珀色表示各有取舍；可切换体验、负面代价等指标，点击楼体查看 A、B 与差值。两份完整方案共用天气和预算，从初始状态分别重算。</p></li></ol></>}
      {modal==='sources'&&<><p>{config.sourceDescription}</p><p>{config.supplementDescription}</p><div className="callout">保留原有建筑轮廓、立面、屋顶、运动场及在建细节。未命名建筑使用方位编号便于选择，编号不是学校正式楼名。楼旁实施位置仍须实地核验。</div><div className="source-links"><a href="https://www.nwpu.edu.cn/info/1047/1051.htm" target="_blank" rel="noreferrer">学校校园地图 ↗</a><a href={`https://www.openstreetmap.org/way/${config.osmWay}`} target="_blank" rel="noreferrer">OpenStreetMap 校区范围 ↗</a><a href={config.referenceImage} target="_blank" rel="noreferrer">官方平面参考图 ↗</a><a href={config.guideImage} target="_blank" rel="noreferrer">2025 年导览 ↗</a><a href={config.mapDownload} download>下载地图几何与来源标注</a>{config.auditSources?.map(s=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a>)}</div><img className="source-map" src={config.guideImage} alt={`${config.name}官方导览`}/><p className="fine-print">OSM 数据 © OpenStreetMap contributors，采用 <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL 1.0</a>。校方图片保留原发布单位权利。建筑高度与未核验体块为简化。</p></>}
      {modal==='rules'&&<><div className={`result-banner ${current.success?'success':''}`}><Target size={28}/><div><h3>{current.success?'空间挑战达标':'继续调整建筑方案'}</h3><p>预算内：同情境减排 ≥2%，体验提高 ≥1，模拟需求覆盖 ≥12%。</p></div></div><p>每次从建筑轮廓、措施位置与共同事件完整重算。投入次序不影响结果，事件不累加。</p><table className="rule-table"><thead><tr><th>同情境结果</th><th>空白布局</th><th>当前 B</th></tr></thead><tbody><tr><td>排放指数</td><td>{baseline.carbon}</td><td>{current.carbon}</td></tr><tr><td>体验指数</td><td>{baseline.comfort}</td><td>{current.comfort}</td></tr><tr><td>热压力</td><td>{baseline.heat}</td><td>{current.heat}</td></tr><tr><td>雨水压力</td><td>{baseline.runoff}</td><td>{current.runoff}</td></tr></tbody></table><h3>建筑如何参与计算</h3><ol className="model-rules"><li>整栋建筑按实际轮廓与中庭拆分到后台空间单元，按覆盖面积分摊用能。同处一片区域的不同建筑分别计算，选择一栋不会改造邻楼。</li><li>光伏与节能改造按整栋体量计价；同一建筑的关联体块统一实施。施工建筑暂不开放。</li><li>花园选择附近开放地表，慢行改善楼前已有路段，接驳站只选择车辆道路，照明配置在周边可用位置。</li><li>花园、慢行和照明的影响随距离衰减。同类重复服务不累加全部收益；相邻设施可能协同，也可能产生噪声和光扰动。</li><li>节能改造使本栋用能减少 35%（高温 45%）；光伏抵扣受日照、天气与本栋剩余用能限制。运行耗能另计。</li><li>体验和覆盖按模拟活动需求加权。旧方案保留原实施范围；重新配置后按整栋计算，数值不宜与旧版直接比较。</li></ol><div className="callout">系数均为教学设定。未接入实测人流、交通调查、地形高程或排水管网，不能替代实际建设评估。</div><button className="secondary-button" onClick={exportPlan}><Download size={15}/>导出建筑方案与完整计算结果</button></>}
      {modal==='reset'&&<><p>清空{config.name}的建筑措施、事件和方案 A。另一个校区不受影响，原迁移备份保留。</p><div className="dialog-actions"><button className="secondary-button" onClick={()=>setModal(null)}>取消</button><button className="primary-button" onClick={()=>{update(emptyBuildingState(config.id));setSelected(null);setShowA(false);setModal(null);}}>重新开始</button></div></>}
    </Modal>}
  </>;
}
