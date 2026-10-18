const fs=require('fs');
(async()=>{
 const urls=[['research/esri-imagery-service.json','https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer?f=pjson'],['research/osm-changan-expanded.json','https://api.openstreetmap.org/api/0.6/map.json?bbox=108.752,34.0185,108.774,34.0405']];
 for(const [file,url] of urls){try{const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error(r.status);fs.writeFileSync(file,await r.text());console.log(file+' saved');}catch(e){console.log(file+' '+e.message)}}
})();
