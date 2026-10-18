import {useState} from 'react';
import type {RefObject} from 'react';
import {ChevronLeft,ChevronRight,MessageCircle,X} from 'lucide-react';
import type {CampusVoice} from './campusPlay';
import {CampusAvatar} from './CampusAvatar';

export type MapFeedback={voices:CampusVoice[];plan:'A'|'B';condition:string;feasible:boolean};
const toneName={wish:'一个心愿',positive:'有了改善',tradeoff:'也有代价'};

export function CampusMapVoices({feedback,buildingName,layerRef,fallback,onLocate}:{feedback:MapFeedback;buildingName:string;layerRef:RefObject<HTMLDivElement|null>;fallback:boolean;onLocate:()=>void}){
  const [active,setActive]=useState(0),[collapsed,setCollapsed]=useState(false);
  const voice=feedback.voices[active]||feedback.voices[0];
  const reminder=feedback.voices.findIndex(v=>v.tone==='tradeoff');
  if(!voice)return null;
  return <div ref={layerRef} className={`map-chat-layer ${fallback?'chat-fallback':''}`}>
    <svg className="map-chat-leader" aria-hidden="true"><path/><circle r="5"/></svg>
    <section className={`map-chat ${voice.tone} ${collapsed?'collapsed':''}`} aria-label="地图校园回声" data-character={voice.character}>
      {collapsed?<button className="map-chat-reopen" aria-label={`展开${buildingName}的校园回声`} onClick={()=>setCollapsed(false)}><CampusAvatar character={voice.character}/><span><MessageCircle size={12}/>{feedback.voices.length}</span></button>:<>
        <header className="map-chat-place"><button onClick={onLocate} title="定位这栋建筑">{buildingName}<span>↗</span></button><button onClick={()=>setCollapsed(true)} aria-label="收起地图校园回声"><X size={14}/></button></header>
        <div className="map-chat-context">{feedback.plan} 方案 · {feedback.condition} · {feedback.feasible?'已配置反馈':'试算反馈'}</div>
        <div className="map-chat-message" aria-live="polite" aria-atomic="true"><CampusAvatar character={voice.character}/><div><div className="map-chat-person"><strong>{voice.role.split(' · ')[0]}</strong><span>{toneName[voice.tone]}</span></div><small>{voice.role.split(' · ')[1]}</small><p>“{voice.quote}”</p></div></div>
        <details className="map-chat-evidence" key={voice.id}><summary>查看计算依据</summary><p>{voice.evidence}</p>{!feedback.feasible&&<p>当前方案超预算或布局无效。</p>}</details>
        <footer className="map-chat-footer"><span>模拟角色 · 非真实意见</span>{feedback.voices.length>1&&<nav aria-label="切换地图反馈"><button onClick={()=>setActive((active+feedback.voices.length-1)%feedback.voices.length)} aria-label="上一条校园回声"><ChevronLeft size={15}/></button><span>{active+1}/{feedback.voices.length}</span><button onClick={()=>setActive((active+1)%feedback.voices.length)} aria-label="下一条校园回声"><ChevronRight size={15}/></button></nav>}</footer>
        {reminder>=0&&voice.tone!=='tradeoff'&&<button className="map-chat-reminder" onClick={()=>setActive(reminder)}>还有取舍要考虑 <span>听听提醒 →</span></button>}
      </>}
    </section>
  </div>;
}
