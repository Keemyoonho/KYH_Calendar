const {chromium}=require(process.env.CALENDAR_PLAYWRIGHT || 'playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.abort());
    const root=path.join(__dirname,'..');
    await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
    await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/styles.css'),'utf8')});
    await page.addScriptTag({content:`Object.defineProperty(window,'localStorage',{value:{getItem(){return null},setItem(){}}}); window.firebase={initializeApp(){},database(){return {ref(){return {on(){},set(value){window.lastSync=value;return Promise.resolve()}}}}}};`});
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/app.js'),'utf8')});

    await page.evaluate(()=>{
      buySlots[0]={title:'old',items:[{text:'기존 구매',done:true}]};
      buySlots[1]={title:'다른 목록',items:[{text:'보존',done:false}]};
      todos=[{text:'기존 할 일',done:false}];
      document.getElementById('quickMemo').value='기존 빠른 메모';
      loadMonthlySections({});
      cur=new Date();cur.setDate(1);render();renderTodos();
    });
    assert.equal(await page.locator('.memo-quick-full').count(),0);
    assert.equal(await page.locator('#quickMemo').isVisible(),false);
    assert.equal(await page.locator('#todoList').textContent().then(t=>t.includes('기존 할 일')),true);
    assert.equal(await page.locator('#buyList').textContent().then(t=>t.includes('기존 구매')),true);
    await page.locator('#monthlyGoalsInput').fill('월 목표');
    await page.locator('#monthlyGoalsInput').press('Enter');
    await page.getByRole('checkbox',{name:'목표 1 달성',exact:true}).check();
    await page.locator('#todoInput').fill('빠른 기록');
    await page.locator('#todoInput').press('Enter');
    await page.evaluate(()=>changeMonth(1));
    assert.equal(await page.locator('#monthlyGoalsInput').inputValue(),'');
    assert.equal(await page.locator('#buyList li').count(),0);
    await page.locator('#buyInput').fill('다음 달 구매');
    await page.locator('#buyInput').press('Enter');
    await page.locator('#monthlyGoalsInput').fill('다음 달 목표');
    await page.locator('#monthlyGoalsInput').press('Enter');
    await page.evaluate(()=>changeMonth(-1));
    assert.match(await page.locator('#monthlyGoalsList').textContent(),/월 목표/);
    assert.equal(await page.getByRole('checkbox',{name:'목표 1 달성',exact:true}).isChecked(),true);
    assert.match(await page.locator('#monthlyGoalsProgress').textContent(),/달성 1 \/ 1개/);
    assert.equal(await page.locator('#buyList li').count(),1);
    await page.evaluate(()=>goBuySlot(1));
    assert.equal(await page.locator('#buySlotTitle').inputValue(),'다른 목록');
    assert.equal(await page.locator('#buyList').textContent().then(t=>t.includes('보존')),true);
    await page.evaluate(()=>pushToFirebase());
    assert.equal(await page.evaluate(()=>window.lastSync.quickMemo),'기존 빠른 메모');
    assert.equal(await page.evaluate(()=>window.lastSync.todos.length),2);
    assert.equal(await page.evaluate(()=>Object.keys(window.lastSync.monthlyGoals).length),2);
    assert.equal(await page.evaluate(()=>window.lastSync.monthlyGoals[currentMonthKey()][0].done),true);
    await page.evaluate(()=>{monthlyGoals[currentMonthKey()]='기존 목표\n둘째 줄';renderMonthlyGoals();});
    assert.equal(await page.locator('#monthlyGoalsList .todo-item span').textContent(),'기존 목표\n둘째 줄');
    await page.evaluate(()=>renderMonthlyGoals());
    assert.equal(await page.locator('#monthlyGoalsList li').count(),1);
    page.once('dialog',d=>d.accept('수정한 목표'));
    await page.getByRole('button',{name:'목표 1 수정',exact:true}).click();
    assert.match(await page.locator('#monthlyGoalsList').textContent(),/수정한 목표/);
    page.once('dialog',d=>d.dismiss());
    await page.getByRole('button',{name:'목표 1 삭제',exact:true}).click();
    assert.equal(await page.locator('#monthlyGoalsList li').count(),1);
    page.once('dialog',d=>d.accept());
    await page.getByRole('button',{name:'목표 1 삭제',exact:true}).click();
    assert.equal(await page.locator('#monthlyGoalsList li').count(),0);
    await page.evaluate(()=>{loadMonthlySections({monthlySectionsVersion:1});goBuySlot(0);});
    assert.equal(await page.locator('#buyList li').count(),0);
    await page.evaluate(()=>{loadMonthlySections({monthlySectionsVersion:1,monthlyBuyLists:{[currentMonthKey()]:{title:'빈 목록'}}});renderBuySlot();});
    assert.equal(await page.locator('#buyList li').count(),0);
    for(const category of ['tech','food','medicine','other']){
      await page.locator('#buyInput').fill('물품 '+category);
      await page.locator('#buyDescription').fill('<b>설명</b>');
      await page.locator('#buyCategory').selectOption(category);
      await page.locator('#buyPrice').fill(category==='tech'?'35000':'0');
      await page.locator('#buyInput').press('Enter');
    }
    assert.equal(await page.locator('#buyList li').count(),4);
    assert.match(await page.locator('#buyList').textContent(),/35,000원/);
    assert.equal(await page.locator('#buyList b').count(),0);
    assert.equal(await page.locator('#buyList [role="img"]').first().getAttribute('aria-label'),'테크');
    await page.locator('#buyInput').fill('잘못된 가격');
    await page.locator('#buyPrice').fill('-1');
    await page.locator('#buyInput').press('Enter');
    assert.equal(await page.locator('#buyList li').count(),4);
    await page.locator('#buyPrice').fill('');
    await page.locator('#buyInput').press('Enter');
    assert.equal(await page.locator('#buyList li').count(),5);
    await page.evaluate(()=>pushToFirebase());
    assert.equal(await page.evaluate(()=>window.lastSync.monthlyBuyLists[currentMonthKey()].items[0].price),35000);
    await page.evaluate(()=>{loadMonthlySections(window.lastSync);renderBuySlot();});
    assert.equal(await page.locator('#buyList li').count(),5);
    await page.evaluate(()=>{monthlyGoals[currentMonthKey()]=Array.from({length:12},(_,i)=>({text:'목표 '+i,done:false}));monthlyGoals[currentMonthKey()].push({text:'긴목표'.repeat(100),done:false});renderMonthlyGoals();});
    for(const width of [1280,390,320])for(const theme of ['light','dark']){
      await page.setViewportSize({width,height:850});
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      for(const selector of ['.monthly-goals','.memo-row'])assert.equal(await page.locator(selector).evaluate(e=>e.scrollWidth<=e.clientWidth),true,`${selector} ${width} ${theme}`);
      const calendar=await page.locator('.calendar').boundingBox(),goals=await page.locator('.monthly-goals').boundingBox();
      assert.ok(goals.y>=calendar.y+calendar.height);
      const boxes=await page.locator('#monthlyGoalsList li').evaluateAll(items=>items.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));
      if(width===1280){assert.equal(boxes[0].y,boxes[1].y);assert.ok(boxes[1].x>boxes[0].x);}
      assert.ok(boxes.at(-1).y>boxes[0].y);
      const panels=await page.locator('.memo-row > .memo-sub').evaluateAll(items=>items.map(e=>({width:e.getBoundingClientRect().width,y:e.getBoundingClientRect().y})));
      const buys=await page.locator('#buyList > li').evaluateAll(items=>items.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));
      if(width===1280){assert.ok(panels[1].width>panels[0].width*1.8);assert.equal(buys[0].y,buys[1].y);assert.ok(buys[1].x>buys[0].x);}
      else assert.ok(panels[1].y>panels[0].y);
      assert.equal(await page.locator('#buyList').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: monthly goals/buys isolation, migration, empty Firebase lists, legacy preservation, notes, sync payload, responsive themes');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
