const {chromium}=require(process.env.CALENDAR_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const root=path.join(__dirname,'..'),page=await browser.newPage();
  await page.route('**/*',r=>r.abort());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/styles.css'),'utf8')});
  await page.addScriptTag({content:`
   window.memory={'yoonho_private_diary_v1':JSON.stringify({'2026-09-01':{body:'local original'},'2026-09-02':{body:'local conflict'}})};
   Object.defineProperty(window,'localStorage',{value:{getItem(k){return memory[k]||null},setItem(k,v){memory[k]=v}}});
   window.cloud={diaryRecords:{'2026-09-02':{body:'remote original'}}};window.seq=0;window.fail=false;
   window.refresh=()=>{};
   function ref(p=[]){return {
    child(key){return ref([...p,...key.split('/')])},
    push(){return ref([...p,'backup'+(++seq)])},
    off(){},on(){},
    async set(v){if(fail)throw Error('offline');let t=cloud;for(const k of p.slice(0,-1))t=t[k]||(t[k]={});t[p.at(-1)]=v;refresh();},
    async update(v){if(fail)throw Error('offline');Object.assign(cloud,v);refresh();},
    async transaction(fn){if(fail)throw Error('offline');let t=cloud;for(const k of p.slice(0,-1))t=t[k]||(t[k]={});const k=p.at(-1),current=t[k]??null,next=fn(current);if(next!==undefined){t[k]=next;refresh();}return {committed:next!==undefined,snapshot:{val:()=>t[k]??null}};}
   };}
   window.firebase={initializeApp(){},database(){return {ref(){return ref()}}}};
   window.canSync=()=>true;window.startSecurity=()=>document.body.classList.remove('auth-locked');
  `});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/diary.js'),'utf8')});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/app.js'),'utf8')});
  await page.evaluate(()=>{refresh=()=>receiveDiary(cloud);receiveDiary(cloud);});
  await page.waitForFunction(()=>diaryMigrationDone&&!diaryMigrationRunning);
  assert.equal(await page.evaluate(()=>cloud.diaryRecords['2026-09-01'].body),'local original');
  assert.equal(await page.evaluate(()=>cloud.diaryRecords['2026-09-02'].body),'remote original');
  assert.equal(await page.evaluate(()=>Object.values(cloud.diaryImports)[0].records['2026-09-02'].body),'local conflict');
  await page.getByRole('tab',{name:'📝 일기',exact:true}).click();
  await page.evaluate(()=>openDiary('2026-09-03'));
  await page.locator('#diaryBody').fill('cloud diary');
  await page.locator('#diaryMood').selectOption('😊');
  await page.locator('#diaryTaskInput').fill('책 읽기');await page.locator('#diaryTaskInput').press('Enter');
  await page.waitForFunction(()=>!diarySaveFailed&&!diaryInflight.size);
  assert.equal(await page.evaluate(()=>cloud.diaryRecords['2026-09-03'].body),'cloud diary');
  assert.equal(await page.evaluate(()=>cloud.diaryRecords['2026-09-03'].tasks.length),1);
  await page.evaluate(()=>pushToFirebase());
  assert.equal(await page.evaluate(()=>cloud.diaryRecords['2026-09-03'].body),'cloud diary');
  // Simulate cleared browser storage / another device using only server data.
  await page.evaluate(()=>{memory={};diaryRecords={};diaryPending={};receiveDiary(cloud);openDiary('2026-09-03');});
  assert.equal(await page.locator('#diaryBody').inputValue(),'cloud diary');
  assert.equal(await page.locator('#diaryMood').inputValue(),'😊');
  await page.evaluate(()=>{fail=true;});
  await page.locator('#diaryBody').fill('pending text');
  await page.waitForFunction(()=>diarySaveFailed&&!diaryInflight.size);
  assert.match(await page.locator('#diarySaveStatus').textContent(),/미완료/);
  assert.equal(await page.evaluate(()=>cloud.diaryRecords['2026-09-03'].body),'cloud diary');
  await page.evaluate(()=>{fail=false;retryDiary();});
  await page.waitForFunction(()=>!diarySaveFailed&&!diaryInflight.size);
  assert.equal(await page.evaluate(()=>cloud.diaryRecords['2026-09-03'].body),'pending text');
  // A concurrent server update must not be overwritten.
  await page.evaluate(()=>{openDiary('2026-09-03');cloud.diaryRecords['2026-09-03']={body:'other device'};});
  await page.locator('#diaryBody').fill('conflicting draft');
  await page.waitForFunction(()=>!diarySaveFailed&&!diaryInflight.size);
  assert.equal(await page.evaluate(()=>cloud.diaryRecords['2026-09-03'].body),'other device');
  assert.ok(await page.evaluate(()=>Object.values(cloud.diaryImports).some(x=>x.records['2026-09-03']?.body==='conflicting draft')));
  for(const width of [1280,390,320])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:850});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   assert.equal(await page.locator('#diaryPanel').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: cloud migration/backup, date saves, browser clearing recovery, general-save preservation, offline retry, conflict backup, responsive themes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
