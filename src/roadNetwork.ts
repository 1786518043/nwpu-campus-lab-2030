import type {CampusData} from './campusTypes';

export type RoadPoint=[number,number];
export type RoadRoute={from:string;to:string;points:RoadPoint[];length:number};
export type RoadNetwork={points:Map<string,RoadPoint>;edges:Map<string,Map<string,number>>;stops:Map<string,string>};
export const isVehicleRoad=(kind:string)=>!['footway','path','steps','cycleway','pedestrian'].includes(kind);
const EPS=1e-7;
const distance=(a:RoadPoint,b:RoadPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a:RoadPoint,b:RoadPoint)=>a[0]*b[1]-a[1]*b[0];
const subtract=(a:RoadPoint,b:RoadPoint):RoadPoint=>[a[0]-b[0],a[1]-b[1]];
const pointAt=(a:RoadPoint,b:RoadPoint,t:number):RoadPoint=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
function project(p:RoadPoint,a:RoadPoint,b:RoadPoint){
  const v=subtract(b,a),offset=subtract(p,a),length2=v[0]*v[0]+v[1]*v[1];
  const t=Math.max(0,Math.min(1,(offset[0]*v[0]+offset[1]*v[1])/length2));
  const point=pointAt(a,b,t);return {t,point,distance:distance(p,point)};
}

/** Use the supplied road centerlines, including bends and actual intersections.
 * Close but separate roads never gain an edge. This is a planar teaching model:
 * the supplied geometry has no driving restrictions or grade-separated junctions.
 * Split at every candidate stop once so routing is independent of plan order.
 */
export function createRoadNetwork(roads:CampusData['roads'],candidates:{id:string;point:RoadPoint}[]):RoadNetwork{
  const segments=[...roads].filter(r=>isVehicleRoad(r.kind)).sort((a,b)=>a.id.localeCompare(b.id)).flatMap(r=>r.points.slice(1).map((p,i)=>({a:[...r.points[i]] as RoadPoint,b:[...p] as RoadPoint,cuts:[0,1]}))).filter(s=>distance(s.a,s.b)>EPS);
  const cut=(s:typeof segments[number],t:number)=>{if(t>=-EPS&&t<=1+EPS)s.cuts.push(Math.max(0,Math.min(1,t)));};
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
    const a=segments[i],b=segments[j],v=subtract(a.b,a.a),w=subtract(b.b,b.a),offset=subtract(b.a,a.a),den=cross(v,w);
    if(Math.abs(den)>EPS){
      const t=cross(offset,w)/den,u=cross(offset,v)/den;
      if(t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS){cut(a,t);cut(b,u);}
    }else{
      // Shared or overlapping collinear segments connect at their endpoints.
      for(const p of [a.a,a.b]){const q=project(p,b.a,b.b);if(q.distance<EPS)cut(b,q.t);}
      for(const p of [b.a,b.b]){const q=project(p,a.a,a.b);if(q.distance<EPS)cut(a,q.t);}
    }
  }
  const points=new Map<string,RoadPoint>(),edges=new Map<string,Map<string,number>>(),stops=new Map<string,string>();
  const node=(p:RoadPoint)=>{
    // Only merge floating-point duplicates; this is not a road-gap tolerance.
    const id=p.map(n=>Math.round(n/EPS)).join(':');
    if(!points.has(id)){points.set(id,p);edges.set(id,new Map());}return id;
  };
  for(const candidate of [...candidates].sort((a,b)=>a.id.localeCompare(b.id))){
    let nearest:{segment:typeof segments[number];t:number;point:RoadPoint;distance:number}|undefined;
    for(const segment of segments){const p=project(candidate.point,segment.a,segment.b);if(!nearest||p.distance<nearest.distance-EPS)nearest={segment,...p};}
    if(nearest){cut(nearest.segment,nearest.t);stops.set(candidate.id,node(nearest.point));}
  }
  for(const s of segments){
    const ids=[...new Set(s.cuts.sort((a,b)=>a-b).map(t=>node(pointAt(s.a,s.b,t))))];
    for(let i=1;i<ids.length;i++){
      const a=ids[i-1],b=ids[i],length=distance(points.get(a)!,points.get(b)!);
      if(length>EPS){edges.get(a)!.set(b,length);edges.get(b)!.set(a,length);}
    }
  }
  return {points,edges,stops};
}
export function stopPosition(network:RoadNetwork,id:string):RoadPoint|undefined{
  const node=network.stops.get(id);return node===undefined?undefined:network.points.get(node);
}
const pathCache=new WeakMap<RoadNetwork,Map<string,RoadRoute|null>>();
/** Dijkstra by geometric length, not the number of map vertices. */
export function roadRoute(network:RoadNetwork,from:string,to:string):RoadRoute|null{
  let cache=pathCache.get(network);if(!cache){cache=new Map();pathCache.set(network,cache);}
  const key=JSON.stringify([from,to]);if(cache.has(key))return cache.get(key)!;
  const start=network.stops.get(from),end=network.stops.get(to);
  if(start===undefined||end===undefined)return null;
  const distances=new Map([[start,0]]),parents=new Map<string,string>(),pending=new Set([start]),visited=new Set<string>();
  while(pending.size){
    const current=[...pending].sort((a,b)=>distances.get(a)!-distances.get(b)!||a.localeCompare(b))[0];
    pending.delete(current);visited.add(current);
    if(current===end){
      const ids=[end];while(ids.at(-1)!==start)ids.push(parents.get(ids.at(-1)!)!);
      const route={from,to,points:ids.reverse().map(id=>network.points.get(id)!),length:distances.get(end)!};cache.set(key,route);return route;
    }
    for(const [next,length] of network.edges.get(current)||[]){
      const total=distances.get(current)!+length;
      if(!visited.has(next)&&total<(distances.get(next)??Infinity)-EPS){distances.set(next,total);parents.set(next,current);pending.add(next);}
    }
  }
  cache.set(key,null);return null;
}
