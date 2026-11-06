const {chromium}=require(process.env.CALENDAR_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const root=path.join(__dirname,'..'),page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());await page.emulateMedia({reducedMotion:'reduce'});
  await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/styles.css'),'utf8')});
  await page.addScriptTag({content:`Object.defineProperty(window,'localStorage',{value:{getItem(){return null},setItem(){}}});window.firebase={initializeApp(){},database(){return {ref(){return {on(){},update(){return Promise.resolve()}}}}}};window.canSync=()=>true;window.startSecurity=()=>document.body.classList.remove('auth-locked');`});
  for(const file of ['diary.js','app.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'js',file),'utf8')});
  await page.evaluate(()=>{
   cur=new Date(2026,10,1);
   events=Array.from({length:30},(_,i)=>({title:'아주 긴 일정 제목 '.repeat(8)+i,date:'2026-11-05',cat:'school',repeat:'weekly',checklist:true,checkId:'evt_ab_'+i.toString(16)}));
   transactions=[{date:'2026-11-05',title:'지출',amount:123456789,type:'expense',category:'food',repeat:'none'}];
   dateNotes={'2026-11-05':{text:'메모 유지'}};render();
  });
  for(const width of [320,390,430,640])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const boxes=await page.locator('#daysGrid .day').evaluateAll(nodes=>nodes.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
   assert.equal(boxes.length,42);assert.ok(boxes.every(b=>b.height===82));assert.ok(Math.max(...boxes.map(b=>b.width))-Math.min(...boxes.map(b=>b.width))<1);
   assert.equal(await page.locator('.event-badge:visible').count(),0);
   assert.ok(await page.locator('.mobile-event-marker:visible').count()>0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const grid=await page.locator('#daysGrid').boundingBox();assert.ok(grid.x>=0&&grid.x+grid.width<=width);
   if(width===390){await page.locator('.calendar').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'tests','mobile-grid-'+theme+'.png')});}
  }
  await page.locator('.mobile-event-marker').first().click();
  assert.equal(await page.locator('#detailBody .evt-card').count(),30);
  assert.match(await page.locator('#detailBody').textContent(),/아주 긴 일정 제목/);
  assert.equal(await page.locator('.event-completion input').count(),30);
  assert.equal(await page.locator('#dateNoteText').inputValue(),'메모 유지');
  await page.evaluate(()=>closeDetailModal());
  await page.setViewportSize({width:1280,height:1000});
  assert.ok(await page.locator('.event-badge:visible').count()>0);
  assert.equal(await page.locator('.mobile-event-marker:visible').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: equal mobile cells, all seven columns visible, markers only, full details/checks/notes on tap, desktop unchanged');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
