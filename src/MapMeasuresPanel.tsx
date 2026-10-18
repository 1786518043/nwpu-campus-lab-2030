import {Building2,ChevronRight,Layers3,Map,MapPin,Trash2,Undo2} from 'lucide-react';
import type {ProjectId} from './game';
import type {BuildingAction,BuildingContext} from './buildingPlanning';
import {actionCost,actionKey} from './buildingPlanning';
import {measure} from './spatial';
import type {SpatialResult} from './spatial';

export type MapMeasureControls={
  plan:'A'|'B';
  selectedProject:ProjectId;
  onFocus:(action:BuildingAction)=>void;
  onRemove?:(action:BuildingAction)=>void;
  onUndo:()=>void;
  canUndo:boolean;
};

export function MapMeasuresPanel({context,actions,result,selectedId,controls,comparing,compact,onClose,onOverview}:{context:BuildingContext;actions:BuildingAction[];result:SpatialResult;selectedId:string|null;controls:MapMeasureControls;comparing:boolean;compact:boolean;onClose:()=>void;onOverview:()=>void}){
  const groups=[...new Set(actions.map(a=>a.buildingId))].map(id=>({site:context.byId.get(id)!,actions:actions.filter(a=>a.buildingId===id)}));
  const readOnly=controls.plan==='A'||comparing;
  return <aside className="map-measures-panel" id="map-measures-panel" aria-label="地图当前措施侧栏">
    <header className="map-measures-heading"><span className="map-measures-icon"><Layers3 size={18}/></span><div><h3>{controls.plan==='A'?'方案 A 的措施':'当前措施'}</h3><p>{controls.plan==='A'?'A 留存 · 只读查看':comparing?'B 底图 · 对照中':'当前 B · 随布局更新'}</p></div><button onClick={onClose} aria-label="收起当前措施侧栏" title="收起侧栏"><ChevronRight size={18}/></button></header>
    <div className={`map-measures-budget ${result.feasible?'':'invalid'}`}><div><span>已投入 <strong>{result.cost}</strong><small> / {result.budget} 点</small></span><span>{result.remaining<0?'超支':'剩余'} <b>{Math.abs(result.remaining)}</b></span></div><progress aria-label={`${controls.plan} 方案预算使用`} max={result.budget} value={Math.min(result.cost,result.budget)}/>{!result.feasible&&<p>{result.remaining<0?'超出当前预算，需调整措施。':result.problems[0]||'当前布局无效。'}</p>}</div>
    <div className="map-measures-count"><strong>{actions.length} 项措施 <span>· {groups.length} 栋建筑</span></strong><span>点击定位 ↗</span></div>
    <div className="map-measures-list" tabIndex={0} aria-label="已配置措施列表">
      {groups.length?groups.map(group=><section className="map-measures-building" key={group.site.id}><h4><Building2 size={13}/>{group.site.name}</h4><ul>{group.actions.map(action=>{
        const definition=measure(action.projectId),active=selectedId===action.buildingId&&controls.selectedProject===action.projectId;
        return <li key={actionKey(action)} className={active?'active':''}><button className="map-measure-focus" aria-label={`在地图定位${group.site.name}的${definition.name}`} aria-pressed={active} onClick={()=>controls.onFocus(action)}><i style={{background:definition.color}}>{definition.symbol}</i><span><strong>{definition.name}</strong><small>{active?'正在查看 · ':''}{actionCost(context,action)} 建设点{action.legacyCells?' · 旧范围':''}</small></span><MapPin size={12}/></button>{!readOnly&&controls.onRemove&&<button className="map-measure-remove" aria-label={`从地图移除${group.site.name}的${definition.name}`} title={`移除 · 退回 ${actionCost(context,action)} 点`} onClick={()=>controls.onRemove?.(action)}><Trash2 size={13}/></button>}</li>;
      })}</ul></section>):<div className="map-measures-empty"><MapPin size={27}/><strong>校园的改变，从这里记起</strong><p>选中一栋建筑并配置措施，<br/>就会出现在这份清单里。</p></div>}
    </div>
    <footer className="map-measures-footer"><p>{controls.plan==='A'?'留存方案仅供查看，不影响当前 B。':comparing?'点击措施，返回 B 查看它的贡献。':compact?'点击一项措施，返回对应建筑近景。':'列表可单独滚动，地图始终留在眼前。'}</p><div><button onClick={onOverview}><Map size={14}/>校园全貌</button>{!readOnly&&<button disabled={!controls.canUndo} onClick={controls.onUndo} aria-label="在地图撤销上一步"><Undo2 size={14}/>撤销上一步</button>}</div></footer>
  </aside>;
}
