const {chromium}=require(process.env.CALENDAR_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const root=path.join(__dirname,'..'),page=await browser.newPage();
  await page.route('**/*',r=>/^https:\/\/(fonts.googleapis.com|fonts.gstatic.com)\//.test(r.request().url())?r.continue():r.abort());
  const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
  await page.setContent(source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/styles.css'),'utf8')});
  await page.addStyleTag({url:source.match(/href="(https:\/\/fonts.googleapis.com[^\"]+)"/)[1].replace(/&amp;/g,'&')});
  assert.ok(await page.evaluate(async()=> (await document.fonts.load('64px "Grand Hotel"','Keemyoonho')).length>0));
  await page.locator('#authMessage').evaluate(e=>e.textContent='본인 Google 계정으로 로그인해 주세요.');
  for(const width of [1280,390,320])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:800});
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const box=await page.locator('#authGate').boundingBox();
   assert.ok(Math.abs(box.x+box.width/2-width/2)<2);
   assert.ok(Math.abs(box.y+box.height/2-400)<2);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.equal(await page.locator('.app').isVisible(),false);
   if(width!==320)await page.screenshot({path:path.join(root,'tests',`login-${theme}-${width}.png`)});
  }
  await page.setViewportSize({width:320,height:280});
  assert.ok((await page.locator('#authGate').boundingBox()).y>=0,'short screens must scroll from the top');
  await page.evaluate(()=>document.body.classList.remove('auth-locked'));
  assert.equal(await page.locator('#authGate').isVisible(),false);
  console.log('PASS: script font loads, login centered across themes/sizes, short-screen scrolling and unlock');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
