const firebaseConfig = {
  apiKey: "AIzaSyA1YO9eS9g-O43Z-zgvtyajgSt9pFUIvHE",
  authDomain: "keemyoonho-calender.firebaseapp.com",
  databaseURL: "https://keemyoonho-calender-default-rtdb.firebaseio.com",
  projectId: "keemyoonho-calender",
  storageBucket: "keemyoonho-calender.firebasestorage.app",
  messagingSenderId: "375920725462",
  appId: "1:375920725462:web:14226256300504b8d86877",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const DATA_REF = db.ref('calendar');

function updateThemeButton() {
  const button = document.getElementById('themeToggle');
  if (!button) return;
  const isDark = document.documentElement.dataset.theme === 'dark';
  button.innerHTML = isDark ? '&#9728;&#65039;' : '&#127769;';
  const label = isDark ? '라이트 모드로 전환' : '다크 모드로 전환';
  button.setAttribute('aria-label', label);
  button.title = label;
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem('yoonho_theme', nextTheme);
  updateThemeButton();
}

const CATS = {
  school:   { label: '학교 관련', color: '#4a7cf7', bg: '#eef3ff', border: '#4a7cf7' },
  exam:     { label: '시험 관련', color: '#e74c3c', bg: '#fff0f0', border: '#e74c3c' },
  personal: { label: '개인 일정', color: '#2ecc71', bg: '#f0fff5', border: '#2ecc71' },
  diet:     { label: '다이어트',   color: '#00a88f', bg: '#e9fffb', border: '#00a88f' },
  anniv:    { label: '기념일',    color: '#e91e9a', bg: '#fff0f8', border: '#e91e9a' },
  etc:      { label: '그 외',    color: '#f39c12', bg: '#fffbf0', border: '#f39c12' },
};

const TRANSACTION_CATS = {
  expense: {
    food:      { label: '🍚 식비', color: '#f39c12' },
    transport: { label: '🚌 교통', color: '#3498db' },
    shopping:  { label: '🛍️ 쇼핑', color: '#e91e9a' },
    education: { label: '📚 교육', color: '#667eea' },
    fixed:     { label: '🏠 고정비', color: '#8e6bbd' },
    health:    { label: '💊 건강', color: '#e74c3c' },
    leisure:   { label: '🎮 여가', color: '#2ecc71' },
    etc:       { label: '📌 기타 지출', color: '#7f8c8d' },
  },
  income: {
    salary:    { label: '💼 급여', color: '#159f69' },
    allowance: { label: '💵 용돈', color: '#27ae60' },
    sidejob:   { label: '🧑‍💻 부수입', color: '#16a085' },
    refund:    { label: '↩️ 환급', color: '#2980b9' },
    etcIncome: { label: '✨ 기타 수입', color: '#6c8f3d' },
  },
};

const PAYMENT_LABELS = { card: '카드', cash: '현금', transfer: '계좌이체', etc: '기타' };

const SLOT_COUNT = 10;           // 주 메모 슬롯 (4 -> 10)
const BUY_SLOT_COUNT = 5;        // Buy list 슬롯 개수
let curSlot = 0;
let curBuySlot = 0;
let slots  = Array.from({length: SLOT_COUNT}, () => ({ title: '', body: '' }));
// buySlots: 각 슬롯이 {title, items:[{text,done}]}
let buySlots = Array.from({length: BUY_SLOT_COUNT}, () => ({ title: '', items: [] }));
let events = [];
let todos  = [];
let transactions = [];
let monthlyBudgets = {};
let fixedExpenses = [];
let dietRecords = {};
let cur = new Date();
let detailDate = '';
let editIdx = -1;
let editOccurrence = '';
let editSource = null;
let editTransactionIdx = -1;
let editFixedExpenseIdx = -1;
let ledgerDetailDateValue = '';
let viewMode = localStorage.getItem('yoonho_view_mode') === 'ledger' ? 'ledger' : 'schedule';
let syncTimer = null;
let isRemoteUpdate = false;

function makeBuySlots(){ return Array.from({length: BUY_SLOT_COUNT}, () => ({ title: '', items: [] })); }

// 예전 buys(단일 배열) 데이터를 슬롯 구조로 변환
function normalizeBuySlots(data){
  if (Array.isArray(data.buySlots) && data.buySlots.length === BUY_SLOT_COUNT){
    return data.buySlots.map(s => ({ title: s.title || '', items: Array.isArray(s.items) ? s.items : [] }));
  }
  const bs = makeBuySlots();
  if (Array.isArray(data.buys)) bs[0].items = data.buys;  // 기존 데이터 이전
  return bs;
}

function setSyncStatus(state, msg) {
  const dot = document.getElementById('syncDot');
  const msgEl = document.getElementById('syncMsg');
  dot.className = 'sync-dot ' + state;
  msgEl.textContent = msg;
  if (state === 'ok') {
    const now = new Date();
    document.getElementById('syncTime').textContent =
      `마지막 동기화 ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
  }
}

function startRealtimeSync() {
  setSyncStatus('syncing', '연결 중...');
  DATA_REF.on('value', (snapshot) => {
    const data = snapshot.val();
    isRemoteUpdate = true;
    if (data) {
      events = Array.isArray(data.events) ? data.events : [];
      todos  = Array.isArray(data.todos)  ? data.todos  : [];
      transactions = Array.isArray(data.transactions) ? data.transactions : [];
      monthlyBudgets = data.monthlyBudgets && typeof data.monthlyBudgets === 'object' ? data.monthlyBudgets : {};
      fixedExpenses = Array.isArray(data.fixedExpenses) ? data.fixedExpenses : [];
      dietRecords = data.dietRecords && typeof data.dietRecords === 'object' ? data.dietRecords : {};
      buySlots = normalizeBuySlots(data);
      if (curBuySlot >= BUY_SLOT_COUNT) curBuySlot = 0;
      if (Array.isArray(data.slots) && data.slots.length === SLOT_COUNT) slots = data.slots;
      const quickMemoEl = document.getElementById('quickMemo');
      if (document.activeElement !== quickMemoEl) {
        quickMemoEl.value = data.quickMemo || '';
        updateQuickChar();
      }
      if (document.activeElement !== document.getElementById('slotTitle') &&
          document.activeElement !== document.getElementById('slotBody')) {
        renderSlot();
      }
    } else {
      events = []; todos = [];
      transactions = []; monthlyBudgets = {}; fixedExpenses = []; dietRecords = {};
      buySlots = makeBuySlots();
      slots = Array.from({length: SLOT_COUNT}, () => ({ title: '', body: '' }));
    }
    render();
    renderTodos();
    renderBuySlot();
    setSyncStatus('ok', '실시간 동기화 중');
    isRemoteUpdate = false;
    saveLocal();
  }, (error) => {
    setSyncStatus('err', '연결 실패 — 로컬 데이터 사용 중');
    loadLocal();
  });
}

function pushToFirebase() {
  if (isRemoteUpdate) return;
  setSyncStatus('syncing', '저장 중...');
  const payload = {
    events,
    todos,
    transactions,
    monthlyBudgets,
    fixedExpenses,
    dietRecords,
    buySlots,
    slots,
    quickMemo: document.getElementById('quickMemo').value,
    updatedAt: Date.now(),
  };
  DATA_REF.set(payload)
    .then(() => setSyncStatus('ok', '실시간 동기화 중'))
    .catch(() => {
      setSyncStatus('err', '저장 실패 — 로컬에 임시 저장');
      saveLocal();
    });
}

function scheduleSync() {
  if (isRemoteUpdate) return;
  updateQuickChar();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushToFirebase, 1500);
}

function updateQuickChar() {
  const v = document.getElementById('quickMemo').value;
  document.getElementById('quickChar').textContent = v.length + '자';
}

function manualRefresh() {
  setSyncStatus('syncing', '새로고침 중...');
  DATA_REF.once('value').then((snapshot) => {
    const data = snapshot.val();
    if (data) {
      events = Array.isArray(data.events) ? data.events : [];
      todos  = Array.isArray(data.todos)  ? data.todos  : [];
      transactions = Array.isArray(data.transactions) ? data.transactions : [];
      monthlyBudgets = data.monthlyBudgets && typeof data.monthlyBudgets === 'object' ? data.monthlyBudgets : {};
      fixedExpenses = Array.isArray(data.fixedExpenses) ? data.fixedExpenses : [];
      dietRecords = data.dietRecords && typeof data.dietRecords === 'object' ? data.dietRecords : {};
      buySlots = normalizeBuySlots(data);
      if (curBuySlot >= BUY_SLOT_COUNT) curBuySlot = 0;
      if (Array.isArray(data.slots) && data.slots.length === SLOT_COUNT) slots = data.slots;
      document.getElementById('quickMemo').value = data.quickMemo || '';
      updateQuickChar();
      renderSlot();
    }
    render(); renderTodos(); renderBuySlot();
    setSyncStatus('ok', '실시간 동기화 중');
  }).catch(() => {
    setSyncStatus('err', '연결 실패');
  });
}

function saveLocal() {
  try {
    localStorage.setItem('yoonho_v2', JSON.stringify(events));
    localStorage.setItem('yoonho_todos', JSON.stringify(todos));
    localStorage.setItem('yoonho_transactions', JSON.stringify(transactions));
    localStorage.setItem('yoonho_monthly_budgets', JSON.stringify(monthlyBudgets));
    localStorage.setItem('yoonho_fixed_expenses', JSON.stringify(fixedExpenses));
    localStorage.setItem('yoonho_diet_records', JSON.stringify(dietRecords));
    localStorage.setItem('yoonho_buySlots', JSON.stringify(buySlots));
    localStorage.setItem('yoonho_slots', JSON.stringify(slots));
    localStorage.setItem('yoonho_quickMemo', document.getElementById('quickMemo').value);
  } catch(e) {}
}

function loadLocal() {
  try { events = JSON.parse(localStorage.getItem('yoonho_v2') || '[]'); } catch(e) {}
  try { todos  = JSON.parse(localStorage.getItem('yoonho_todos') || '[]'); } catch(e) {}
  try { transactions = JSON.parse(localStorage.getItem('yoonho_transactions') || '[]'); } catch(e) { transactions = []; }
  try { monthlyBudgets = JSON.parse(localStorage.getItem('yoonho_monthly_budgets') || '{}'); } catch(e) { monthlyBudgets = {}; }
  try { fixedExpenses = JSON.parse(localStorage.getItem('yoonho_fixed_expenses') || '[]'); } catch(e) { fixedExpenses = []; }
  try { dietRecords = JSON.parse(localStorage.getItem('yoonho_diet_records') || '{}'); } catch(e) { dietRecords = {}; }
  try {
    const b = JSON.parse(localStorage.getItem('yoonho_buySlots'));
    if (Array.isArray(b) && b.length === BUY_SLOT_COUNT) buySlots = b;
    else {
      const oldB = JSON.parse(localStorage.getItem('yoonho_buys') || '[]');
      buySlots = makeBuySlots();
      if (Array.isArray(oldB)) buySlots[0].items = oldB;
    }
  } catch(e) { buySlots = makeBuySlots(); }
  try {
    const s = JSON.parse(localStorage.getItem('yoonho_slots'));
    if (Array.isArray(s) && s.length === SLOT_COUNT) slots = s;
  } catch(e) {}
  document.getElementById('quickMemo').value = localStorage.getItem('yoonho_quickMemo') || '';
  updateQuickChar();
  render(); renderSlot(); renderTodos(); renderBuySlot();
}

// ── 주 메모 슬롯 ──
function renderSlot() {
  const s = slots[curSlot];
  document.getElementById('slotTitle').value = s.title;
  document.getElementById('slotBody').value  = s.body;
  document.getElementById('slotChar').textContent = s.body.length + '자';
  document.getElementById('slotIndicator').textContent = `${curSlot+1} / ${SLOT_COUNT}`;
  document.getElementById('slotPrev').disabled = curSlot === 0;
  document.getElementById('slotNext').disabled = curSlot === SLOT_COUNT-1;
  document.getElementById('slotDots').innerHTML = Array.from({length: SLOT_COUNT}, (_,i) =>
    `<div class="slot-dot ${i===curSlot?'active':''}" onclick="goSlot(${i})"></div>`
  ).join('');
}
function saveSlot() {
  slots[curSlot].title = document.getElementById('slotTitle').value;
  slots[curSlot].body  = document.getElementById('slotBody').value;
  document.getElementById('slotChar').textContent = slots[curSlot].body.length + '자';
  scheduleSync();
}
function changeSlot(d) { saveSlot(); curSlot = Math.max(0, Math.min(SLOT_COUNT-1, curSlot+d)); renderSlot(); }
function goSlot(i) { saveSlot(); curSlot = i; renderSlot(); }

// ── Todo ──
function renderTodos() {
  document.getElementById('todoList').innerHTML = todos.map((t,i) =>
    `<li class="todo-item">
      <input type="checkbox" ${t.done?'checked':''} onchange="toggleTodo(${i})" />
      <span class="${t.done?'done':''}" onclick="toggleTodo(${i})">${t.text}</span>
      <button class="del-todo" onclick="delTodo(${i})">&#10005;</button>
    </li>`
  ).join('');
  renderDashboard();
}
function addTodo() {
  const inp = document.getElementById('todoInput');
  const text = inp.value.trim(); if (!text) return;
  todos.push({ text, done: false });
  renderTodos(); inp.value = ''; scheduleSync();
}
function toggleTodo(i) { todos[i].done = !todos[i].done; renderTodos(); scheduleSync(); }
function delTodo(i) { todos.splice(i,1); renderTodos(); scheduleSync(); }
function todoKey(e) { if(e.key==='Enter') addTodo(); }

// ── Buy list 슬롯 ──
function renderBuySlot() {
  const slot = buySlots[curBuySlot];
  document.getElementById('buySlotTitle').value = slot.title || '';
  document.getElementById('buySlotIndicator').textContent = `${curBuySlot+1} / ${BUY_SLOT_COUNT}`;
  document.getElementById('buySlotPrev').disabled = curBuySlot === 0;
  document.getElementById('buySlotNext').disabled = curBuySlot === BUY_SLOT_COUNT-1;
  document.getElementById('buyList').innerHTML = slot.items.map((b,i) =>
    `<li class="todo-item">
      <input type="checkbox" class="buy-accent" ${b.done?'checked':''} onchange="toggleBuy(${i})" />
      <span class="${b.done?'done':''}" onclick="toggleBuy(${i})">${b.text}</span>
      <button class="del-todo" onclick="delBuy(${i})">&#10005;</button>
    </li>`
  ).join('');
  document.getElementById('buySlotDots').innerHTML = Array.from({length: BUY_SLOT_COUNT}, (_,i) =>
    `<div class="buy-slot-dot ${i===curBuySlot?'active':''}" onclick="goBuySlot(${i})"></div>`
  ).join('');
}
function saveBuySlotTitle() {
  buySlots[curBuySlot].title = document.getElementById('buySlotTitle').value;
  scheduleSync();
}
function changeBuySlot(d) { curBuySlot = Math.max(0, Math.min(BUY_SLOT_COUNT-1, curBuySlot+d)); renderBuySlot(); }
function goBuySlot(i) { curBuySlot = i; renderBuySlot(); }
function addBuy() {
  const inp = document.getElementById('buyInput');
  const text = inp.value.trim(); if (!text) return;
  buySlots[curBuySlot].items.push({ text, done: false });
  renderBuySlot(); inp.value = ''; scheduleSync();
}
function toggleBuy(i) { buySlots[curBuySlot].items[i].done = !buySlots[curBuySlot].items[i].done; renderBuySlot(); scheduleSync(); }
function delBuy(i) { buySlots[curBuySlot].items.splice(i,1); renderBuySlot(); scheduleSync(); }
function buyKey(e) { if(e.key==='Enter') addBuy(); }

// ── 일정 / 가계부 모드 ──
function setViewMode(mode) {
  viewMode = mode === 'ledger' ? 'ledger' : 'schedule';
  localStorage.setItem('yoonho_view_mode', viewMode);
  updateViewMode();
  render();
}

function updateViewMode() {
  const isLedger = viewMode === 'ledger';
  document.body.classList.toggle('ledger-view', isLedger);
  document.getElementById('scheduleModeBtn').classList.toggle('active', !isLedger);
  document.getElementById('ledgerModeBtn').classList.toggle('active', isLedger);
  document.getElementById('scheduleModeBtn').setAttribute('aria-selected', String(!isLedger));
  document.getElementById('ledgerModeBtn').setAttribute('aria-selected', String(isLedger));
  document.getElementById('scheduleLegend').style.display = isLedger ? 'none' : 'flex';
  document.getElementById('ledgerLegend').style.display = isLedger ? 'flex' : 'none';
  document.getElementById('ledgerSummary').classList.toggle('show', isLedger);
  document.getElementById('scheduleActions').style.display = isLedger ? 'none' : 'flex';
  document.getElementById('ledgerActions').classList.toggle('show', isLedger);
  document.querySelector('.header-title').innerHTML = isLedger ? '&#128176; 윤호의 가계부' : '&#128197; 윤호의 스케줄표';
  document.querySelector('.header-sub').textContent = isLedger ? "Yoonho's Personal Ledger" : "Yoonho's Personal Schedule";
}

function formatWon(amount) {
  return `${Math.round(Number(amount) || 0).toLocaleString('ko-KR')}원`;
}

function currentMonthKey() {
  return `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
}

function parseLocalDate(dateStr) {
  const [y,m,d] = dateStr.split('-').map(Number);
  return new Date(y,m-1,d);
}

function dateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function occursOn(item, dateStr) {
  if (!item?.date || dateStr < item.date) return false;
  if (item.repeatEnd && dateStr > item.repeatEnd) return false;
  const repeat = item.repeat || 'none';
  if (repeat === 'none') return item.date === dateStr;
  const base = parseLocalDate(item.date), target = parseLocalDate(dateStr);
  const diffDays = Math.round((target-base)/86400000);
  if (repeat === 'weekly') return Array.isArray(item.repeatDays) && item.repeatDays.length
    ? item.repeatDays.includes(target.getDay()) : diffDays >= 0 && diffDays % 7 === 0;
  if (repeat === 'monthly') return target.getDate() === base.getDate();
  if (repeat === 'yearly') return target.getMonth() === base.getMonth() && target.getDate() === base.getDate();
  return item.date === dateStr;
}

function getEventsForDate(dateStr) {
  return events.flatMap((event,i)=>eventOccurrencesOn(event,dateStr).map(e=>({...e,_i:i})));
}

function eventOccurrencesOn(event,dateStr) {
  const exceptions=event.exceptions || {};
  const result=[];
  if(occursOn(event,dateStr) && !exceptions[dateStr]) result.push({...event,_originalDate:dateStr});
  for(const [original,change] of Object.entries(exceptions)) {
    if(change && !change.cancelled && change.date===dateStr && occursOn(event,original))
      result.push({...event,...change,_originalDate:original,_changed:true});
  }
  return result;
}

function updateEventRepeatUI() {
  document.getElementById('eventRepeatOptions').hidden=!!editOccurrence;
  document.getElementById('evtWeekdays').hidden=document.getElementById('evtRepeat').value!=='weekly';
}

function eventRepeatLabel(event) {
  if(event.repeat!=='weekly') return repeatLabel(event.repeat);
  const days=event.repeatDays?.length?event.repeatDays:[parseLocalDate(event.date).getDay()];
  return '매주 '+days.map(d=>['일','월','화','수','목','금','토'][d]).join('·');
}

function fixedOccursOn(item, dateStr) {
  if (!item?.active) return false;
  if (item.startDate && dateStr < item.startDate) return false;
  const target = parseLocalDate(dateStr);
  const lastDay = new Date(target.getFullYear(), target.getMonth()+1, 0).getDate();
  return target.getDate() === Math.min(Math.max(Number(item.day)||1,1),lastDay);
}

function getLedgerEntriesForDate(dateStr) {
  const repeated = transactions.map((tx,i)=>({...tx,_i:i,_source:'transaction'})).filter(tx=>occursOn(tx,dateStr));
  const fixed = fixedExpenses.map((item,i)=>({
    id:item.id, type:'expense', amount:item.amount, title:item.title, date:dateStr,
    category:item.category||'fixed', payment:item.payment||'card', memo:'고정비',
    repeat:'monthly', _i:i, _source:'fixed'
  })).filter((_,i)=>fixedOccursOn(fixedExpenses[i],dateStr));
  return [...repeated,...fixed];
}

function getLedgerEntriesForMonth(year, monthIndex) {
  const days = new Date(year,monthIndex+1,0).getDate();
  const entries=[];
  for(let day=1;day<=days;day++){
    const dateStr=`${year}-${String(monthIndex+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    getLedgerEntriesForDate(dateStr).forEach(entry=>entries.push({...entry,_occurrenceDate:dateStr}));
  }
  return entries;
}

function nextOccurrence(item, fromStr=todayStr(), maxDays=730) {
  const start=parseLocalDate(fromStr);
  for(let i=0;i<=maxDays;i++){
    const candidate=new Date(start);candidate.setDate(start.getDate()+i);
    const str=dateString(candidate);
    if(eventOccurrencesOn(item,str).length)return str;
  }
  return '';
}

function renderLedgerSummary() {
  const key = currentMonthKey();
  const monthTransactions = getLedgerEntriesForMonth(cur.getFullYear(),cur.getMonth());
  const income = monthTransactions.filter(t => t.type === 'income').reduce((sum,t) => sum + (Number(t.amount) || 0), 0);
  const expense = monthTransactions.filter(t => t.type === 'expense').reduce((sum,t) => sum + (Number(t.amount) || 0), 0);
  const balance = income - expense;
  const budget = Number(monthlyBudgets[key]) || 0;
  const percent = budget > 0 ? Math.round((expense / budget) * 100) : 0;
  document.getElementById('monthIncome').textContent = formatWon(income);
  document.getElementById('monthExpense').textContent = formatWon(expense);
  const balanceEl = document.getElementById('monthBalance');
  balanceEl.textContent = `${balance < 0 ? '−' : ''}${formatWon(Math.abs(balance))}`;
  balanceEl.classList.toggle('negative', balance < 0);
  const budgetInput = document.getElementById('monthlyBudgetInput');
  if (document.activeElement !== budgetInput) budgetInput.value = budget || '';
  document.getElementById('budgetProgressBar').style.width = `${Math.min(percent,100)}%`;
  document.getElementById('budgetCaption').textContent = budget > 0
    ? `${percent}% 사용 · ${formatWon(Math.max(budget-expense,0))} 남음`
    : '예산을 설정해 주세요';
}

function saveMonthlyBudget() {
  const key = currentMonthKey();
  const amount = Math.max(0, Number(document.getElementById('monthlyBudgetInput').value) || 0);
  if (amount) monthlyBudgets[key] = Math.round(amount);
  else delete monthlyBudgets[key];
  renderLedgerSummary();
  pushToFirebase();
}

function renderDashboard() {
  const today=todayStr();
  const todayEvents=getEventsForDate(today).sort((a,b)=>(a.start||'99:99').localeCompare(b.start||'99:99'));
  const todayExpenses=getLedgerEntriesForDate(today).filter(entry=>entry.type==='expense');
  const expenseTotal=todayExpenses.reduce((sum,entry)=>sum+(Number(entry.amount)||0),0);
  const pending=todos.filter(todo=>!todo.done);
  document.getElementById('todayScheduleValue').textContent=`${todayEvents.length}개`;
  document.getElementById('todayScheduleSub').textContent=todayEvents.length ? todayEvents.slice(0,2).map(event=>event.title).join(' · ') : '등록된 일정이 없어요';
  document.getElementById('todayExpenseValue').textContent=formatWon(expenseTotal);
  document.getElementById('todayExpenseSub').textContent=todayExpenses.length ? `${todayExpenses.length}건의 지출` : '지출 내역이 없어요';
  document.getElementById('todayTodoValue').textContent=`${pending.length}개`;
  document.getElementById('todayTodoSub').textContent=pending.length ? pending.slice(0,2).map(todo=>todo.text).join(' · ') : '모두 완료했어요';

  const candidates=events.map((event,i)=>{
    const target=event.deadline || nextOccurrence(event,today);
    return target ? {...event,_i:i,_target:target} : null;
  }).filter(Boolean).filter(event=>event._target>=today).sort((a,b)=>a._target.localeCompare(b._target));
  const nearest=candidates[0];
  if(nearest){
    const diff=Math.round((parseLocalDate(nearest._target)-parseLocalDate(today))/86400000);
    document.getElementById('todayDdayValue').textContent=diff===0?'D-Day':`D-${diff}`;
    document.getElementById('todayDdaySub').textContent=`${nearest.title} · ${fmtDate(nearest._target)}`;
  }else{
    document.getElementById('todayDdayValue').textContent='없음';
    document.getElementById('todayDdaySub').textContent='예정된 마감이 없어요';
  }

  const pinned=events.map((event,i)=>({...event,_i:i,_next:nextOccurrence(event,today)}))
    .filter(event=>event.pinned&&event._next).sort((a,b)=>a._next.localeCompare(b._next)).slice(0,6);
  const strip=document.getElementById('importantStrip');
  strip.classList.toggle('show',pinned.length>0);
  strip.innerHTML=pinned.length ? `<span class="important-label">📌 중요 일정</span>${pinned.map(event=>
    `<button class="important-item" type="button" onclick="openPinnedEvent('${event._next}')">${fmtDate(event._next)} · ${escapeHtml(event.title)}</button>`
  ).join('')}` : '';
}

function openPinnedEvent(dateStr){openDetailModal({stopPropagation(){}},dateStr);}

function renderDietTracker() {
  const today=todayStr();
  const todayRecord=dietRecords[today]||{};
  const fields=[['dietWeight','weight'],['dietWater','water'],['dietWorkout','workout'],['dietMeal','meal']];
  fields.forEach(([id,key])=>{const el=document.getElementById(id);if(document.activeElement!==el)el.value=todayRecord[key]??'';});
  const prefix=currentMonthKey();
  const monthRecords=Object.entries(dietRecords).filter(([date])=>date.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b));
  const weights=monthRecords.filter(([,record])=>Number(record.weight)>0).map(([,record])=>Number(record.weight));
  const workout=monthRecords.reduce((sum,[,record])=>sum+(Number(record.workout)||0),0);
  const waters=monthRecords.filter(([,record])=>Number(record.water)>0).map(([,record])=>Number(record.water));
  document.getElementById('dietWeightChange').textContent=weights.length>=2 ? `${weights.at(-1)-weights[0]>=0?'+':''}${(weights.at(-1)-weights[0]).toFixed(1)}kg` : (weights.length?'기준 기록 1개':'기록 없음');
  document.getElementById('dietWorkoutTotal').textContent=`${workout.toLocaleString('ko-KR')}분`;
  document.getElementById('dietWaterAverage').textContent=waters.length?`${(waters.reduce((a,b)=>a+b,0)/waters.length).toFixed(1)}잔`:'0잔';
  const recent=Object.entries(dietRecords).sort(([a],[b])=>b.localeCompare(a)).slice(0,7);
  document.getElementById('dietRecent').innerHTML=recent.length?recent.map(([date,record])=>
    `<div class="diet-day"><strong>${fmtDate(date)}</strong>${record.weight?`⚖️ ${record.weight}kg<br>`:''}${record.water?`💧 ${record.water}잔<br>`:''}${record.workout?`🏃 ${record.workout}분<br>`:''}${record.meal?`🥗 ${escapeHtml(record.meal)}`:''}</div>`
  ).join(''):'<div class="panel-hint">아직 저장된 다이어트 기록이 없어요.</div>';
}

function saveDietRecord() {
  const date=todayStr();
  const record={
    weight:Number(document.getElementById('dietWeight').value)||'',
    water:Number(document.getElementById('dietWater').value)||'',
    workout:Number(document.getElementById('dietWorkout').value)||'',
    meal:document.getElementById('dietMeal').value.trim(),
  };
  if(record.weight||record.water||record.workout||record.meal)dietRecords[date]=record;
  else delete dietRecords[date];
  renderDietTracker();renderDashboard();pushToFirebase();
}

function renderLedgerStats() {
  const year=cur.getFullYear(),month=cur.getMonth();
  const entries=getLedgerEntriesForMonth(year,month).filter(entry=>entry.type==='expense');
  const total=entries.reduce((sum,entry)=>sum+(Number(entry.amount)||0),0);
  const previousDate=new Date(year,month-1,1);
  const previousEntries=getLedgerEntriesForMonth(previousDate.getFullYear(),previousDate.getMonth()).filter(entry=>entry.type==='expense');
  const previousTotal=previousEntries.reduce((sum,entry)=>sum+(Number(entry.amount)||0),0);
  const days=new Date(year,month+1,0).getDate();
  document.getElementById('averageDailyExpense').textContent=formatWon(total/days);
  const comparison=previousTotal?Math.round(((total-previousTotal)/previousTotal)*100):0;
  document.getElementById('previousMonthComparison').textContent=previousTotal?`${comparison>0?'+':''}${comparison}%`:'비교 없음';
  document.getElementById('monthlyExpenseCount').textContent=`${entries.length}건`;
  const totals={};entries.forEach(entry=>{totals[entry.category]=(totals[entry.category]||0)+(Number(entry.amount)||0);});
  const sorted=Object.entries(totals).sort((a,b)=>b[1]-a[1]);
  document.getElementById('categoryBars').innerHTML=sorted.length?sorted.map(([category,amount])=>{
    const cat=TRANSACTION_CATS.expense[category]||TRANSACTION_CATS.expense.etc;
    const percent=total?Math.round(amount/total*100):0;
    return `<div class="category-bar-row"><div class="category-bar-label">${cat.label}</div><div class="category-bar-track"><div class="category-bar-fill" style="width:${percent}%;background:${cat.color}"></div></div><div class="category-bar-value">${percent}% · ${formatWon(amount)}</div></div>`;
  }).join(''):'<div class="panel-hint">이번 달 지출을 입력하면 카테고리 통계가 표시됩니다.</div>';
}

function renderFixedExpenses() {
  const list=document.getElementById('fixedExpenseList');
  list.innerHTML=fixedExpenses.length?fixedExpenses.map((item,i)=>{
    const cat=TRANSACTION_CATS.expense[item.category]||TRANSACTION_CATS.expense.fixed;
    return `<div class="fixed-item"><div class="fixed-main"><div class="fixed-title">${escapeHtml(item.title)}</div><div class="fixed-meta">매월 ${item.day}일 · ${cat.label} · ${PAYMENT_LABELS[item.payment]||'기타'}${item.startDate?` · ${fmtDate(item.startDate)}부터`:''}${item.active?'':' · 일시정지'}</div></div><div class="fixed-amount">−${formatWon(item.amount)}</div><div><button class="small-action" onclick="openFixedExpenseModal(${i})">수정</button> <button class="small-action" onclick="deleteFixedExpense(${i})">삭제</button></div></div>`;
  }).join(''):'<div class="panel-hint">등록된 고정비가 없어요.</div>';
}

function openFixedExpenseModal(idx) {
  editFixedExpenseIdx=idx!==undefined?idx:-1;
  const item=editFixedExpenseIdx>=0?fixedExpenses[editFixedExpenseIdx]:{};
  document.getElementById('fixedExpenseModalTitle').textContent=editFixedExpenseIdx>=0?'✏️ 고정비 수정':'🏦 고정비 추가';
  document.getElementById('fixedExpenseTitle').value=item.title||'';
  document.getElementById('fixedExpenseAmount').value=item.amount||'';
  document.getElementById('fixedExpenseDay').value=item.day||1;
  document.getElementById('fixedExpenseStart').value=item.startDate||`${currentMonthKey()}-01`;
  document.getElementById('fixedExpenseCategory').value=item.category||'fixed';
  document.getElementById('fixedExpensePayment').value=item.payment||'card';
  document.getElementById('fixedExpenseActive').checked=item.active!==false;
  document.getElementById('fixedExpenseOverlay').classList.add('open');
  setTimeout(()=>document.getElementById('fixedExpenseTitle').focus(),100);
}
function closeFixedExpenseModal(){document.getElementById('fixedExpenseOverlay').classList.remove('open');editFixedExpenseIdx=-1;}
function closeFixedExpenseOutside(e){if(e.target.id==='fixedExpenseOverlay')closeFixedExpenseModal();}
function saveFixedExpense(){
  const title=document.getElementById('fixedExpenseTitle').value.trim();
  const amount=Math.round(Number(document.getElementById('fixedExpenseAmount').value)||0);
  const day=Math.min(31,Math.max(1,Math.round(Number(document.getElementById('fixedExpenseDay').value)||1)));
  if(!title){document.getElementById('fixedExpenseTitle').focus();return;}if(amount<=0){document.getElementById('fixedExpenseAmount').focus();return;}
  const previous=editFixedExpenseIdx>=0?fixedExpenses[editFixedExpenseIdx]:null;
  const item={id:previous?.id||`${Date.now()}_fixed`,title,amount,day,startDate:document.getElementById('fixedExpenseStart').value,category:document.getElementById('fixedExpenseCategory').value,payment:document.getElementById('fixedExpensePayment').value,active:document.getElementById('fixedExpenseActive').checked};
  if(editFixedExpenseIdx>=0)fixedExpenses[editFixedExpenseIdx]=item;else fixedExpenses.push(item);
  closeFixedExpenseModal();render();pushToFirebase();
}
function deleteFixedExpense(idx){if(!confirm('이 고정비를 삭제할까요?'))return;fixedExpenses.splice(idx,1);render();pushToFirebase();}

function setTransactionType(type, selectedCategory) {
  const safeType = type === 'income' ? 'income' : 'expense';
  document.getElementById('transactionType').value = safeType;
  document.getElementById('expenseTypeBtn').classList.toggle('active', safeType === 'expense');
  document.getElementById('incomeTypeBtn').classList.toggle('active', safeType === 'income');
  const categories = TRANSACTION_CATS[safeType];
  const select = document.getElementById('transactionCategory');
  select.innerHTML = Object.entries(categories).map(([value,cat]) =>
    `<option value="${value}">${cat.label}</option>`
  ).join('');
  if (selectedCategory && categories[selectedCategory]) select.value = selectedCategory;
  const isEdit = editTransactionIdx >= 0;
  document.getElementById('transactionModalTitle').textContent = isEdit
    ? (safeType === 'income' ? '✏️ 수입 수정' : '✏️ 지출 수정')
    : (safeType === 'income' ? '💰 수입 추가' : '💳 지출 추가');
}

function openTransactionModal(type='expense', date, idx) {
  editTransactionIdx = idx !== undefined ? idx : -1;
  const isEdit = editTransactionIdx >= 0;
  const tx = isEdit ? transactions[editTransactionIdx] : {};
  const txType = isEdit ? tx.type : type;
  setTransactionType(txType, tx.category);
  document.getElementById('transactionAmount').value = tx.amount || '';
  document.getElementById('transactionTitle').value = tx.title || '';
  document.getElementById('transactionDate').value = tx.date || date || todayStr();
  document.getElementById('transactionPayment').value = tx.payment || 'card';
  document.getElementById('transactionRepeat').value = tx.repeat || 'none';
  document.getElementById('transactionRepeatEnd').value = tx.repeatEnd || '';
  document.getElementById('transactionMemo').value = tx.memo || '';
  document.getElementById('transactionOverlay').classList.add('open');
  setTimeout(() => document.getElementById('transactionAmount').focus(), 100);
}

function closeTransactionModal() {
  document.getElementById('transactionOverlay').classList.remove('open');
  editTransactionIdx = -1;
}
function closeTransactionOutside(e) { if (e.target.id === 'transactionOverlay') closeTransactionModal(); }

function saveTransaction() {
  const amount = Math.round(Number(document.getElementById('transactionAmount').value) || 0);
  const title = document.getElementById('transactionTitle').value.trim();
  const date = document.getElementById('transactionDate').value;
  if (amount <= 0) { document.getElementById('transactionAmount').focus(); return; }
  if (!title) { document.getElementById('transactionTitle').focus(); return; }
  if (!date) { document.getElementById('transactionDate').focus(); return; }
  const previous = editTransactionIdx >= 0 ? transactions[editTransactionIdx] : null;
  const tx = {
    id: previous?.id || `${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    type: document.getElementById('transactionType').value,
    amount,
    title,
    date,
    category: document.getElementById('transactionCategory').value,
    payment: document.getElementById('transactionPayment').value,
    repeat: document.getElementById('transactionRepeat').value,
    repeatEnd: document.getElementById('transactionRepeatEnd').value,
    memo: document.getElementById('transactionMemo').value.trim(),
  };
  if (editTransactionIdx >= 0) transactions[editTransactionIdx] = tx;
  else transactions.push(tx);
  closeTransactionModal();
  render();
  if (ledgerDetailDateValue === date) renderLedgerDetail(date);
  pushToFirebase();
}

function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function openLedgerDetailModal(e, dateStr) {
  e.stopPropagation();
  ledgerDetailDateValue = dateStr;
  const parts = dateStr.split('-');
  const d = new Date(+parts[0], +parts[1]-1, +parts[2]);
  const days = ['일','월','화','수','목','금','토'];
  document.getElementById('ledgerDetailDate').textContent = `${+parts[1]}월 ${+parts[2]}일 (${days[d.getDay()]}) 가계부`;
  renderLedgerDetail(dateStr);
  document.getElementById('ledgerDetailOverlay').classList.add('open');
}

function closeLedgerDetailModal() {
  document.getElementById('ledgerDetailOverlay').classList.remove('open');
  ledgerDetailDateValue = '';
}
function closeLedgerDetailOutside(e) { if (e.target.id === 'ledgerDetailOverlay') closeLedgerDetailModal(); }

function renderLedgerDetail(dateStr) {
  const dayTransactions = getLedgerEntriesForDate(dateStr);
  let html = '';
  if (!dayTransactions.length) html = '<div class="no-event">등록된 수입·지출이 없어요</div>';
  dayTransactions.forEach(tx => {
    const type = tx.type === 'income' ? 'income' : 'expense';
    const cat = TRANSACTION_CATS[type][tx.category] || Object.values(TRANSACTION_CATS[type])[0];
    const sign = type === 'income' ? '+' : '−';
    html += `<div class="txn-card" style="border-left-color:${cat.color}">
      <div class="txn-card-top">
        <div><div class="txn-category">${cat.label}</div><div class="txn-title">${escapeHtml(tx.title)}</div></div>
        <div class="txn-amount ${type}">${sign}${formatWon(tx.amount)}</div>
      </div>
      <div class="txn-meta">${PAYMENT_LABELS[tx.payment] || '기타'}${tx.repeat&&tx.repeat!=='none'?` <span class="repeat-tag">${repeatLabel(tx.repeat)}</span>`:''}${tx._source==='fixed'?'<span class="repeat-tag">고정비</span>':''}${tx.memo ? ` · ${escapeHtml(tx.memo)}` : ''}</div>
      <div class="txn-actions">
        ${tx._source==='fixed'
          ? `<button class="txn-action-btn" onclick="editFixedFromDetail(${tx._i})">✏️ 고정비 수정</button><button class="txn-action-btn" onclick="deleteFixedFromDetail(${tx._i},'${dateStr}')">🗑 삭제</button>`
          : `<button class="txn-action-btn" onclick="editTransaction(${tx._i},'${dateStr}')">✏️ 수정</button><button class="txn-action-btn" onclick="deleteTransaction(${tx._i},'${dateStr}')">🗑 삭제</button>`}
      </div>
    </div>`;
  });
  html += `<div class="ledger-detail-actions">
    <button class="btn-expense" onclick="openTransactionFromDetail('expense','${dateStr}')">− 지출 추가</button>
    <button class="btn-income" onclick="openTransactionFromDetail('income','${dateStr}')">+ 수입 추가</button>
  </div>`;
  document.getElementById('ledgerDetailBody').innerHTML = html;
}

function editTransaction(idx, dateStr) { closeLedgerDetailModal(); openTransactionModal('expense', dateStr, idx); }
function deleteTransaction(idx, dateStr) {
  if (!confirm('이 내역을 삭제할까요?')) return;
  transactions.splice(idx,1);
  render(); renderLedgerDetail(dateStr); pushToFirebase();
}
function openTransactionFromDetail(type, dateStr) { closeLedgerDetailModal(); openTransactionModal(type, dateStr); }
function editFixedFromDetail(idx){closeLedgerDetailModal();openFixedExpenseModal(idx);}
function deleteFixedFromDetail(idx,dateStr){if(!confirm('이 고정비를 삭제할까요?'))return;fixedExpenses.splice(idx,1);render();renderLedgerDetail(dateStr);pushToFirebase();}

function repeatLabel(repeat){return ({weekly:'매주',monthly:'매월',yearly:'매년'})[repeat]||'';}

// ── 캘린더 ──
function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
}
function fmtTime(t) {
  if (!t) return '';
  const [h,m] = t.split(':');
  const hh=+h, ampm=hh>=12?'오후':'오전', hd=hh===0?12:hh>12?hh-12:hh;
  return `${ampm} ${hd}:${m}`;
}
function fmtDate(d) {
  if (!d) return '';
  const [y,m,day] = d.split('-');
  return `${+m}월 ${+day}일`;
}
function deadlineStatus(dStr) {
  if (!dStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const dl = new Date(dStr); dl.setHours(0,0,0,0);
  const diff = Math.ceil((dl-today)/86400000);
  if (diff<0) return {cls:'overdue',icon:'\u{1F6A8}',text:`마감 ${Math.abs(diff)}일 초과`};
  if (diff<=3) return {cls:'urgent',icon:'\u26A0\uFE0F',text:diff===0?'오늘 마감!':`마감 D-${diff}`};
  return {cls:'normal',icon:'\u{1F4C5}',text:`마감 ${fmtDate(dStr)} (D-${diff})`};
}
function toggleSection(id,cb) { document.getElementById(id).style.display = cb.checked?'block':'none'; }

function render() {
  const y=cur.getFullYear(), m=cur.getMonth();
  document.getElementById('monthLabel').textContent=`${y}년 ${m+1}월`;
  renderLedgerSummary();
  renderDashboard();
  renderDietTracker();
  renderLedgerStats();
  renderFixedExpenses();
  const first=new Date(y,m,1).getDay(), lastDay=new Date(y,m+1,0).getDate(), prevLast=new Date(y,m,0).getDate();
  const today=new Date(); let html='';
  for(let i=0;i<42;i++){
    let day,cls='day',dateStr;
    if(i<first){day=prevLast-first+1+i;const pm=m===0?12:m,py=m===0?y-1:y;dateStr=`${py}-${String(pm).padStart(2,'0')}-${String(day).padStart(2,'0')}`;cls+=' other-month';}
    else if(i>=first+lastDay){day=i-first-lastDay+1;const nm=m===11?1:m+2,ny=m===11?y+1:y;dateStr=`${ny}-${String(nm).padStart(2,'0')}-${String(day).padStart(2,'0')}`;cls+=' other-month';}
    else{day=i-first+1;dateStr=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;if(day===today.getDate()&&m===today.getMonth()&&y===today.getFullYear())cls+=' today';}
    let badges='', clickHandler='', expenseFooter='';
    if(viewMode==='ledger'){
      const dayTx=getLedgerEntriesForDate(dateStr);
      const income=dayTx.filter(t=>t.type==='income').reduce((sum,t)=>sum+(Number(t.amount)||0),0);
      const expense=dayTx.filter(t=>t.type==='expense').reduce((sum,t)=>sum+(Number(t.amount)||0),0);
      if(income)badges+=`<div class="money-badge income" onclick="openLedgerDetailModal(event,'${dateStr}')">+${formatWon(income)}</div>`;
      if(expense)badges+=`<div class="money-badge expense" onclick="openLedgerDetailModal(event,'${dateStr}')">−${formatWon(expense)}</div>`;
      clickHandler=`openLedgerDetailModal(event,'${dateStr}')`;
    }else{
      const dayEvts=getEventsForDate(dateStr).sort((a,b)=>(a.start||'99:99').localeCompare(b.start||'99:99'));
      badges=dayEvts.map(e=>{const cat=CATS[e.cat]||CATS.etc;const dl=deadlineStatus(e.deadline);const warn=dl&&(dl.cls==='urgent'||dl.cls==='overdue')?' \u26A0':'';const t=e.start?` ${fmtTime(e.start)}`:'';const flags=`${e.pinned?'📌 ':''}${e.repeat&&e.repeat!=='none'?'↻ ':''}`;return `<div class="event-badge" style="background:${cat.color}" onclick="openDetailModal(event,'${dateStr}')">${flags}${e.title}${t}${warn}</div>`;}).join('');
      const dayExpense=getLedgerEntriesForDate(dateStr).filter(t=>t.type==='expense').reduce((sum,t)=>sum+(Number(t.amount)||0),0);
      if(dayExpense){cls+=' has-expense-summary';expenseFooter=`<div class="schedule-expense-summary">−${formatWon(dayExpense)}</div>`;}
      clickHandler=`openDetailModal(event,'${dateStr}')`;
    }
    html+=`<div class="${cls}" onclick="${clickHandler}"><div class="day-num">${day}</div><div class="events">${badges}</div>${expenseFooter}</div>`;
  }
  document.getElementById('daysGrid').innerHTML=html;
}
function changeMonth(d){cur.setMonth(cur.getMonth()+d);render();}

function openAddModal(date,idx,originalDate=''){
  editIdx=(idx!==undefined)?idx:-1;const isEdit=editIdx>=0;
  editOccurrence=originalDate;
  editSource=isEdit?events[editIdx]:null;
  document.getElementById('modalTitle').textContent=isEdit?'\u270F\uFE0F 일정 수정':'\u{1F4DD} 일정 추가';
  const e=isEdit?(originalDate?{...editSource,date:originalDate,...editSource.exceptions?.[originalDate]}:editSource):{};
  if(originalDate) document.getElementById('modalTitle').textContent='이번 회차만 수정';
  document.getElementById('evtScopeNote').textContent=originalDate?'이 회차의 날짜·시간·내용만 변경됩니다.':isEdit&&e.repeat&&e.repeat!=='none'?'반복 일정 전체를 수정합니다. 개별 변경·취소 기록은 유지됩니다.':'';
  document.getElementById('evtTitle').value=e.title||'';document.getElementById('evtDate').value=e.date||date||todayStr();document.getElementById('evtCat').value=e.cat||'school';document.getElementById('evtMemo').value=e.memo||'';
  const ut=!!(e.start);document.getElementById('useTime').checked=ut;document.getElementById('timeFields').style.display=ut?'block':'none';document.getElementById('evtStart').value=e.start||'';document.getElementById('evtEnd').value=e.end||'';
  const ud=!!(e.deadline);document.getElementById('useDeadline').checked=ud;document.getElementById('deadlineFields').style.display=ud?'block':'none';document.getElementById('evtDeadline').value=e.deadline||'';document.getElementById('evtDeadlineMemo').value=e.deadlineMemo||'';
  const ul=!!(e.link);document.getElementById('useLink').checked=ul;document.getElementById('linkFields').style.display=ul?'block':'none';document.getElementById('evtLink').value=e.link||'';document.getElementById('evtLinkLabel').value=e.linkLabel||'';
  document.getElementById('evtRepeat').value=e.repeat||'none';document.getElementById('evtRepeatEnd').value=e.repeatEnd||'';document.getElementById('evtPinned').checked=!!e.pinned;
  const selected=e.repeatDays?.length?e.repeatDays:[parseLocalDate(e.date||date||todayStr()).getDay()];
  document.querySelectorAll('#evtWeekdays input').forEach(input=>input.checked=selected.includes(Number(input.value)));
  updateEventRepeatUI();
  document.getElementById('addOverlay').classList.add('open');setTimeout(()=>document.getElementById('evtTitle').focus(),100);
}
function closeAddModal(){document.getElementById('addOverlay').classList.remove('open');editIdx=-1;editOccurrence='';editSource=null;}
function closeAddOutside(e){if(e.target.id==='addOverlay')closeAddModal();}

function saveEvent(){
  const title=document.getElementById('evtTitle').value.trim();const date=document.getElementById('evtDate').value;
  if(!title){document.getElementById('evtTitle').focus();return;}if(!date){document.getElementById('evtDate').focus();return;}
  const ut=document.getElementById('useTime').checked,ud=document.getElementById('useDeadline').checked,ul=document.getElementById('useLink').checked;
  const repeat=document.getElementById('evtRepeat').value;
  if(editIdx>=0 && events[editIdx]!==editSource){alert('다른 기기에서 일정이 갱신되었습니다. 창을 닫고 다시 수정해 주세요.');return;}
  const repeatDays=Array.from(document.querySelectorAll('#evtWeekdays input:checked'),input=>Number(input.value));
  if(!editOccurrence && repeat==='weekly' && !repeatDays.length){alert('반복할 요일을 하나 이상 선택해 주세요.');return;}
  const repeatEnd=document.getElementById('evtRepeatEnd').value;
  if(!editOccurrence && repeat!=='none' && repeatEnd && repeatEnd<date){alert('반복 종료일은 시작일 이후로 지정해 주세요.');return;}
  const obj={title,date,cat:document.getElementById('evtCat').value,memo:document.getElementById('evtMemo').value.trim(),
    start:ut?document.getElementById('evtStart').value:'',end:ut?document.getElementById('evtEnd').value:'',
    deadline:ud?document.getElementById('evtDeadline').value:'',deadlineMemo:ud?document.getElementById('evtDeadlineMemo').value.trim():'',
    link:ul?document.getElementById('evtLink').value.trim():'',linkLabel:ul?document.getElementById('evtLinkLabel').value.trim():'',
    repeat,repeatEnd:repeat==='none'?'':document.getElementById('evtRepeatEnd').value,pinned:document.getElementById('evtPinned').checked};
  if(editOccurrence){
    const {repeat:ignoredRepeat,repeatEnd:ignoredEnd,...change}=obj;
    events[editIdx]={...editSource,exceptions:{...editSource.exceptions,[editOccurrence]:change}};
  }else{
    obj.repeatDays=repeat==='weekly'?repeatDays:[];
    if(editIdx>=0)events[editIdx]={...editSource,...obj};else events.push(obj);
  }
  saveLocal();render();closeAddModal();if(detailDate)renderDetail(detailDate);
  pushToFirebase();
}

function openDetailModal(e,dateStr){
  e.stopPropagation();detailDate=dateStr;
  const parts=dateStr.split('-');const d=new Date(+parts[0],+parts[1]-1,+parts[2]);
  const days=['일','월','화','수','목','금','토'];
  document.getElementById('detailDate').textContent=`${+parts[1]}월 ${+parts[2]}일 (${days[d.getDay()]})`;
  renderDetail(dateStr);document.getElementById('detailOverlay').classList.add('open');
}
function closeDetailModal(){document.getElementById('detailOverlay').classList.remove('open');detailDate='';}
function closeDetailOutside(e){if(e.target.id==='detailOverlay')closeDetailModal();}

function renderDetail(dateStr){
  const dayEvts=getEventsForDate(dateStr).sort((a,b)=>(a.start||'99:99').localeCompare(b.start||'99:99'));
  let html='';if(!dayEvts.length)html='<div class="no-event">등록된 일정이 없어요</div>';
  dayEvts.forEach(e=>{
    const cat=CATS[e.cat]||CATS.etc;const dl=deadlineStatus(e.deadline);
    let timeHtml='';if(e.start){timeHtml=`<div class="evt-time">\u23F0 ${fmtTime(e.start)}`;if(e.end)timeHtml+=` ~ ${fmtTime(e.end)}`;timeHtml+='</div>';}
    let dlHtml='';if(dl){dlHtml=`<div class="evt-deadline ${dl.cls}">${dl.icon} ${dl.text}${e.deadlineMemo?` — ${e.deadlineMemo}`:''}</div>`;}
    let linkHtml='';if(e.link){linkHtml=`<div class="evt-link">\u{1F517} <a href="${e.link}" target="_blank" rel="noopener">${e.linkLabel||e.link}</a></div>`;}
    html+=`<div class="evt-card" style="background:${cat.bg};border-left-color:${cat.border}">
      <div class="evt-card-top"><div><span class="cat-badge" style="background:${cat.color}">${cat.label}</span>${e.repeat&&e.repeat!=='none'?`<span class="repeat-tag">${repeatLabel(e.repeat)}</span>`:''}${e.pinned?'<span class="pin-tag">📌 중요</span>':''}</div>
      <div class="evt-actions">${e.repeat&&e.repeat!=='none'?`<button class="evt-action-btn" onclick="editEvent(${e._i},'${dateStr}','${e._originalDate}')">이번 회차 수정</button><button class="evt-action-btn" onclick="cancelOccurrence(${e._i},'${e._originalDate}','${dateStr}')">이번 회차 취소</button>`:''}<button class="evt-action-btn" onclick="editEvent(${e._i},'${dateStr}')">${e.repeat&&e.repeat!=='none'?'전체 수정':'수정'}</button><button class="evt-action-btn" onclick="delEvent(${e._i},'${dateStr}')">${e.repeat&&e.repeat!=='none'?'전체 삭제':'삭제'}</button></div></div>
      ${e.repeat&&e.repeat!=='none'?`<div class="repeat-note">${eventRepeatLabel(events[e._i])}${e._changed?' · 이번 회차 변경됨':''}</div>`:''}
      <div class="evt-title">${e.title}</div>${timeHtml}${dlHtml}${e.memo?`<div class="evt-memo">\u{1F4CC} ${e.memo}</div>`:''}${linkHtml}
    </div>`;
  });
  html+=`<button class="detail-add-btn" onclick="openAddFromDetail('${dateStr}')">+ 이 날 일정 추가</button>`;
  document.getElementById('detailBody').innerHTML=html;
}

function editEvent(idx,dateStr,originalDate=''){closeDetailModal();openAddModal(dateStr,idx,originalDate);}
function cancelOccurrence(idx,originalDate,dateStr){
  if(!confirm('이 회차만 취소할까요? 다른 날짜의 반복 일정은 유지됩니다.'))return;
  const source=events[idx];
  source.exceptions={...source.exceptions,[originalDate]:{cancelled:true}};
  saveLocal();render();renderDetail(dateStr);pushToFirebase();
}
function delEvent(idx,dateStr){if(!confirm(events[idx].repeat&&events[idx].repeat!=='none'?'모든 회차와 개별 변경 기록을 삭제할까요?':'삭제할까요?'))return;events.splice(idx,1);saveLocal();render();renderDetail(dateStr);pushToFirebase();}
function openAddFromDetail(dateStr){closeDetailModal();openAddModal(dateStr);}

document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeAddModal();closeDetailModal();closeTransactionModal();closeLedgerDetailModal();closeFixedExpenseModal();}});

updateThemeButton(); updateViewMode(); render(); startRealtimeSync();
