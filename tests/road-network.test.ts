import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createRoadNetwork,roadRoute,stopPosition,isVehicleRoad} from '../src/roadNetwork';
import type {RoadPoint,RoadRoute} from '../src/roadNetwork';
import type {CampusData} from '../src/campusTypes';
import {CAMPUSES} from '../src/campuses';
import {distanceToSegment} from '../src/mapGeometry';
import {createBuildingContext,evaluateBuildingPlan,readBuildingState,emptyBuildingState} from '../src/buildingPlanning';
import {evaluateActionImpact} from '../src/buildingImpact';
import {compareBuildingPlans} from '../src/buildingComparison';
import {shuttleRouteEnergy} from '../src/spatial';
import {drawBuildingInterventions} from '../src/buildingInterventions';
import {drawImpactOverlay,clearImpactOverlay} from '../src/impactOverlay';

const road=(id:string,points:RoadPoint[],kind='service')=>({id,name:id,kind,points});
const stop=(id:string,point:RoadPoint)=>({id,point});
function followsRoads(route:RoadRoute,roads:CampusData['roads']){
  for(let i=1;i<route.points.length;i++)expect(roads.some(r=>isVehicleRoad(r.kind)&&r.points.slice(1).some((p,j)=>distanceToSegment(route.points[i-1],r.points[j],p)<1e-6&&distanceToSegment(route.points[i],r.points[j],p)<1e-6)),'each entire drawn segment must belong to an existing vehicle road').toBe(true);
}
describe('road geometry routing',()=>{
  it('snaps stops to roads and preserves every turn without cutting across a U-shaped road',()=>{
    const roads=[road('u',[[0,0],[0,20],[20,20],[20,0]])],network=createRoadNetwork(roads,[stop('a',[1,2]),stop('b',[19,2])]);
    const route=roadRoute(network,'a','b')!;
    expect(route.points).toEqual([[0,2],[0,20],[20,20],[20,2]]);expect(route.length).toBe(56);
    expect(stopPosition(network,'a')).toEqual(route.points[0]);expect(stopPosition(network,'b')).toEqual(route.points.at(-1));followsRoads(route,roads);
  });
  it('does not bridge nearby parallel roads, a small gap, or a pedestrian-only connection',()=>{
    const parallel=[road('a',[[0,0],[30,0]]),road('b',[[0,2],[30,2]]),road('walk',[[0,0],[0,2]],'footway')];
    expect(roadRoute(createRoadNetwork(parallel,[stop('a',[2,0]),stop('b',[28,2])]),'a','b')).toBeNull();
    const gap=[road('a',[[0,0],[15,0]]),road('b',[[15.01,0],[30,0]])];
    expect(roadRoute(createRoadNetwork(gap,[stop('a',[2,0]),stop('b',[28,0])]),'a','b')).toBeNull();
  });
  it('splits T and crossing junctions and shared collinear segments',()=>{
    const roads=[road('main',[[0,0],[30,0]]),road('cross',[[15,-10],[15,10]]),road('tee',[[25,0],[25,10]]),road('overlap',[[20,0],[40,0]])];
    const network=createRoadNetwork(roads,[stop('a',[15,-8]),stop('b',[25,8]),stop('c',[38,0])]);
    const ab=roadRoute(network,'a','b')!,ac=roadRoute(network,'a','c')!;
    expect(ab.length).toBe(26);expect(ab.points).toContainEqual([15,0]);expect(ab.points).toContainEqual([25,0]);expect(ac.length).toBe(31);
    followsRoads(ab,roads);followsRoads(ac,roads);
  });
  it('chooses distance rather than vertex count, and is independent of input ordering',()=>{
    const roads=[road('dense-short',[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0]]),road('sparse-long',[[0,0],[5,10],[10,0]])];
    const stops=[stop('a',[0,0]),stop('b',[10,0])],original=JSON.stringify({roads,stops});
    const first=roadRoute(createRoadNetwork(roads,stops),'a','b')!,reordered=roadRoute(createRoadNetwork([...roads].reverse(),[...stops].reverse()),'a','b')!;
    expect(first.length).toBe(10);expect(first).toEqual(reordered);expect(first.points.every(p=>p[1]===0)).toBe(true);expect(JSON.stringify({roads,stops})).toBe(original);
    // Extra source vertices do not increase operating energy.
    const sparse=roadRoute(createRoadNetwork([road('short',[[0,0],[10,0]])],stops),'a','b')!;
    expect(shuttleRouteEnergy([first])).toBe(shuttleRouteEnergy([sparse]));
  });
  it('handles repeated vertices and two stops at the same road point without phantom length',()=>{
    const network=createRoadNetwork([road('r',[[0,0],[0,0],[20,0]])],[stop('a',[10,1]),stop('b',[10,-1])]);
    expect(roadRoute(network,'a','b')).toMatchObject({length:0,points:[[10,0]]});
  });
});

describe('campus routes, displays and save compatibility',()=>{
  for(const campusId of ['changan','youyi'] as const)it(`${campusId}: preview and installed lines follow source roads, and A/B uses the same route energy`,()=>{
    const context=createBuildingContext(CAMPUSES[campusId]);
    const ids=campusId==='changan'?['177231713','177231719']:['1267628305','1267628489'];
    const actions=ids.map(buildingId=>({buildingId,projectId:'shuttle' as const}));
    const result=evaluateBuildingPlan(context,actions,'normal'),preview=evaluateActionImpact(context,actions.slice(0,1),'normal',actions[1]);
    expect(result.routes).toHaveLength(1);expect(preview.routes).toEqual(result.routes);
    const route=result.routes[0];followsRoads(route,context.config.data.roads);
    expect(route.points[0]).toEqual(stopPosition(context.world.transitNetwork,route.from));expect(route.points.at(-1)).toEqual(stopPosition(context.world.transitNetwork,route.to));
    const before=JSON.stringify({...emptyBuildingState(campusId),actions,event:'rain',snapshot:{actions:actions.slice(0,1),savedAt:'2026-10-18'}});
    const loaded=readBuildingState(before,context);
    expect(loaded.actions).toEqual(actions);expect(loaded.snapshot?.actions).toEqual(actions.slice(0,1));expect(loaded.event).toBe('rain');expect(loaded.campusId).toBe(campusId);
    const comparison=compareBuildingPlans(context,actions.slice(0,1),actions,'rain');
    expect(comparison.a.routes).toHaveLength(0);expect(comparison.b.routes).toEqual(result.routes);expect(comparison.routeEnergyA).toBe(0);expect(comparison.routeEnergyB).toBeCloseTo(shuttleRouteEnergy(result.routes));expect(preview.routeEnergyDelta).toBeCloseTo(comparison.routeEnergyB);
    const installedGroup=new THREE.Group(),previewGroup=new THREE.Group();
    drawBuildingInterventions(installedGroup,context,actions,null,result);drawImpactOverlay(previewGroup,context,preview);
    for(const [group,kind] of [[installedGroup,'shuttle-route'],[previewGroup,'preview-route']] as const){
      const line=group.children.find(o=>o.userData.kind===kind) as THREE.Line;
      const positions=line.geometry.getAttribute('position');expect(positions.count).toBe(route.points.length);
      route.points.forEach((p,i)=>{expect(positions.getX(i)).toBeCloseTo(p[0],4);expect(positions.getZ(i)).toBeCloseTo(p[1],4);});
    }
    for(const marker of installedGroup.children.filter(o=>o.userData.kind==='shuttle-stop'))expect([marker.position.x,marker.position.z]).toEqual(stopPosition(context.world.transitNetwork,marker.userData.cellId));
    clearImpactOverlay(installedGroup);clearImpactOverlay(previewGroup);
  });
});
