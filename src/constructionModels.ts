import * as THREE from 'three';
import type {CampusConfig} from './campusTypes';
import {boundsOf,instanceBoxes} from './mapGeometry';
import type {BoxInstance} from './mapGeometry';

/** Construction equipment is illustrative; the building's source date is in its inspector. */
export function addConstructionSites(scene:THREE.Scene,config:CampusConfig){
  const fence:BoxInstance[]=[],posts:BoxInstance[]=[],yellow:BoxInstance[]=[],concrete:BoxInstance[]=[];
  for(const site of config.data.grounds.filter(g=>g.kind==='construction')){
    const bb=boundsOf(site.points);
    for(let i=1;i<site.points.length;i++){
      const a=site.points[i-1],b=site.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),angle=Math.atan2(-dz,dx);
      const bays=Math.ceil(length/.7);
      for(let j=0;j<bays;j++){
        // Gate on the north edge, facing the existing cross-campus road.
        if(i===1&&j>=Math.floor(bays/2)-1&&j<=Math.floor(bays/2)+1)continue;
        const t=(j+.5)/bays,x=a[0]+dx*t,z=a[1]+dz*t;
        fence.push({x,y:.14,z,w:length/bays-.035,h:.28,d:.035,angle});
        posts.push({x:a[0]+dx*j/bays,y:.17,z:a[1]+dz*j/bays,w:.035,h:.34,d:.035});
      }
    }
    // Two tower cranes, placed in the courtyards; mast bases meet the ground.
    for(const [x,z,rotation] of [[bb.cx-1,32.1,0],[bb.cx+1,42.5,Math.PI/2]]){
      const h=3.9;
      concrete.push({x,y:.06,z,w:.46,h:.12,d:.46});
      for(const dx of [-.105,.105])for(const dz of [-.105,.105])yellow.push({x:x+dx,y:h/2,z:z+dz,w:.025,h,d:.025});
      for(let y=.25;y<h;y+=.3){
        yellow.push({x,y,z,w:.24,h:.025,d:.24});
      }
      const jibX=x+Math.cos(rotation)*.75,jibZ=z-Math.sin(rotation)*.75;
      yellow.push({x:jibX,y:h,z:jibZ,w:4.1,h:.09,d:.18,angle:rotation});
      yellow.push({x:x-Math.cos(rotation)*.9,y:h-.1,z:z+Math.sin(rotation)*.9,w:.45,h:.25,d:.3,angle:rotation});
      posts.push({x:x+Math.cos(rotation)*2,y:h-.55,z:z-Math.sin(rotation)*2,w:.012,h:1.0,d:.012});
    }
    for(let i=0;i<4;i++)concrete.push({x:bb.minX+.9+i*.45,y:.11,z:bb.minZ+.32,w:.35,h:.22,d:.35});
  }
  instanceBoxes(scene,fence,new THREE.MeshStandardMaterial({color:0x688fa1,roughness:.8}),true);
  instanceBoxes(scene,posts,new THREE.MeshStandardMaterial({color:0xc3ccd0,roughness:.7}),true);
  instanceBoxes(scene,yellow,new THREE.MeshStandardMaterial({color:0xd4ac48,roughness:.7}),true);
  instanceBoxes(scene,concrete,new THREE.MeshStandardMaterial({color:0xb0aaa0,roughness:1}),true);
}
