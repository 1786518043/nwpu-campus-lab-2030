const fs = require('fs');
const items = [
 ['sports-2024-52.jpg','https://imagepphcloud.thepaper.cn/pph/image/322/723/52.jpg'],
 ['sports-2024-53.jpg','https://imagepphcloud.thepaper.cn/pph/image/322/723/53.jpg'],
 ['sports-2024-54.jpg','https://imagepphcloud.thepaper.cn/pph/image/322/723/54.jpg'],
 ['phase3-2026-19.jpg','https://jijian.nwpu.edu.cn/__local/B/9B/E1/4A02FCC97957E7633768CCED791_D3EAD729_3C03C.jpg'],
 ['phase3-2026-20.jpg','https://jijian.nwpu.edu.cn/__local/1/99/04/BC1D5DD79A50090292850FBED6C_6011A900_3F363.jpg'],
 ['phase3-2026-21.jpg','https://jijian.nwpu.edu.cn/__local/3/AA/FF/882AFD5E1D1FECE57513FAF5CE1_F7D3F11C_75114.jpg'],
 ['phase3-2026-22.jpg','https://jijian.nwpu.edu.cn/__local/5/8F/19/CF1F2F6E91F9EB8C9FD2CD6F314_2F42FCFA_484A6.jpg'],
 ['phase3-2026-23.jpg','https://jijian.nwpu.edu.cn/__local/F/C1/22/B9ABBFB78BCEAE0DA5E57C3A97A_B1E5FF66_17025.jpg'],
 ['phase4-2026-19.jpg','https://jijian.nwpu.edu.cn/__local/A/1D/F3/1F69E6D0026B70E5BA5325A6EC1_0149C1AB_BB836.jpg'],
 ['phase4-2026-20.jpg','https://jijian.nwpu.edu.cn/__local/B/A2/2F/A19E91C87AE456A2FE7F0308759_BCDD9B00_62C8A.jpg'],
 ['phase4-2026-21.jpg','https://jijian.nwpu.edu.cn/__local/A/0A/69/C3A6A9A068C52FE75B56560B862_36C4D8C3_C45CF.jpg'],
 ['phase4-2026-22.jpg','https://jijian.nwpu.edu.cn/__local/8/D6/D9/F3C4A0951554F955D0B00F94ADE_29764A9F_8689F.jpg'],
 ['phase4-render.png','https://jijian.nwpu.edu.cn/__local/B/F2/5B/4B632CE530E77A17A951638891F_EE6AF35C_28E42.png'],
 ['sports-wechat.html','https://mp.weixin.qq.com/s?__biz=MjM5NzM3ODI2MA%3D%3D&mid=2650038116&idx=1&sn=f6b68db23a688df53396bcbb165719fd']
];
(async()=>{
 fs.mkdirSync('public/reference/changan-south',{recursive:true});
 await Promise.allSettled(items.map(async ([file,url])=>{
  try { const r=await fetch(url,{signal:AbortSignal.timeout(25000)}); if(!r.ok)throw Error(r.status); const b=Buffer.from(await r.arrayBuffer()); fs.writeFileSync('public/reference/changan-south/'+file,b); console.log(file+' '+b.length); } catch(e){console.log(file+' ERROR '+e.message);}
 }));
 fs.writeFileSync('research/changan-south-image-sources.json',JSON.stringify(items.map(([file,url])=>({file:'public/reference/changan-south/'+file,url})),null,2));
})();
