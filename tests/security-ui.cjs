const {chromium}=require(process.env.CALENDAR_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const root=path.join(__dirname,'..');
  for(const configured of [false,true]){
   const page=await browser.newPage();await page.route('**/*',r=>r.abort());
   await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
   await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/styles.css'),'utf8')});
   await page.addScriptTag({content:`window.reads=0;window.writes=0;window.localWrites=0;Object.defineProperty(window,'localStorage',{value:{getItem(){return null},setItem(){window.localWrites++}}});window.fakeAuth={currentUser:null,onAuthStateChanged(cb){window.authCb=cb},setPersistence(){return Promise.resolve()},signOut(){return Promise.resolve()}};window.firebase={initializeApp(){},auth(){return window.fakeAuth},database(){return {ref(){return {off(){},on(event,cb,error){window.reads++;window.dataCb=cb;window.dataError=error},set(){window.writes++;return Promise.resolve()}}}}}};`});
   await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/diary.js'),'utf8')});
   await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/security.js'),'utf8').replace("const OWNER_UID='';",`const OWNER_UID='${configured?'owner':''}';`)});
   await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/app.js'),'utf8')});
   await page.evaluate(()=>{authCb(null);pushToFirebase();manualRefresh();});
   assert.equal(await page.evaluate(()=>reads+writes+localWrites),0);
   assert.equal(await page.locator('.app').isVisible(),false);
   await page.evaluate(()=>{fakeAuth.currentUser={uid:'outsider'};authCb(fakeAuth.currentUser);});
   assert.equal(await page.evaluate(()=>reads+writes),0);
   await page.evaluate(()=>{fakeAuth.currentUser={uid:'owner'};authCb(fakeAuth.currentUser);pushToFirebase();});
   if(!configured){assert.equal(await page.evaluate(()=>reads+writes),0);assert.match(await page.locator('#authUid').textContent(),/owner/);await page.close();continue;}
   assert.equal(await page.evaluate(()=>reads),1);assert.equal(await page.evaluate(()=>writes),0);
   await page.evaluate(()=>dataError(Error('denied')));
   assert.equal(await page.locator('.app').isVisible(),false);
   assert.equal(await page.evaluate(()=>localWrites),0);
   await page.evaluate(()=>{authCb(fakeAuth.currentUser);dataCb({val:()=>({events:[],slots:Array.from({length:10},()=>({title:'',body:''}))})});});
   assert.equal(await page.locator('.app').isVisible(),true);
   await page.evaluate(()=>pushToFirebase());assert.equal(await page.evaluate(()=>writes),1);
   await page.evaluate(()=>{
    cur=new Date(2026,8,1);
    const payload='<img src="invalid" onerror="window.auditMarker=true">';
    events=[{title:payload,memo:payload,deadlineMemo:payload,deadline:'2026-09-09',date:'2026-09-06',cat:'personal',link:'javascript:window.auditMarker=true',linkLabel:payload}];
    render();openDetailModal({stopPropagation(){}},'2026-09-06');
   });
   assert.equal(await page.locator('#daysGrid img,#detailBody img,#detailBody a').count(),0);
   assert.equal(await page.evaluate(()=>window.auditMarker),undefined);
   assert.equal(await page.evaluate(()=>safeEventUrl('data:text/html,test')),'');
   assert.equal(await page.evaluate(()=>safeEventUrl('https://example.com')),'https://example.com/');
   await page.evaluate(()=>{window.stale=dataCb;fakeAuth.currentUser=null;authCb(null);stale({val:()=>({events:[]})});pushToFirebase();});
   assert.equal(await page.locator('.app').isVisible(),false);assert.equal(await page.evaluate(()=>writes),1);
   await page.close();
  }
  console.log('PASS: fail-closed setup, anonymous/nonowner denied, initial-read gate, permission denial, stale callbacks, XSS and URL schemes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
