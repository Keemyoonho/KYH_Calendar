const {chromium}=require(process.env.CALENDAR_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const root=path.join(__dirname,'..'),page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
  await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/styles.css'),'utf8')});
  await page.addScriptTag({content:`
   window.cloud={};window.writes=[];window.fail=false;window.allowed=true;window.refresh=()=>{};window.testDay='2026-09-11';
   Object.defineProperty(window,'localStorage',{value:{getItem(){return null},setItem(){}}});
   function ref(p=[]){return {child(k){return ref([...p,...k.split('/')])},off(){},on(){},push(){return ref([...p,'backup'])},
    async set(v){if(fail)throw Error('offline');writes.push(p.join('/'));let t=cloud;for(const k of p.slice(0,-1))t=t[k]||(t[k]={});t[p.at(-1)]=JSON.parse(JSON.stringify(v));refresh();},
    async update(v){if(fail)throw Error('offline');Object.assign(cloud,JSON.parse(JSON.stringify(v)));refresh();},
    async transaction(fn){if(fail)throw Error('offline');let t=cloud;for(const k of p.slice(0,-1))t=t[k]||(t[k]={});const k=p.at(-1),next=fn(t[k]??null);if(next!==undefined){t[k]=next;refresh();}return {committed:next!==undefined,snapshot:{val:()=>t[k]??null}};}
   };}
   window.firebase={initializeApp(){},database(){return {ref(){return ref()}}}};window.canSync=()=>allowed;window.startSecurity=()=>document.body.classList.remove('auth-locked');
  `});
  for(const file of ['goals.js','diary.js','app.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'js',file),'utf8')});
  await page.evaluate(()=>{window.realGoalToday=goalToday;});
  await page.evaluate(()=>{
   goalToday=()=>testDay;goalLastToday=testDay;goalDate=testDay;
   cur=new Date(2026,8,1);events=[{title:'금토 수업',date:'2026-09-11',repeat:'weekly',repeatDays:[5,6],cat:'school',exceptions:{'2026-09-12':{cancelled:true},'2026-09-18':{date:'2026-09-19',title:'보강'}}}];
   refresh=()=>receiveGoalTracker(cloud);receiveGoalTracker(cloud);render();
  });
  await page.waitForFunction(()=>!goalScheduleSaving);
  assert.equal(await page.locator('#goalChecklist input').count(),1);
  await page.locator('.goal-settings summary').click();
  await page.locator('#goalSlogan').fill('꾸준히 성장하기');
  await page.locator('#goalStart').fill('2026-09-11');await page.locator('#goalEnd').fill('2026-10-02');
  await page.locator('#goalTaskLines').fill('전공 문제 3개\n30분 걷기');
  await page.locator('#goalCreate').click();
  await page.waitForFunction(()=>!goalPlanSaving);
  assert.equal(await page.locator('#goalChecklist input').count(),3);
  assert.equal(await page.locator('#goalChecklist input:checked').count(),0);
  await page.getByRole('checkbox',{name:'전공 문제 3개 달성',exact:true}).check();
  await page.waitForFunction(()=>!goalBusy.size);
  await page.getByRole('checkbox',{name:'금토 수업 달성',exact:true}).check();
  await page.waitForFunction(()=>!goalBusy.size);
  assert.match(await page.locator('#goalProgress').textContent(),/달성 2 \/ 3/);
  assert.ok(await page.evaluate(()=>goalBadge('2026-09-11').includes('2/3')));
  // Other calendar saves must not replace the tracker subtree.
  await page.evaluate(()=>pushToFirebase());
  assert.equal(await page.evaluate(()=>Object.keys(cloud.goalTracker.records['2026-09-11']).length),2);
  // Midnight starts unchecked; cancelled occurrences are omitted.
  await page.evaluate(()=>{testDay='2026-09-12';checkGoalMidnight();});
  await page.waitForFunction(()=>!goalScheduleSaving);
  assert.equal(await page.locator('#goalDate').inputValue(),'2026-09-12');
  assert.equal(await page.locator('#goalChecklist input').count(),2);
  assert.equal(await page.locator('#goalChecklist input:checked').count(),0);
  await page.evaluate(()=>openDetailModal({stopPropagation(){}},'2026-09-11'));
  assert.match(await page.locator('#detailBody .goal-history').textContent(),/목표 달성 2 \/ 3/);
  await page.evaluate(()=>closeDetailModal());
  // Simulated cleared browser/new device restores server records.
  await page.evaluate(()=>{goalPlans={};goalRecords={};goalSchedules={};receiveGoalTracker(cloud);selectGoalDate('2026-09-11');});
  assert.equal(await page.locator('#goalChecklist input:checked').count(),2);
  // Retained schedule versions preserve unchecked past tasks after later deletion.
  await page.evaluate(()=>{events=[];syncGoalSchedule();});
  await page.waitForFunction(()=>!goalScheduleSaving);
  assert.equal(await page.evaluate(()=>goalRows('2026-09-11').length),3);
  await page.evaluate(()=>selectGoalDate('2026-09-12'));
  await page.evaluate(()=>{fail=true;});
  await page.getByRole('checkbox',{name:'30분 걷기 달성',exact:true}).click();
  await page.waitForFunction(()=>!goalBusy.size);
  assert.equal(await page.getByRole('checkbox',{name:'30분 걷기 달성',exact:true}).isChecked(),false);
  assert.match(await page.locator('#goalSaveStatus').textContent(),/저장 실패/);
  await page.evaluate(()=>{fail=false;});
  await page.getByRole('checkbox',{name:'30분 걷기 달성',exact:true}).check();await page.waitForFunction(()=>!goalBusy.size);
  assert.equal(await page.getByRole('checkbox',{name:'30분 걷기 달성',exact:true}).isChecked(),true);
  // Separate leaf writes preserve another task written by another device.
  await page.evaluate(()=>{const row=goalRows(goalDate).find(r=>r.text==='전공 문제 3개');cloud.goalTracker.records[goalDate][row.key]={text:row.text,group:row.group,done:true};receiveGoalTracker(cloud);});
  await page.getByRole('checkbox',{name:'30분 걷기 달성',exact:true}).uncheck();await page.waitForFunction(()=>!goalBusy.size);
  assert.equal(await page.getByRole('checkbox',{name:'전공 문제 3개 달성',exact:true}).isChecked(),true);
  // Future previews, range boundaries and occurrence moves.
  await page.evaluate(()=>{events=[{goalId:'stable',title:'반복',date:'2026-09-11',repeat:'weekly',repeatDays:[5,6],exceptions:{'2026-09-18':{date:'2026-09-19',title:'보강'}}}];selectGoalDate('2026-09-18');});
  assert.equal(await page.locator('#goalChecklist input:not(:disabled)').count(),0);
  assert.equal(await page.evaluate(()=>goalRows('2026-09-18').filter(r=>r.group.startsWith('반복')).length),0);
  assert.equal(await page.evaluate(()=>goalRows('2026-09-19').filter(r=>r.group.startsWith('반복')).length),2);
  assert.equal(await page.evaluate(()=>goalRows('2026-10-03').filter(r=>r.group==='꾸준히 성장하기').length),0);
  // Diary and ledger date dialogs expose the same history.
  await page.evaluate(()=>{setViewMode('diary');openDiary('2026-09-11');});
  assert.match(await page.locator('#diaryGoalHistory').textContent(),/목표 달성 2 \/ 3/);
  await page.evaluate(()=>{setViewMode('ledger');openLedgerDetailModal({stopPropagation(){}},'2026-09-11');});
  assert.match(await page.locator('#ledgerDetailBody .goal-history').textContent(),/목표 달성 2 \/ 3/);
  await page.evaluate(()=>{closeLedgerDetailModal();setViewMode('schedule');selectGoalDate('2026-09-12');});
  await page.locator('.goal-settings summary').click();
  for(const width of [1280,390,320])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   assert.equal(await page.locator('#goalTracker').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
   const dash=await page.locator('.today-dashboard').boundingBox(),goals=await page.locator('#goalTracker').boundingBox(),cal=await page.locator('.calendar').boundingBox();
   assert.ok(goals.y>=dash.y+dash.height&&goals.y+goals.height<=cal.y);
   if(width!==320){await page.locator('#goalTracker').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'tests',`goals-${theme}-${width}.png`)});}
  }
  await page.evaluate(async()=>{allowed=false;window.beforeWrites=writes.length;await toggleGoalRecord('2026-09-12',goalRows('2026-09-12')[0].key,true);await createGoalPlan();await syncGoalSchedule();});
  assert.equal(await page.evaluate(()=>writes.length),await page.evaluate(()=>beforeWrites));
  await page.clock.install({time:new Date('2026-09-11T14:59:59Z')});
  await page.evaluate(()=>{goalToday=realGoalToday;goalLastToday='2026-09-11';goalDate='2026-09-11';});
  assert.equal(await page.evaluate(()=>goalToday()),'2026-09-11');
  await page.clock.fastForward(1500);
  assert.equal(await page.evaluate(()=>goalToday()),'2026-09-12');
  assert.equal(await page.locator('#goalDate').inputValue(),'2026-09-12');
  assert.deepEqual(errors,[]);
  console.log('PASS: goal periods, per-date checks, KST midnight, recurring exceptions/history, cloud restore, offline rollback, independent writes, auth gates, all views and responsive placement');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
