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
   window.allowed=true;window.authEpoch=1;window.fail=false;
   window.cloud={diaryRecords:{old:{body:'delete'}},diaryImports:{backup:'delete'},events:[{title:'keep'}],transactions:[{title:'keep money'}],eventChecks:{keep:true},dateNotes:{'2026-10-09':{text:'keep note'}}};
   window.storage={yoonho_private_diary_v1:'old',yoonho_diary_pending_v2:'old',yoonho_diary_migrated_v2:'yes',yoonho_view_mode:'diary',other:'keep'};
   Object.defineProperty(window,'localStorage',{value:{getItem(k){return storage[k]??null},setItem(k,v){storage[k]=v},removeItem(k){delete storage[k]}}});
   const ref={off(){},on(){},async update(v){if(fail)throw Error('offline');for(const [k,value] of Object.entries(v)){if(value===null)delete cloud[k];else cloud[k]=value;}},child(p){return {async transaction(fn){if(fail)throw Error('offline');const [key,date]=p.split('/');cloud[key]||={};const next=fn(cloud[key][date]??null);if(next!==undefined)cloud[key][date]=next;return {committed:next!==undefined,snapshot:{val:()=>cloud[key][date]??null}};}}}};
   window.firebase={initializeApp(){},database(){return {ref(){return ref}}}};
   window.canSync=()=>allowed;window.startSecurity=()=>document.body.classList.remove('auth-locked');
  `});
  for(const file of ['diary.js','app.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'js',file),'utf8')});
  assert.deepEqual(errors,[]);
  assert.equal(await page.locator('#diaryPanel,#diaryModeBtn').count(),0);
  assert.equal(await page.evaluate(()=>viewMode),'schedule');
  const retained=await page.evaluate(()=>JSON.stringify([cloud.events,cloud.transactions,cloud.eventChecks,cloud.dateNotes]));
  await page.evaluate(async()=>{allowed=false;await purgeRetiredDiary(cloud);});assert.ok(await page.evaluate(()=>cloud.diaryRecords));
  await page.evaluate(async()=>{allowed=true;fail=true;await purgeRetiredDiary(cloud);});assert.equal(await page.locator('body').getAttribute('data-retired-diary'),'failed');
  await page.evaluate(async()=>{fail=false;await purgeRetiredDiary(cloud);});
  assert.equal(await page.evaluate(()=>cloud.diaryRecords||cloud.diaryImports),undefined);
  assert.equal(await page.evaluate(()=>JSON.stringify([cloud.events,cloud.transactions,cloud.eventChecks,cloud.dateNotes])),retained);
  assert.equal(await page.evaluate(()=>storage.yoonho_private_diary_v1||storage.yoonho_diary_pending_v2||storage.yoonho_diary_migrated_v2),undefined);
  assert.equal(await page.evaluate(()=>storage.other),'keep');
  await page.evaluate(()=>{receiveDateNotes(cloud);openDetailModal({stopPropagation(){}},'2026-10-10');});
  await page.locator('#dateNoteText').fill('오늘 짧은 기록 <img src=x>');
  await page.evaluate(()=>saveDateNote('2026-10-10'));
  assert.match(await page.locator('#dateNoteStatus').textContent(),/서버 저장 완료/);
  assert.equal(await page.evaluate(()=>cloud.dateNotes['2026-10-10'].text),'오늘 짧은 기록 <img src=x>');
  await page.evaluate(()=>{dateNotes={};receiveDateNotes(cloud);openDetailModal({stopPropagation(){}},'2026-10-10');});
  assert.equal(await page.locator('#dateNoteText').inputValue(),'오늘 짧은 기록 <img src=x>');
  assert.equal(await page.locator('#detailBody img').count(),0);
  await page.locator('#dateNoteText').fill('입력 보존');
  await page.evaluate(()=>{receiveDateNotes(cloud);renderDetail(detailDate);});
  assert.equal(await page.locator('#dateNoteText').inputValue(),'입력 보존');
  assert.equal(await page.locator('#dateNoteText').evaluate(e=>document.activeElement===e),true);
  await page.evaluate(()=>openDetailModal({stopPropagation(){}},'2026-10-11'));
  assert.equal(await page.locator('#dateNoteText').inputValue(),'');
  await page.locator('#dateNoteText').fill('다른 날짜');await page.evaluate(()=>saveDateNote('2026-10-11'));
  await page.evaluate(()=>openDetailModal({stopPropagation(){}},'2026-10-10'));
  assert.equal(await page.locator('#dateNoteText').inputValue(),'입력 보존');
  await page.evaluate(async()=>{fail=true;await saveDateNote('2026-10-10');});
  assert.match(await page.locator('#dateNoteStatus').textContent(),/저장 실패/);
  assert.equal(await page.locator('#dateNoteText').inputValue(),'입력 보존');
  await page.evaluate(async()=>{fail=false;cloud.dateNotes['2026-10-10']={text:'다른 기기'};await saveDateNote('2026-10-10');});
  assert.match(await page.locator('#dateNoteStatus').textContent(),/다른 기기/);
  assert.equal(await page.locator('#dateNoteText').inputValue(),'입력 보존');
  await page.evaluate(()=>reloadDateNote('2026-10-10'));
  assert.equal(await page.locator('#dateNoteText').inputValue(),'다른 기기');
  await page.locator('#dateNoteText').fill('');await page.evaluate(()=>saveDateNote('2026-10-10'));
  assert.equal(await page.evaluate(()=>cloud.dateNotes['2026-10-10']),null);
  const saved=await page.evaluate(()=>JSON.stringify(cloud.dateNotes));
  await page.evaluate(()=>pushToFirebase());assert.equal(await page.evaluate(()=>JSON.stringify(cloud.dateNotes)),saved);
  for(const width of [1280,390,320])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   assert.equal(await page.locator('#detailOverlay .detail-modal').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
   if(width===390)await page.screenshot({path:path.join(root,'tests','date-note-'+theme+'.png')});
  }
  assert.deepEqual(errors,[]);console.log('PASS: old diary purge and isolation, date notes CRUD, recovery, input preservation, conflict/offline handling, responsive themes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
