import {ArrowRight,BookOpen,Check,CheckCircle2,Compass,Flag,Leaf,MapPin,MessageCircle,Sparkles,Trophy,X} from 'lucide-react';
import type {BuildingAction,BuildingContext} from './buildingPlanning';
import {actionKey} from './buildingPlanning';
import {measure} from './spatial';
import {EVENTS} from './game';
import {DISCOVERIES,MISSIONS,missionStarts} from './campusPlay';
import type {ActiveDiscovery,CampusVoice,DiscoveryId,MissionId,MissionStatus,PlayProgress} from './campusPlay';
import {CampusAvatar} from './CampusAvatar';

type MissionProps={context:BuildingContext;progress:PlayProgress;statuses:MissionStatus[];condition:string;viewingB:boolean;onChoose:(id:MissionId|null)=>void;onFocus:(a:BuildingAction)=>void;onComplete:(id:MissionId)=>void;onBook:()=>void;onReturn:()=>void;};
export function MissionBoard({context,progress,statuses,condition,viewingB,onChoose,onFocus,onComplete,onBook,onReturn}:MissionProps){
  const mission=MISSIONS.find(m=>m.id===progress.activeMission),status=statuses.find(m=>m.id===progress.activeMission);
  const completed=Object.keys(progress.completed).length,next=MISSIONS.find(m=>!progress.completed[m.id])||MISSIONS[0];
  const record=mission?progress.completed[mission.id]:undefined;
  return <section className={`mission-board ${mission?'':'free-explore'}`} aria-label="校园行动手册">
    <div className="play-heading"><div className="play-title"><span className="play-icon"><Compass size={19}/></span><div><h2>校园行动手册 <span>{completed} / {MISSIONS.length} 关已完成</span></h2><p>{mission?'接一个小任务，把校园里的想法变成改变。':'自由探索中 · 所有建筑措施、情境与 A/B 对照均可使用。'}</p></div></div><div className="play-heading-actions"><button onClick={onBook}><BookOpen size={15}/>协同图鉴 <b>{Object.keys(progress.discoveries).length}/{DISCOVERIES.length}</b></button><button aria-pressed={!mission} onClick={()=>onChoose(mission?null:next.id)}>{mission?'自由探索':'继续任务'}<ArrowRight size={14}/></button></div></div>
    {mission&&status&&<>
      <div className="mission-path" aria-label="选择任务关卡">{MISSIONS.map((m,i)=><button key={m.id} aria-pressed={mission.id===m.id} className={mission.id===m.id?'active':''} onClick={()=>onChoose(m.id)}><span className={progress.completed[m.id]?'chapter done':'chapter'}>{progress.completed[m.id]?<Check size={13}/>:String(i+1).padStart(2,'0')}</span><span><strong>{m.title}</strong><small>{m.subtitle}</small></span></button>)}</div>
      <div className="mission-content"><div className="mission-story"><div className="mission-kicker"><Flag size={13}/>任务 {String(MISSIONS.indexOf(mission)+1).padStart(2,'0')}<span>当前 B · {condition}</span></div><h3>{mission.title}{record&&<span className="mission-stamp"><CheckCircle2 size={13}/>历史已完成</span>}</h3><p>{mission.brief}</p><details className="mission-hints"><summary>需要一点选址提示？</summary><p>{mission.hint}</p><div>{missionStarts(context,mission.id).map(a=><button key={actionKey(a)} onClick={()=>onFocus(a)}><MapPin size={12}/>{context.byId.get(a.buildingId)!.name} · {measure(a.projectId).name}<ArrowRight size={12}/></button>)}</div><small>仅定位和选择措施；确认配置后才投入预算。也可以自行选址。</small></details></div>
        <div className="mission-checklist"><div className="mission-progress-label"><strong>{status.ready?'条件已达成，可以提交':'本关进度'}</strong><span>{status.goals.filter(g=>g.met).length} / {status.goals.length}</span></div><ul>{status.goals.map(g=><li key={g.label} className={g.met?'met':''}><span className="goal-check">{g.met?<Check size={12}/>:<span/>}</span><div><strong>{g.label}</strong><small>{g.detail}</small><progress max={1} value={g.ratio} aria-label={g.label}/></div></li>)}</ul><div className="mission-submit">{viewingB?<button className="primary-button" disabled={!status.ready} onClick={()=>onComplete(mission.id)}><Trophy size={14}/>{record?'记录本次达标':'提交本关'}</button>:<button className="secondary-button" onClick={onReturn}>返回 B 继续任务<ArrowRight size={14}/></button>}<span>{record?`通关记录：${EVENTS.find(e=>e.id===record.event)!.name} · ${new Date(record.at).toLocaleDateString('zh-CN')}`:'切换关卡保留布局，可随时自由探索。'}</span></div></div>
      </div>
    </>}
  </section>;
}

export function CampusVoices({voices,buildingName,plan,condition,feasible}:{voices:CampusVoice[];buildingName?:string;plan:'A'|'B';condition:string;feasible:boolean}){
  return <section className="campus-voices" aria-label="虚拟师生反馈"><div className="voices-heading"><h3><MessageCircle size={15}/>校园回声</h3><span>模拟角色 · {plan} 方案</span></div><p className="voices-context">{buildingName||'选择一栋建筑，听听校园回声'} · {condition}</p>{!feasible&&<p className="voices-caution">当前查看方案超预算或布局无效，以下为试算反馈。</p>}<div className="voice-list">{voices.map(v=><article key={v.id} className={`voice-card ${v.tone}`}><div><CampusAvatar character={v.character}/><strong>{v.role}</strong><small>{v.tone==='positive'?'有了改善':v.tone==='tradeoff'?'也有代价':'一个心愿'}</small></div><p>“{v.quote}”</p><small className="voice-evidence">依据 · {v.evidence}</small></article>)}</div><p className="voices-footnote">由当前方案与同情境空白方案的教学计算触发，非真实师生意见。周边范围与三维影响明细一致。</p></section>;
}

export function MissionShortcut({progress,statuses,viewingB,onComplete}:{progress:PlayProgress;statuses:MissionStatus[];viewingB:boolean;onComplete:(id:MissionId)=>void}){
  const mission=MISSIONS.find(m=>m.id===progress.activeMission),status=statuses.find(m=>m.id===progress.activeMission);
  if(!mission||!status)return null;
  const canSubmit=viewingB&&status.ready&&!progress.completed[mission.id];
  return <div className={`mission-shortcut ${canSubmit?'ready':''}`}><div><Flag size={13}/><strong>{mission.title}</strong><span>{canSubmit?'本关已达标':progress.completed[mission.id]?'历史已完成':'任务进行中'}</span></div><button onClick={()=>canSubmit?onComplete(mission.id):document.querySelector('.mission-board')?.scrollIntoView({behavior:'smooth',block:'start'})}>{canSubmit?'完成当前任务':'查看任务进度'}{canSubmit?<Trophy size={13}/>:<ArrowRight size={13}/>}</button></div>;
}

export function DiscoveryNotice({ids,onBook,onDismiss}:{ids:DiscoveryId[];onBook:()=>void;onDismiss:()=>void}){
  if(!ids.length)return null;
  return <div className="discovery-notice" role="status"><span className="discovery-spark"><Sparkles size={22}/></span><div><strong>发现新的校园协同</strong><p>{ids.map(id=>DISCOVERIES.find(d=>d.id===id)!.name).join(' · ')}<span>已记入本校区图鉴</span></p></div><button onClick={onBook}>查看发现 <ArrowRight size={14}/></button><button className="dismiss-discovery" aria-label="关闭协同发现提示" onClick={onDismiss}><X size={16}/></button></div>;
}

export function DiscoveryBook({context,progress,active,actions,feasible,onFocus}:{context:BuildingContext;progress:PlayProgress;active:ActiveDiscovery[];actions:BuildingAction[];feasible:boolean;onFocus:(a:BuildingAction)=>void}){
  return <div className="discovery-book"><div className="book-intro"><span><BookOpen size={24}/></span><div><h3>把发现留在校园里</h3><p>已收集 {Object.keys(progress.discoveries).length} / {DISCOVERIES.length} 种协同。图鉴只记录可行的当前 B 方案，不额外加分。</p></div></div><div className="discovery-grid">{DISCOVERIES.map((d,i)=>{
    const record=progress.discoveries[d.id],live=active.find(a=>a.id===d.id);
    const focus=live?actions.filter(a=>live.buildingIds.includes(a.buildingId)&&d.projects.includes(a.projectId)):[];
    const unique=focus.filter((a,i)=>focus.findIndex(b=>b.buildingId===a.buildingId)===i);
    return <article key={d.id} className={`discovery-card ${record?'collected':''}`}><div className="discovery-card-top"><span className="discovery-number">{record?<Leaf size={20}/>:String(i+1).padStart(2,'0')}</span><span className={live&&feasible?'discovery-state live':'discovery-state'}>{live?(feasible?'B 正在触发':'B 已触发 · 暂不可收录'):record?'已发现 · B 当前未触发':'等待发现'}</span></div><h4>{d.name}</h4><p>{d.recipe}</p><dl><div><dt>带来什么</dt><dd>{d.benefit}</dd></div><div><dt>也要考虑</dt><dd>{d.tradeoff}</dd></div></dl>{!!unique.length&&<div className="discovery-sites">{unique.slice(0,4).map(a=><button key={a.buildingId} onClick={()=>onFocus(a)}><MapPin size={12}/>{context.byId.get(a.buildingId)!.name}<ArrowRight size={12}/></button>)}{unique.length>4&&<small>另有 {unique.length-4} 栋参与建筑</small>}</div>}<footer>{record?`首次发现：${new Date(record.at).toLocaleDateString('zh-CN')} · ${EVENTS.find(e=>e.id===record.event)!.name}`:'实际配置并形成协同后自动收录；预览与查看 A 不收录。'}</footer></article>;
  })}</div><p className="book-footnote">已发现的记录会保留。移除措施或更换情境后，「B 正在触发」始终按当前完整布局重新判断；两个校区各自记录。</p></div>;
}
