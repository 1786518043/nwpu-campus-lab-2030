import * as THREE from 'three';
import type {CampusConfig} from './campusTypes';
import {boundsOf,instanceBoxes,pointInside,shapeOf} from './mapGeometry';
import type {BoxInstance} from './mapGeometry';
import {BUILDING_BASE} from './mapLevels';

const palette:Record<string,number>={academic:0xe3d6c3,dorm:0xe8d9c4,library:0xd5ded7,sport:0xe5e3d7,dining:0xdbc4a8,public:0xd7d6c6};

export function buildCampusBuildings(scene:THREE.Scene,config:CampusConfig) {
  const buildings:THREE.Mesh[]=[];
  const panes:BoxInstance[]=[], frames:BoxInstance[]=[], trims:BoxInstance[]=[], equipment:BoxInstance[]=[], solar:BoxInstance[]=[];
  const concrete:BoxInstance[]=[],scaffolds:BoxInstance[]=[],bluePanels:BoxInstance[]=[];
  const roofMaterial=new THREE.MeshStandardMaterial({color:0xb8bab0,roughness:.95});
  const floorLines:number[]=[];
  config.data.buildings.flatMap(b=>b.parts?.map(part=>({...b,...part}))||[b]).forEach(b=>{
    if(b.points.length<3) return;
    const construction=b.status==='under-construction',glass=b.modelStyle==='glass-pavilion';
    const baseColor=construction?0x829ba5:glass?0x6698a6:b.modelStyle==='haitian-dorm'?0xe8e9e3:palette[b.kind]||palette.academic;
    const wall=new THREE.MeshStandardMaterial({color:baseColor,roughness:glass?.25:.86,transparent:construction,opacity:construction?.36:1,depthWrite:!construction});
    const geometry=new THREE.ExtrudeGeometry(shapeOf(b.points,b.holes),{depth:b.height,bevelEnabled:false});
    const body=new THREE.Mesh(geometry,[construction?wall:roofMaterial,wall]);
    body.rotation.x=-Math.PI/2;body.position.y=BUILDING_BASE;body.castShadow=true;body.receiveShadow=true;
    body.userData={id:b.id,name:b.name,baseColor,wall};scene.add(body);buildings.push(body);

    const floorCount=glass?1:Math.max(1,Math.round(b.height/.35)),floorHeight=b.height/floorCount;
    if(construction){
      // The August 2026 photo shows topped-out frames behind blue-grey safety
      // mesh. Slabs, columns and scaffold grids are schematic, not shop drawings.
      const bb=boundsOf(b.points),fits=(x:number,z:number)=>pointInside([x,z],b.points)&&!b.holes.some(h=>pointInside([x,z],h));
      for(let f=0;f<=floorCount;f++){
        const slab=new THREE.Mesh(new THREE.ExtrudeGeometry(shapeOf(b.points,b.holes),{depth:.055,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:0xb8b5a8,roughness:1}));
        slab.rotation.x=-Math.PI/2;slab.position.y=BUILDING_BASE+Math.max(0,f*floorHeight-.055);slab.castShadow=true;slab.receiveShadow=true;scene.add(slab);
      }
      for(let x=bb.minX+.12;x<bb.maxX;x+=.68)for(let z=bb.minZ+.12;z<bb.maxZ;z+=.68){
        if(fits(x,z))concrete.push({x,y:BUILDING_BASE+b.height/2,z,w:.075,h:b.height,d:.075});
      }
      for(const ring of [b.points,...b.holes])for(let i=1;i<ring.length;i++){
        const a=ring[i-1],c=ring[i],dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz),angle=Math.atan2(-dz,dx);
        for(let t=0;t<=length;t+=.46)scaffolds.push({x:a[0]+dx*t/length,y:BUILDING_BASE+b.height/2+.08,z:a[1]+dz*t/length,w:.018,h:b.height+.16,d:.018});
        for(let f=1;f<=floorCount;f++)scaffolds.push({x:(a[0]+c[0])/2,y:BUILDING_BASE+f*floorHeight,z:(a[1]+c[1])/2,w:length,h:.018,d:.018,angle});
      }
      return;
    }
    [b.points,...b.holes].forEach((ring,ringIndex)=>{
      const signed=ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0);
      const direction=(signed>0?1:-1)*(ringIndex? -1:1);
      for(let i=0;i<ring.length;i++) {
        const a=ring[i],c=ring[(i+1)%ring.length],dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);
        if(length<.05)continue;
        const angle=Math.atan2(-dz,dx),nx=dz/length*direction,nz=-dx/length*direction;
        // Parapet and a grounded plinth trace the actual footprint, including courtyards.
        trims.push({x:(a[0]+c[0])/2,y:BUILDING_BASE+b.height+.05,z:(a[1]+c[1])/2,w:length+.025,h:.15,d:.1,angle});
        trims.push({x:(a[0]+c[0])/2,y:BUILDING_BASE+.08,z:(a[1]+c[1])/2,w:length+.025,h:.16,d:.11,angle});
        for(let f=1;f<floorCount;f++)floorLines.push(a[0]+nx*.012,BUILDING_BASE+f*floorHeight,a[1]+nz*.012,c[0]+nx*.012,BUILDING_BASE+f*floorHeight,c[1]+nz*.012);
        const curtain=glass||b.kind==='library'&&(config.id==='changan'||b.id==='1267628278');
        const bays=Math.floor(length/(curtain?.37:.48));
        for(let col=0;col<bays;col++){
          const t=(col+.5)/bays;
          for(let f=0;f<floorCount;f++){
            const x=a[0]+dx*t,z=a[1]+dz*t,y=BUILDING_BASE+(f+.55)*floorHeight;
            const w=length/bays*(curtain?.89:.59),h=floorHeight*(curtain?.78:.54);
            frames.push({x:x+nx*.025,y,z:z+nz*.025,w:w+.055,h:h+.045,d:.035,angle});
            panes.push({x:x+nx*.048,y,z:z+nz*.048,w,h,d:.02,angle});
          }
        }
        if(b.modelStyle==='haitian-dorm'&&length>5){
          for(const t of [.12,.88])bluePanels.push({x:a[0]+dx*t+nx*.065,y:BUILDING_BASE+b.height/2,z:a[1]+dz*t+nz*.065,w:.32,h:b.height,d:.055,angle});
        }
      }
    });
    // Roof elements stay inside the source footprint and outside courtyard voids.
    const box=boundsOf(b.points);
    const fits=(x:number,z:number,w:number,d:number)=>[[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]].every(p=>pointInside(p,b.points)&&!b.holes.some(h=>pointInside(p,h)));
    if(glass){
      // A shallow metal roof, glazed frontage and narrow entrance canopy.
      for(let x=box.minX+.15;x<box.maxX;x+=.25)trims.push({x,y:BUILDING_BASE+b.height+.02,z:box.cz,w:.015,h:.025,d:box.depth});
      trims.push({x:box.cx,y:BUILDING_BASE+b.height-.08,z:box.minZ-.18,w:1.2,h:.045,d:.35});
      return;
    }
    let rooftopUnits=0;
    for(let x=box.minX+.65;x<box.maxX-.6;x+=1.3){
      for(let z=box.minZ+.65;z<box.maxZ-.6;z+=1.4){
        if(config.projects.find(p=>p.id==='solar')!.buildingIds.includes(b.id)&&fits(x,z,.7,.9)) {
          solar.push({x,y:BUILDING_BASE+b.height+.16,z,w:.68,h:.11,d:.85});
        } else if(rooftopUnits<3&&fits(x,z,.65,.5)) {
          equipment.push({x,y:BUILDING_BASE+b.height+.13,z,w:.65,h:.26,d:.5});rooftopUnits++;
        }
      }
    }
    // Long glazing strips are an expressive roof detail, not surveyed roof equipment.
    if(b.kind==='library'&&config.id==='changan'){
      for(let x=box.minX+1.2;x<box.maxX-1;x+=1.45){
        const z=box.minZ+2.6;
        if(fits(x,z,.65,1.35)){
          trims.push({x,y:BUILDING_BASE+b.height+.065,z,w:.8,h:.13,d:1.5});
          panes.push({x,y:BUILDING_BASE+b.height+.14,z,w:.63,h:.07,d:1.3});
        }
      }
    }
  });
  instanceBoxes(scene,trims,new THREE.MeshStandardMaterial({color:0xf4eddd,roughness:.8}),true);
  instanceBoxes(scene,frames,new THREE.MeshStandardMaterial({color:0xd4d7cf,roughness:.7}));
  instanceBoxes(scene,panes,new THREE.MeshStandardMaterial({color:0x668b92,roughness:.33,metalness:.28}));
  instanceBoxes(scene,equipment,new THREE.MeshStandardMaterial({color:0xc5c8bd,roughness:.8}),true);
  instanceBoxes(scene,bluePanels,new THREE.MeshStandardMaterial({color:0x438bb5,roughness:.7}));
  instanceBoxes(scene,concrete,new THREE.MeshStandardMaterial({color:0xb5b1a6,roughness:1}),true);
  instanceBoxes(scene,scaffolds,new THREE.MeshStandardMaterial({color:0xa59b75,roughness:.8}));
  const bands=new THREE.BufferGeometry();bands.setAttribute('position',new THREE.Float32BufferAttribute(floorLines,3));
  scene.add(new THREE.LineSegments(bands,new THREE.LineBasicMaterial({color:0x9caa9e,transparent:true,opacity:.38})));
  const solarGroup=new THREE.Group();scene.add(solarGroup);
  instanceBoxes(solarGroup,solar.map(p=>({...p,y:p.y-.105,w:p.w*.8,d:p.d*.8,h:.11})),new THREE.MeshStandardMaterial({color:0x78837e}),true);
  instanceBoxes(solarGroup,solar,new THREE.MeshStandardMaterial({color:0x244f66,roughness:.3,metalness:.45}),true);
  // Visible cell divisions make the proposed installation legible on zoom.
  instanceBoxes(solarGroup,solar.flatMap(p=>[-.22,0,.22].map(offset=>({...p,y:p.y+.06,x:p.x+offset,w:.014,h:.009}))),new THREE.MeshBasicMaterial({color:0xa0c5d1}));
  solarGroup.visible=false;
  return {buildings,solarGroup,detailCount:panes.length};
}
