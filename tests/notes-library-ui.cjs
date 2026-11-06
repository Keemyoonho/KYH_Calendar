const {chromium}=require(process.env.CALENDAR_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const root=path.join(__dirname,'..'),page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('**/*',r=>r.abort());
  await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/styles.css'),'utf8')});
  await page.addScriptTag({content:`
   window.allowed=true;window.authEpoch=1;window.fail=false;
   window.cloud={dateNotes:{'2026-11-07':{text:'기존 메모 원본'}},events:[{title:'keep'}]};
   Object.defineProperty(window,'localStorage',{value:{getItem(){return null},setItem(){},removeItem(){}}});
   const ref={off(){},on(){},async update(v){Object.assign(cloud,v)},child(p){return {async transaction(fn){if(fail)throw Error('offline');const next=fn(structuredClone(cloud[p]??null));if(next!==undefined)cloud[p]=next;return {committed:next!==undefined,snapshot:{val:()=>structuredClone(cloud[p]??null)}};}}}};
   window.firebase={initializeApp(){},database(){return {ref(){return ref}}}};
   window.canSync=()=>allowed;window.startSecurity=()=>document.body.classList.remove('auth-locked');
  `});
  for(const file of ['diary.js','notes.js','app.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'js',file),'utf8')});
  await page.evaluate(()=>{receiveDateNotes(cloud);setViewMode('notes')});
  assert.equal(await page.locator('.calendar').isVisible(),false);
  assert.equal(await page.locator('#notesBody .note-card').count(),1);
  await page.locator('#newNoteCategory').fill('대학교');await page.evaluate(()=>addNoteCategory());
  const cat=await page.evaluate(()=>activeNoteCategory);
  await page.evaluate(()=>newLibraryNote());
  await page.locator('#libraryNoteTitle').fill('전자회로 <img src=x>');await page.locator('#libraryNoteBody').fill('복습 내용\n회로 정리');
  await page.evaluate(()=>saveLibraryNote());const id=await page.evaluate(()=>libraryDraft.id);
  assert.equal(await page.evaluate(id=>cloud.noteLibrary.notes[id].category,id),cat);
  assert.equal(await page.evaluate(()=>libraryDraft.dirty),false);
  assert.equal(await page.locator('#notesBody img').count(),0);
  await page.locator('#libraryNoteBody').fill('작성 중');await page.evaluate(()=>{receiveDateNotes(cloud);render()});
  assert.equal(await page.locator('#libraryNoteBody').inputValue(),'작성 중');
  await page.evaluate(async()=>{fail=true;await saveLibraryNote()});assert.equal(await page.evaluate(()=>libraryDraft.dirty),true);
  await page.evaluate(async()=>{fail=false;cloud.noteLibrary.notes[libraryDraft.id].text='다른 기기';await saveLibraryNote()});
  assert.match(await page.locator('#notesStatus').textContent(),/다른 기기/);assert.equal(await page.locator('#libraryNoteBody').inputValue(),'작성 중');
  await page.evaluate(()=>reloadLibraryNote());assert.equal(await page.locator('#libraryNoteBody').inputValue(),'다른 기기');
  await page.locator('#libraryNoteBody').fill('최종');await page.evaluate(()=>saveLibraryNote());
  await page.evaluate(()=>closeLibraryNote());await page.evaluate(()=>deleteNoteCategory());
  assert.equal(await page.evaluate(id=>cloud.noteLibrary.notes[id].category,id),'uncategorized');
  await page.evaluate(()=>{selectNoteCategory('uncategorized');openLibraryNote('date_2026-11-07')});
  await page.locator('#libraryNoteBody').fill('기존 메모 편집');await page.evaluate(()=>saveLibraryNote());
  assert.equal(await page.evaluate(()=>cloud.dateNotes['2026-11-07'].text),'기존 메모 원본');
  await page.evaluate(()=>deleteLibraryNote());assert.equal(await page.locator('#notesBody .note-card').count(),1);
  await page.evaluate(()=>{receiveDateNotes(cloud);renderNotesPanel()});assert.equal(await page.locator('#notesBody .note-card').count(),1);
  await page.evaluate(()=>selectNoteCategory('all'));await page.locator('#notesSearch').fill('없는 검색');assert.equal(await page.locator('.note-card').count(),0);await page.locator('#notesSearch').fill('');
  await page.evaluate(()=>{newLibraryNote()});await page.locator('#libraryNoteTitle').fill('권한 차단');await page.evaluate(async()=>{allowed=false;await saveLibraryNote()});assert.equal(await page.evaluate(()=>libraryDraft.dirty),true);await page.evaluate(()=>{allowed=true;libraryDraft.dirty=false;closeLibraryNote()});
  for(const width of [1280,390,320])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:950});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(400);await page.evaluate(()=>renderNoteCards());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.equal(await page.locator('.calendar').isVisible(),false);
   if(width!==320)await page.screenshot({path:path.join(root,'tests', 'notes-library-'+width+'-'+theme+'.png'),fullPage:true});
  }
  await page.evaluate(()=>setViewMode('schedule'));assert.equal(await page.locator('.calendar').isVisible(),true);assert.equal(await page.locator('#notesPanel').isVisible(),false);
  await page.evaluate(()=>setViewMode('ledger'));assert.equal(await page.locator('.calendar').isVisible(),true);
  await page.evaluate(async()=>{
    cloud.slots=[{body:'remove'}];cloud.quickMemo='remove';
    await purgeScheduleMemos(cloud);
    if(cloud.slots!==null||cloud.quickMemo!==null)throw Error('purge failed');
    if(!cloud.dateNotes||!cloud.noteLibrary)throw Error('unrelated notes removed');
    noteLibrary.categories={old:{name:'old',createdAt:1},newer:{name:'newer',createdAt:2}};
    activeNoteCategory='newer';cloud.noteLibrary=structuredClone(noteLibrary);
    await pinNoteCategory();
    if(Object.keys(libraryCategories()).join()!=='newer,old,uncategorized')throw Error('pin order');
    await pinNoteCategory();
    if(Object.keys(libraryCategories()).join()!=='old,newer,uncategorized')throw Error('age order');
    if('legacy' in libraryCategories())throw Error('legacy category remains');
    setViewMode('schedule');
  });
  assert.equal(await page.locator('#slotBody,#slotTitle,#quickMemo').count(),0);
  await page.locator('#buyInput').fill('링크 물품');await page.locator('#buyLink').fill('https://example.com/product');
  await page.evaluate(()=>addBuy());
  assert.equal(await page.locator('#buyList a').getAttribute('target'),'_blank');
  assert.equal(await page.locator('#buyList a').getAttribute('href'),'https://example.com/product');
  await page.evaluate(()=>editBuy(0));assert.equal(await page.locator('#buyLink').inputValue(),'https://example.com/product');
  await page.locator('#buyLink').fill('javascript:alert(1)');await page.evaluate(()=>addBuy());
  assert.equal(await page.evaluate(()=>currentBuyList().items[0].link),'https://example.com/product');
  await page.locator('#buyLink').fill('');await page.evaluate(()=>addBuy());assert.equal(await page.locator('#buyList a').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: categories, CRUD, legacy preservation, sync conflict/offline/auth, search, mobile/desktop themes, calendar isolation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
