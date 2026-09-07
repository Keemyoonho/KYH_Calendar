const {chromium}=require(process.env.CALENDAR_PLAYWRIGHT || 'playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page=await browser.newPage();
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.route('**/*',route=>route.abort());
    const root=path.join(__dirname,'..');
    const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
    await page.setContent(html);
    await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/styles.css'),'utf8')});
    await page.addScriptTag({content:`Object.defineProperty(window,'localStorage',{value:{getItem(){return null},setItem(){}}}); window.firebase={initializeApp(){},database(){return {ref(){return {on(){},update(){return Promise.resolve()}}}}}};`});
    await page.addScriptTag({content:"window.canSync=()=>true;window.startSecurity=()=>document.body.classList.remove('auth-locked');"});
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/app.js'),'utf8')});

    await page.evaluate(()=>{
      cur=new Date(2026,8,1);
      events=[{date:'2026-09-07',title:'새로운 한 주 계획',cat:'school'},{date:'2026-09-10',title:'프로젝트 정리',cat:'personal'}];
      todos=[{text:'읽고 싶은 책 정리',done:false}];
      monthlyGoals={'2026-09':[{text:'꾸준히 기록하기',done:false},{text:'운동 12회',done:true}]};
      monthlyBuyLists={'2026-09':{items:[{text:'무선 헤드폰',description:'집중을 위한 작은 도구',category:'tech',price:120000,done:false}]}};
      render();renderTodos();
    });
    for(const width of [1280,390,320])for(const theme of ['light','dark']){
      await page.setViewportSize({width,height:1000});
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      assert.equal(await page.locator('.app').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
      const colors=await page.locator('body,.header,.calendar,.mode-btn.active,.panel-title').evaluateAll(nodes=>nodes.map(e=>getComputedStyle(e).color));
      for(const color of colors){const nums=color.match(/\d+/g).map(Number);assert.equal(nums[0],nums[1]);assert.equal(nums[1],nums[2]);}
      if(width!==320)await page.screenshot({path:path.join(root,'tests','glass-'+theme+'-'+width+'.png'),fullPage:true});
      if(width===390){await page.locator('.memo-row').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'tests','glass-'+theme+'-mobile-bottom.png')});await page.evaluate(()=>window.scrollTo(0,0));}
    }
    console.log('PASS: monochrome computed colors and 320/390/1280px layouts');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
