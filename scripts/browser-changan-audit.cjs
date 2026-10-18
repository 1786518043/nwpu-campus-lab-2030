const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
(async()=>{
  fs.mkdirSync('test-results',{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5173/');
    const count=JSON.parse(fs.readFileSync('src/data/campus.json','utf8')).buildings.length;
    await page.locator(`canvas[data-building-count="${count}"][data-ground-level="0"]`).waitFor();
    await page.getByRole('button',{name:'展开大图',exact:true}).click();
    await page.getByLabel('地标近景',{exact:true}).selectOption('haitian-district');
    await page.waitForTimeout(700);
    await page.screenshot({path:'test-results/changan-south-rebuilt.png'});
    for(const id of ['official-haitian-block4','official-haitian-phase4','official-haitian-food-plaza']){
      await page.getByLabel('地标近景',{exact:true}).selectOption(id);
      await page.locator('.building-status').waitFor();
      await page.getByText('查看核对资料',{exact:true}).click();
      await page.waitForFunction(()=>[...document.querySelectorAll('.building-evidence img')].every(i=>i.complete&&i.naturalWidth>0));
      if(id==='official-haitian-phase4')await page.getByText(/在建 · 2026年8月18日主体封顶/).waitFor();
      await page.screenshot({path:`test-results/${id}.png`});
      await page.getByText('查看核对资料',{exact:true}).click();
    }
    await page.getByLabel('地标近景',{exact:true}).selectOption('haitian-sports');
    await page.waitForTimeout(500);
    await page.screenshot({path:'test-results/changan-haitian-sports.png'});
    await page.getByLabel('地标近景',{exact:true}).selectOption('official-aviation-support');
    await page.locator('.building-inspector').getByText('航空宇航支撑学科创新中心',{exact:true}).waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({path:'test-results/changan-support-center.png'});
    await page.getByLabel('地标近景',{exact:true}).selectOption('693572365');
    await page.getByRole('button',{name:'隐藏地图标记',exact:true}).click();
    const box=await page.locator('canvas').boundingBox();
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
    await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.17,{steps:18});await page.mouse.up();
    await page.waitForTimeout(700);
    await page.screenshot({path:'test-results/changan-nanshan-grounded.png'});
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'地图来源与精度 ↗',exact:true}).click();
    await page.getByText(/新增三处的相邻关系经公开资料核对/).waitFor();
    await page.getByRole('button',{name:'关闭弹窗'}).click();
    await page.setViewportSize({width:390,height:844});
    await page.getByLabel('地标近景',{exact:true}).selectOption('haitian-sports');
    await page.getByRole('button',{name:'展开大图',exact:true}).click();
    await page.waitForTimeout(500);
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
    await page.screenshot({path:'test-results/changan-sports-mobile.png'});
    if(errors.length)throw Error(errors.join('\n'));
    console.log('PASS: corrected south scene, district/sports tours, support center, grounded Nanshanyuan low-angle view, provenance, mobile and no page errors.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
