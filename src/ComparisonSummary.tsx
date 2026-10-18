import {useState} from 'react';
import type {BuildingContext} from './buildingPlanning';
import type {ComparedBuilding,ComparisonDisplay,ComparisonMetric,PlanComparison} from './buildingComparison';
import {COMPARISON_EPS,COMPARISON_METRICS,comparisonBuildings,comparisonKindName,matchesComparisonMetric} from './buildingComparison';
import {impactNumber} from './buildingImpact';
import {measure} from './spatial';

export function ComparisonMetricPicker({value,onChange}:{value:ComparisonMetric;onChange:(v:ComparisonMetric)=>void}){
  return <select aria-label="三维对照指标" value={value} onChange={e=>onChange(e.target.value as ComparisonMetric)}>{COMPARISON_METRICS.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>;
}
const number=(n:number)=>Number(n.toFixed(2)).toString();
export function ComparisonDetails({building,metric}:{building:ComparedBuilding;metric:ComparisonMetric}){
  const changed=(delta:number)=>Math.abs(delta)>=COMPARISON_EPS;
  const values=[...building.values].sort((a,b)=>Number(matchesComparisonMetric(b.key,metric))-Number(matchesComparisonMetric(a.key,metric))||Number(changed(b.delta))-Number(changed(a.delta)));
  return <>
    <table className="building-comparison-table"><caption>同情境 · B − A · {metric==='overall'?'变化项优先':'当前指标优先'}</caption><thead><tr><th>指标</th><th>A</th><th>B</th><th>差值</th></tr></thead><tbody>{values.map(v=>{
      const changed=Math.abs(v.delta)>=COMPARISON_EPS,better=(v.lower?-v.delta:v.delta)>0;
      return <tr key={v.key}><th>{v.label}{v.unit&&<small>{v.unit}</small>}</th><td>{number(v.a)}</td><td>{number(v.b)}</td><td className={!changed?'neutral':better?'good':'bad'}>{changed?impactNumber(v.delta):'≈ 0'}</td></tr>;
    })}</tbody></table>
    <div className="comparison-action-changes">{building.added.map(a=><span key={`+${a.projectId}`}>B 新增：{measure(a.projectId).name}{a.legacyCells?'（旧范围）':''}</span>)}{building.removed.map(a=><span key={`-${a.projectId}`}>B 移除：{measure(a.projectId).name}{a.legacyCells?'（旧范围）':''}</span>)}{!building.added.length&&!building.removed.length&&<span>{values.some(v=>changed(v.delta))?'本栋措施相同；差异来自周边设施联动。':'本栋措施相同，各项指标无明显差异。'}</span>}</div>
    {building.legacy&&<p>含旧方案的局部实施范围，比较时保留原范围。</p>}
  </>;
}
function DifferenceChips({building}:{building:ComparisonDisplay}){
  return <div className="impact-effects">{(['positive','negative'] as const).map(kind=><div className={kind} key={kind}>{building[kind].slice(0,2).map(v=><span key={v.key}>{kind==='positive'?'改善':'代价'} · {v.label} <b>{impactNumber(v.delta)}</b></span>)}{building[kind].length>2&&<small>另 {building[kind].length-2} 项</small>}</div>)}</div>;
}
export default function ComparisonSummary({context,comparison,metric,onInspect}:{context:BuildingContext;comparison:PlanComparison;metric:ComparisonMetric;onInspect:(id:string)=>void}){
  const [all,setAll]=useState(false),[filter,setFilter]=useState('all');
  const buildings=comparisonBuildings(comparison,metric),filtered=buildings.filter(b=>filter==='all'||b.kind===filter);
  const definition=COMPARISON_METRICS.find(m=>m.id===metric)!;
  return <section className="impact-summary comparison-summary" aria-label="建筑 A/B 差异分析">
    <div className="impact-summary-heading"><div><span className="eyebrow">A/B / 完整方案对照</span><h3>{definition.name} · B 相比 A</h3></div><span>{buildings.filter(b=>b.kind!=='neutral').length} 栋建筑有差异</span></div>
    <p>{definition.hint}。地图以 B 的设施为底图，颜色只表示 B 相比 A 的变化。</p>
    <div className="comparison-budget">{(['a','b'] as const).map(key=><span key={key} className={comparison[key].feasible?'':'bad'}>{key.toUpperCase()} 投入 {comparison[key].cost} / {comparison[key].budget}{comparison[key].remaining<0?` · 超支 ${-comparison[key].remaining}`:!comparison[key].feasible?' · 存在布局冲突':' · 预算内'}</span>)}</div>
    {(!comparison.a.feasible||!comparison.b.feasible)&&<p className="impact-caution">当前含不可行方案，差异仅供效果比较；超预算或冲突方案不能保存为可行方案。</p>}
    <p>线路运行用能：A {number(comparison.routeEnergyA)} → B {number(comparison.routeEnergyB)}（{impactNumber(comparison.routeEnergyB-comparison.routeEnergyA)} 模型单位）。已计入全校排放，不归到某栋建筑。</p>
    <div className="comparison-filters" aria-label="筛选建筑差异">{[['all','全部'],['positive','B 改善更多'],['negative','B 表现更差'],['mixed','各有取舍'],['neutral','配置不同但无明显差异']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label} <b>{id==='all'?buildings.length:buildings.filter(b=>b.kind===id).length}</b></button>)}</div>
    <div className="impact-building-list">{(all?filtered:filtered.slice(0,6)).map(building=><button key={building.buildingId} className={`impact-building-card ${building.kind}`} aria-label={`定位对照 ${context.byId.get(building.buildingId)!.name}`} onClick={()=>onInspect(building.buildingId)}>
      <div><strong>{context.byId.get(building.buildingId)!.name}</strong><span>{comparisonKindName[building.kind]} ↗</span></div><DifferenceChips building={building}/>
      <small>{building.kind==='neutral'?'配置不同，当前指标无明显差异':`周边体验：${number(building.values[0].a)} → ${number(building.values[0].b)}`}{building.added.length||building.removed.length?` · 本栋新增 ${building.added.length} / 移除 ${building.removed.length}`:''}</small>
    </button>)}</div>
    {!filtered.length&&<p>{comparison.identical?'A 与 B 配置相同，三维地图没有差异高亮。':buildings.length?'此筛选下暂无建筑。':'当前指标无明显差异，可切换其他指标查看。'}</p>}
    {filtered.length>6&&<button className="impact-more" onClick={()=>setAll(v=>!v)}>{all?'收起列表':`查看全部 ${filtered.length} 栋建筑`}</button>}
    <p className="impact-method">两套方案使用相同天气与预算，从初始状态分别重算。周边指标覆盖楼体及楼外约 40 米环境；本栋改造贡献按移除本栋节能/光伏后的全校排放差计算，不把邻楼算成已改造。共享环境与改造贡献均不可逐楼相加。数值为教学模拟，差异小于 0.005 记为无明显差异。</p>
  </section>;
}
