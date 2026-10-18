import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {CAMPUSES} from '../src/campuses';
import {buildCampusBuildings} from '../src/buildingModels';
import {GROUND_TOP,BOARD_DEPTH} from '../src/mapLevels';
import {shapeOf,boundsOf,pointInside} from '../src/mapGeometry';
import audit from '../research/changan-geometry-audit.json';

describe('Chang’an south model regression',()=>{
  it('contains the verified south compound and excludes the stray off-campus building',()=>{
    const c=CAMPUSES.changan.data;
    expect(c.buildings.some(b=>b.id==='1553568695')).toBe(false);
    expect(c.buildings.find(b=>b.id==='official-aviation-support')?.holes.length).toBe(3);
    expect(c.grounds.find(g=>g.id==='official-haitian-courts')?.sport).toBe('multi');
    expect(c.buildings.filter(b=>b.id.startsWith('r14477260-'))).toHaveLength(1);
    expect(c.buildings.filter(b=>b.id.startsWith('r14477262-'))).toHaveLength(1);
    expect(audit.outsideGround).toEqual([]);
    expect(audit.overlaps).toEqual([]);
    expect(audit.sportsBuildingConflicts).toEqual([]);
    expect(audit.newBuildingRoadConflicts).toEqual([]);
  });
  it('preserves verified neighbourhoods, courtyard voids and construction state',()=>{
    const c=CAMPUSES.changan.data,find=(id:string)=>c.buildings.find(b=>b.id===id)!;
    const phase3=find('official-haitian-block4'),phase4=find('official-haitian-phase4'),food=find('official-haitian-food-plaza');
    const p3=boundsOf(phase3.points),p4=boundsOf(phase4.points),canteen=boundsOf(find('1087520424').points);
    expect(p3.maxZ).toBeLessThan(boundsOf(find('r14477263-0').points).minZ);
    expect(p3.maxX).toBeLessThan(boundsOf(find('r14477262-0').points).minX);
    expect(p4.maxX).toBeLessThan(boundsOf(find('r14477260-0').points).minX);
    expect(boundsOf(food.points).maxZ).toBeLessThan(canteen.minZ);
    expect(phase3.holes).toHaveLength(1);expect(phase3.levels).toBe(6);
    expect(phase4.holes).toHaveLength(3);expect(phase4.status).toBe('under-construction');
    expect(phase4.parts!.filter(p=>p.height===phase4.height)).toHaveLength(4);
    const site=c.grounds.find(g=>g.kind==='construction')!;
    expect(phase4.points.every(p=>pointInside(p,site.points))).toBe(true);
    expect(food.modelStyle).toBe('glass-pavilion');
    for(const b of [phase3,phase4,food]){
      expect(b.evidence?.length).toBeGreaterThanOrEqual(2);
      expect(b.positionNote).toContain('近似');
      expect(CAMPUSES.changan.tours.some(t=>t.buildingId===b.id)).toBe(true);
    }
  });
  it('every rendered body and connector rests on the actual board top',()=>{
    const config=CAMPUSES.changan,scene=new THREE.Scene();
    const {buildings}=buildCampusBuildings(scene,config);
    const ground=new THREE.Mesh(new THREE.ExtrudeGeometry(shapeOf(config.data.boundary),{depth:BOARD_DEPTH,bevelEnabled:false}));
    ground.rotation.x=-Math.PI/2;ground.position.y=GROUND_TOP-BOARD_DEPTH;
    const groundTop=new THREE.Box3().setFromObject(ground).max.y;
    for(const mesh of buildings){
      const bodyBottom=new THREE.Box3().setFromObject(mesh).min.y;
      expect(bodyBottom,`${mesh.userData.name} floats above the board`).toBeCloseTo(groundTop,5);
    }
    expect(buildings.filter(m=>m.userData.id==='r14477260-0').length).toBeGreaterThan(1);
    ground.geometry.dispose();
    scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments)o.geometry.dispose();});
  });
});
