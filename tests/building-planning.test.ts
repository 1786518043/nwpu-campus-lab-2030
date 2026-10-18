import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {CAMPUSES} from '../src/campuses';
import type {Building,CampusConfig} from '../src/campusTypes';
import {createBuildingContext,clippedArea,evaluateBuildingPlan,emptyBuildingState,addBuildingAction,actionReason,actionCells,actionCost,actionSignature,readBuildingState} from '../src/buildingPlanning';
import type {BuildingAction} from '../src/buildingPlanning';
import {SPATIAL_VERSION,MEASURES,evaluateSpatial} from '../src/spatial';
import {drawBuildingInterventions} from '../src/buildingInterventions';
const box=(x:number,z:number,w:number,d:number)=>[[x,z],[x+w,z],[x+w,z+d],[x,z+d]];
const building=(id:string,x:number,z:number,w:number,d:number):Building=>({id,name:id,kind:'academic',points:box(x,z,w,d),holes:[],center:[x+w/2,z+d/2],height:2,heightSource:'test'});
const config:CampusConfig={...CAMPUSES.changan,data:{...CAMPUSES.changan.data,boundary:box(0,0,32,32),buildings:[building('tiny-a',.2,.2,.6,.6),building('tiny-b',2.8,2.8,.6,.6),{...building('courtyard',8,4,12,12),holes:[box(12,8,4,4)]},building('r42-0',4,24,4,4),{...building('r42-1',12,24,4,4),name:'r42-0'}, {...building('construction',24,24,4,4),status:'under-construction'}],roads:[{id:'main',name:'试验路',kind:'service',points:[[2,18],[30,18]]}],waters:[],grounds:[]}};
const context=createBuildingContext(config),act=(buildingId:string,projectId:BuildingAction['projectId']):BuildingAction=>({buildingId,projectId});
const at=(r:ReturnType<typeof evaluateBuildingPlan>,id:string)=>r.cells.find(c=>c.cellId===id)!;
describe('building selection maps to a private spatial engine',()=>{
  it('clips footprints across cell boundaries and preserves concave areas',()=>{
    expect(clippedArea(box(2,2,4,4),0,0,4,4)).toBe(4);
    expect(clippedArea([[0,0],[4,0],[4,1],[1,1],[1,4],[0,4]],0,0,4,4)).toBe(7);
    expect(context.byId.get('courtyard')!.area).toBe(128);
    expect(context.byId.get('courtyard')!.footprint.some(f=>f.cellId==='r2c3')).toBe(false);
  });
  it('small buildings remain selectable and one building cannot retrofit its neighbour in a shared cell',()=>{
    const a=context.byId.get('tiny-a')!,b=context.byId.get('tiny-b')!;
    expect(a.footprint[0].cellId).toBe(b.footprint[0].cellId);expect(actionReason(context,act(a.id,'retrofit'))).toBeNull();
    const blank=evaluateBuildingPlan(context,[],'normal'),one=evaluateBuildingPlan(context,[act(a.id,'retrofit')],'normal'),both=evaluateBuildingPlan(context,[act(a.id,'retrofit'),act(b.id,'retrofit')],'normal');
    const id=a.footprint[0].cellId,oneSaving=at(blank,id).energy-at(one,id).energy;
    expect(oneSaving).toBeCloseTo(a.footprint[0].energy*.35,10);
    expect(at(blank,id).energy-at(both,id).energy).toBeCloseTo(oneSaving*2,10);
  });
  it('a whole-building action affects all roof fragments and excludes the courtyard',()=>{
    const site=context.byId.get('courtyard')!,blank=evaluateBuildingPlan(context,[],'normal'),r=evaluateBuildingPlan(context,[act(site.id,'solar')],'normal');
    expect(site.footprint.length).toBeGreaterThan(1);
    for(const f of site.footprint)expect(at(r,f.cellId).energy).toBeLessThan(at(blank,f.cellId).energy);
    expect(at(r,'r2c3').energy).toBe(at(blank,'r2c3').energy);
  });
  it('linked building parts select as a single unit and all construction measures are forbidden',()=>{
    const site=context.byBuildingId.get('r42-1')!;expect(site.id).toBe('r42-0');expect(site.buildings).toHaveLength(2);
    for(const m of MEASURES)expect(actionReason(context,act('construction',m.id))).toContain('施工');
  });
  it('uses nearby valid roads and prevents charging twice for the same shared facility',()=>{
    const walk=act('courtyard','walk'),site=context.byId.get(walk.buildingId)!;
    expect(site.targets.walk!.length).toBeGreaterThan(1);
    expect(actionCells(context,walk).every(id=>context.world.byId.get(id)!.road)).toBe(true);
    expect(actionReason(context,walk,[walk])).toBeTruthy();
    const plans=context.sites.filter(s=>s.targets.shuttle).map(s=>act(s.id,'shuttle'));
    for(const p of plans)expect(actionCells(context,p).every(id=>context.world.byId.get(id)!.vehicleRoad)).toBe(true);
  });
  it('keeps order and event changes deterministic, with no negative energy or double-credit',()=>{
    const plan=[act('courtyard','solar'),act('courtyard','retrofit'),act('courtyard','garden'),act('courtyard','walk')];
    const normal=evaluateBuildingPlan(context,plan,'normal');evaluateBuildingPlan(context,plan,'rain');
    expect(evaluateBuildingPlan(context,[...plan].reverse(),'normal')).toEqual(normal);
    expect(evaluateBuildingPlan(context,plan,'normal')).toEqual(normal);
    expect(normal.cells.every(c=>c.energy>=0)).toBe(true);
    expect(evaluateBuildingPlan(context,[act('courtyard','solar')],'rain').carbon).toBeGreaterThan(evaluateBuildingPlan(context,[act('courtyard','solar')],'normal').carbon);
  });
  it('enforces budget without mutating an existing layout',()=>{
    const state={...emptyBuildingState('changan'),event:'budget' as const,actions:[act('courtyard','solar'),act('courtyard','retrofit'),act('r42-0','solar'),act('r42-0','retrofit')]};
    expect(evaluateBuildingPlan(context,state.actions,state.event).feasible).toBe(false);
    expect(addBuildingAction(context,state,act('courtyard','walk')).state).toBe(state);
  });
  it('preserves every old placement, event and A/B scope during migration and isolates campus saves',()=>{
    const old={version:2,gridVersion:SPATIAL_VERSION,campusId:'changan',placements:[{projectId:'solar',cellId:'r1c2'},{projectId:'solar',cellId:'r1c3'}],event:'rain',snapshot:{placements:[{projectId:'garden',cellId:'r0c2'}],savedAt:'2026-10-18'}};
    const migrated=readBuildingState(JSON.stringify(old),context);
    expect(migrated.event).toBe('rain');expect(migrated.actions.flatMap(a=>a.legacyCells!)).toEqual(['r1c2','r1c3']);expect(migrated.snapshot?.actions.flatMap(a=>a.legacyCells!)).toEqual(['r0c2']);
    expect(evaluateBuildingPlan(context,migrated.actions,'rain').cost).toBe(evaluateSpatial(context.world,old.placements as never,'rain').cost);
    expect(readBuildingState(JSON.stringify(migrated),context)).toEqual(migrated);
    expect(readBuildingState(JSON.stringify({...migrated,campusId:'youyi'}),context)).toEqual(emptyBuildingState('changan'));
    expect(actionSignature(migrated.actions[0])).not.toBe(actionSignature({...migrated.actions[0],legacyCells:undefined}));
  });
  it('renders roof interventions without modifying the original campus geometry',()=>{
    const original=JSON.stringify(config.data),group=new THREE.Group(),plan=[act('courtyard','solar')];
    drawBuildingInterventions(group,context,plan,'courtyard',evaluateBuildingPlan(context,plan,'normal'));
    expect(group.children.filter(c=>c instanceof THREE.Mesh).length).toBeGreaterThan(0);
    for(const c of group.children.filter(c=>c instanceof THREE.Mesh)){expect(c.position.y).toBeGreaterThan(2);expect(c.position.x>12&&c.position.x<16&&c.position.z>8&&c.position.z<12).toBe(false);}
    drawBuildingInterventions(group,context,[],null,evaluateBuildingPlan(context,[],'normal'));expect(group.children).toHaveLength(0);expect(JSON.stringify(config.data)).toBe(original);
  });
});
describe('actual campus building units',()=>{
  it('retains attainable building-based challenges in both campuses',()=>{
    const plans={changan:[act('362977206','garden'),act('r14477263-0','garden'),act('363091532','garden'),act('r14477260-0','solar'),act('177231713','garden')],youyi:[act('1267628245','garden'),act('1267628351','lighting'),act('1267628460','solar'),act('1267628078','garden')]};
    for(const config of Object.values(CAMPUSES)){const c=createBuildingContext(config);expect(evaluateBuildingPlan(c,plans[config.id],'normal')).toMatchObject({feasible:true,success:true});}
  });
  for(const config of Object.values(CAMPUSES))it(`${config.name} has valid building units and all six measures`,()=>{
    const c=createBuildingContext(config);expect(c.byBuildingId.size).toBe(config.data.buildings.length);
    for(const m of MEASURES){const site=c.sites.find(s=>!actionReason(c,act(s.id,m.id)));expect(site).toBeTruthy();expect(actionCost(c,act(site!.id,m.id))).toBeGreaterThan(0);}
    expect(evaluateBuildingPlan(c,[],'normal')).toMatchObject({carbon:100,comfort:50,cost:0});
    if(config.id==='changan'){expect(c.byBuildingId.get('r14477263-1')!.buildings).toHaveLength(3);expect(c.sites.find(s=>s.name==='教学东楼')!.buildings.length).toBeGreaterThan(1);}
  });
});
