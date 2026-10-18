import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {CAMPUSES} from '../src/campuses';
import type {Building,CampusConfig} from '../src/campusTypes';
import {createBuildingContext,evaluateBuildingPlan,actionCells,actionReason} from '../src/buildingPlanning';
import type {BuildingAction} from '../src/buildingPlanning';
import {evaluateActionImpact} from '../src/buildingImpact';
import {drawImpactOverlay,clearImpactOverlay} from '../src/impactOverlay';
const box=(x:number,z:number,w:number,d:number)=>[[x,z],[x+w,z],[x+w,z+d],[x,z+d]];
const b=(id:string,x:number,z:number,w=4,d=4):Building=>({id,name:id,kind:'dorm',points:box(x,z,w,d),holes:[],center:[x+w/2,z+d/2],height:2,heightSource:'test'});
const config:CampusConfig={...CAMPUSES.changan,data:{...CAMPUSES.changan.data,boundary:box(0,0,64,48),buildings:[b('one',8,12),b('two',24,12),b('far',52,36),b('tiny-a',.2,.2,.6,.6),b('tiny-b',2.8,2.8,.6,.6),{...b('construction',40,8),status:'under-construction'}],roads:[{id:'main',name:'试验路',kind:'service',points:[[2,18],[62,18]]}],waters:[],grounds:[{id:'green',kind:'grass',points:box(0,0,32,32)}]}};
const context=createBuildingContext(config),act=(buildingId:string,projectId:BuildingAction['projectId']):BuildingAction=>({buildingId,projectId});

describe('selected-action counterfactual impact',()=>{
  it('isolates one roof action even when neighbours share a computation cell',()=>{
    const selected=act('tiny-a','solar'),impact=evaluateActionImpact(context,[],'normal',selected);
    expect(context.byId.get('tiny-a')!.footprint[0].cellId).toBe(context.byId.get('tiny-b')!.footprint[0].cellId);
    expect(impact.buildings.map(b=>b.buildingId)).toEqual(['tiny-a']);expect(impact.ranges).toEqual([]);
    expect(impact.buildings[0].positive[0].value).toBeLessThan(0);
  });
  it('shows only marginal changes, and addition equals the contribution of the installed action',()=>{
    const selected=act('one','garden'),others=[act('far','solar'),act('one','walk')],saved=JSON.stringify(others);
    const preview=evaluateActionImpact(context,others,'heat',selected);
    const installed=evaluateActionImpact(context,[...others,selected],'heat',selected);
    expect(installed.status).toBe('installed');expect(preview.status).toBe('preview');
    expect(installed.buildings).toEqual(preview.buildings);expect(installed.ranges).toEqual(preview.ranges);
    expect(preview.buildings.some(b=>b.buildingId==='far')).toBe(false);
    expect(preview.buildings.some(b=>b.positive.some(e=>e.key==='synergy'))).toBe(true);
    expect(JSON.stringify(others)).toBe(saved);
  });
  it('keeps benefits and costs visible even if the net comfort change is positive',()=>{
    const impact=evaluateActionImpact(context,[act('one','garden')],'normal',act('one','lighting'));
    const local=impact.buildings.find(b=>b.buildingId==='one')!;
    expect(local.kind).toBe('mixed');expect(local.netComfort).toBeGreaterThan(0);
    expect(local.positive.some(e=>e.key==='light')).toBe(true);
    expect(local.negative.some(e=>e.key==='ecology')).toBe(true);
    expect(local.negative.some(e=>e.key==='energy')).toBe(true);
    expect(impact.ranges.every(f=>f.kind==='lighting'&&f.radius===2)).toBe(true);
  });
  it('does not invent service for an isolated stop; a second stop also activates the first area',()=>{
    const one=act('one','shuttle'),two=act('two','shuttle');
    expect(actionReason(context,one)).toBeNull();expect(actionReason(context,two,[one])).toBeNull();
    const idle=evaluateActionImpact(context,[],'normal',one);
    expect(idle.idleShuttle).toBe(true);expect(idle.buildings).toEqual([]);expect(idle.ranges.every(f=>f.potential)).toBe(true);expect(idle.routeEnergyDelta).toBe(0);
    const linked=evaluateActionImpact(context,[one],'normal',two);
    expect(linked.idleShuttle).toBe(false);expect(linked.routeEnergyDelta).toBeGreaterThan(0);expect(linked.routes.length).toBeGreaterThan(0);
    for(const cellId of [...actionCells(context,one),...actionCells(context,two)])expect(linked.ranges.some(f=>f.kind==='shuttle'&&f.cellId===cellId)).toBe(true);
    expect(linked.buildings.some(b=>b.buildingId==='one'&&b.negative.some(e=>e.key==='noise'))).toBe(true);
  });
  it('respects A scope, invalid locations and budget without writing plan state',()=>{
    const selected=act('one','lighting');
    expect(evaluateActionImpact(context,[],'normal',selected,'A')).toMatchObject({status:'unavailable',buildings:[],ranges:[]});
    expect(evaluateActionImpact(context,[],'normal',act('construction','solar')).status).toBe('unavailable');
    const expensive=[act('one','solar'),act('one','retrofit'),act('two','solar'),act('two','retrofit'),act('far','solar')];
    const original=JSON.stringify(expensive),impact=evaluateActionImpact(context,expensive,'budget',selected);
    expect(impact.status).toBe('preview');expect(impact.overBudget).toBeGreaterThan(0);expect(impact.buildings.length).toBeGreaterThan(0);expect(JSON.stringify(expensive)).toBe(original);
  });
  it('recomputes under each common event, order independently, without changing old scores',()=>{
    const others=[act('one','walk'),act('two','solar')],selected=act('one','garden');
    const heat=evaluateActionImpact(context,others,'heat',selected);
    evaluateActionImpact(context,others,'rain',selected);
    expect(evaluateActionImpact(context,[...others].reverse(),'heat',selected)).toEqual(heat);
    const normal=evaluateBuildingPlan(context,others,'normal');
    expect(normal.budget).toBe(100);expect(normal.cells.every(c=>Number.isFinite(c.light)&&Number.isFinite(c.synergy))).toBe(true);
  });
  it('preserves legacy scope rather than silently previewing a whole building',()=>{
    const old={...act('one','solar'),legacyCells:[context.byId.get('one')!.footprint[0].cellId]};
    expect(evaluateActionImpact(context,[old],'normal',act('one','solar'))).toMatchObject({status:'installed',legacy:true,action:old});
  });
});
describe('non-destructive 3D impact overlay',()=>{
  it('renders continuous ranges and exact roof outlines, and disposes on replacement',()=>{
    const original=JSON.stringify(config.data),impact=evaluateActionImpact(context,[act('one','garden')],'normal',act('one','lighting')),group=new THREE.Group();
    drawImpactOverlay(group,context,impact);
    expect(group.children.some(o=>o.userData.kind==='continuous-range'&&o instanceof THREE.Mesh&&o.material instanceof THREE.ShaderMaterial)).toBe(true);
    expect(group.children.some(o=>o.userData.buildingId==='one'&&o.userData.impact==='mixed')).toBe(true);
    expect(group.children.some(o=>o instanceof THREE.GridHelper||o instanceof THREE.Mesh&&o.geometry instanceof THREE.BoxGeometry)).toBe(false);
    const geometry=(group.children[0] as THREE.Mesh).geometry,disposed=vi.spyOn(geometry,'dispose');
    clearImpactOverlay(group);expect(disposed).toHaveBeenCalledOnce();expect(group.children).toHaveLength(0);expect(JSON.stringify(config.data)).toBe(original);
  });
  for(const config of Object.values(CAMPUSES))it(`evaluates all six measures in ${config.name}`,()=>{
    const c=createBuildingContext(config);
    for(const projectId of ['solar','retrofit','garden','walk','shuttle','lighting'] as const){
      const site=c.sites.find(s=>!actionReason(c,act(s.id,projectId)))!;
      const impact=evaluateActionImpact(c,[],'normal',act(site.id,projectId));
      expect(impact.status).toBe('preview');expect(impact.buildings.every(b=>Number.isFinite(b.netComfort))).toBe(true);
    }
  });
});
