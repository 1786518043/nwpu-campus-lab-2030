import * as THREE from 'three';
import type {RoadRoute} from './roadNetwork';

/** A narrow strip within the road, with a centerline preserving every bend. */
export function drawShuttleRoute(group:THREE.Group,route:RoadRoute,preview=false){
  const y=preview?.38:.34,color=0x237d91,vertices:number[]=[];
  for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-7)continue;
    const dx=-(b[1]-a[1])/length*.14,dz=(b[0]-a[0])/length*.14;
    const corners=[[a[0]+dx,y,a[1]+dz],[a[0]-dx,y,a[1]-dz],[b[0]+dx,y,b[1]+dz],[b[0]-dx,y,b[1]-dz]];
    for(const n of [0,1,2,2,1,3])vertices.push(...corners[n]);
  }
  const strip=new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:preview,opacity:preview?.35:1,depthWrite:false}));
  strip.renderOrder=3;strip.userData.kind=preview?'preview-route-strip':'shuttle-route-strip';group.add(strip);
  const points=route.points.map(p=>new THREE.Vector3(p[0],y+.01,p[1]));
  const material=preview?new THREE.LineDashedMaterial({color,dashSize:.55,gapSize:.25,depthTest:false}):new THREE.LineBasicMaterial({color});
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),material);
  if(preview)line.computeLineDistances();line.renderOrder=4;line.userData.kind=preview?'preview-route':'shuttle-route';group.add(line);
}
