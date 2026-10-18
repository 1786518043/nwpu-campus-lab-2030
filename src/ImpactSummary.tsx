import {useState} from 'react';
import type {ActionImpact,BuildingImpact} from './buildingImpact';
import {impactKindName,impactNumber} from './buildingImpact';
import type {BuildingContext} from './buildingPlanning';
import {measure} from './spatial';

export function ImpactEffects({effect,compact=false}:{effect:BuildingImpact;compact?:boolean}){
  return <div className="impact-effects">{(['positive','negative'] as const).map(kind=><div key={kind} className={kind}>{effect[kind].slice(0,compact?2:undefined).map(item=><span key={item.key}>{kind==='positive'?'＋':'−'} {item.label} <b>{impactNumber(item.value)}{item.unit}</b></span>)}{compact&&effect[kind].length>2&&<small>另 {effect[kind].length-2} 项</small>}</div>)}</div>;
}
export default function ImpactSummary({impact,context,onInspect}:{impact:ActionImpact|null;context:BuildingContext;onInspect:(id:string)=>void}){
  const [all,setAll]=useState(false);
  if(!impact)return <section className="impact-summary"><h3>先选建筑，再看影响如何传递</h3><p>选择一项措施，地图会预览作用范围，并标记受影响建筑的收益与代价。</p></section>;
  const source=context.byId.get(impact.action.buildingId)!;
  const neighbors=impact.buildings.filter(b=>b.buildingId!==source.id);
  return <section className="impact-summary" aria-label="所选措施影响分析">
    <div className="impact-summary-heading"><div><span className="eyebrow">{impact.plan} / {impact.status==='installed'?'已配置措施的贡献':impact.status==='unavailable'?'暂无可用预览':'实施前预览'}</span><h3>{source.name} · {measure(impact.action.projectId).name}</h3></div><span>{neighbors.length} 栋周边建筑受影响</span></div>
    {impact.reason?<p className="impact-caution">{impact.reason}</p>:<>
      <p>{impact.status==='installed'?'对比移除这一项后的同一方案':'对比当前方案与新增这一项后的方案'}，天气与其他措施保持一致。</p>
      {impact.overBudget>0&&<p className="impact-caution">当前为超预算效果演示：超出 {impact.overBudget} 点，不能确认实施或保存为可行方案。</p>}
      {impact.idleShuttle&&<p className="impact-caution">站点尚未连通：灰色虚线仅为潜在服务范围，当前没有出行收益或运行噪声。</p>}
      {Math.abs(impact.routeEnergyDelta)>.001&&<p className="impact-caution">线路运行用能 {impactNumber(impact.routeEnergyDelta)} 模型单位，计入全校排放，不摊到某一栋楼。</p>}
      {impact.legacy&&<p className="impact-caution">保留旧方案的局部实施范围；轮廓标记用于关联建筑，未表示整栋均已改造。</p>}
      <div className="impact-building-list">{(all?impact.buildings:impact.buildings.slice(0,6)).map(effect=><button className={`impact-building-card ${effect.kind}`} key={effect.buildingId} onClick={()=>onInspect(effect.buildingId)} aria-label={`定位影响 ${context.byId.get(effect.buildingId)!.name}`}>
        <div><strong>{context.byId.get(effect.buildingId)!.name}{effect.buildingId===source.id?' · 本栋':''}</strong><span>{impactKindName[effect.kind]} ↗</span></div><ImpactEffects effect={effect} compact/>
        <small>周边体验净变化 {impactNumber(effect.netComfort)}{effect.positive.length&&effect.negative.length?' · 收益与代价同时存在':''}</small>
      </button>)}</div>
      {!impact.buildings.length&&!impact.idleShuttle&&<p>当前规则下未检测到可显示的增量影响。同类设施重叠时，已有服务可能已经覆盖这里。</p>}
      {impact.buildings.length>6&&<button className="impact-more" onClick={()=>setAll(v=>!v)}>{all?'收起列表':`查看全部 ${impact.buildings.length} 栋建筑`}</button>}
      {!!impact.buildings.length&&!impact.buildings.some(b=>b.negative.length)&&<p>当前规则未检测到额外负面项，不表示真实建设没有其他代价。</p>}
    </>}
    <p className="impact-method">范围是距离衰减示意；建筑评价包含楼体及楼外约 40 米环境，邻楼可能共享环境，数值不能相加。均为教学模型指数，非实测温度、噪声分贝或工程排水量。</p>
  </section>;
}
