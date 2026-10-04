const {chromium}=require(process.env.CALENDAR_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const root=path.join(__dirname,'..'),page=await browser.newPage(),errors=[];
  await page.emulateMedia({reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/*',r=>r.abort());
  await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/styles.css'),'utf8')});
  await page.addScriptTag({content:`
   window.cloud={events:[{title:'keep',date:'2026-10-04',cat:'diet'}],transactions:[{title:'keep expense'}],diaryRecords:{'2026-10-04':{meals:'keep meal',body:'keep diary'}},todos:[{text:'keep bucket'}],monthlyBuyLists:{'2026-10':{items:[]}},dietRecords:{old:true},goalTracker:{records:{old:true}}};
   window.writes=[];window.fail=false;window.allowed=true;window.authEpoch=1;window.storage={yoonho_diet_records:'old'};window.refresh=()=>{};
   Object.defineProperty(window,'localStorage',{value:{getItem(k){return storage[k]??null},setItem(k,v){storage[k]=v},removeItem(k){delete storage[k]}}});
   function ref(p=[]){return {child(k){return ref([...p,...k.split('/')])},off(){},on(){},
    async update(v){if(fail)throw Error('offline');writes.push(v);for(const [k,value] of Object.entries(v)){if(value===null)delete cloud[k];else cloud[k]=JSON.parse(JSON.stringify(value));}refresh();},
    async transaction(fn){if(fail)throw Error('offline');let t=cloud;for(const k of p.slice(0,-1))t=t[k]||(t[k]={});const k=p.at(-1),next=fn(t[k]??null);if(next!==undefined){t[k]=next;writes.push(p.join('/'));refresh();}return {committed:next!==undefined,snapshot:{val:()=>t[k]??null}};}
   };}
   window.firebase={initializeApp(){},database(){return {ref(){return ref()}}}};window.canSync=()=>allowed;window.startSecurity=()=>document.body.classList.remove('auth-locked');
  `});
  for(const file of ['timetable.js','diary.js','app.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'js',file),'utf8')});
  await page.evaluate(()=>{refresh=()=>receiveWeeklyTimetable(cloud);receiveWeeklyTimetable(cloud);selectTimetableDay(1);});
  assert.equal(await page.locator('#dietTracker,#goalTracker,#diaryGoalHistory').count(),0);
  const preserved=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(cloud).filter(([k])=>!['dietRecords','goalTracker'].includes(k)))));
  await page.evaluate(async()=>{allowed=false;await purgeRetiredTracking(cloud);});
  assert.equal(await page.evaluate(()=>writes.length),0);
  await page.evaluate(async()=>{allowed=true;fail=true;await purgeRetiredTracking(cloud);});
  assert.equal(await page.locator('body').getAttribute('data-retired-tracking'),'failed');
  assert.ok(await page.evaluate(()=>cloud.dietRecords));
  await page.evaluate(async()=>{fail=false;await purgeRetiredTracking(cloud);});
  assert.equal(await page.evaluate(()=>JSON.stringify(cloud)),preserved);
  assert.equal(await page.evaluate(()=>storage.yoonho_diet_records),undefined);
  assert.equal(await page.locator('body').getAttribute('data-retired-tracking'),'deleted');
  await page.evaluate(()=>timetableEl('timetableSettings').open=true);
  async function fill(title,start,end){await page.locator('#timetableTitle').fill(title);await page.locator('#timetableStart').fill(start);await page.locator('#timetableEnd').fill(end);}
  async function save(){await page.evaluate(()=>saveTimetableBlock());}
  await fill('전공 공부','09:00','12:00');await save();
  assert.equal(await page.locator('#timetableList li').count(),1);
  assert.match(await page.locator('#timetableStatus').textContent(),/저장 완료/);
  await fill('겹치는 일정','11:00','13:00');await save();
  assert.match(await page.locator('#timetableStatus').textContent(),/겹칩니다/);
  assert.equal(await page.locator('#timetableList li').count(),1);
  await fill('수면','23:00','07:00');await save();
  assert.equal(await page.locator('.timetable-sector').count(),3);
  assert.match(await page.locator('#timetableList').textContent(),/다음 날 07:00/);
  await fill('빈 시간','08:00','08:00');await save();
  assert.match(await page.locator('#timetableStatus').textContent(),/서로 다른/);
  await page.evaluate(()=>resetTimetableEditor());
  await page.locator('#timetableList button').first().click();
  await fill('전공 복습','09:30','11:30');await save();
  assert.match(await page.locator('#timetableList').textContent(),/전공 복습/);
  await page.evaluate(()=>selectTimetableDay(2));
  assert.equal(await page.locator('#timetableList li').count(),0);
  await fill('<img src=x onerror=alert(1)>','10:00','12:00');await save();
  assert.equal(await page.locator('#weeklyTimetable img').count(),0);
  await page.evaluate(()=>selectTimetableDay(1));
  assert.equal(await page.locator('#timetableList li').count(),2);
  await fill('실패 보존','15:00','16:00');await page.evaluate(()=>fail=true);await save();
  assert.equal(await page.locator('#timetableTitle').inputValue(),'실패 보존');
  assert.match(await page.locator('#timetableStatus').textContent(),/저장 실패/);
  await page.evaluate(()=>fail=false);await save();
  assert.equal(await page.locator('#timetableList li').count(),3);
  // Concurrent change arrives after form setup but before transaction.
  await fill('동시 수정','17:00','18:00');
  await page.evaluate(()=>{cloud.weeklyTimetable[1].concurrent={title:'다른 기기',start:'18:00',end:'19:00'};});
  await save();assert.match(await page.locator('#timetableStatus').textContent(),/다른 기기/);
  assert.ok(await page.evaluate(()=>cloud.weeklyTimetable[1].concurrent));
  await save();assert.match(await page.locator('#timetableStatus').textContent(),/저장 완료/);
  await page.evaluate(()=>deleteTimetableBlock('concurrent'));
  assert.equal(await page.evaluate(()=>cloud.weeklyTimetable[1].concurrent),undefined);
  const saved=await page.evaluate(()=>JSON.stringify(cloud.weeklyTimetable));
  await page.evaluate(()=>{weeklyTimetable={};receiveWeeklyTimetable(cloud);});
  assert.equal(await page.evaluate(()=>JSON.stringify(cloud.weeklyTimetable)),saved);
  for(const width of [1280,768,390,320])for(const theme of ['dark','light']){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>{document.documentElement.dataset.theme=t;timetableEl('timetableSettings').open=false;},theme);
   assert.equal(await page.locator('.app').evaluate(e=>e.scrollWidth<=e.clientWidth),true,`${width} ${theme}`);
   assert.equal(await page.locator('#weeklyTimetable').evaluate(e=>e.scrollWidth<=e.clientWidth),true,JSON.stringify(await page.locator('#weeklyTimetable').evaluate(e=>({width:innerWidth,client:e.clientWidth,scroll:e.scrollWidth,children:[...e.children].map(c=>[c.tagName,c.clientWidth,c.scrollWidth])}))));
   if(width===1280){
    const cards=await page.locator('.dashboard-card').all(),a=await cards[0].boundingBox(),b=await cards[1].boundingBox(),c=await cards[2].boundingBox(),dial=await page.locator('#weeklyTimetable').boundingBox();
    assert.equal(a.y,b.y);assert.ok(c.y>a.y);assert.ok(dial.x>b.x);
   }
   await page.evaluate(()=>scrollTo(0,0));
   if(width===1280||width===390)await page.screenshot({path:path.join(root,'tests',`timetable-${theme}-${width}.png`)});
   await page.evaluate(()=>timetableEl('timetableSettings').open=true);
   assert.equal(await page.locator('#weeklyTimetable').evaluate(e=>e.scrollWidth<=e.clientWidth),true,JSON.stringify(await page.locator('#weeklyTimetable').evaluate(e=>({width:innerWidth,client:e.clientWidth,scroll:e.scrollWidth,children:[...e.querySelectorAll('*')].filter(c=>c.scrollWidth>c.clientWidth).map(c=>[c.tagName,c.id,c.clientWidth,c.scrollWidth])}))));
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: targeted deletion, preservation, weekday CRUD, overnight, overlap, XSS, failure, conflict, cloud restore, responsive light/dark');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
