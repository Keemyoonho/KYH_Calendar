const {chromium}=require(process.env.CALENDAR_PLAYWRIGHT || 'playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page=await browser.newPage();
    await page.route('**/*',route=>route.abort());
    const root=path.join(__dirname,'..');
    const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
    await page.setContent(html);
    await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/styles.css'),'utf8')});
    await page.addScriptTag({content:`Object.defineProperty(window,'localStorage',{value:{getItem(){return null},setItem(){}}}); window.firebase={initializeApp(){},database(){return {ref(){return {on(){},update(){return Promise.resolve()}}}}}};`});
    await page.addScriptTag({content:"window.canSync=()=>true;window.startSecurity=()=>document.body.classList.remove('auth-locked');"});
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/app.js'),'utf8')});
    assert.equal(await page.getByRole('button',{name:'+ 일정 추가',exact:true}).count(),0);
    await page.locator('#daysGrid .day:not(.other-month)').first().click();
    await page.getByRole('button',{name:'+ 이 날 일정 추가',exact:true}).click();
    await page.locator('#evtTitle').fill('운동');
    await page.locator('#evtDate').fill('2026-09-07');
    await page.locator('#evtRepeat').selectOption('weekly');
    for(const d of [0,1,2,3,4,5,6])await page.locator(`#evtWeekdays input[value="${d}"]`).setChecked([1,3,5].includes(d));
    for(const width of [1280,390,320])for(const theme of ['light','dark']){
      await page.setViewportSize({width,height:850});
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      assert.equal(await page.locator('#evtWeekdays').isVisible(),true);
      assert.equal(await page.locator('#evtWeekdays').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
    }
    await page.locator('#addOverlay .btn-save').click();
    await page.evaluate(()=>openDetailModal({stopPropagation(){}},'2026-09-09'));
    await page.getByRole('button',{name:'이번 회차 수정',exact:true}).click();
    assert.equal(await page.locator('#eventRepeatOptions').isVisible(),false);
    await page.locator('#evtDate').fill('2026-09-10');
    await page.locator('#evtTitle').fill('변경된 운동');
    await page.locator('#addOverlay .btn-save').click();
    await page.evaluate(()=>openDetailModal({stopPropagation(){}},'2026-09-10'));
    assert.equal(await page.getByText('변경된 운동',{exact:true}).count(),1);
    page.on('dialog',d=>d.accept());
    await page.getByRole('button',{name:'이번 회차 취소',exact:true}).click();
    assert.equal(await page.getByText('등록된 일정이 없어요',{exact:true}).count()>0,true);
    console.log('PASS: offline UI create/edit/move/cancel; 320/390/1280px light/dark');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
