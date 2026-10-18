import {useRef,useState} from 'react';
import type {CampusConfig} from './campusTypes';
import type {ProjectId} from './game';
import {CELL_SIZE,measure,suitability,placementKey} from './spatial';
import type {World,Placement,SpatialResult,Cell} from './spatial';

export type GridLayer='land'|'demand'|'heat'|'runoff'|'benefit';
const landColor=(c:Cell)=>c.construction?'#b6a28d':c.water>.3?'#8cbac4':c.protected?'#b7c59b':c.roof>.1?'#bbc3c5':c.road?'#ded2b5':c.green>.2?'#93b99b':'#e5e8d9';
function ramp(value:number){const t=Math.max(0,Math.min(1,value));return `rgb(${Math.round(83+159*t)},${Math.round(158-59*t)},${Math.round(142-65*t)})`;}
function benefitColor(value:number){const neutral=[238,239,224],target=value<0?[213,108,84]:[83,158,142],t=Math.min(1,Math.abs(value)/(value<0?8:12));return `rgb(${neutral.map((n,i)=>Math.round(n+(target[i]-n)*t)).join(',')})`;}
export default function GridMap({config,world,placements,result,layer,tool,selected,onSelect,showSuitable,readOnly=false}:{config:CampusConfig;world:World;placements:Placement[];result:SpatialResult;layer:GridLayer;tool:ProjectId;selected:string|null;onSelect:(id:string)=>void;showSuitable:boolean;readOnly?:boolean}){
  const b=world.bounds,[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:b.cx,z:b.cz});
  const drag=useRef<{x:number;y:number;pan:{x:number;z:number};moved:boolean}|null>(null);
  const svg=useRef<SVGSVGElement>(null);
  const width=(b.width+8)/zoom,height=(b.depth+8)/zoom;
  const cellResults=new Map(result.cells.map(c=>[c.cellId,c]));
  const chosen=selected?world.byId.get(selected):null;
  const svgId=`clip-${config.id}`;
  function magnify(factor:number){setZoom(z=>Math.max(1,Math.min(5,z*factor)));if(chosen)setPan({x:chosen.x,z:chosen.z});}
  function fill(c:Cell){const r=cellResults.get(c.id)!;if(layer==='land')return landColor(c);if(layer==='demand')return ramp(c.demand);if(layer==='heat')return ramp(r.heat);if(layer==='runoff')return ramp(r.runoff);return benefitColor(r.comfort-r.initialComfort);}
  return <div className="grid-map">
    <div className="grid-topline"><span><i/>40 m 教学网格 · {world.cells.length} 格</span><strong>N ↑</strong></div>
    <svg ref={svg} className="planning-svg" aria-label={`${config.name}空间规划地图`} role="group" viewBox={`${pan.x-width/2} ${pan.z-height/2} ${width} ${height}`}
      onPointerDown={e=>{if(e.button===0)drag.current={x:e.clientX,y:e.clientY,pan:{...pan},moved:false};}}
      onPointerMove={e=>{const d=drag.current;if(!d||e.buttons!==1)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.hypot(dx,dy)<6&&!d.moved)return;d.moved=true;const rect=e.currentTarget.getBoundingClientRect(),scale=Math.min(rect.width/width,rect.height/height);setPan({x:d.pan.x-dx/scale,z:d.pan.z-dy/scale});}}
      onKeyDown={e=>{const c=chosen||world.cells[0],shift:{[k:string]:[number,number]}={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};if(shift[e.key]){e.preventDefault();const [dr,dc]=shift[e.key],n=world.cells.find(n=>n.row===c.row+dr&&n.col===c.col+dc);if(n)onSelect(n.id);}}}>
      <defs><clipPath id={svgId}><polygon points={config.data.boundary.map(p=>p.join(',')).join(' ')}/></clipPath></defs>
      <g clipPath={`url(#${svgId})`}>
        {world.cells.map(c=>{const valid=!suitability(world,tool,c.id),active=selected===c.id;return <rect key={c.id} data-cell-id={c.id} role="button" tabIndex={active||!selected&&c===world.cells[0]?0:-1} aria-label={`${c.id} ${c.name}${valid?'，适合'+measure(tool).name:'，'+suitability(world,tool,c.id)}`} aria-pressed={active} x={c.x-CELL_SIZE/2} y={c.z-CELL_SIZE/2} width={CELL_SIZE} height={CELL_SIZE} fill={fill(c)} fillOpacity={showSuitable&&!valid?.22:1} stroke={active?'#203e3d':showSuitable&&valid?'#438a65':'#ffffff70'} strokeWidth={active?.55:.12} onClick={()=>{if(drag.current?.moved){drag.current=null;return;}onSelect(c.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(c.id);}}}><title>{c.name} · {c.id} · 模拟活动强度 {Math.round(c.demand*100)}</title></rect>;})}
        <g pointerEvents="none">
          {config.data.waters.map(w=><polygon key={w.id} points={w.points.map(p=>p.join(',')).join(' ')} fill="#84b8c5" fillOpacity=".6" stroke="#6499a7" strokeWidth=".15"/>)}
          {config.data.buildings.map(b=><polygon key={b.id} points={b.points.map(p=>p.join(',')).join(' ')} fill="none" stroke="#46544c" strokeOpacity=".5" strokeWidth=".15"/>)}
          {config.data.roads.map(r=><polyline key={r.id} points={r.points.map(p=>p.join(',')).join(' ')} fill="none" stroke="#fbfbf3" strokeWidth=".4" strokeOpacity=".6"/>)}
          {result.routes.map((route,i)=><polyline key={i} data-testid="shuttle-route" points={route.map(id=>{const c=world.byId.get(id)!;return `${c.x},${c.z}`;}).join(' ')} fill="none" stroke="#226b88" strokeWidth=".7" strokeDasharray="1 .5"/>)}
          {chosen&&!['retrofit','solar'].includes(tool)&&<circle cx={chosen.x} cy={chosen.z} r={CELL_SIZE*(tool==='garden'?3:tool==='shuttle'?2.5:2)} fill="none" stroke="#2c6453" strokeWidth=".18" strokeDasharray=".6 .5"/>}
          {placements.map((p,i)=>{const c=world.byId.get(p.cellId)!,m=measure(p.projectId),same=placements.filter(q=>q.cellId===p.cellId),offset=same.length>1?(same.findIndex(q=>placementKey(q)===placementKey(p))-(same.length-1)/2)*1.45:0;return <g key={placementKey(p)}><circle cx={c.x+offset} cy={c.z} r={same.length>1?.9:1.45} fill={m.color} stroke="white" strokeWidth=".18"/><text x={c.x+offset} y={c.z+.48} textAnchor="middle" fontSize={same.length>1?1.2:1.7} fill="white" fontWeight="600">{m.symbol}</text><title>{i+1}. {m.name} · {c.name}</title></g>;})}
          {selected&&chosen&&<rect x={chosen.x-2} y={chosen.z-2} width="4" height="4" fill="none" stroke="#172e30" strokeWidth=".55"/>}
          {config.landmarks.filter(l=>['云天苑','星天苑','海天苑1号楼','启真湖','启翔湖','公字楼','勇字楼','田径场'].includes(l.name)).map(l=><text key={l.name} x={l.location[0]} y={l.location[1]-2} textAnchor="middle" fontSize={height/65} fill="#3b6053" stroke="#fffff5" strokeWidth={height/350} paintOrder="stroke">{l.name}</text>)}
        </g>
      </g>
      <polygon points={config.data.boundary.map(p=>p.join(',')).join(' ')} fill="none" stroke="#82967f" strokeWidth=".22" pointerEvents="none"/>
    </svg>
    <div className="grid-zoom"><button onClick={()=>magnify(1.4)} aria-label="放大规划地图">＋</button><button onClick={()=>magnify(1/1.4)} aria-label="缩小规划地图">−</button><button onClick={()=>{setZoom(1);setPan({x:b.cx,z:b.cz});}}>全校</button><button disabled={!chosen} onClick={()=>{if(chosen){setZoom(3);setPan({x:chosen.x,z:chosen.z});}}}>选址近看</button></div>
    <div className="grid-legend">{layer==='land'?<><span>■ 建筑</span><span className="legend-green">■ 绿地</span><span className="legend-water">■ 水体</span><span>保护球场 / 施工区不可占用</span></>:layer==='benefit'?<><span>变差</span><i style={{background:'linear-gradient(90deg,#d56c54,#eeefe0,#539e8e)'}}/><span>改善</span><span>浅色表示无变化 · 相对同情境空白方案</span></>:<><span>低</span><i/><span>高</span><span>教学代理指标，非实测</span></>}</div>
    <div className="grid-footnote">{readOnly?'正在查看方案 A · 点击仅查看地块':'点选网格 → 预览效果 → 确认实施'} · 拖动平移 · 方向键移动选区</div>
  </div>;
}
