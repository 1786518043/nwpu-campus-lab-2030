import fs from 'node:fs';

// This source contains downloaded OSM data, not measurements made for this prototype.
// Run from the project root after downloading research/osm-youyi-full.json.
const data = JSON.parse(fs.readFileSync('research/osm-youyi-full.json', 'utf8'));
const boundaryData = JSON.parse(fs.readFileSync('research/osm-youyi-boundary.json', 'utf8'));
const all = new Map([...data.elements, ...boundaryData.elements].map(e => [`${e.type}/${e.id}`, e]));
const rawBoundary = all.get('way/177231509');
if (rawBoundary?.tags?.name !== '西北工业大学友谊校区') throw new Error('Unexpected Youyi campus boundary');
const boundaryNodes = rawBoundary.nodes.map(id => all.get(`node/${id}`));
const bbox = {
  minLon: Math.min(...boundaryNodes.map(n => n.lon)), maxLon: Math.max(...boundaryNodes.map(n => n.lon)),
  minLat: Math.min(...boundaryNodes.map(n => n.lat)), maxLat: Math.max(...boundaryNodes.map(n => n.lat)),
};
const origin = { lon: (bbox.minLon + bbox.maxLon) / 2, lat: (bbox.minLat + bbox.maxLat) / 2 };
const metresPerLonDegree = 111320 * Math.cos(origin.lat * Math.PI / 180);
const project = n => [
  +((n.lon - origin.lon) * metresPerLonDegree / 10).toFixed(3),
  +(-(n.lat - origin.lat) * 111320 / 10).toFixed(3),
];
const points = ids => ids.map(id => all.get(`node/${id}`)).filter(Boolean).map(project);
const geometry = way => points(way.nodes);
const boundary = geometry(rawBoundary);
const ways = data.elements.filter(e => e.type === 'way');
const relations = data.elements.filter(e => e.type === 'relation');

function contains(p, poly = boundary) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function area(poly) {
  return Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
}
function center(poly) {
  let a = 0, x = 0, z = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], c = p[0] * q[1] - q[0] * p[1];
    a += c; x += (p[0] + q[0]) * c; z += (p[1] + q[1]) * c;
  }
  if (Math.abs(a) < 1e-8) return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  return [x / (3 * a), z / (3 * a)];
}
function onCampus(poly) {
  return poly.length >= 4 && (contains(center(poly)) || poly.slice(0, -1).filter(p => contains(p)).length > (poly.length - 1) / 2);
}
function join(members) {
  const segments = members.map(m => all.get(`way/${m.ref}`)?.nodes).filter(Boolean).map(a => [...a]);
  const rings = [];
  while (segments.length) {
    const chain = segments.shift(); let changed = true;
    while (changed && chain[0] !== chain.at(-1)) {
      changed = false;
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        if (chain.at(-1) === s[0]) chain.push(...s.slice(1));
        else if (chain.at(-1) === s.at(-1)) chain.push(...s.slice(0, -1).reverse());
        else if (chain[0] === s.at(-1)) chain.unshift(...s.slice(0, -1));
        else if (chain[0] === s[0]) chain.unshift(...s.slice(1).reverse());
        else continue;
        segments.splice(i, 1); changed = true; break;
      }
    }
    if (chain.length >= 4 && chain[0] === chain.at(-1)) rings.push(points(chain));
  }
  return rings;
}
function kindFor(tags) {
  const name = tags.name || '';
  if (/图书|书海/.test(name) || tags.amenity === 'library') return 'library';
  if (/体育|训练馆|游泳|文体/.test(name) || tags.leisure === 'sports_centre') return 'sport';
  if (/餐厅|食堂/.test(name) || ['restaurant', 'canteen'].includes(tags.amenity)) return 'dining';
  if (/宿舍|公寓|[南西]村|西湖[12]/.test(name) || ['dormitory', 'residential', 'apartments'].includes(tags.building)) return 'dorm';
  if (/服务|保安|活动|基金会|医院|配电|消毒|饭店|浴室|物资/.test(name)) return 'public';
  return 'academic';
}
const buildings = [];
// Identity follows the official map/guide where the OSM English tag is inconsistent.
// Historical labels are retained explicitly; no assertion of current room use is made.
const officialNames = {
  '1267628278': '东图书馆 / 国际会议中心',
  '1267629807': '西图书馆（老图书馆）',
  '1267628223': '综合服务大楼',
  '1267628950': '创新科技大楼 A 座',
  '1267628753': '创新科技大楼 B 座',
  '1267629580': '创新科技大楼 · 裙楼',
};
// Main-wing storey labels read from the dated official 2021 plan, converted only
// for an approximate visual model. Multi-height wings are not treated as measured.
const officialMainWingLevels = {
  '1267628489': 5, '1267629749': 12, '1267628305': 4,
  '1267629285': 3, '1267629807': 4,
  'r17405495-0': 6, 'r17405500-0': 6,
};
const constructionOfficeLevels = {'1267628950':19, '1267628753':23, '1267629580':4};
// Triangle-area intersection verification found these legacy simplified outlines
// completely inside newer OSM outlines. Keep the newer geometry and transfer labels.
const supersededOutlines = new Set(['362794781','988902352']);
function addBuilding(id, tags, poly, holes = []) {
  if (!onCampus(poly) || area(poly) < 0.03) return;
  const name = officialNames[String(id)] || tags.name || (tags.amenity === 'library' ? '友谊校区图书馆' : '校园建筑');
  const kind = kindFor({...tags,name}), levels = Number.parseFloat(tags['building:levels']), metres = Number.parseFloat(tags.height);
  // Preserve OSM-supplied height/level evidence; other heights are illustration estimates.
  let height = Number.isFinite(metres) && metres > 0 ? metres / 10 : Number.isFinite(levels) && levels > 0 ? levels * 0.35 :
    kind === 'library' ? 1.8 : kind === 'dorm' ? 2.1 : kind === 'sport' ? 1.4 : kind === 'dining' ? 1.2 : area(poly) > 40 ? 2.1 : area(poly) < 2 ? 0.7 : 1.65;
  let heightSource = Number.isFinite(metres) && metres > 0 ? 'OSM 高度标签，未经现场复核' : Number.isFinite(levels) && levels > 0 ? 'OSM 楼层标签估算，未经现场复核' : '表现性高度，非实测';
  if (!(Number.isFinite(metres) && metres > 0) && !(Number.isFinite(levels) && levels > 0) && officialMainWingLevels[String(id)]) {
    height = officialMainWingLevels[String(id)] * 0.35;
    heightSource = '校方2021总图主翼层数×3.5米估算，非实测，现状待复核';
  }
  if (constructionOfficeLevels[String(id)]) {
    height = constructionOfficeLevels[String(id)] * .35;
    heightSource = '校方基建处竣工资料层数×3.5米估算；体块人工对应，非实测';
  }
  if (String(id) === '1267628223') {height=2.1;heightSource='旧OSM综合服务大楼6层标签迁移估算，非实测';}
  buildings.push({ id: String(id), name, kind, points: poly, holes, center: center(poly).map(n => +n.toFixed(2)), height: +height.toFixed(2), heightSource, source: 'OpenStreetMap 建筑轮廓', ...(officialNames[String(id)] ? {osmName: tags.name || '', nameSource: constructionOfficeLevels[String(id)] ? '校方基建处竣工说明与总图位置人工对应' : '校方总图/指南或重叠OSM旧名称迁移'} : {}) });
}
const relationBuildingMembers = new Set(relations.filter(r => r.tags?.building).flatMap(r => r.members.filter(m => m.type === 'way').map(m => m.ref)));
ways.filter(w => w.tags?.building && !relationBuildingMembers.has(w.id) && !supersededOutlines.has(String(w.id))).forEach(w => addBuilding(w.id, w.tags, geometry(w)));
relations.filter(r => r.tags?.building).forEach(r => {
  const outers = join(r.members.filter(m => m.type === 'way' && m.role !== 'inner'));
  const holes = join(r.members.filter(m => m.type === 'way' && m.role === 'inner'));
  outers.forEach((p, i) => addBuilding(`r${r.id}-${i}`, r.tags, p, holes.filter(h => contains(h[0], p))));
});

// Clip streets to the campus outline, including segments crossing the polygon with endpoints outside.
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
function clippedSegment(a, b) {
  const r = [b[0] - a[0], b[1] - a[1]], ts = [0, 1];
  for (let i = 0; i < boundary.length - 1; i++) {
    const c = boundary[i], d = boundary[i + 1], s = [d[0] - c[0], d[1] - c[1]], q = [c[0] - a[0], c[1] - a[1]];
    const den = cross(r, s); if (Math.abs(den) < 1e-9) continue;
    const t = cross(q, s) / den, u = cross(q, r) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  const sorted = [...new Set(ts.map(t => +t.toFixed(8)))].sort((a, b) => a - b);
  const at = t => [+(a[0] + t * r[0]).toFixed(3), +(a[1] + t * r[1]).toFixed(3)];
  const pieces = [];
  for (let i = 1; i < sorted.length; i++) if (contains(at((sorted[i - 1] + sorted[i]) / 2))) pieces.push([at(sorted[i - 1]), at(sorted[i])]);
  return pieces;
}
const roads = [];
ways.filter(w => w.tags?.highway && !['construction', 'proposed'].includes(w.tags.highway)).forEach(w => {
  const line = geometry(w), paths = [];
  for (let i = 1; i < line.length; i++) for (const segment of clippedSegment(line[i - 1], line[i])) {
    const last = paths.at(-1), end = last?.at(-1);
    if (end && Math.hypot(end[0] - segment[0][0], end[1] - segment[0][1]) < 0.01) last.push(segment[1]);
    else paths.push(segment);
  }
  paths.filter(p => p.length > 1).forEach((p, i) => roads.push({id: `${w.id}-${i}`, name: w.tags.name || '', kind: w.tags.highway, points: p}));
});

const waters = [], grounds = [];
const isWater = t => t?.natural === 'water' || t?.waterway === 'riverbank';
const groundKind = t => ['pitch', 'track', 'park', 'garden'].includes(t?.leisure) ? t.leisure : ['grass', 'forest', 'meadow'].includes(t?.landuse) ? t.landuse : null;
function addSurface(target, id, tags, p, holes = []) {
  if (!onCampus(p)) return;
  target.push({id: String(id), name: tags.name || (target === waters ? '校园水景' : ''), kind: target === waters ? tags.water || 'water' : groundKind(tags), points: p, holes});
}
const relationSurfaceMembers = new Set(relations.filter(r => isWater(r.tags) || groundKind(r.tags)).flatMap(r => r.members.filter(m => m.type === 'way').map(m => m.ref)));
ways.filter(w => !relationSurfaceMembers.has(w.id)).forEach(w => {
  if (isWater(w.tags)) addSurface(waters, w.id, w.tags, geometry(w));
  else if (groundKind(w.tags)) addSurface(grounds, w.id, w.tags, geometry(w));
});
relations.filter(r => isWater(r.tags) || groundKind(r.tags)).forEach(r => {
  const outers = join(r.members.filter(m => m.type === 'way' && m.role !== 'inner'));
  const holes = join(r.members.filter(m => m.type === 'way' && m.role === 'inner'));
  outers.forEach((p, i) => addSurface(isWater(r.tags) ? waters : grounds, `r${r.id}-${i}`, r.tags, p, holes.filter(h => contains(h[0], p))));
});

const result = {
  source: '© OpenStreetMap contributors · ODbL 1.0；建筑名称参考校方导览核验',
  retrieved: '2026-10-18',
  projection: `local equirectangular, origin ${origin.lon.toFixed(7)}E ${origin.lat.toFixed(7)}N, one scene unit ≈ 10 metres`,
  origin, bbox, boundary, buildings, waters, roads, grounds,
  osmBuildingCount: buildings.length, supplementalBuildingCount: 0,
  excludedDuplicateOutlines: [...supersededOutlines],
};
fs.mkdirSync('src/data', {recursive: true}); fs.mkdirSync('public/data', {recursive: true});
fs.writeFileSync('src/data/youyi.json', JSON.stringify(result, null, 2));
fs.copyFileSync('src/data/youyi.json', 'public/data/youyi-map.json');
console.log(JSON.stringify({origin, counts: {buildings:buildings.length, roads:roads.length, waters:waters.length, grounds:grounds.length}, namedBuildings:buildings.filter(b => b.name !== '校园建筑').map(({id,name,center,height})=>({id,name,center,height}))},null,2));
