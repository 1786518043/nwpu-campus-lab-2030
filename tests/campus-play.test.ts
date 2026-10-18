import {describe,it,expect} from 'vitest';
import {CAMPUSES} from '../src/campuses';
import type {Building,CampusConfig} from '../src/campusTypes';
import {createBuildingContext,emptyBuildingState,evaluateBuildingPlan,actionReason,readBuildingState} from '../src/buildingPlanning';
import type {BuildingAction} from '../src/buildingPlanning';
import {activeDiscoveries,campusVoices,completeMission,discoverFromPlan,emptyPlayProgress,evaluateMissions,missionStarts,playStorageKey,readPlayProgress} from '../src/campusPlay';
import type {MissionId} from '../src/campusPlay';
const contexts=Object.values(CAMPUSES).map(createBuildingContext);
const at='2026-10-18T08:00:00.000Z';
const act=(buildingId:string,projectId:BuildingAction['projectId']):BuildingAction=>({buildingId,projectId});
const balanced={changan:[act('362977206','garden'),act('r14477263-0','garden'),act('363091532','garden'),act('r14477260-0','solar'),act('177231713','garden')],youyi:[act('1267628245','garden'),act('1267628351','lighting'),act('1267628460','solar'),act('1267628078','garden')]};

describe.each(contexts)('$config.name learning journey',context=>{
  const empty=emptyBuildingState(context.config.id),blank=evaluateBuildingPlan(context,[],'normal');
  it('all four missions are attainable and hints reference valid buildings and measures',()=>{
    for(const id of ['cool','shade','connect','balance'] as MissionId[]){
      for(const a of missionStarts(context,id))expect(actionReason(context,a)).toBeNull();
      const actions=id==='balance'?balanced[context.config.id]:missionStarts(context,id);
      const state={...empty,actions},result=evaluateBuildingPlan(context,actions,state.event);
      expect(result.feasible,`${id}: ${result.problems.join(',')}`).toBe(true);
      expect(evaluateMissions(context,actions,result,blank).find(m=>m.id===id)?.ready,id).toBe(true);
      const completed=completeMission(emptyPlayProgress(context.config.id),context,state,id,at);
      expect(completed.completed[id]?.actions).toEqual(actions);
      expect(readPlayProgress(JSON.stringify(completed),context)).toEqual(completed);
    }
  });
  it('does not complete an empty plan or a single unconnected station',()=>{
    expect(evaluateMissions(context,[],blank,blank).every(m=>!m.ready)).toBe(true);
    const actions=missionStarts(context,'connect').slice(0,1),r=evaluateBuildingPlan(context,actions,'normal');
    expect(activeDiscoveries(context,actions,r).some(d=>d.id==='shuttle-network')).toBe(false);
    expect(evaluateMissions(context,actions,r,blank).find(m=>m.id==='connect')?.ready).toBe(false);
    expect(campusVoices(context,actions,'normal',r,blank,actions[0].buildingId).some(v=>v.id==='idle')).toBe(true);
  });
  it('has discoverable green, walking, shuttle and last-mile combinations',()=>{
    const shade=missionStarts(context,'shade'),sr=evaluateBuildingPlan(context,shade,'normal');
    expect(activeDiscoveries(context,shade,sr).map(d=>d.id)).toEqual(expect.arrayContaining(['shade','walk-network']));
    const stops=missionStarts(context,'connect');
    const connected=[...stops,act(stops[0].buildingId,'walk')],r=evaluateBuildingPlan(context,connected,'normal');
    expect(r.feasible).toBe(true);
    expect(activeDiscoveries(context,connected,r).map(d=>d.id)).toEqual(expect.arrayContaining(['shuttle-network','last-mile']));
    for(const d of activeDiscoveries(context,shade,sr))expect(d.buildingIds).toContain(shade[0].buildingId);
  });
  it('recalculates for each scenario and ignores action order',()=>{
    const actions=missionStarts(context,'shade');
    for(const event of ['normal','heat','rain','budget'] as const){
      const r=evaluateBuildingPlan(context,actions,event),b=evaluateBuildingPlan(context,[],event),reverse=evaluateBuildingPlan(context,[...actions].reverse(),event);
      expect(evaluateMissions(context,actions,r,b)).toEqual(evaluateMissions(context,[...actions].reverse(),reverse,b));
      expect(activeDiscoveries(context,actions,r)).toEqual(activeDiscoveries(context,[...actions].reverse(),reverse));
      expect(evaluateMissions(context,actions,r,b).find(m=>m.id==='shade')?.ready).toBe(true);
    }
  });
  it('rejects awards for over-budget plans while preserving earlier valid records',()=>{
    const shade=missionStarts(context,'shade'),state={...empty,actions:shade},r=evaluateBuildingPlan(context,shade,'normal');
    let learned=discoverFromPlan(emptyPlayProgress(context.config.id),context,state,r,at);
    learned=completeMission(learned,context,state,'shade',at);
    const roofs=context.sites.filter(s=>!actionReason(context,act(s.id,'solar'))).slice(0,12).map(s=>act(s.id,'solar'));
    const invalid={...state,event:'budget' as const,actions:[...shade,...roofs]},bad=evaluateBuildingPlan(context,invalid.actions,invalid.event);
    expect(bad.remaining).toBeLessThan(0);
    expect(discoverFromPlan(emptyPlayProgress(context.config.id),context,invalid,bad,at).discoveries).toEqual({});
    expect(completeMission(learned,context,invalid,'shade','2026-10-19T08:00:00.000Z')).toBe(learned);
    expect(evaluateMissions(context,[],blank,blank).find(m=>m.id==='shade')?.ready).toBe(false);
    expect(activeDiscoveries(context,[],blank)).toEqual([]);
    expect(readPlayProgress(JSON.stringify(learned),context)).toEqual(learned);
  });
  it('stores reproducible evidence without changing building state, snapshot or scores',()=>{
    const actions=missionStarts(context,'shade'),state={...empty,actions,snapshot:{actions:balanced[context.config.id],savedAt:at}},original=JSON.stringify(state),r=evaluateBuildingPlan(context,actions,'normal');
    const p=emptyPlayProgress(context.config.id),learned=discoverFromPlan(p,context,state,r,at);
    expect(p.discoveries).toEqual({});
    expect(learned.discoveries.shade?.actions).not.toBe(state.actions);
    expect(discoverFromPlan(learned,context,state,r,'2026-10-19T08:00:00.000Z')).toBe(learned);
    expect(JSON.stringify(state)).toBe(original);
    expect(evaluateBuildingPlan(context,actions,'normal')).toEqual(r);
    expect(readBuildingState(original,context)).toEqual({...state,migrated:false});
  });
  it('validates stored history and cannot mix campus records',()=>{
    const state={...empty,actions:missionStarts(context,'shade')},r=evaluateBuildingPlan(context,state.actions,'normal');
    const learned=discoverFromPlan(emptyPlayProgress(context.config.id),context,state,r,at);
    const other=context.config.id==='changan'?'youyi':'changan';
    expect(playStorageKey(context.config.id)).not.toBe(playStorageKey(other));
    expect(readPlayProgress(JSON.stringify({...learned,campusId:other}),context)).toEqual(emptyPlayProgress(context.config.id));
    expect(readPlayProgress('{bad',context)).toEqual(emptyPlayProgress(context.config.id));
    expect(readPlayProgress(JSON.stringify({...learned,discoveries:{shade:{...learned.discoveries.shade,actions:[act('missing','garden')]}}}),context).discoveries).toEqual({});
    expect(readPlayProgress(JSON.stringify({...learned,completed:{connect:learned.discoveries.shade},discoveries:{'shuttle-network':learned.discoveries.shade}}),context)).toMatchObject({completed:{},discoveries:{}});
    expect(readPlayProgress(JSON.stringify({...learned,activeMission:'unknown'}),context).activeMission).toBe('cool');
    expect(readPlayProgress(JSON.stringify({...learned,activeMission:null}),context).activeMission).toBeNull();
  });
  it('voices track the shown plan and weather, keeping light costs alongside benefits',()=>{
    const actions=missionStarts(context,'shade'),site=actions[0].buildingId;
    const r=evaluateBuildingPlan(context,actions,'normal');
    expect(campusVoices(context,[],'normal',blank,blank,site).some(v=>v.tone==='positive')).toBe(false);
    expect(campusVoices(context,actions,'normal',r,blank,site).some(v=>v.id==='cool')).toBe(true);
    const rain=evaluateBuildingPlan(context,actions,'rain'),rainBase=evaluateBuildingPlan(context,[],'rain');
    expect(campusVoices(context,actions,'rain',rain,rainBase,site).some(v=>v.id==='rain')).toBe(true);
    const lit=[...actions,act(site,'lighting')],lr=evaluateBuildingPlan(context,lit,'normal'),voices=campusVoices(context,lit,'normal',lr,blank,site);
    expect(lr.feasible).toBe(true);
    expect(voices.some(v=>v.tone==='positive')).toBe(true);
    expect(voices.some(v=>v.id==='ecology'&&v.tone==='tradeoff')).toBe(true);
    expect(voices.find(v=>v.id==='cool')?.character).toBe('student');
    expect(voices.find(v=>v.id==='ecology')?.character).toBe('teacher');
    expect(campusVoices(context,actions,'normal',r,blank,site)).toEqual(campusVoices(context,[...actions].reverse(),'normal',r,blank,site));
  });
  it('gives building energy feedback to a staff character with reproducible evidence',()=>{
    const site=context.sites.find(s=>!actionReason(context,act(s.id,'retrofit')))!;
    const actions=[act(site.id,'retrofit')],result=evaluateBuildingPlan(context,actions,'normal');
    const voice=campusVoices(context,actions,'normal',result,blank,site.id).find(v=>v.id==='energy');
    expect(voice?.character).toBe('staff');expect(voice?.role).toContain('职工');
    expect(voice?.evidence).toContain((blank.carbon-result.carbon).toFixed(2));
  });
});

it('last-mile discovery only names the connected shuttle component serving the walk',()=>{
  const box=(x:number,z:number,w:number,d:number)=>[[x,z],[x+w,z],[x+w,z+d],[x,z+d]];
  const building=(id:string,x:number,z:number):Building=>({id,name:id,kind:'academic',points:box(x,z,4,4),holes:[],center:[x+2,z+2],height:2,heightSource:'test'});
  const config:CampusConfig={...CAMPUSES.changan,data:{...CAMPUSES.changan.data,boundary:box(0,0,40,44),buildings:[building('a',4,0),building('b',24,0),building('c',4,34),building('d',24,34)],roads:[{id:'north',name:'北路',kind:'service',points:[[2,6],[36,6]]},{id:'south',name:'南路',kind:'service',points:[[2,30],[36,30]]}],waters:[],grounds:[]}};
  const c=createBuildingContext(config),actions=[act('a','shuttle'),act('b','shuttle'),act('c','shuttle'),act('d','shuttle'),act('a','walk')];
  const r=evaluateBuildingPlan(c,actions,'normal');
  expect(r.feasible).toBe(true);expect(r.routes).toHaveLength(2);
  expect(activeDiscoveries(c,actions,r).find(d=>d.id==='last-mile')?.buildingIds).toEqual(['a','b']);
});
