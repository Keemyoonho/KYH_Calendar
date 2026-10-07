const {chromium}=require(process.env.CALENDAR_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const root=path.join(__dirname,'..'),page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('**/*',r=>r.abort());
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/styles.css'),'utf8')});
  await page.addScriptTag({content:`
   window.authEpoch=1;window.allowed=true;window.fail=false;window.cloud={};window.paths=[];
   Object.defineProperty(window,'localStorage',{value:{getItem(){return null},setItem(){},removeItem(){}}});
   const fakeRef={off(){},on(type,cb){window.snapshot=cb},update(v){Object.assign(cloud,JSON.parse(JSON.stringify(v)));return Promise.resolve()},child(p){return {async set(v){if(fail)throw Error("offline");paths.push(p);const parts=p.split("/");let t=cloud;for(const k of parts.slice(0,-1))t=t[k]||(t[k]={});t[parts.at(-1)]=v;}}}};
   window.firebase={initializeApp(){},database(){return {ref(){return fakeRef}}}};
   window.canSync=()=>allowed;window.isCalendarOwner=()=>allowed;window.syncReady=true;window.startSecurity=()=>document.body.classList.remove('auth-locked');
  `});
  for(const file of ['diary.js','app.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'js',file),'utf8')});
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>{cur=new Date(2026,9,1);openAddModal('2026-10-07');});
  assert.equal(await page.locator('#evtChecklistRow').isVisible(),false);
  await page.locator('#evtTitle').fill('전공 공부');await page.locator('#evtRepeat').selectOption('weekly');
  assert.equal(await page.locator('#evtChecklistRow').isVisible(),true);
  await page.locator('#evtChecklist').check();await page.evaluate(()=>saveEvent());
  assert.ok(await page.evaluate(()=>events[0].checkId));
  await page.evaluate(()=>openDetailModal({stopPropagation(){}},'2026-10-07'));
  await page.locator('.event-completion input').check();await page.waitForFunction(()=>!eventChecksBusy.size);
  assert.equal(await page.locator('.event-completion input').isChecked(),true);
  assert.match(await page.locator('#daysGrid').textContent(),/✓/);
  await page.evaluate(()=>openDetailModal({stopPropagation(){}},'2026-10-14'));
  assert.equal(await page.locator('.event-completion input').isChecked(),false);
  await page.evaluate(()=>fail=true);await page.locator('.event-completion input').click();await page.waitForFunction(()=>!eventChecksBusy.size);
  assert.equal(await page.locator('.event-completion input').isChecked(),false);
  assert.match(await page.locator('#eventCheckStatus').textContent(),/저장 실패/);
  await page.evaluate(()=>{fail=false;allowed=false;});await page.locator('.event-completion input').click();
  assert.equal(await page.locator('.event-completion input').isChecked(),false);
  await page.evaluate(()=>{allowed=true;closeDetailModal();openAddModal('2026-10-07',0,'2026-10-07');});
  await page.locator('#evtDate').fill('2026-10-08');await page.evaluate(()=>saveEvent());
  await page.evaluate(()=>openDetailModal({stopPropagation(){}},'2026-10-08'));
  assert.equal(await page.locator('.event-completion input').isChecked(),true);
  await page.locator('.event-completion input').uncheck();await page.waitForFunction(()=>!eventChecksBusy.size);
  assert.ok((await page.evaluate(()=>paths)).every(p=>p.endsWith('/2026-10-07')));
  await page.evaluate(()=>{closeDetailModal();openAddModal('2026-10-07',0);});
  assert.equal(await page.locator('#evtChecklist').isChecked(),true);
  await page.locator('#evtChecklist').uncheck();await page.evaluate(()=>saveEvent());
  await page.evaluate(()=>openDetailModal({stopPropagation(){}},'2026-10-08'));
  assert.equal(await page.locator('.event-completion').count(),0);
  // Re-enable keeps the identity and previously saved occurrence records.
  const id=await page.evaluate(()=>events[0].checkId);
  await page.evaluate(()=>{closeDetailModal();openAddModal('2026-10-07',0);});
  await page.locator('#evtChecklist').check();await page.evaluate(()=>saveEvent());
  assert.equal(await page.evaluate(()=>events[0].checkId),id);
  await page.evaluate(()=>{eventChecks={};startRealtimeSync();snapshot({val:()=>cloud});openDetailModal({stopPropagation(){}},'2026-10-08');});
  assert.equal(await page.locator('.event-completion input').isChecked(),false);
  await page.locator('.event-completion input').check();await page.waitForFunction(()=>!eventChecksBusy.size);
  await page.evaluate(()=>{eventChecks={};snapshot({val:()=>cloud});});
  assert.equal(await page.locator('.event-completion input').isChecked(),true);
  const records=await page.evaluate(()=>JSON.stringify(cloud.eventChecks));
  await page.evaluate(()=>pushToFirebase());assert.equal(await page.evaluate(()=>JSON.stringify(cloud.eventChecks)),records);
  for(const width of [1280,390,320])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   assert.equal(await page.locator('#detailOverlay .detail-modal').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  }
  assert.deepEqual(errors,[]);console.log('PASS: opt-in, occurrence isolation, move, uncheck, failure/auth gates, toggle preservation, cloud recovery, general-save preservation, responsive themes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
