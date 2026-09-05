const {chromium}=require(process.env.CALENDAR_PLAYWRIGHT || 'playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.abort());
    const root=path.join(__dirname,'..');
    await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
    await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/styles.css'),'utf8')});
    await page.addScriptTag({content:`Object.defineProperty(window,'localStorage',{value:{getItem(){return null},setItem(){}}}); window.firebase={initializeApp(){},database(){return {ref(){return {on(){},set(value){window.lastSync=value;return Promise.resolve()}}}}}};`});
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/app.js'),'utf8')});
    await page.evaluate(()=>{
      cur=new Date(2026,8,1);dietRecords={'2026-08-31':{weight:99,workout:999,water:99,meal:'previous'}};
      for(let d=1;d<=10;d++)dietRecords[`2026-09-${String(d).padStart(2,'0')}`]={weight:80-d,water:d===1?0:8,workout:10,meal:'meal '+d};
      render();
    });
    assert.equal(await page.locator('.diet-day').count(),10);
    assert.equal(await page.locator('#dietWeightChange').textContent(),'-9.0kg');
    assert.equal(await page.locator('#dietWorkoutTotal').textContent(),'100분');
    assert.equal(await page.locator('#dietWaterAverage').textContent(),'7.2잔');
    await page.getByRole('button',{name:'2026-09-01 기록 수정',exact:true}).click();
    assert.equal(await page.locator('#dietWeight').inputValue(),'79');
    assert.equal(await page.locator('#dietWater').inputValue(),'0');
    await page.locator('#dietMeal').fill('edited');
    await page.evaluate(()=>renderDietTracker());
    assert.equal(await page.locator('#dietMeal').inputValue(),'edited');
    page.once('dialog',d=>d.dismiss());
    await page.evaluate(()=>changeMonth(-1));
    assert.equal(await page.locator('#dietDate').inputValue(),'2026-09-01');
    await page.getByRole('button',{name:'기록 저장',exact:true}).click();
    assert.equal(await page.evaluate(()=>dietRecords['2026-09-01'].meal),'edited');
    assert.equal(await page.evaluate(()=>dietRecords['2026-08-31'].workout),999);
    await page.locator('#dietDate').fill('2026-08-31');
    assert.match(await page.locator('#dietTrackerTitle').textContent(),/2026년 8월/);
    assert.equal(await page.locator('.diet-day').count(),1);
    assert.equal(await page.locator('#dietWeight').inputValue(),'99');
    await page.evaluate(()=>{cur=new Date(2026,0,31);dietFormDirty=false;changeMonth(1);});
    assert.match(await page.locator('#dietTrackerTitle').textContent(),/2026년 2월/);
    assert.equal(await page.locator('.diet-day').count(),0);
    await page.locator('#dietWater').fill('0');
    await page.getByRole('button',{name:'기록 저장',exact:true}).click();
    assert.equal(await page.evaluate(()=>dietRecords['2026-02-01'].water),0);
    assert.equal(await page.evaluate(()=>!!window.lastSync),true);
    await page.evaluate(()=>selectDietDate('2026-09-01'));
    for(const width of [1280,390,320])for(const theme of ['light','dark']){
      await page.setViewportSize({width,height:850});
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      assert.equal(await page.locator('#dietTracker').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: monthly filtering, all records, statistics, historical editing, zero values, unsaved guard, month rollover, mocked sync, 320/390/1280px light/dark');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
