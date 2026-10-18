import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Plus,Minus,RotateCcw,Layers,Navigation,MapPin,Maximize2,Minimize2,Eye,EyeOff,X,ScanSearch} from 'lucide-react';
import type {ProjectId,EventId} from './game';
import type {CampusConfig,Building} from './campusTypes';
import {boundsOf,pointInside,shapeOf} from './mapGeometry';
import {buildCampusBuildings} from './buildingModels';
import {addLandscapeDetails} from './landscapeModels';
import {addConstructionSites} from './constructionModels';
import {GROUND_TOP,BOARD_DEPTH} from './mapLevels';
import {assetUrl} from './assetUrl';
import {measure} from './spatial';
import type {SpatialResult} from './spatial';
import {actionKey} from './buildingPlanning';
import type {BuildingContext,BuildingAction} from './buildingPlanning';
import {drawBuildingInterventions} from './buildingInterventions';

type MapProps={config:CampusConfig;selected:ProjectId[];focused:ProjectId|null;event:EventId;onFocus:(id:ProjectId)=>void;onSources:()=>void;onClearFocus:()=>void;planning?:{context:BuildingContext;actions:BuildingAction[];result:SpatialResult;selectedId:string|null;focusRequest:number;onSelect:(buildingId:string)=>void}};
type MapController={zoom:(factor:number)=>void;reset:()=>void;top:()=>void;focusBuilding:(id:string)=>void;focusTour:(id:string)=>void};

export default function CampusMap({config,selected,focused,event,onFocus,onSources,onClearFocus,planning}:MapProps){
  const container=useRef<HTMLDivElement>(null),labelLayer=useRef<HTMLDivElement>(null);
  const controlsRef=useRef<MapController|null>(null);
  const stateRef=useRef({selected,focused,event,onFocus,onClearFocus,planning});stateRef.current={selected,focused,event,onFocus,onClearFocus,planning};
  const [failed,setFailed]=useState(false),[flat,setFlat]=useState(false),[hover,setHover]=useState('');
  const [expanded,setExpanded]=useState(false),[showLabels,setShowLabels]=useState(true);
  const [tour,setTour]=useState(''),[inspected,setInspected]=useState<Building|null>(null);
  useEffect(()=>{
    if(!expanded)return;
    const old=document.body.style.overflow;document.body.style.overflow='hidden';
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false);};window.addEventListener('keydown',escape);
    return()=>{document.body.style.overflow=old;window.removeEventListener('keydown',escape);};
  },[expanded]);
  useEffect(()=>{
    const host=container.current!,campus=config.data,projects=config.projects;
    const bounds=boundsOf(campus.boundary),size=Math.max(bounds.width,bounds.depth),cx=bounds.cx,cz=bounds.cz;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{setFailed(true);return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.setClearColor(0xe8eddf,0);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label',`西北工业大学${config.name}三维教学地图，可拖动、缩放并点击建筑`);
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-140,140,105,-105,.1,1200);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;controls.dampingFactor=.10;controls.minZoom=.65;controls.maxZoom=14;
    controls.minPolarAngle=.05;controls.maxPolarAngle=Math.PI*.44;
    controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
    let focusSpan:number|null=null;
    const home=()=>{focusSpan=null;camera.position.set(cx+size*.83,size*1.23,cz+size);camera.zoom=1.08;controls.target.set(cx,0,cz);camera.updateProjectionMatrix();controls.update();setFlat(false);setTour('');setInspected(null);};home();
    scene.add(new THREE.HemisphereLight(0xfffdf2,0x86967d,1.9));
    const sun=new THREE.DirectionalLight(0xfff4dd,2.35);sun.position.set(cx-size*.5,size*1.2,cz+size*.3);sun.castShadow=true;
    Object.assign(sun.shadow.camera,{left:-size*.85,right:size*.85,top:size*.85,bottom:-size*.85,near:.1,far:size*3});
    sun.target.position.set(cx,0,cz);scene.add(sun.target);sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0002;sun.shadow.normalBias=.045;scene.add(sun);
    const material=(color:number,opts:THREE.MeshStandardMaterialParameters={})=>new THREE.MeshStandardMaterial({color,roughness:.9,...opts});
    const area=(points:number[][],color:number,y=.02,holes:number[][][]=[])=>{
      if(points.length<3)return;
      const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(points,holes)),material(color));mesh.rotation.x=-Math.PI/2;mesh.position.y=y;mesh.receiveShadow=true;scene.add(mesh);return mesh;
    };
    const groundGeo=new THREE.ExtrudeGeometry(shapeOf(campus.boundary),{depth:BOARD_DEPTH,bevelEnabled:false});
    const ground=new THREE.Mesh(groundGeo,[material(0xd4ddbf),material(0x9eaf94)]);ground.rotation.x=-Math.PI/2;ground.position.y=GROUND_TOP-BOARD_DEPTH;ground.receiveShadow=true;scene.add(ground);
    const board=new THREE.Mesh(new THREE.PlaneGeometry(bounds.width+40,bounds.depth+40),new THREE.ShadowMaterial({opacity:.16}));board.rotation.x=-Math.PI/2;board.position.set(cx,-2.3,cz);board.receiveShadow=true;scene.add(board);
    campus.grounds.forEach(g=>area(g.points,g.kind==='construction'?0xb7ac95:g.kind==='pitch'?0x87a581:g.kind==='track'?0xbd7b62:0xb5c79c,.04));
    campus.waters.forEach(w=>{
      const water=area(w.points,0x79aeb0,.10,w.holes);if(water)(water.material as THREE.MeshStandardMaterial).roughness=.25;
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(w.points.map(p=>new THREE.Vector3(p[0],.13,p[1]))),new THREE.LineBasicMaterial({color:0xb7d7ca})));
    });
    function ribbon(points:number[][],width:number,color:number,y:number){
      const vertices:number[]=[];
      for(let i=0;i<points.length-1;i++){
        const a=points[i],b=points[i+1],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
        if(!pointInside(mid,campus.boundary)&&!pointInside(a,campus.boundary)&&!pointInside(b,campus.boundary))continue;
        const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.005)continue;
        const ox=-dz/len*width/2,oz=dx/len*width/2;
        vertices.push(a[0]+ox,y,a[1]+oz,b[0]+ox,y,b[1]+oz,a[0]-ox,y,a[1]-oz,b[0]+ox,y,b[1]+oz,b[0]-ox,y,b[1]-oz,a[0]-ox,y,a[1]-oz);
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();
      const mesh=new THREE.Mesh(geo,material(color,{side:THREE.DoubleSide}));mesh.receiveShadow=true;scene.add(mesh);return mesh;
    }
    campus.roads.forEach(r=>{
      const path=['footway','path','steps','cycleway'].includes(r.kind);
      ribbon(r.points,path?.32:1.15,path?0xe3d6be:0xa2afa0,.13);
      if(!path)ribbon(r.points,.84,0xeee9da,.14);
    });
    const {buildings,solarGroup,detailCount}=buildCampusBuildings(scene,config);
    renderer.domElement.dataset.buildingCount=String(campus.buildings.length);renderer.domElement.dataset.facadeDetails=String(detailCount);
    renderer.domElement.dataset.groundLevel=String(GROUND_TOP);
    const {lampMaterial}=addLandscapeDetails(scene,config);
    addConstructionSites(scene,config);
    const spatialMarkers=new THREE.Group();scene.add(spatialMarkers);
    const rings=new Map<ProjectId,THREE.Mesh>();
    projects.forEach(p=>{const m=new THREE.Mesh(new THREE.RingGeometry(2.6,2.85,64),new THREE.MeshBasicMaterial({color:0x237654,transparent:true,opacity:.85,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.set(p.location[0],.27,p.location[1]);m.visible=false;scene.add(m);rings.set(p.id,m);});
    const shuttlePaths=campus.roads.filter(r=>config.shuttleRoadNames.includes(r.name)).map(r=>{const path=ribbon(r.points,.6,0x33886a,.26);path.visible=false;return path;});
    const walkPaths=campus.roads.filter(r=>['footway','path','pedestrian'].includes(r.kind)||config.id==='youyi'&&r.name==='教学南路').map(r=>{const path=ribbon(r.points,.35,0xc4a14a,.27);path.visible=false;return path;});
    const garden=projects.find(p=>p.id==='garden')!;
    const gardenGroup=new THREE.Group();gardenGroup.position.set(garden.location[0],.22,garden.location[1]);scene.add(gardenGroup);
    for(let i=0;i<3;i++){const bed=new THREE.Mesh(new THREE.BoxGeometry(1.8,.22,.65),material(i===1?0x7eaa9d:0x719451));bed.position.set((i-1)*1.1,0,(i%2)*1.1);gardenGroup.add(bed);}gardenGroup.visible=false;
    const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();let down=[0,0],moved=false;
    const pick=(e:PointerEvent)=>{const rect=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera);return raycaster.intersectObjects(buildings,false)[0]?.object;};
    const onMove=(e:PointerEvent)=>{if(Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)moved=true;const hit=pick(e);setHover(hit?(stateRef.current.planning?.context.byBuildingId.get(hit.userData.id)?.name||hit.userData.name):'');renderer.domElement.style.cursor=hit?'pointer':'grab';};
    const onDown=(e:PointerEvent)=>{down=[e.clientX,e.clientY];moved=false;};
    const onUp=(e:PointerEvent)=>{if(moved||e.button!==0)return;const hit=pick(e);if(!hit)return;stateRef.current.onClearFocus();setInspected(campus.buildings.find(b=>b.id===hit.userData.id)!);stateRef.current.planning?.onSelect(hit.userData.id);};
    renderer.domElement.addEventListener('pointermove',onMove);renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointerup',onUp);
    const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);const aspect=w/h,halfHeight=size*(aspect<1.1?.73:.53);camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;if(focusSpan)camera.zoom=THREE.MathUtils.clamp(halfHeight*2*Math.min(1,aspect)/(focusSpan*1.65),1.2,14);camera.updateProjectionMatrix();};
    const observer=new ResizeObserver(resize);observer.observe(host);resize();
    const closeup=(x:number,z:number,span:number,height=0,fromNorth=false)=>{
      controls.target.set(x,height*.3,z);camera.position.set(x+size*.65,size*.7,z+size*(fromNorth?-.8:.8));
      focusSpan=span;stateRef.current.onClearFocus();camera.zoom=THREE.MathUtils.clamp(Math.min(camera.top*2,camera.right-camera.left)/(span*1.65),1.2,14);camera.updateProjectionMatrix();controls.update();setFlat(false);
    };
    controlsRef.current={
      zoom:factor=>{focusSpan=null;camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,.65,14);camera.updateProjectionMatrix();},reset:home,
      top:()=>{focusSpan=null;camera.position.set(cx,size*2,cz+.01);controls.target.set(cx,0,cz);camera.zoom=1.03;camera.updateProjectionMatrix();controls.update();setFlat(true);setTour('');setInspected(null);},
      focusBuilding:id=>{
        const b=campus.buildings.find(b=>b.id===id);if(!b)return;const bb=boundsOf(b.points),span=Math.max(bb.width,bb.depth,b.height*2,6);
        const site=stateRef.current.planning?.context.byBuildingId.get(id),siteBounds=site?boundsOf(site.buildings.flatMap(b=>b.points)):bb;
        closeup(siteBounds.cx,siteBounds.cz,Math.max(span,siteBounds.width,siteBounds.depth),b.height,b.modelStyle==='glass-pavilion');setInspected(b);setTour(config.tours.some(t=>t.buildingId===id)?id:'');
      },
      focusTour:id=>{
        const t=config.tours.find(t=>(t.id||t.buildingId)===id);if(!t)return;
        if(t.buildingId){controlsRef.current?.focusBuilding(t.buildingId);stateRef.current.planning?.onSelect(t.buildingId);return;}
        if(t.location){closeup(t.location[0],t.location[1],t.span||35);setInspected(null);setTour(id);}
      }
    };
    let frame=0,lastKey='';const vector=new THREE.Vector3(),north=new THREE.Vector3(),origin=new THREE.Vector3();
    const animate=()=>{
      frame=requestAnimationFrame(animate);controls.update();
      const {selected,focused,event,planning}=stateRef.current,key=selected.join(',')+'|'+focused+'|'+event+'|'+planning?.selectedId+'|'+(planning?.actions.map(a=>actionKey(a)+(a.legacyCells?.join(',')||'')).join(',')||'');
      if(key!==lastKey){
        if(planning)drawBuildingInterventions(spatialMarkers,planning.context,planning.actions,planning.selectedId,planning.result);
        lastKey=key;buildings.forEach(mesh=>{const site=planning?.context.byBuildingId.get(mesh.userData.id),p=projects.find(p=>p.buildingIds.includes(mesh.userData.id));const active=planning?planning.actions.some(a=>a.buildingId===site?.id&&a.projectId==='retrofit'):p&&selected.includes(p.id);const wall=mesh.userData.wall as THREE.MeshStandardMaterial;wall.color.set(active?0x94b89c:mesh.userData.baseColor);wall.emissive.set(site&&site.id===planning?.selectedId?0x493c18:0x000000);wall.emissiveIntensity=.18;});
        rings.forEach((ring,id)=>{ring.visible=selected.includes(id)||id===focused;(ring.material as THREE.MeshBasicMaterial).color.set(selected.includes(id)?0x237654:0xd4aa41);});
        shuttlePaths.forEach(p=>p.visible=selected.includes('shuttle'));walkPaths.forEach(p=>p.visible=selected.includes('walk'));
        solarGroup.visible=selected.includes('solar');gardenGroup.visible=selected.includes('garden');lampMaterial.emissiveIntensity=selected.includes('lighting')?.8:0;
        sun.color.set(event==='heat'?0xffe0a4:event==='rain'?0xdcebf5:0xfff4dd);
      }
      const rect=host.getBoundingClientRect();origin.set(0,0,0).project(camera);north.set(0,0,-10).project(camera);
      const compass=host.parentElement?.querySelector<SVGElement>('.compass svg');if(compass)compass.style.transform=`rotate(${Math.atan2((north.x-origin.x)*rect.width,(north.y-origin.y)*rect.height)*180/Math.PI-45}deg)`;
      const occupied:{x:number;y:number;w:number;h:number}[]=[];
      const labels=Array.from(labelLayer.current?.querySelectorAll<HTMLElement>('[data-map-x]')||[]).sort((a,b)=>Number(b.classList.contains('focused')||b.classList.contains('selected'))-Number(a.classList.contains('focused')||a.classList.contains('selected')));
      labels.forEach(label=>{
        vector.set(Number(label.dataset.mapX),Number(label.dataset.mapY||4),Number(label.dataset.mapZ)).project(camera);
        const x=(vector.x+1)*rect.width/2,y=(-vector.y+1)*rect.height/2;
        label.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;
        const outside=x<20||x>rect.width-20||y<100||y>rect.height-42;
        label.classList.remove('compact-label');let w=label.offsetWidth;const h=label.offsetHeight;
        const overlaps=occupied.some(o=>Math.abs(x-o.x)<(w+o.w)/2+5&&Math.abs(y-o.y)<Math.max(h,o.h)+3);
        if(overlaps&&label.classList.contains('map-pin')&&!label.classList.contains('focused')){label.classList.add('compact-label');w=28;}
        label.style.visibility=outside||overlaps&&label.classList.contains('landmark-label')?'hidden':'visible';
        if(!outside)occupied.push({x,y,w,h});
      });renderer.render(scene,camera);
    };animate();
    return()=>{
      cancelAnimationFrame(frame);observer.disconnect();controls.dispose();controlsRef.current=null;
      renderer.domElement.removeEventListener('pointermove',onMove);renderer.domElement.removeEventListener('pointerdown',onDown);renderer.domElement.removeEventListener('pointerup',onUp);
      const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
      scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line||o instanceof THREE.LineSegments){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));if(o instanceof THREE.InstancedMesh)o.dispose();}});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
    };
  },[config]);
  useEffect(()=>{if(planning?.selectedId){const site=planning.context.byId.get(planning.selectedId);if(site)setInspected(site.buildings[0]);}},[planning?.selectedId]);
  useEffect(()=>{if(planning?.focusRequest&&planning.selectedId)controlsRef.current?.focusBuilding(planning.context.byId.get(planning.selectedId)!.buildingIds[0]);},[planning?.focusRequest]);
  return <div className={`campus-view event-${event} ${expanded?'expanded-map':''}`}>
    <div className="map-chrome"><div><span className="live-dot"/> {config.name} <span className="map-chrome-separator">/</span> {flat?'俯视地图':'立体校园'}</div><span className="map-model-note">公开底图 · 近似复原</span></div>
    <div className="three-host" ref={container}/>
    <div className="map-explore"><ScanSearch size={14}/><select aria-label="地标近景" value={tour} onChange={e=>{if(e.target.value)controlsRef.current?.focusTour(e.target.value);else controlsRef.current?.reset();}}><option value="">地标近景</option>{config.tours.map(t=><option key={t.id||t.buildingId} value={t.id||t.buildingId}>{t.name}</option>)}</select><button onClick={()=>setShowLabels(v=>!v)} aria-label={showLabels?'隐藏地图标记':'显示地图标记'} title={showLabels?'隐藏地图标记':'显示地图标记'}>{showLabels?<Eye size={15}/>:<EyeOff size={15}/>}</button><button onClick={()=>setExpanded(v=>!v)} aria-label={expanded?'退出大图':'展开大图'} title={expanded?'退出大图':'展开大图'}>{expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button></div>
    {failed?<div className="map-fallback"><img src={config.previewImage} alt={`西北工业大学${config.name}官方地图`}/><p>当前设备无法显示三维地图，措施选择仍可使用。</p></div>:<div className={`map-labels ${showLabels?'':'labels-hidden'}`} ref={labelLayer}>
      {planning?planning.context.sites.filter(site=>planning.actions.some(a=>a.buildingId===site.id)||planning.selectedId===site.id).map(site=>{const actions=planning.actions.filter(a=>a.buildingId===site.id);return <button key={site.id} data-map-x={site.center[0]} data-map-z={site.center[1]} data-map-y={site.height+1.5} className={`map-pin ${actions.length?'selected':''} ${planning.selectedId===site.id?'focused':''}`} onClick={()=>planning.onSelect(site.id)} aria-label={`选择建筑 ${site.name}`}><span>{actions.length||'◎'}</span><em>{site.name}{actions.length?' · '+actions.map(a=>measure(a.projectId).symbol).join(' / '):''}</em></button>;}):config.projects.map((p,i)=><button key={p.id} data-map-x={p.location[0]} data-map-z={p.location[1]} data-map-y={p.id==='retrofit'?6:4} className={`map-pin ${selected.includes(p.id)?'selected':''} ${focused===p.id?'focused':''}`} onClick={()=>{setInspected(null);onFocus(p.id);}} aria-label={`查看${p.name}：${p.site}`}><span>{selected.includes(p.id)?'✓':String(i+1).padStart(2,'0')}</span><em>{p.short}</em></button>)}
      {config.landmarks.map(l=><span key={l.name} className={`landmark-label ${l.water?'water-label':''}`} data-map-x={l.location[0]} data-map-z={l.location[1]} data-map-y={l.height||1}>{l.name}</span>)}
    </div>}
    <div className="map-tools"><button onClick={()=>controlsRef.current?.zoom(1.35)} aria-label="放大地图"><Plus size={17}/></button><button onClick={()=>controlsRef.current?.zoom(1/1.35)} aria-label="缩小地图"><Minus size={17}/></button><span/><button onClick={()=>{if(flat)controlsRef.current?.reset();else controlsRef.current?.top();}} aria-label={flat?'切换立体地图':'切换俯视地图'}><Layers size={17}/></button><button onClick={()=>controlsRef.current?.reset()} aria-label="重置地图视角"><RotateCcw size={16}/></button></div>
    <div className="compass" aria-label="地图北向"><Navigation size={22} strokeWidth={1.5}/><span>N</span></div>
    {inspected&&<div className="building-inspector"><div><MapPin size={14}/><strong>{inspected.name}</strong><button aria-label="关闭建筑详情" onClick={()=>setInspected(null)}><X size={14}/></button></div>
      {inspected.statusNote&&<p className={`building-status ${inspected.status==='under-construction'?'is-construction':''}`}>{inspected.statusNote}</p>}
      <p>{inspected.positionNote||`${inspected.source||(inspected.id.startsWith('official-')?'校方图补绘轮廓':'OSM 建筑轮廓')} · 高度与立面为示意`}</p>
      {inspected.evidence&&<details className="building-evidence"><summary>查看核对资料</summary>{inspected.evidence.map(e=><a key={e.label} href={e.url} target="_blank" rel="noreferrer">{e.image&&<img src={assetUrl(e.image)} alt={e.label} loading="lazy"/>}<span>{e.label} ↗</span></a>)}</details>}
      <button className="inspect-closeup" onClick={()=>controlsRef.current?.focusBuilding(inspected.id)}><ScanSearch size={13}/>近看这栋建筑</button>{planning&&<button className="inspect-closeup configure-building" onClick={()=>{planning.onSelect(inspected.id);setExpanded(false);document.getElementById('building-controls')?.scrollIntoView({behavior:'smooth',block:'start'});}}>为这栋楼配置措施 →</button>}</div>}
    {hover&&!inspected&&<div className="map-hover"><MapPin size={13}/>{hover}</div>}
    <div className="map-bottom"><span>拖动旋转 · 滚轮缩放 · 点击建筑{planning?'选择措施':'查看细节'}</span><button onClick={onSources}>地图来源与精度 ↗</button></div>
  </div>;
}
