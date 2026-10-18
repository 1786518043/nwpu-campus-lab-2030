import {describe,it,expect} from 'vitest';
import {CAMPUSES} from '../src/campuses';
import type {CampusConfig,Building} from '../src/campusTypes';
import {createWorld,MEASURES,evaluateSpatial,suitability,addPlacement,emptySpatial,readSpatial,placementKey,placementCost} from '../src/spatial';
import type {Placement,SpatialState} from '../src/spatial';
const box=(x:number,z:number,w:number,h:number)=>[[x,z],[x+w,z],[x+w,z+h],[x,z+h]];
const building=(id:string,kind:string,x:number,z:number,w:number,d:number,height:number):Building=>({id,name:id,kind,points:box(x,z,w,d),holes:[],height,heightSource:'test',center:[x+w/2,z+d/2]});
const config:CampusConfig={...CAMPUSES.changan,data:{...CAMPUSES.changan.data,boundary:box(0,0,40,32),buildings:[building('dorm','dorm',4,4,8,8,2),building('low-roof','academic',16,8,8,4,1),building('tall-south','academic',16,16,8,12,6)],roads:[{id:'main',name:'试验路',kind:'service',points:[[2,14],[38,14]]}],waters:[{id:'water',name:'水体',points:box(32,24,8,8),holes:[]}],grounds:[{id:'park',name:'公园',kind:'park',points:box(0,20,12,12)},{id:'pitch',name:'球场',kind:'pitch',points:box(28,4,8,4)}]}};
const world=createWorld(config);
const p=(projectId:Placement['projectId'],cellId:string):Placement=>({projectId,cellId});
const at=(r:ReturnType<typeof evaluateSpatial>,id:string)=>r.cells.find(c=>c.cellId===id)!;

describe('spatial engine: effects depend on geometry and relationships',()=>{
  it('rejects water, protected courts, non-rooftops, and shuttle on footpaths',()=>{
    expect(suitability(world,'garden','r6c8')).toBeTruthy();
    expect(suitability(world,'garden','r1c7')).toBeTruthy();
    expect(suitability(world,'solar','r0c0')).toBeTruthy();
    expect(suitability(world,'walk','r3c1')).toBeNull();
    const pedestrian=createWorld({...config,data:{...config.data,roads:config.data.roads.map(r=>({...r,kind:'footway'}))}});
    expect(suitability(pedestrian,'walk','r3c1')).toBeNull();
    expect(suitability(pedestrian,'shuttle','r3c1')).toBeTruthy();
  });
  it('moving the same garden changes aggregate benefit and affects only its neighborhood',()=>{
    const base=evaluateSpatial(world,[],'heat'),near=evaluateSpatial(world,[p('garden','r4c1')],'heat'),far=evaluateSpatial(world,[p('garden','r0c9')],'heat');
    expect(near.cost).toBe(far.cost);expect(near.comfort).not.toBe(far.comfort);
    expect(at(near,'r3c1').heat).toBeLessThan(at(base,'r3c1').heat);
    expect(at(near,'r0c9').heat).toBe(at(base,'r0c9').heat);
  });
  it('garden and walk produce a positive local interaction beyond separate benefits',()=>{
    const g=p('garden','r4c1'),w=p('walk','r3c1'),base=evaluateSpatial(world,[],'heat');
    const garden=evaluateSpatial(world,[g],'heat'),walk=evaluateSpatial(world,[w],'heat'),both=evaluateSpatial(world,[g,w],'heat');
    const gain=(r:typeof base)=>at(r,'r3c1').comfort-at(base,'r3c1').comfort;
    expect(gain(both)).toBeGreaterThan(gain(garden)+gain(walk));
    expect(both.interactions.some(x=>x.name==='花园 × 慢行绿荫')).toBe(true);
  });
  it('overlapping gardens do not sum their full cooling twice',()=>{
    const a=p('garden','r4c0'),b=p('garden','r4c1'),one=evaluateSpatial(world,[a],'normal'),two=evaluateSpatial(world,[b],'normal'),both=evaluateSpatial(world,[a,b],'normal');
    expect(at(both,'r3c1').heat).toBe(Math.min(at(one,'r3c1').heat,at(two,'r3c1').heat));
    expect(both.cost).toBe(one.cost+two.cost);
  });
  it('shuttle requires a connected vehicle route; isolated stops and gaps give no service',()=>{
    const stops=[p('shuttle','r3c1'),p('shuttle','r3c8')],single=evaluateSpatial(world,stops.slice(0,1),'normal'),connected=evaluateSpatial(world,stops,'normal');
    expect(single.routes).toEqual([]);expect(single.coverage).toBe(0);expect(connected.routes).toHaveLength(1);
    expect(connected.routes[0].every(id=>world.byId.get(id)?.vehicleRoad)).toBe(true);
    const graph=new Map([...world.transitGraph].filter(([id])=>id!=='r3c4').map(([id,ns])=>[id,ns.filter(n=>n!=='r3c4')]));
    expect(evaluateSpatial({...world,transitGraph:graph},stops,'normal').routes).toEqual([]);
    expect(connected.routeEnergy).toBeGreaterThan(0);
  });
  it('connected walking and transit create feeder access, while dorms receive noise',()=>{
    const plan=[p('shuttle','r3c1'),p('shuttle','r3c8'),p('walk','r3c1'),p('walk','r3c2')];
    const r=evaluateSpatial(world,plan,'normal');
    expect(r.interactions.some(x=>x.name==='慢行 × 接驳')).toBe(true);
    expect(at(r,'r2c1').noise).toBeGreaterThan(0);
    expect(r.interactions.some(x=>x.name==='接驳站 × 宿舍噪声')).toBe(true);
  });
  it('lighting near green land has a real ecological cost and consumes energy',()=>{
    const base=evaluateSpatial(world,[],'normal'),r=evaluateSpatial(world,[p('lighting','r5c1')],'normal');
    expect(at(r,'r5c1').ecology).toBeGreaterThan(0);expect(r.carbon).toBeGreaterThan(base.carbon);
    expect(r.interactions.some(x=>x.name==='照明 × 生态光扰动')).toBe(true);
    const light=evaluateSpatial(world,[p('lighting','r4c1')],'normal'),mixed=evaluateSpatial(world,[p('lighting','r4c1'),p('garden','r4c1')],'normal');
    expect(at(mixed,'r4c1').ecology).toBeGreaterThan(at(light,'r4c1').ecology);
    expect(mixed.interactions.some(x=>x.name==='花园 × 照明光扰动')).toBe(true);
  });
  it('solar responds to south-side shadow and rain, and cannot double-credit retrofit savings',()=>{
    const roof=world.byId.get('r2c4')!;expect(roof.sun).toBeLessThan(1);
    const solar=[p('solar',roof.id)],dry=evaluateSpatial(world,solar,'normal'),rain=evaluateSpatial(world,solar,'rain');
    expect(rain.carbon).toBeGreaterThan(dry.carbon);
    const both=evaluateSpatial(world,[...solar,p('retrofit',roof.id)],'normal');
    expect(at(both,roof.id).energy).toBeGreaterThanOrEqual(0);
    expect(both.interactions.some(x=>x.name==='节能 × 光伏共同上限')).toBe(true);
  });
  it('is deterministic, order-independent and never accumulates events or mutates the plan',()=>{
    const plan=[p('garden','r4c1'),p('walk','r3c1'),p('shuttle','r3c1'),p('shuttle','r3c8')],copy=JSON.stringify(plan);
    const r=evaluateSpatial(world,plan,'normal');evaluateSpatial(world,plan,'heat');evaluateSpatial(world,plan,'rain');
    expect(evaluateSpatial(world,plan,'normal')).toEqual(r);
    expect(evaluateSpatial(world,[...plan].reverse(),'normal')).toEqual(r);expect(JSON.stringify(plan)).toBe(copy);
    for(const event of ['normal','heat','rain','budget'] as const){const r=evaluateSpatial(world,plan,event);expect(r.carbon).toBeGreaterThanOrEqual(0);expect(r.comfort).toBeGreaterThanOrEqual(0);expect(r.comfort).toBeLessThanOrEqual(100);expect(r.coverage).toBeLessThanOrEqual(100);expect(r.cost+r.remaining).toBe(r.budget);}
  });
  it('enforces budget and duplicates without discarding the existing over-budget layout',()=>{
    const placements=world.cells.filter(c=>!suitability(world,'lighting',c.id)).slice(0,16).map(c=>p('lighting',c.id));
    const state:SpatialState={...emptySpatial('changan'),placements,event:'budget'};
    expect(evaluateSpatial(world,state.placements,state.event)).toMatchObject({feasible:false,cost:96,budget:80});
    expect(addPlacement(world,state,p('walk','r3c1')).state).toBe(state);
    expect(addPlacement(world,state,placements[0]).error).toBeTruthy();
    expect(evaluateSpatial(world,placements.slice(0,13),'budget').feasible).toBe(true);
  });
  it('migrates legacy locations and snapshots, preserves them, and rejects cross-campus or corrupt saves',()=>{
    const old={version:1,selected:['garden','walk'],event:'rain',snapshot:{ids:['solar'],savedAt:'2026-10-18'}};
    const state=readSpatial(JSON.stringify(old),world,config);
    expect(state.migrated).toBe(true);expect(state.placements).toHaveLength(2);expect(state.snapshot?.placements).toHaveLength(1);expect(state.event).toBe('rain');
    expect(state.placements.every(p=>!suitability(world,p.projectId,p.cellId))).toBe(true);
    expect(readSpatial(JSON.stringify(state),world,config)).toEqual(state);
    expect(readSpatial(JSON.stringify({...state,campusId:'youyi'}),world,config)).toEqual(emptySpatial('changan'));
    expect(readSpatial('{bad',world,config)).toEqual(emptySpatial('changan'));
    expect(readSpatial(JSON.stringify({...state,placements:[...state.placements,state.placements[0]]}),world,config)).toEqual(emptySpatial('changan'));
    expect(new Set(state.placements.map(placementKey)).size).toBe(2);
  });
});

describe('actual campus geometry supports the spatial game',()=>{
  it('the first challenge is achievable in both campuses within the shared 100-point budget',()=>{
    const plans:Record<string,Placement[]>={
      changan:[p('garden','r-21c4'),p('garden','r5c-11'),p('garden','r3c0'),p('solar','r-8c1'),p('solar','r-8c2'),p('garden','r-9c-2')],
      youyi:[p('garden','r-4c-1'),p('lighting','r2c-8'),p('solar','r-4c-10'),p('solar','r4c-11'),p('garden','r-4c4'),p('garden','r4c-5'),p('garden','r2c1')],
    };
    for(const config of Object.values(CAMPUSES)){const world=createWorld(config),plan=plans[config.id];expect(evaluateSpatial(world,plan,'normal')).toMatchObject({feasible:true,success:true});expect(evaluateSpatial(world,plan,'budget').feasible).toBe(false);}
  });
  for(const config of Object.values(CAMPUSES))it(`${config.name}: all measures have valid candidate sites and independent saves`,()=>{
    const world=createWorld(config);expect(world.cells.length).toBeGreaterThan(200);
    for(const m of MEASURES){const candidate=world.cells.find(c=>!suitability(world,m.id,c.id));expect(candidate,`${m.id} has no valid sites`).toBeTruthy();const p={projectId:m.id,cellId:candidate!.id};expect(placementCost(world,p)).toBeGreaterThan(0);expect(addPlacement(world,emptySpatial(config.id),p).error).toBeUndefined();}
    const normal=evaluateSpatial(world,[],'normal');expect(normal).toMatchObject({carbon:100,comfort:50,coverage:0,cost:0});
  });
});
