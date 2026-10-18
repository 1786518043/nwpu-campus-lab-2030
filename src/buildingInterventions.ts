import * as THREE from 'three';
import type {BuildingAction,BuildingContext} from './buildingPlanning';
import {actionCells,actionKey} from './buildingPlanning';
import type {SpatialResult} from './spatial';
import {measure} from './spatial';
import {boundsOf,pointInside} from './mapGeometry';
import {BUILDING_BASE} from './mapLevels';
import {stopPosition} from './roadNetwork';
import {drawShuttleRoute} from './shuttleRouteDisplay';

export function drawBuildingInterventions(group:THREE.Group,context:BuildingContext,actions:BuildingAction[],selectedId:string|null,result:SpatialResult){
  group.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});group.clear();
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.7}));mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);return mesh;};
  for(const a of actions){
    const site=context.byId.get(a.buildingId)!;
    if(a.projectId==='solar')for(const building of site.buildings)for(const part of building.parts||[building]){
      const b=boundsOf(part.points),holes=part.holes||[];
      // Keep every panel inside the existing real footprint, outside courtyards.
      for(let x=b.minX+.5;x<b.maxX-.3;x+=1.1)for(let z=b.minZ+.5;z<b.maxZ-.3;z+=1.25){
        if(![[x-.3,z-.4],[x+.3,z-.4],[x+.3,z+.4],[x-.3,z+.4]].every(p=>pointInside(p,part.points)&&!holes.some(h=>pointInside(p,h))))continue;
        if(a.legacyCells&&!a.legacyCells.some(id=>{const c=context.world.byId.get(id)!;return Math.abs(c.x-x)<=2&&Math.abs(c.z-z)<=2;}))continue;
        box(x,BUILDING_BASE+part.height+.14,z,.6,.08,.8,0x375b70);
      }
    }
    if(!['solar','retrofit'].includes(a.projectId)){
      const ids=actionCells(context,a);
      for(const cellId of a.projectId==='walk'?ids.slice(0,1):ids){
      const c=context.world.byId.get(cellId);if(!c)continue;
      const [x,z]=a.projectId==='shuttle'?stopPosition(context.world.transitNetwork,cellId)||[c.x,c.z]:[c.x,c.z];
      const color=new THREE.Color(measure(a.projectId).color);
      const marker=new THREE.Mesh(new THREE.RingGeometry(.65,.85,32),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,depthTest:false}));marker.rotation.x=-Math.PI/2;marker.position.set(x,.3,z);marker.renderOrder=4;marker.userData={kind:a.projectId==='shuttle'?'shuttle-stop':'measure',cellId};group.add(marker);
      if(a.projectId==='garden')for(let i=0;i<3;i++)box(c.x+(i-1)*.55,.28,c.z,.42,.24,1.25,0x6a9868);
      if(a.projectId==='lighting'){box(c.x,.75,c.z,.05,1.25,.05,0x798779);box(c.x,.75+1.25/2,c.z,.38,.1,.16,0xeed58e);}
      if(a.projectId==='shuttle'){box(x,.7,z,.07,1.2,.07,0x4c777c);box(x,1.45,z,.7,.18,.45,0x438c9c);}
      if(a.projectId==='walk'&&ids.length>1)for(const from of ids)for(const to of context.world.roadGraph.get(from)||[])if(ids.includes(to)&&from<to){const points=[from,to].map(id=>{const p=context.world.byId.get(id)!;return new THREE.Vector3(p.x,.3,p.z);});group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xc19b52})));}
      }
    }
  }
  for(const route of result.routes)drawShuttleRoute(group,route);
  const selected=selectedId?context.byId.get(selectedId):null;
  if(selected)for(const b of selected.buildings)for(const part of b.parts||[b]){
    const outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(part.points.map(p=>new THREE.Vector3(p[0],BUILDING_BASE+part.height+.22,p[1]))),new THREE.LineBasicMaterial({color:0xc8a452,depthTest:false}));outline.renderOrder=5;group.add(outline);
  }
  group.userData.plan=actions.map(actionKey).join(',');
}
