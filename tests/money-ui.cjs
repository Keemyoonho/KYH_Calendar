const {chromium}=require(process.env.CALENDAR_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const root=path.join(__dirname,'..'),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.abort());
  await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/styles.css'),'utf8')});
  await page.addScriptTag({content:`Object.defineProperty(window,'localStorage',{value:{getItem(){return null},setItem(){}}});window.firebase={initializeApp(){},database(){return {ref(){return {on(){},update(v){window.lastSync=v;return Promise.resolve()}}}}}};window.canSync=()=>true;window.startSecurity=()=>document.body.classList.remove('auth-locked');`});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/app.js'),'utf8')});
  const price=page.locator('#buyPrice');
  await price.pressSequentially('1234567');assert.equal(await price.inputValue(),'1,234,567');
  await price.evaluate(e=>e.setSelectionRange(3,3));await price.pressSequentially('9');
  assert.equal(await price.inputValue(),'12,934,567');
  assert.equal(await price.evaluate(e=>e.selectionStart),4);
  await price.fill('1,000');await price.evaluate(e=>e.setSelectionRange(2,2));await price.press('Backspace');
  assert.equal(await price.inputValue(),'000');
  await price.fill('12,345');await price.evaluate(e=>e.setSelectionRange(2,2));await price.press('Delete');
  assert.equal(await price.inputValue(),'1,245');
  await price.fill('9007199254740992');
  assert.equal(await page.evaluate(()=>Number.isNaN(readMoneyInput(document.getElementById('buyPrice')))),true);
  await price.fill('1.5');
  assert.equal(await page.evaluate(()=>Number.isNaN(readMoneyInput(document.getElementById('buyPrice')))),true);
  await price.fill('35000');await page.locator('#buyInput').fill('테스트');await page.locator('#buyInput').press('Enter');
  assert.equal(await page.evaluate(()=>currentBuyList().items[0].price),35000);
  await page.evaluate(()=>{setViewMode('ledger');openTransactionModal('expense','2026-09-20');});
  await page.locator('#transactionAmount').fill('1234567');
  assert.equal(await page.locator('#transactionAmount').inputValue(),'1,234,567');
  await page.locator('#transactionTitle').fill('테스트 지출');await page.evaluate(()=>saveTransaction());
  assert.equal(await page.evaluate(()=>transactions[0].amount),1234567);
  await page.evaluate(()=>openTransactionModal('expense','2026-09-20',0));
  assert.equal(await page.locator('#transactionAmount').inputValue(),'1,234,567');
  await page.evaluate(()=>{closeTransactionModal();openFixedExpenseModal();});
  await page.locator('#fixedExpenseAmount').fill('99000');await page.locator('#fixedExpenseTitle').fill('테스트 고정비');
  await page.evaluate(()=>saveFixedExpense());
  assert.equal(await page.evaluate(()=>fixedExpenses[0].amount),99000);
  await page.locator('#monthlyBudgetInput').fill('2500000');await page.locator('#monthlyBudgetInput').press('Tab');
  assert.equal(await page.evaluate(()=>monthlyBudgets[currentMonthKey()]),2500000);
  assert.equal(await page.locator('#monthlyBudgetInput').inputValue(),'2,500,000');
  await page.locator('#monthlyBudgetInput').fill('');await page.locator('#monthlyBudgetInput').press('Tab');
  assert.equal(await page.evaluate(()=>monthlyBudgets[currentMonthKey()]),undefined);
  assert.equal(await page.locator('#dietWeight').getAttribute('type'),'number');
  for(const width of [1280,390,320])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   assert.equal(await page.locator('.app').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  }
  assert.deepEqual(errors,[]);console.log('PASS: live commas, caret edits, separator deletion, paste, integer validation, buy/ledger/fixed/budget numeric saves and responsive themes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
