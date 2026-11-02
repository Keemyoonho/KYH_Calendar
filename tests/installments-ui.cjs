const {chromium}=require(process.env.CALENDAR_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const root=path.join(__dirname,'..'),page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('**/*',r=>r.abort());await page.emulateMedia({reducedMotion:'reduce'});
  await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/styles.css'),'utf8')});
  await page.addScriptTag({content:`Object.defineProperty(window,'localStorage',{value:{getItem(){return null},setItem(){}}});window.firebase={initializeApp(){},database(){return {ref(){return {on(){},update(v){window.saved=JSON.parse(JSON.stringify(v));return Promise.resolve()}}}}}};window.canSync=()=>true;window.startSecurity=()=>document.body.classList.remove('auth-locked');`});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/app.js'),'utf8')});
  await page.evaluate(()=>{transactions=[{id:'keep',date:'2026-01-01',title:'기존 수입',amount:500,type:'income',repeat:'monthly'}];openTransactionModal('expense','2026-01-31');});
  await page.locator('#transactionAmount').fill('100000');await page.locator('#transactionTitle').fill('노트북');await page.locator('#transactionRepeat').selectOption('monthly');
  await page.locator('#transactionInstallments').fill('3');
  assert.equal(await page.locator('#transactionRepeat').isDisabled(),true);
  assert.equal(await page.locator('#transactionRepeat').inputValue(),'none');
  assert.match(await page.locator('#installmentPreview').textContent(),/33,334/);
  await page.evaluate(()=>saveTransaction());
  const entries=await page.evaluate(()=>transactions.slice(1));
  assert.deepEqual(entries.map(t=>t.amount),[33334,33333,33333]);
  assert.deepEqual(entries.map(t=>t.date),['2026-01-31','2026-02-28','2026-03-31']);
  assert.equal(entries.reduce((n,t)=>n+t.amount,0),100000);assert.equal(new Set(entries.map(t=>t.id)).size,3);
  assert.ok(entries.every(t=>t.repeat==='none'));assert.equal(await page.evaluate(()=>saved.transactions.length),4);
  assert.equal(await page.evaluate(()=>getLedgerEntriesForDate('2026-04-30').filter(t=>t.type==='expense').length),0);
  await page.evaluate(()=>renderLedgerDetail('2026-02-28'));assert.match(await page.locator('#ledgerDetailBody').textContent(),/할부 2\/3회차/);
  assert.deepEqual(await page.evaluate(()=>installmentParts(10,'2028-01-31',3).map(t=>t.date)),['2028-01-31','2028-02-29','2028-03-31']);
  assert.deepEqual(await page.evaluate(()=>installmentParts(12,'2026-12-31',2).map(t=>t.date)),['2026-12-31','2027-01-31']);
  assert.equal(await page.evaluate(()=>installmentParts(2,'2026-01-31',3).length),0);
  assert.equal(await page.evaluate(()=>installmentParts(10,'2026-02-31',3).length),0);
  assert.equal(await page.evaluate(()=>installmentParts(10,'2026-01-01',2.5).length),0);
  await page.evaluate(()=>{openTransactionModal('expense',undefined,2);});
  assert.equal(await page.locator('#transactionInstallments').isDisabled(),true);
  assert.equal(await page.locator('#transactionRepeat').isDisabled(),true);
  await page.locator('#transactionTitle').fill('이번 회차 수정');await page.evaluate(()=>saveTransaction());
  assert.equal(await page.evaluate(()=>transactions.length),4);assert.equal(await page.evaluate(()=>transactions[2].installment.number),2);
  assert.equal(await page.evaluate(()=>transactions[1].title),'노트북');
  await page.evaluate(()=>openTransactionModal('expense','2026-05-01'));await page.locator('#transactionInstallments').fill('4');
  await page.evaluate(()=>setTransactionType('income'));assert.equal(await page.locator('#installmentFields').isVisible(),false);
  assert.equal(await page.locator('#transactionRepeat').isDisabled(),false);
  await page.evaluate(()=>setTransactionType('expense'));assert.equal(await page.locator('#transactionInstallments').inputValue(),'1');
  await page.locator('#transactionAmount').fill('9000');await page.locator('#transactionTitle').fill('일시불');await page.evaluate(()=>saveTransaction());
  assert.equal(await page.evaluate(()=>transactions.at(-1).amount),9000);assert.equal(await page.evaluate(()=>transactions.at(-1).installment),undefined);
  await page.evaluate(()=>openTransactionModal('expense','2026-11-02'));await page.locator('#transactionAmount').fill('120000');await page.locator('#transactionTitle').fill('할부 예시');await page.locator('#transactionInstallments').fill('3');
  for(const width of [1280,390,320])for(const theme of ['dark','light']){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   assert.equal(await page.locator('#transactionOverlay .modal').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
   if(width===390)await page.screenshot({path:path.join(root,'tests','installments-'+theme+'.png')});
  }
  assert.deepEqual(errors,[]);console.log('PASS: split totals, rounding, month-end/leap/year boundaries, finite duration, saved records, installment edits, repeat/income isolation, responsive themes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
