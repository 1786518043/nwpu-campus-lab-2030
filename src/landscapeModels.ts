import * as THREE from 'three';
import type {CampusConfig} from './campusTypes';
import {boundsOf,pointInside,shapeOf,instanceBoxes,distanceToSegment} from './mapGeometry';
import type {BoxInstance} from './mapGeometry';

export function addLandscapeDetails(scene:THREE.Scene,config:CampusConfig) {
  const campus=config.data;
  const courtPosts:BoxInstance[]=[],courtBoards:BoxInstance[]=[],courtNets:BoxInstance[]=[];
  const lineVertices:number[]=[];
  const line=(pts:number[][],y=.19)=>{for(let i=1;i<pts.length;i++)lineVertices.push(pts[i-1][0],y,pts[i-1][1],pts[i][0],y,pts[i][1]);};
  const surface=(pts:number[][],color:number,y:number)=>{
    const m=new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(pts)),new THREE.MeshStandardMaterial({color,roughness:.95}));
    m.rotation.x=-Math.PI/2;m.position.y=y;m.receiveShadow=true;scene.add(m);
  };
  campus.grounds.filter(g=>g.kind==='pitch'||g.kind==='track').forEach(g=>{
    // Align markings to the source polygon's long edge, never to screen axes.
    let longest=0,axis=[0,1];
    for(let i=1;i<g.points.length;i++){
      const dx=g.points[i][0]-g.points[i-1][0],dz=g.points[i][1]-g.points[i-1][1],l=Math.hypot(dx,dz);
      if(l>longest){longest=l;axis=[dx/l,dz/l];}
    }
    const cross=[axis[1],-axis[0]];
    const projected=g.points.map(p=>[p[0]*cross[0]+p[1]*cross[1],p[0]*axis[0]+p[1]*axis[1]]);
    const b=boundsOf(projected),w=b.width-.25,d=b.depth-.25;
    if(w<1||d<1)return;
    const world=(x:number,z:number)=>[(x+b.cx)*cross[0]+(z+b.cz)*axis[0],(x+b.cx)*cross[1]+(z+b.cz)*axis[1]];
    const path=(p:number[][],y=.19)=>line(p.map(([x,z])=>world(x,z)),y);
    const rect=(x:number,z:number,ww:number,dd:number,y=.19)=>path([[x-ww/2,z-dd/2],[x+ww/2,z-dd/2],[x+ww/2,z+dd/2],[x-ww/2,z+dd/2],[x-ww/2,z-dd/2]],y);
    const circle=(x:number,z:number,r:number)=>path(Array.from({length:49},(_,i)=>[x+Math.cos(i/48*Math.PI*2)*r,z+Math.sin(i/48*Math.PI*2)*r]));
    if(config.athleticsIds.includes(g.id)){
      const capsule=(r:number,halfStraight:number)=>{
        const p:number[][]=[];
        for(let i=0;i<=32;i++){const a=i/32*Math.PI;p.push(world(Math.cos(a)*r,Math.sin(a)*r+halfStraight));}
        for(let i=0;i<=32;i++){const a=Math.PI+i/32*Math.PI;p.push(world(Math.cos(a)*r,Math.sin(a)*r-halfStraight));}
        p.push(p[0]);return p;
      };
      const radius=w/2,straight=Math.max(0,d/2-radius);
      surface(capsule(radius,straight),0xbd7b62,.10);
      surface(capsule(radius-1.0,straight),0x799d72,.12);
      for(let i=0;i<=6;i++)line(capsule(radius-.08-i*.15,straight),.16);
      const pw=Math.min(6.8,w-2.7),pd=Math.min(10.5,d-3.2);
      rect(0,0,pw,pd);path([[-pw/2,0],[pw/2,0]]);circle(0,0,.915);
      for(const sign of [-1,1]){
        rect(0,sign*(pd/2-.825),Math.min(4.03,pw*.75),1.65);
        rect(0,sign*(pd/2-.275),Math.min(1.83,pw*.35),.55);
      }
    } else if(g.sport==='multi') {
      // The compound is traced from the school plan. Court types/markings are
      // illustrative: available official material does not survey every court.
      surface(g.points,0xc1b6a1,.09);
      const rows=Math.max(1,Math.floor(d/3.7)),cols=Math.max(1,Math.floor(w/3.3));
      const angle=Math.atan2(-axis[1],axis[0]);
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const x=-w/2+w/cols*(col+.5),z=-d/2+d/rows*(row+.5),tennis=row>=Math.ceil(rows*.6);
        const cw=tennis?1.097:1.5,cd=tennis?2.377:2.8;
        const slab=[[-cw/2-.32,-cd/2-.35],[cw/2+.32,-cd/2-.35],[cw/2+.32,cd/2+.35],[-cw/2-.32,cd/2+.35]].map(([a,b])=>world(x+a,z+b));
        if(!slab.every(p=>pointInside(p,g.points)))continue;
        surface(slab,tennis?0x668d95:0x6e9c8b,.12);rect(x,z,cw,cd,.16);
        path([[x-cw/2,z],[x+cw/2,z]],.16);
        if(tennis){
          for(const side of [-1,1])path([[x+side*.4115,z-cd/2],[x+side*.4115,z+cd/2]],.16);
          rect(x,z,.823,1.28,.16);path([[x,z-.64],[x,z+.64]],.16);
          const n=world(x,z);courtNets.push({x:n[0],y:.2,z:n[1],w:.018,h:.18,d:cw+.1,angle});
          for(const side of [-1,1]){const p=world(x+side*(cw/2+.06),z);courtPosts.push({x:p[0],y:.2,z:p[1],w:.025,h:.4,d:.025});}
        }else{
          circle(x,z,.18);
          for(const side of [-1,1]){
            rect(x,z+side*(cd/2-.29),.49,.58,.16);
            const p=world(x,z+side*(cd/2+.06)),back=world(x,z+side*(cd/2-.1));
            courtPosts.push({x:p[0],y:.2,z:p[1],w:.035,h:.4,d:.035});
            courtBoards.push({x:back[0],y:.36,z:back[1],w:.025,h:.12,d:.18,angle});
          }
        }
      }
    } else {
      // A source football pitch inside a mapped track is already rendered above.
      if(campus.grounds.some(other=>config.athleticsIds.includes(other.id)&&g.points.every(p=>pointInside(p,other.points))))return;
      const rows=Math.max(1,Math.floor(d/3.2)),cols=Math.max(1,Math.floor(w/1.9));
      const cw=w/cols*.83,cd=d/rows*.89;
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const x=-w/2+w/cols*(col+.5),z=-d/2+d/rows*(row+.5);
        if(![[-1,-1],[1,-1],[1,1],[-1,1]].every(([a,b])=>pointInside(world(x+a*cw/2,z+b*cd/2),g.points)))continue;
        rect(x,z,cw,cd);path([[x-cw/2,z],[x+cw/2,z]]);circle(x,z,Math.min(cw*.16,.18));
        rect(x,z-cd/2+cd*.1,cw*.35,cd*.2);rect(x,z+cd/2-cd*.1,cw*.35,cd*.2);
      }
    }
  });
  const white=new THREE.BufferGeometry();white.setAttribute('position',new THREE.Float32BufferAttribute(lineVertices,3));
  scene.add(new THREE.LineSegments(white,new THREE.LineBasicMaterial({color:0xf4f0dc,transparent:true,opacity:.87})));
  instanceBoxes(scene,courtPosts,new THREE.MeshStandardMaterial({color:0x596f65}),true);
  instanceBoxes(scene,courtBoards,new THREE.MeshStandardMaterial({color:0xf1ecdb}),true);
  instanceBoxes(scene,courtNets,new THREE.MeshStandardMaterial({color:0xd6ded5,transparent:true,opacity:.55,side:THREE.DoubleSide}));

  let seed=config.id==='changan'?3821:9276;
  const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  const positions:number[][]=[],box=boundsOf(campus.boundary);
  const buildingExclusions=campus.buildings.map(b=>({points:b.points,...boundsOf(b.points)}));
  const nearBuilding=(p:number[])=>buildingExclusions.some(b=>p[0]>=b.minX-.85&&p[0]<=b.maxX+.85&&p[1]>=b.minZ-.85&&p[1]<=b.maxZ+.85&&(pointInside(p,b.points)||b.points.slice(1).some((q,i)=>distanceToSegment(p,b.points[i],q)<.85)));
  const clear=(p:number[],roadClearance:number)=>pointInside(p,campus.boundary)&&!nearBuilding(p)&&!campus.waters.some(w=>pointInside(p,w.points))&&!campus.grounds.some(g=>['pitch','track','construction'].includes(g.kind)&&pointInside(p,g.points))&&!campus.roads.some(r=>r.points.slice(1).some((q,i)=>distanceToSegment(p,r.points[i],q)<roadClearance));
  // Avenue trees follow actual road segments; the planting positions are illustrative.
  for(const road of campus.roads.filter(r=>!['footway','path','steps'].includes(r.kind))){
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
      for(let t=2;t<len;t+=3.3)for(const side of [-1,1]){
        const p=[a[0]+dx*t/len-dz/len*1.08*side,a[1]+dz*t/len+dx/len*1.08*side];
        if(clear(p,.7)&&positions.every(q=>Math.hypot(p[0]-q[0],p[1]-q[1])>1.2))positions.push(p);
      }
    }
  }
  const target=config.id==='changan'?600:420;
  for(let i=0;i<5000&&positions.length<target;i++){
    const p=[box.minX+random()*box.width,box.minZ+random()*box.depth];
    if(clear(p,1)&&positions.every(q=>Math.hypot(p[0]-q[0],p[1]-q[1])>1.4))positions.push(p);
  }
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.055,.085,.8,6),new THREE.MeshStandardMaterial({color:0x948668}),positions.length);
  const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.55,2),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),positions.length);
  const dummy=new THREE.Object3D(),treeColor=new THREE.Color();
  positions.forEach((p,i)=>{
    const s=.72+random()*.65;
    dummy.position.set(p[0],.42,p[1]);dummy.scale.set(1,s,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    dummy.position.y=.85*s;dummy.scale.set(s,s*1.35,s);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
    treeColor.setHSL(.25+random()*.05,.20+random()*.07,.40+random()*.12);crowns.setColorAt(i,treeColor);
  });
  crowns.castShadow=true;trunks.castShadow=true;scene.add(trunks,crowns);
  const poles:BoxInstance[]=[],lamps:BoxInstance[]=[],benches:BoxInstance[]=[];
  positions.filter((_,i)=>i%7===0).forEach(p=>{
    if(!clear([p[0]+.7,p[1]],.6))return;
    poles.push({x:p[0]+.7,y:.45,z:p[1],w:.035,h:.9,d:.035});
    lamps.push({x:p[0]+.7,y:.93,z:p[1],w:.17,h:.06,d:.12});
    benches.push({x:p[0]-.35,y:.24,z:p[1]+.55,w:.45,h:.09,d:.15});
  });
  instanceBoxes(scene,poles,new THREE.MeshStandardMaterial({color:0x6e7b6c}));
  const lampMaterial=new THREE.MeshStandardMaterial({color:0xf3e7b9,emissive:0xefc879,emissiveIntensity:0});
  instanceBoxes(scene,lamps,lampMaterial);
  instanceBoxes(scene,benches,new THREE.MeshStandardMaterial({color:0xa38f71}));
  return {lampMaterial};
}
