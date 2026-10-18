import * as THREE from 'three';

export function pointInside(p: number[], poly: number[][]) {
  let hit = false;
  for (let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i], b=poly[j];
    if ((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) hit=!hit;
  }
  return hit;
}
export function shapeOf(points: number[][], holes: number[][][]=[]) {
  const shape = new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],-p[1])));
  holes.forEach(h=>shape.holes.push(new THREE.Path(h.map(p=>new THREE.Vector2(p[0],-p[1])))));
  return shape;
}
export function boundsOf(points: number[][]) {
  const xs=points.map(p=>p[0]), zs=points.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  return {minX,maxX,minZ,maxZ,width:maxX-minX,depth:maxZ-minZ,cx:(minX+maxX)/2,cz:(minZ+maxZ)/2};
}
export function distanceToSegment(p:number[],a:number[],b:number[]) {
  const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz;
  const t=l ? THREE.MathUtils.clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l,0,1) : 0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);
}
// A single instanced draw per material keeps the repeated facade details inexpensive.
export type BoxInstance = {x:number; y:number; z:number; w:number; h:number; d:number; angle?:number};
export function instanceBoxes(scene:THREE.Object3D, items:BoxInstance[], material:THREE.Material, shadow=false) {
  if (!items.length) return;
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,items.length);
  const dummy=new THREE.Object3D();
  items.forEach((b,i)=>{
    dummy.position.set(b.x,b.y,b.z); dummy.scale.set(b.w,b.h,b.d); dummy.rotation.set(0,b.angle||0,0);
    dummy.updateMatrix(); mesh.setMatrixAt(i,dummy.matrix);
  });
  mesh.castShadow=shadow; mesh.receiveShadow=true; scene.add(mesh); return mesh;
}
