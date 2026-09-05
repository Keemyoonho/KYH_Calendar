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
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/diary.js'),'utf8')});
    await page.addScriptTag({content:"window.canSync=()=>true;window.startSecurity=()=>document.body.classList.remove('auth-locked');"});
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/app.js'),'utf8')});

    await page.evaluate(()=>{const memory={};Object.defineProperty(window.localStorage,'setItem',{value:(k,v)=>memory[k]=v});Object.defineProperty(window.localStorage,'getItem',{value:k=>memory[k]||null});});
    await page.getByRole('tab',{name:'📝 일기',exact:true}).click();
    assert.equal(await page.locator('#diaryPanel').isVisible(),true);
    await page.locator('#daysGrid .day:not(.other-month)').first().click();
    await page.locator('#diaryBody').fill('나만의 일기 <script>test</script>');
    await page.locator('#diaryMood').selectOption('😊');
    await page.locator('#diaryTaskInput').fill('책 읽기');
    await page.locator('#diaryTaskInput').press('Enter');
    assert.equal(await page.locator('#diaryTasks li').count(),1);
    const date=await page.evaluate(()=>diaryDate);
    await page.evaluate(()=>openDiary('2026-01-01'));
    assert.equal(await page.locator('#diaryBody').inputValue(),'');
    await page.locator('#diaryBody').fill('다른 날');
    await page.evaluate(d=>openDiary(d),date);
    assert.equal(await page.locator('#diaryBody').inputValue(),'나만의 일기 <script>test</script>');
    assert.equal(await page.locator('#diaryMood').inputValue(),'😊');
    assert.equal(await page.locator('#diaryTasks li').count(),1);
    await page.evaluate(()=>{diaryRecords=JSON.parse(localStorage.getItem(DIARY_KEY));pushToFirebase();});
    assert.equal(await page.evaluate(()=>JSON.stringify(window.lastSync).includes('나만의 일기')),false);
    assert.equal(await page.evaluate(()=>diaryRecords[diaryDate].body),'나만의 일기 <script>test</script>');
    assert.ok(await page.locator('.diary-badge').count()>0);
    await page.getByRole('tab',{name:'💰 가계부',exact:true}).click();
    assert.equal(await page.locator('#diaryPanel').isVisible(),false);
    await page.getByRole('tab',{name:'📝 일기',exact:true}).click();
    for(const width of [1280,390,320])for(const theme of ['light','dark']){
      await page.setViewportSize({width,height:850});
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      assert.equal(await page.locator('#diaryPanel').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
    }
    await page.evaluate(()=>Object.defineProperty(window.localStorage,'setItem',{value:()=>{throw Error('quota');}}));
    await page.locator('#diaryBody').fill('저장 실패 확인');
    assert.match(await page.locator('#diarySaveStatus').textContent(),/저장 실패/);
    assert.deepEqual(errors,[]);
    console.log('PASS: diary date isolation, tasks, mood, local persistence, cloud exclusion, failed storage, responsive themes');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
