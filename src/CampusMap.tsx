import {useEffect,useMemo,useRef,useState} from 'react';
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
import type {ActionImpact} from './buildingImpact';
import {impactKindName,impactNumber} from './buildingImpact';
import {drawImpactOverlay,drawComparisonOverlay} from './impactOverlay';
import {ImpactEffects} from './ImpactSummary';
import {CELL_SIZE} from './spatial';
import {COMPARISON_METRICS,comparisonBuildings,comparisonDisplay,comparisonKindName} from './buildingComparison';
import type {PlanComparison,ComparisonMetric} from './buildingComparison';
import {ComparisonDetails,ComparisonMetricPicker} from './ComparisonSummary';

type MapProps={config:CampusConfig;selected:ProjectId[];focused:ProjectId|null;event:EventId;onFocus:(id:ProjectId)=>void;onSources:()=>void;onClearFocus:()=>void;planning?:{context:BuildingContext;actions:BuildingAction[];result:SpatialResult;selectedId:string|null;focusRequest:number;onSelect:(buildingId:string)=>void;impact:ActionImpact|null;impactInspection:{id:string;serial:number}|null};comparison?:{data:PlanComparison;metric:ComparisonMetric;onMetric:(metric:ComparisonMetric)=>void;selectedId:string|null;focusRequest:number;onSelect:(id:string|null,focus?:boolean)=>void;onExit:()=>void;condition:string}};
type MapController={zoom:(factor:number)=>void;reset:()=>void;top:()=>void;focusBuilding:(id:string)=>void;focusTour:(id:string)=>void;focusImpact:()=>void;focusComparison:()=>void};

export default function CampusMap({config,selected,focused,event,onFocus,onSources,onClearFocus,planning,comparison}:MapProps){
  const container=useRef<HTMLDivElement>(null),labelLayer=useRef<HTMLDivElement>(null);
  const controlsRef=useRef<MapController|null>(null);
  const [showImpact,setShowImpact]=useState(true),[inspectedImpact,setInspectedImpact]=useState<string|null>(null);
  const [showComparison,setShowComparison]=useState(true);
  const differences=useMemo(()=>comparison?comparisonBuildings(comparison.data,comparison.metric):[],[comparison?.data,comparison?.metric]);
  const stateRef=useRef({selected,focused,event,onFocus,onClearFocus,planning,showImpact,comparison,showComparison,differences});stateRef.current={selected,focused,event,onFocus,onClearFocus,planning,showImpact,comparison,showComparison,differences};
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
    const spatialMarkers=new THREE.Group(),impactMarkers=new THREE.Group();scene.add(spatialMarkers,impactMarkers);
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
    const onUp=(e:PointerEvent)=>{if(moved||e.button!==0)return;const hit=pick(e);if(!hit)return;stateRef.current.onClearFocus();setInspected(campus.buildings.find(b=>b.id===hit.userData.id)!);if(stateRef.current.comparison)stateRef.current.comparison.onSelect(hit.userData.id);else stateRef.current.planning?.onSelect(hit.userData.id);};
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
        if(t.buildingId){controlsRef.current?.focusBuilding(t.buildingId);if(stateRef.current.comparison)stateRef.current.comparison.onSelect(t.buildingId);else stateRef.current.planning?.onSelect(t.buildingId);return;}
        if(t.location){closeup(t.location[0],t.location[1],t.span||35);setInspected(null);setTour(id);}
      },
      focusImpact:()=>{
        const p=stateRef.current.planning;if(!p?.impact)return;
        const source=p.context.byId.get(p.impact.action.buildingId)!;
        const points=source.buildings.flatMap(b=>b.points);
        for(const range of p.impact.ranges){const c=p.context.world.byId.get(range.cellId)!;const r=range.radius*CELL_SIZE;points.push([c.x-r,c.z-r],[c.x+r,c.z+r]);}
        for(const effect of p.impact.buildings)points.push(...p.context.byId.get(effect.buildingId)!.buildings.flatMap(b=>b.points));
        const box=boundsOf(points);closeup(box.cx,box.cz,Math.max(box.width,box.depth,12),source.height);setInspected(null);
      },
      focusComparison:()=>{
        const s=stateRef.current;if(!s.planning||!s.comparison)return;
        const points=s.differences.flatMap(d=>s.planning!.context.byId.get(d.buildingId)!.buildings.flatMap(b=>b.points));
        if(!points.length){home();return;}
        const box=boundsOf(points);closeup(box.cx,box.cz,Math.max(box.width,box.depth,15));setInspected(null);
      }
    };
    let frame=0,lastKey='',lastImpact:ActionImpact|null|undefined,lastComparison:PlanComparison|undefined,lastComparisonMode='';const vector=new THREE.Vector3(),north=new THREE.Vector3(),origin=new THREE.Vector3();
    const animate=()=>{
      frame=requestAnimationFrame(animate);controls.update();
      const {selected,focused,event,planning}=stateRef.current,key=selected.join(',')+'|'+focused+'|'+event+'|'+planning?.selectedId+'|'+(planning?.actions.map(a=>actionKey(a)+(a.legacyCells?.join(',')||'')).join(',')||'');
      const s=stateRef.current,comparison=s.comparison,comparisonMode=String(s.showComparison)+'|'+comparison?.metric;
      const impact=!comparison&&s.showImpact?planning?.impact:null;
      if(impact!==lastImpact||comparison?.data!==lastComparison||comparisonMode!==lastComparisonMode){
        lastImpact=impact;lastComparison=comparison?.data;lastComparisonMode=comparisonMode;
        if(comparison&&planning)drawComparisonOverlay(impactMarkers,planning.context,s.showComparison?s.differences:[]);else drawImpactOverlay(impactMarkers,planning?.context!,impact||null);
        renderer.domElement.dataset.impactBuildings=String(impact?.buildings.length||0);renderer.domElement.dataset.impactRanges=String(impact?.ranges.length||0);
        renderer.domElement.dataset.comparisonBuildings=String(comparison&&s.showComparison?s.differences.length:0);renderer.domElement.dataset.comparisonMetric=comparison?.metric||'';
      }
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
      const blockers=comparison?Array.from(host.parentElement?.querySelectorAll<HTMLElement>('.map-comparison-control,.map-explore,.comparison-inspector')||[]).map(e=>e.getBoundingClientRect()):[];
      const labels=Array.from(labelLayer.current?.querySelectorAll<HTMLElement>('[data-map-x]')||[]).sort((a,b)=>Number(b.classList.contains('focused')||b.classList.contains('selected'))-Number(a.classList.contains('focused')||a.classList.contains('selected')));
      labels.forEach(label=>{
        vector.set(Number(label.dataset.mapX),Number(label.dataset.mapY||4),Number(label.dataset.mapZ)).project(camera);
        const x=(vector.x+1)*rect.width/2,y=(-vector.y+1)*rect.height/2;
        label.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;
        let outside=x<20||x>rect.width-20||y<(comparison?48:impact?190:100)||y>rect.height-42;
        label.classList.remove('compact-label');let w=label.offsetWidth;const h=label.offsetHeight;
        const overlaps=occupied.some(o=>Math.abs(x-o.x)<(w+o.w)/2+5&&Math.abs(y-o.y)<Math.max(h,o.h)+3);
        if(overlaps&&label.classList.contains('map-pin')&&!label.classList.contains('focused')){label.classList.add('compact-label');w=28;}
        outside=outside||blockers.some(b=>x+w/2>b.left-rect.left&&x-w/2<b.right-rect.left&&y>b.top-rect.top&&y-h<b.bottom-rect.top);
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
  useEffect(()=>{setInspectedImpact(null);},[planning?.impact]);
  const inspectImpact=(id:string)=>{setShowImpact(true);setInspectedImpact(id);const site=planning?.context.byId.get(id);if(site)controlsRef.current?.focusBuilding(site.buildingIds[0]);};
  useEffect(()=>{if(planning?.impactInspection)inspectImpact(planning.impactInspection.id);},[planning?.impactInspection]);
  useEffect(()=>{if(comparison?.focusRequest&&comparison.selectedId&&planning)controlsRef.current?.focusBuilding(planning.context.byId.get(comparison.selectedId)!.buildingIds[0]);},[comparison?.focusRequest]);
  useEffect(()=>{if(comparison){setShowComparison(true);controlsRef.current?.focusComparison();}},[!!comparison]);
  const impact=planning?.impact,activeImpact=showImpact&&impact&&impact.status!=='unavailable';
  const inspectedEffect=activeImpact?impact.buildings.find(b=>b.buildingId===inspectedImpact):null;
  const rangeRadii=impact?[...new Set(impact.ranges.map(r=>r.radius*CELL_SIZE*10))].sort((a,b)=>a-b).join(' / '):'';
  const impactLabels=activeImpact?[...impact.buildings].sort((a,b)=>Number(b.buildingId===planning!.selectedId)-Number(a.buildingId===planning!.selectedId)).slice(0,8):[];
  const planLabels=!comparison&&planning?planning.context.sites.filter(site=>(planning.actions.some(a=>a.buildingId===site.id)||planning.selectedId===site.id)&&!impactLabels.some(b=>b.buildingId===site.id)):[];
  const comparisonLabels=[...differences].sort((a,b)=>Number(b.buildingId===comparison?.selectedId)-Number(a.buildingId===comparison?.selectedId)).slice(0,8);
  const comparedBuilding=comparison?.data.buildings.find(b=>b.buildingId===comparison.selectedId);
  const comparedDisplay=comparedBuilding&&comparison?comparisonDisplay(comparedBuilding,comparison.metric):null;
  return <div className={`campus-view event-${event} ${expanded?'expanded-map':''}`}>
    <div className="map-chrome"><div><span className="live-dot"/> {config.name} <span className="map-chrome-separator">/</span> {flat?'俯视地图':'立体校园'}</div><span className="map-model-note">公开底图 · 近似复原</span></div>
    <div className="three-host" ref={container}/>
    {comparison&&<div className="map-impact-control map-comparison-control" aria-label="三维 A/B 对照控制">
      <div><strong>B − A · {comparison.condition}</strong><button onClick={comparison.onExit}>退出对照</button></div>
      <div className="map-comparison-picker"><ComparisonMetricPicker value={comparison.metric} onChange={comparison.onMetric}/><button aria-pressed={showComparison} onClick={()=>setShowComparison(v=>!v)}>{showComparison?'隐藏差异':'显示差异'}</button></div>
      <p className={!comparison.data.a.feasible||!comparison.data.b.feasible?'bad':''}>共同预算 {comparison.data.a.budget} · A 投入 {comparison.data.a.cost}{comparison.data.a.remaining<0?'（超支）':''} / B 投入 {comparison.data.b.cost}{comparison.data.b.remaining<0?'（超支）':''} · B 设施底图</p>
      {showComparison&&<div className="impact-legend"><span className="positive">● B 更优</span><span className="negative">● B 更差</span><span className="mixed">● 有取舍</span><span className="neutral">● 无差异</span><button onClick={()=>controlsRef.current?.focusComparison()}>集中查看差异 ↗</button></div>}
      {!differences.length&&<p>{comparison.data.identical?'两套配置相同，暂无差异高亮':'当前指标无明显差异'}</p>}
    </div>}
    <div className="map-explore"><ScanSearch size={14}/><select aria-label="地标近景" value={tour} onChange={e=>{if(e.target.value)controlsRef.current?.focusTour(e.target.value);else controlsRef.current?.reset();}}><option value="">地标近景</option>{config.tours.map(t=><option key={t.id||t.buildingId} value={t.id||t.buildingId}>{t.name}</option>)}</select><button onClick={()=>setShowLabels(v=>!v)} aria-label={showLabels?'隐藏地图标记':'显示地图标记'} title={showLabels?'隐藏地图标记':'显示地图标记'}>{showLabels?<Eye size={15}/>:<EyeOff size={15}/>}</button><button onClick={()=>setExpanded(v=>!v)} aria-label={expanded?'退出大图':'展开大图'} title={expanded?'退出大图':'展开大图'}>{expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button></div>
    {impact&&<div className="map-impact-control" aria-label="地图影响图例"><div><strong>{impact.plan} · {impact.status==='installed'?'措施贡献':impact.status==='unavailable'?'暂无预览':'选址预览'} / {measure(impact.action.projectId).name}</strong><button aria-pressed={showImpact} onClick={()=>setShowImpact(v=>!v)}>{showImpact?'隐藏影响':'显示影响'}</button></div>{showImpact&&<>
      {impact.reason?<p>{impact.reason}</p>:<><p>{['solar','retrofit'].includes(impact.action.projectId)?(impact.legacy?'保留旧方案局部实施范围':'本栋建筑范围 · 不向邻楼传播'):impact.idleShuttle?'灰色虚线：潜在范围，尚未连通':!rangeRadii?'未产生额外作用范围':`蓝色光晕：半径约 ${rangeRadii} 米 · 教学示意`}{impact.overBudget>0?' · 超预算':''}</p><div className="impact-legend"><span className="positive">● 正面</span><span className="negative">● 负面</span><span className="mixed">● 利弊并存</span><button onClick={()=>{setInspectedImpact(null);controlsRef.current?.focusImpact();}}>查看影响全貌 ↗</button></div></>}
    </>}</div>}
    {failed?<div className="map-fallback"><img src={config.previewImage} alt={`西北工业大学${config.name}官方地图`}/><p>当前设备无法显示三维地图，措施选择仍可使用。</p></div>:<div className={`map-labels ${showLabels?'':'labels-hidden'}`} ref={labelLayer}>
      {planning?planLabels.map(site=>{const actions=planning.actions.filter(a=>a.buildingId===site.id);return <button key={site.id} data-map-x={site.center[0]} data-map-z={site.center[1]} data-map-y={site.height+1.5} className={`map-pin ${actions.length?'selected':''} ${planning.selectedId===site.id?'focused':''}`} onClick={()=>planning.onSelect(site.id)} aria-label={`选择建筑 ${site.name}`}><span>{actions.length||'◎'}</span><em>{site.name}{actions.length?' · '+actions.map(a=>measure(a.projectId).symbol).join(' / '):''}</em></button>;}):config.projects.map((p,i)=><button key={p.id} data-map-x={p.location[0]} data-map-z={p.location[1]} data-map-y={p.id==='retrofit'?6:4} className={`map-pin ${selected.includes(p.id)?'selected':''} ${focused===p.id?'focused':''}`} onClick={()=>{setInspected(null);onFocus(p.id);}} aria-label={`查看${p.name}：${p.site}`}><span>{selected.includes(p.id)?'✓':String(i+1).padStart(2,'0')}</span><em>{p.short}</em></button>)}
      {activeImpact&&impactLabels.map(effect=>{const site=planning!.context.byId.get(effect.buildingId)!;return <button key={`impact-${site.id}`} className={`map-pin impact-pin ${effect.kind} ${inspectedImpact===site.id?'focused':''}`} data-map-x={site.center[0]} data-map-z={site.center[1]} data-map-y={site.height+2.8} onClick={()=>inspectImpact(site.id)} aria-label={`查看影响 ${site.name}：${impactKindName[effect.kind]}`}><span>{effect.kind==='mixed'?'±':effect.kind==='positive'?'+':'−'}</span><em>{site.name} · {impactKindName[effect.kind]}</em></button>;})}
      {comparison&&showComparison&&comparisonLabels.map(d=>{const site=planning!.context.byId.get(d.buildingId)!;return <button key={`compare-${site.id}`} className={`map-pin impact-pin comparison-pin ${d.kind} ${comparison.selectedId===site.id?'focused':''}`} data-map-x={site.center[0]} data-map-z={site.center[1]} data-map-y={site.height+2} onClick={()=>comparison.onSelect(site.id,true)} aria-label={`查看对照 ${site.name}`}><span>{d.kind==='positive'?'+':d.kind==='negative'?'−':d.kind==='mixed'?'±':'≈'}</span><em>{site.name} · {d.value===null?comparisonKindName[d.kind]:impactNumber(d.value)}</em></button>;})}
      {config.landmarks.map(l=><span key={l.name} className={`landmark-label ${l.water?'water-label':''}`} data-map-x={l.location[0]} data-map-z={l.location[1]} data-map-y={l.height||1}>{l.name}</span>)}
    </div>}
    <div className="map-tools"><button onClick={()=>controlsRef.current?.zoom(1.35)} aria-label="放大地图"><Plus size={17}/></button><button onClick={()=>controlsRef.current?.zoom(1/1.35)} aria-label="缩小地图"><Minus size={17}/></button><span/><button onClick={()=>{if(flat)controlsRef.current?.reset();else controlsRef.current?.top();}} aria-label={flat?'切换立体地图':'切换俯视地图'}><Layers size={17}/></button><button onClick={()=>controlsRef.current?.reset()} aria-label="重置地图视角"><RotateCcw size={16}/></button></div>
    <div className="compass" aria-label="地图北向"><Navigation size={22} strokeWidth={1.5}/><span>N</span></div>
    {comparison&&comparedDisplay&&<div className={`building-inspector impact-inspector comparison-inspector ${comparedDisplay.kind}`} aria-label="地图建筑 A/B 明细"><div><strong>{planning!.context.byId.get(comparedDisplay.buildingId)!.name}</strong><button aria-label="关闭 A/B 建筑明细" onClick={()=>comparison.onSelect(null)}><X size={14}/></button></div><p>{COMPARISON_METRICS.find(m=>m.id===comparison.metric)!.name} · {comparisonKindName[comparedDisplay.kind]}</p><ComparisonDetails building={comparedDisplay} metric={comparison.metric}/></div>}
    {inspectedEffect&&<div className={`building-inspector impact-inspector ${inspectedEffect.kind}`} aria-label="地图建筑影响详情"><div><strong>{planning!.context.byId.get(inspectedEffect.buildingId)!.name}</strong><button aria-label="关闭影响详情" onClick={()=>setInspectedImpact(null)}><X size={14}/></button></div><p>来自{planning!.context.byId.get(impact!.action.buildingId)!.name}的{measure(impact!.action.projectId).name} · {impactKindName[inspectedEffect.kind]}</p><ImpactEffects effect={inspectedEffect}/><p>周边体验净变化 {impactNumber(inspectedEffect.netComfort)} · 教学指数</p><button className="inspect-closeup" onClick={()=>{setInspectedImpact(null);controlsRef.current?.focusImpact();}}>返回影响全貌 ↗</button></div>}
    {inspected&&!activeImpact&&!comparison&&<div className="building-inspector"><div><MapPin size={14}/><strong>{inspected.name}</strong><button aria-label="关闭建筑详情" onClick={()=>setInspected(null)}><X size={14}/></button></div>
      {inspected.statusNote&&<p className={`building-status ${inspected.status==='under-construction'?'is-construction':''}`}>{inspected.statusNote}</p>}
      <p>{inspected.positionNote||`${inspected.source||(inspected.id.startsWith('official-')?'校方图补绘轮廓':'OSM 建筑轮廓')} · 高度与立面为示意`}</p>
      {inspected.evidence&&<details className="building-evidence"><summary>查看核对资料</summary>{inspected.evidence.map(e=><a key={e.label} href={e.url} target="_blank" rel="noreferrer">{e.image&&<img src={assetUrl(e.image)} alt={e.label} loading="lazy"/>}<span>{e.label} ↗</span></a>)}</details>}
      <button className="inspect-closeup" onClick={()=>controlsRef.current?.focusBuilding(inspected.id)}><ScanSearch size={13}/>近看这栋建筑</button>{planning&&<button className="inspect-closeup configure-building" onClick={()=>{planning.onSelect(inspected.id);setExpanded(false);document.getElementById('building-controls')?.scrollIntoView({behavior:'smooth',block:'start'});}}>为这栋楼配置措施 →</button>}</div>}
    {hover&&!inspected&&<div className="map-hover"><MapPin size={13}/>{hover}</div>}
    <div className="map-bottom"><span>拖动旋转 · 滚轮缩放 · 点击建筑{comparison?'查看 A/B 差值':planning?'选择措施':'查看细节'}</span><button onClick={onSources}>地图来源与精度 ↗</button></div>
  </div>;
}
