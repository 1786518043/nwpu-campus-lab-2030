import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {CAMPUSES} from '../src/campuses';
import type {Building,CampusConfig} from '../src/campusTypes';
import {createBuildingContext,actionCells,evaluateBuildingPlan} from '../src/buildingPlanning';
import type {BuildingAction} from '../src/buildingPlanning';
import {compareBuildingPlans,comparisonBuildings,comparisonDisplay,COMPARISON_METRICS} from '../src/buildingComparison';
import {drawComparisonOverlay,clearImpactOverlay} from '../src/impactOverlay';
const box=(x:number,z:number,w:number,d:number)=>[[x,z],[x+w,z],[x+w,z+d],[x,z+d]];
const b=(id:string,x:number,z:number,w=4,d=4):Building=>({id,name:id,kind:'dorm',points:box(x,z,w,d),holes:[],center:[x+w/2,z+d/2],height:2,heightSource:'test'});
const config:CampusConfig={...CAMPUSES.changan,data:{...CAMPUSES.changan.data,boundary:box(0,0,64,48),buildings:[b('one',8,12),b('two',32,12),b('far',52,36),b('tiny-a',.2,.2,.6,.6),b('tiny-b',2.8,2.8,.6,.6),{...b('courtyard',8,28,12,12),holes:[box(12,32,4,4)]}],roads:[{id:'main',name:'试验路',kind:'service',points:[[2,18],[62,18]]}],waters:[],grounds:[{id:'green',kind:'grass',points:box(0,0,44,24)}]}};
const context=createBuildingContext(config),act=(buildingId:string,projectId:BuildingAction['projectId']):BuildingAction=>({buildingId,projectId});
const row=(result:ReturnType<typeof compareBuildingPlans>,id:string)=>result.buildings.find(b=>b.buildingId===id)!;

describe('whole-plan building A/B comparison',()=>{
  it('identical layouts have no highlights even when the action order changes',()=>{
    const actions=[act('one','garden'),act('one','walk'),act('two','solar')];
    const c=compareBuildingPlans(context,actions,[...actions].reverse(),'heat');
    expect(c.identical).toBe(true);expect(c.a).toEqual(c.b);
    for(const metric of COMPARISON_METRICS)expect(comparisonBuildings(c,metric.id)).toEqual([]);
  });
  it('moving a garden improves the receiving area and worsens the former area',()=>{
    const c=compareBuildingPlans(context,[act('one','garden')],[act('two','garden')],'normal');
    expect(comparisonDisplay(row(c,'one'),'heat').kind).toBe('negative');
    expect(comparisonDisplay(row(c,'two'),'heat').kind).toBe('positive');
    expect(comparisonDisplay(row(c,'far'),'overall').kind).toBe('neutral');
    expect(row(c,'one').removed).toHaveLength(1);expect(row(c,'two').added).toHaveLength(1);
  });
  it('retains a negative cost even when overall comfort improves',()=>{
    const a=[act('one','garden')],c=compareBuildingPlans(context,a,[...a,act('one','lighting')],'normal'),one=row(c,'one');
    expect(comparisonDisplay(one,'overall').kind).toBe('mixed');
    expect(comparisonDisplay(one,'comfort').kind).toBe('positive');
    expect(comparisonDisplay(one,'costs').kind).toBe('negative');
    expect(one.values.find(v=>v.key==='ecology')!.delta).toBeGreaterThan(0);
    expect(one.values.find(v=>v.key==='lightingEnergy')!.delta).toBeGreaterThan(0);
  });
  it('A/B reversal negates each delta and swaps improvements and deterioration',()=>{
    const a=[act('one','garden'),act('tiny-a','solar')],b=[act('two','garden'),act('one','lighting')];
    const forward=compareBuildingPlans(context,a,b,'rain'),backward=compareBuildingPlans(context,b,a,'rain');
    for(const building of forward.buildings){
      const opposite=row(backward,building.buildingId);
      for(const v of building.values)expect(opposite.values.find(q=>q.key===v.key)!.delta).toBeCloseTo(-v.delta,10);
      for(const metric of COMPARISON_METRICS){const x=comparisonDisplay(building,metric.id).kind,y=comparisonDisplay(opposite,metric.id).kind;expect(y).toBe(x==='positive'?'negative':x==='negative'?'positive':x);}
    }
  });
  it('does not credit a neighbouring roof even inside the same internal cell',()=>{
    expect(actionCells(context,act('tiny-a','solar'))).toEqual(actionCells(context,act('tiny-b','solar')));
    const c=compareBuildingPlans(context,[],[act('tiny-a','solar')],'normal');
    expect(comparisonDisplay(row(c,'tiny-a'),'roof').kind).toBe('positive');
    expect(comparisonDisplay(row(c,'tiny-b'),'overall').kind).toBe('neutral');
    expect(comparisonBuildings(c,'overall').map(b=>b.buildingId)).toEqual(['tiny-a']);
  });
  it('accounts for remote station activation and separates route running energy',()=>{
    const a=[act('one','shuttle')],c=compareBuildingPlans(context,a,[...a,act('two','shuttle')],'normal');
    expect(c.routeEnergyA).toBe(0);expect(c.routeEnergyB).toBeGreaterThan(0);
    expect(row(c,'one').values.find(v=>v.key==='access')!.delta).toBeGreaterThan(0);
    expect(row(c,'one').values.find(v=>v.key==='noise')!.delta).toBeGreaterThan(0);
    expect(row(c,'one').added).toHaveLength(0);expect(row(c,'one').removed).toHaveLength(0);
  });
  it('shows an isolated station as configuration-only change, without invented benefits',()=>{
    const c=compareBuildingPlans(context,[],[act('one','shuttle')],'normal'),shown=comparisonBuildings(c,'overall');
    expect(shown).toHaveLength(1);expect(shown[0].kind).toBe('neutral');expect(shown[0].added).toHaveLength(1);
  });
  it('uses a common event and budget, leaves layouts untouched, and detects infeasibility',()=>{
    const a=[act('one','solar')],b=[act('one','solar'),act('one','retrofit'),act('two','solar'),act('two','retrofit'),act('courtyard','solar')];
    const original=JSON.stringify({a,b,data:config.data}),c=compareBuildingPlans(context,a,b,'budget');
    expect(c.a.budget).toBe(80);expect(c.b.budget).toBe(80);expect(c.a.feasible).toBe(true);expect(c.b.feasible).toBe(false);
    compareBuildingPlans(context,a,b,'rain');expect(compareBuildingPlans(context,a,b,'budget')).toEqual(c);
    expect(JSON.stringify({a,b,data:config.data})).toBe(original);
    expect(c.b).toEqual(evaluateBuildingPlan(context,b,'budget'));
  });
  it('preserves legacy local roof scope and recognizes a whole-building replacement',()=>{
    const old={...act('courtyard','solar'),legacyCells:[actionCells(context,act('courtyard','solar'))[0]]};
    const c=compareBuildingPlans(context,[old],[act('courtyard','solar')],'normal'),site=row(c,'courtyard');
    expect(site.legacy).toBe(true);expect(site.added).toHaveLength(1);expect(site.removed[0].legacyCells).toEqual(old.legacyCells);
    expect(comparisonDisplay(site,'roof').kind).toBe('positive');
  });
});
describe('detailed comparison overlay',()=>{
  it('adds a separate roof tint, preserves courtyards and disposes the comparison layer',()=>{
    const original=JSON.stringify(config.data),group=new THREE.Group(),c=compareBuildingPlans(context,[],[act('courtyard','solar')],'normal');
    drawComparisonOverlay(group,context,comparisonBuildings(c,'roof'));
    const roof=group.children.find(o=>o.userData.kind==='comparison-roof') as THREE.Mesh;
    expect(roof.geometry).toBeInstanceOf(THREE.ShapeGeometry);expect(roof.userData.buildingId).toBe('courtyard');
    const shape=(roof.geometry as THREE.ShapeGeometry).parameters.shapes as THREE.Shape;expect(shape.holes).toHaveLength(1);
    expect(group.children.some(o=>o instanceof THREE.GridHelper)).toBe(false);
    const disposed=vi.spyOn(roof.geometry,'dispose');drawComparisonOverlay(group,context,[]);expect(disposed).toHaveBeenCalledOnce();expect(group.children).toHaveLength(0);
    clearImpactOverlay(group);expect(JSON.stringify(config.data)).toBe(original);
  });
  for(const campus of Object.values(CAMPUSES))it(`compares the actual ${campus.name} under each common scenario`,()=>{
    const c=createBuildingContext(campus),site=c.sites.find(s=>!s.construction&&s.targets.garden&&s.targets.lighting)!;
    for(const event of ['normal','heat','rain','budget'] as const){
      const result=compareBuildingPlans(c,[act(site.id,'garden')],[act(site.id,'garden'),act(site.id,'lighting')],event);
      expect(result.buildings).toHaveLength(c.sites.length);expect(result.a.budget).toBe(result.b.budget);
      expect(result.buildings.every(b=>b.values.every(v=>Number.isFinite(v.delta)))).toBe(true);
      expect(comparisonBuildings(result,'overall').length).toBeGreaterThan(0);
    }
  });
});
