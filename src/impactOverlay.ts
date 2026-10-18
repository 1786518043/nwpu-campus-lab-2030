import * as THREE from 'three';
import type {BuildingContext} from './buildingPlanning';
import type {ActionImpact,ImpactKind} from './buildingImpact';
import type {ComparisonDisplay,ComparisonKind} from './buildingComparison';
import {CELL_SIZE} from './spatial';
import {shapeOf} from './mapGeometry';
import {BUILDING_BASE} from './mapLevels';
import {stopPosition} from './roadNetwork';
import {drawShuttleRoute} from './shuttleRouteDisplay';

export const IMPACT_COLORS:Record<ImpactKind,number>={positive:0x218b64,negative:0xc44f58,mixed:0xc18323};
export const COMPARISON_COLORS:Record<ComparisonKind,number>={...IMPACT_COLORS,neutral:0x84918a};
export function clearImpactOverlay(group:THREE.Group){
  group.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});group.clear();
}
/** Independent overlays; never replace or recolor the detailed campus meshes. */
export function drawImpactOverlay(group:THREE.Group,context:BuildingContext,impact:ActionImpact|null){
  clearImpactOverlay(group);if(!impact||impact.status==='unavailable')return;
  // A campus-clipped continuous radial field. Each range is a smooth gradient,
  // with no calculation-cell geometry. Depth testing keeps facades legible.
  for(const range of impact.ranges){
    const c=context.world.byId.get(range.cellId)!;const radius=range.radius*CELL_SIZE;
    if(!range.potential){
      const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
        uniforms:{center:{value:new THREE.Vector2(c.x,c.z)},radius:{value:radius},strength:{value:range.strength}},
        vertexShader:'varying vec2 campusPoint; void main(){ campusPoint=vec2(position.x,-position.y); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader:'varying vec2 campusPoint; uniform vec2 center; uniform float radius; uniform float strength; void main(){ float t=length(campusPoint-center)/radius; if(t>=1.0)discard; float a=(1.0-t)*.38*strength; gl_FragColor=vec4(.10,.55,.63,a); }',
      });
      const field=new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(context.config.data.boundary)),material);field.rotation.x=-Math.PI/2;field.position.y=.19;field.renderOrder=2;field.userData.kind='continuous-range';group.add(field);
    }
    const points=Array.from({length:97},(_,i)=>new THREE.Vector3(c.x+Math.cos(i/96*Math.PI*2)*radius,.24,c.z+Math.sin(i/96*Math.PI*2)*radius));
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:range.potential?0x85948a:0x3b8f9b,transparent:true,opacity:range.potential?.55:.8,dashSize:.7,gapSize:.4,depthWrite:false,depthTest:false}));line.computeLineDistances();line.renderOrder=4;line.userData.kind=range.potential?'potential-range':'range-boundary';group.add(line);
    const [x,z]=range.kind==='shuttle'?stopPosition(context.world.transitNetwork,range.cellId)||[c.x,c.z]:[c.x,c.z];
    const anchor=new THREE.Mesh(new THREE.RingGeometry(.27,.43,32),new THREE.MeshBasicMaterial({color:0x327e93,side:THREE.DoubleSide,depthTest:false}));anchor.rotation.x=-Math.PI/2;anchor.position.set(x,.28,z);anchor.renderOrder=5;group.add(anchor);
  }
  drawBuildingOutlines(group,context,impact.buildings);
  for(const route of impact.routes)drawShuttleRoute(group,route,true);
  group.userData.source=impact.action.buildingId;
}
function drawBuildingOutlines(group:THREE.Group,context:BuildingContext,buildings:{buildingId:string;kind:ComparisonKind}[]){
  for(const affected of buildings){
    const site=context.byId.get(affected.buildingId)!;
    for(const building of site.buildings)for(const part of building.parts||[building]){
      for(const boundary of [part.points,...(part.holes||[])]){
        const points=boundary.map(p=>new THREE.Vector3(p[0],BUILDING_BASE+part.height+.26,p[1]));
        const outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:COMPARISON_COLORS[affected.kind],transparent:true,opacity:.95,depthTest:false}));outline.renderOrder=6;outline.userData.buildingId=site.id;outline.userData.impact=affected.kind;group.add(outline);
      }
      // Sparse vertical accents expose the effect even on a low camera angle.
      const edges=part.points.filter((_,i)=>i%Math.max(1,Math.ceil(part.points.length/6))===0).flatMap(p=>[new THREE.Vector3(p[0],.2,p[1]),new THREE.Vector3(p[0],part.height+.24,p[1])]);
      const verticals=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edges),new THREE.LineBasicMaterial({color:COMPARISON_COLORS[affected.kind],transparent:true,opacity:.5,depthWrite:false}));group.add(verticals);
    }
  }
}
export function drawComparisonOverlay(group:THREE.Group,context:BuildingContext,buildings:ComparisonDisplay[]){
  clearImpactOverlay(group);drawBuildingOutlines(group,context,buildings);
  const max=Math.max(1,...buildings.map(b=>b.score));
  for(const affected of buildings){
    if(affected.kind==='neutral')continue;
    for(const b of context.byId.get(affected.buildingId)!.buildings)for(const part of b.parts||[b]){
      const roof=new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(part.points,part.holes)),new THREE.MeshBasicMaterial({color:COMPARISON_COLORS[affected.kind],transparent:true,opacity:.07+.1*affected.score/max,depthWrite:false,side:THREE.DoubleSide}));
      roof.rotation.x=-Math.PI/2;roof.position.y=BUILDING_BASE+part.height+.2;roof.renderOrder=3;roof.userData.kind='comparison-roof';roof.userData.buildingId=affected.buildingId;group.add(roof);
    }
  }
  group.userData.mode='comparison';
}
