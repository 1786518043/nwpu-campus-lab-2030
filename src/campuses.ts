import changanData from './data/campus.json';
import youyiData from './data/youyi.json';
import {PROJECTS} from './game';
import type {ProjectId} from './game';
import type {CampusConfig,CampusId} from './campusTypes';

const youyiSites:Record<ProjectId,{site:string;location:[number,number];buildingIds:string[];description?:string}>={
  retrofit:{site:'东图书馆 / 国际会议中心',location:[3.35,19.26],buildingIds:['1267628278']},
  shuttle:{site:'三航路 · 生活区接驳',location:[19.8,3.5],buildingIds:['1267629390'],description:'沿三航路探索教学区与生活区之间的校内接驳，降雨时维持出行便利。此处为教学概念路线。'},
  walk:{site:'教学南路 · 慢行连通',location:[-18.37,24.75],buildingIds:[],description:'改善教学南路一带的步行、骑行连接与遮雨节点，优先保障日常通行体验。'},
  lighting:{site:'诚字楼',location:[-14.58,11.27],buildingIds:['1267628305']},
  solar:{site:'航空楼 · 屋顶试点',location:[4.79,7.05],buildingIds:['1267629040'],description:'以航空楼屋顶为清洁能源教学试点，比较不同天气下的减排收益。实际建设须另行核验屋面条件。'},
  garden:{site:'香蜜园周边',location:[-1.94,-20.12],buildingIds:[],description:'以香蜜园周边绿地为场景，探索雨水滞蓄与绿荫休憩的组合，改善高温与降雨时的体验。'}
};
export const CAMPUSES:Record<CampusId,CampusConfig>={
  changan:{
    id:'changan',name:'长安校区',english:'CHANG’AN',subtitle:'山水园林 · 绿色更新',data:changanData,projects:PROJECTS,
    osmWay:'273391732',referenceImage:'/reference/nwpu-changan-official-map.jpg',previewImage:'/reference/nwpu-changan-official-map-preview.jpg',guideImage:'/reference/nwpu-changan-guide-map-2025.png',mapDownload:'/data/campus-map.json',
    sourceDescription:'依据 OSM 建筑轮廓与校方地图，结合官方导览、2024年美食广场开业照片及2026年宿舍航拍核对海天苑。4号楼位于1号楼北侧、留学生公寓西侧；四期位于2号楼西侧原农场地块；美食广场位于餐厅北侧原绿化带。',
    supplementDescription:'核对日期：2026年10月18日。新增三处的相邻关系经公开资料核对，占地边线、层高与立面仍为人工近似复原。四期按2026年8月主体封顶后的在建阶段表现，施工设施位置示意；设计效果图不作为竣工现状。运动场内部场线示意，底座不是地籍边界；本图不是实测校园地图。',
    auditSources:[
      {label:'2025 年底官方导览原件',url:'https://npuinternationalcollege.nwpu.edu.cn/__local/E/6E/25/5F37628D7D0C7315914F51E5518_4F623DF5_1F4A3A2.pdf'},
      {label:'海天苑篮球场 · 2026 年官方实景',url:'https://ruanjian.nwpu.edu.cn/info/1040/14876.htm'},
      {label:'海天苑三期移交说明',url:'https://jijian.nwpu.edu.cn/info/1059/8633.htm'},
      {label:'三期2022年可研效果总览',url:'https://fazhan.nwpu.edu.cn/info/1321/6031.htm'},
      {label:'海天苑四期封顶实景与设计图',url:'https://jijian.nwpu.edu.cn/info/1059/8543.htm'},
      {label:'海天苑美食广场改造与开业',url:'https://houqin.nwpu.edu.cn/info/1011/230241.htm'}
    ],
    shuttleRoadNames:['银河路','长安大道'],athleticsIds:['362977204','363081279'],
    landmarks:[
      {name:'云天苑',location:[26,-88]},{name:'星天苑',location:[-33,-77]},{name:'海天苑1号楼',location:[-43,17],height:3},{name:'海天苑2号楼',location:[-32,37],height:3},
      {name:'海天苑4号楼',location:[-44,3.8],height:2.6},{name:'海天苑四期 · 在建',location:[-44,37],height:2.8},{name:'海天苑美食广场',location:[-31,14.7],height:1},
      {name:'海天苑运动场',location:[-38,51]},{name:'艺术教育中心',location:[-31,24],height:2.5},{name:'航空宇航支撑学科创新中心',location:[-42,63],height:3},
      {name:'启翔湖',location:[-2,54],water:true},{name:'启真湖',location:[10,-10],water:true},
      {name:'启翔楼',location:[5.48,46.82],height:3.5},{name:'海天苑大楼',location:[2,14],height:4},{name:'教学东楼',location:[24,-54],height:3.5}
    ],
    tours:[{name:'海天苑片区',id:'haitian-district',location:[-36,29],span:62},{name:'海天苑4号楼（三期）',buildingId:'official-haitian-block4'},{name:'海天苑四期（在建）',buildingId:'official-haitian-phase4'},{name:'海天苑美食广场',buildingId:'official-haitian-food-plaza'},{name:'海天苑运动场',id:'haitian-sports',location:[-38,51.5],span:28},{name:'海天苑2号楼',buildingId:'r14477260-0'},{name:'海天苑大楼',buildingId:'official-haitian-east'},{name:'航空宇航支撑中心',buildingId:'official-aviation-support'},{name:'南山苑',buildingId:'693572365'},{name:'图书馆',buildingId:'r14477264-0'},{name:'教学东楼',buildingId:'official-teaching-east-central'},{name:'启翔楼',buildingId:'official-qixiang-main'},{name:'翱翔体育馆',buildingId:'362977203'}]
  },
  youyi:{
    id:'youyi',name:'友谊校区',english:'YOUYI',subtitle:'城市校园 · 存量焕新',data:youyiData,projects:PROJECTS.map(p=>({...p,...youyiSites[p.id]})),
    osmWay:'177231509',referenceImage:'https://peixun.nwpu.edu.cn/youyixiaoquxianzhuang20210304.jpg',previewImage:'/reference/nwpu-youyi-official-map-preview.jpg',guideImage:'/reference/nwpu-youyi-guide-map-2025.png',mapDownload:'/data/youyi-map.json',
    sourceDescription:'依据 OpenStreetMap 友谊校区主校园边界，保留密集街区、公字楼、教学楼群、生活区及田径场的空间关系，并与学校 2021 年校园现状图、2025 年导览图交叉核对。',
    supplementDescription:'当前展示 OSM 主校园边界范围；校方地图中的部分西侧、南侧分离附属地块未纳入。新旧地图存在年代与标注差异，不保证反映当前全部建设状态。',
    shuttleRoadNames:['三航路'],athleticsIds:['333840994'],
    landmarks:[
      {name:'公字楼',location:[-35.37,29.83],height:2.5},{name:'勇字楼',location:[-14.54,29.04],height:2.5},
      {name:'书海楼',location:[-19,3.62],height:2.5},{name:'材料科技大楼',location:[-29,5.24],height:3},
      {name:'学生公寓',location:[17.36,4.9],height:3},{name:'田径场',location:[32.5,-19],height:1},
      {name:'北村生活区',location:[0,-30],height:3}
    ],
    tours:[{name:'公字楼',buildingId:'1267628489'},{name:'东图书馆',buildingId:'1267628278'},{name:'航空楼',buildingId:'1267629040'},{name:'勇字楼',buildingId:'1267629749'},{name:'创新科技大楼',buildingId:'1267628950'}]
  }
};
export const CAMPUS_IDS:CampusId[]=['changan','youyi'];
export function storageKey(id:CampusId){return id==='changan'?'campus2030:green:v1':`campus2030:green:${id}:v1`;}
export function parseCampusId(value:string|null):CampusId{return value==='youyi'?'youyi':'changan';}
