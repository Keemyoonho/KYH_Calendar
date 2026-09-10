// Date-keyed achievement records. This subtree is never replaced by general saves.
let goalPlans={},goalRecords={},goalSchedules={},goalStarted='',goalDate='',goalLastToday='',goalReady=false;
let goalScheduleSaving=false,goalScheduleRetry=false,goalPlanSaving=false;
const goalBusy=new Set();
function goalToday(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function goalId(){return 'g_'+Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');}
function goalSignature(value){if(Array.isArray(value))return '['+value.map(goalSignature).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+goalSignature(value[k])).join(',')+'}';return JSON.stringify(value);}
let goalMessageTimer;
function goalMessage(text){const el=document.getElementById('goalSaveStatus');if(!el)return;clearTimeout(goalMessageTimer);el.textContent=text;if(text.includes('완료'))goalMessageTimer=setTimeout(()=>{el.textContent='';},2500);}
function goalHash(value){let h=2166136261;for(const ch of value){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
function ensureGoalEventIds(){events.forEach((e,i)=>{if(!/^[a-zA-Z0-9_-]+$/.test(e.goalId||''))e.goalId='event_'+i+'_'+goalHash(JSON.stringify(e));});}
function goalScheduleSnapshot(){ensureGoalEventIds();return events.filter(e=>e.repeat&&e.repeat!=='none').map(e=>JSON.parse(JSON.stringify(e)));}
function receiveGoalTracker(data){
 const value=data.goalTracker||{};
 goalPlans=value.plans||{};goalRecords=value.records||{};goalSchedules=value.schedules||{};
 goalStarted=isSafeCalendarDate(value.started)?value.started:Object.keys(goalSchedules).sort()[0]||goalToday();
 goalReady=true;
 if(!goalDate||(goalLastToday&&goalLastToday!==goalToday()))goalDate=goalToday();
 goalLastToday=goalToday();
 syncGoalSchedule();renderGoalTracker();
 if(detailDate)renderDetail(detailDate);
 if(ledgerDetailDateValue)renderLedgerDetail(ledgerDetailDateValue);
}
async function syncGoalSchedule(){
 if(!goalReady||!canSync()||goalScheduleSaving)return;
 const today=goalToday(),snapshot=goalScheduleSnapshot();
 const record={version:1,events:snapshot};
 if(goalSchedules[today]&&goalSignature(goalSchedules[today].events||[])===goalSignature(snapshot)&&!goalScheduleRetry)return;
 goalScheduleSaving=true;goalScheduleRetry=false;
 try{
  // Keep one schedule version per day so later edits do not rewrite past checklists.
  await DATA_REF.child('goalTracker/started').transaction(current=>current||today,undefined,false);
  if(!canSync())throw Error('locked');
  await DATA_REF.child('goalTracker/schedules/'+today).set(record);
  goalSchedules[today]=record;
 }catch(e){goalScheduleRetry=true;goalMessage('목표 일정 저장 실패. 연결 복구 후 자동 재시도합니다. 계속되면 새로고침해 주세요.');}
 finally{goalScheduleSaving=false;}
 if(!goalScheduleRetry&&canSync()&&goalSignature(goalScheduleSnapshot())!==goalSignature(snapshot))syncGoalSchedule();
}
function goalRows(date){
 if(!goalReady||!isSafeCalendarDate(date)||date<goalStarted)return [];
 const rows={};
 for(const [id,p] of Object.entries(goalPlans)){
  if(!/^[\w-]+$/.test(id)||!isSafeCalendarDate(p.start)||!isSafeCalendarDate(p.end))continue;
  if(date<p.start||date>p.end||date<(p.createdDate||p.start)||(p.stopAfter&&date>p.stopAfter))continue;
  for(const [task,text] of Object.entries(p.items||{}))if(/^[\w-]+$/.test(task))rows['plan_'+id+'_'+task]={text:String(text),group:String(p.slogan||'목표'),done:false};
 }
 const today=goalToday();
 let source=[];
 if(date>=today)source=goalScheduleSnapshot();
 else{const version=Object.keys(goalSchedules).filter(d=>d<=date).sort().pop();source=goalSchedules[version]?.events||[];}
 for(const event of source){
  if(!/^[\w-]+$/.test(event.goalId||''))continue;
  for(const occurrence of eventOccurrencesOn(event,date)){
   const key='repeat_'+event.goalId+'_'+occurrence._originalDate;
   rows[key]={text:String(occurrence.title||'반복 일정'),group:'반복 일정'+(occurrence.start?' · '+occurrence.start:''),done:false};
  }
 }
 // A checked or explicitly unchecked record survives source edits/deletion.
 for(const [key,record] of Object.entries(goalRecords[date]||{}))if(/^[\w-]+$/.test(key)&&record&&typeof record.text==='string')rows[key]={...record,done:record.done===true};
 return Object.entries(rows).map(([key,row])=>({key,...row}));
}
function goalSummary(date){const rows=goalRows(date);return {rows,total:rows.length,done:rows.filter(r=>r.done).length};}
function goalBadge(date){const s=goalSummary(date);return s.total?'<div class="goal-day-badge">✓ '+s.done+'/'+s.total+'</div>':'';}
function goalHistoryHtml(date){
 const s=goalSummary(date);if(!s.total)return '<section class="goal-history"><h3>목표 달성 기록</h3><p class="panel-hint">이날의 목표 기록이 없습니다.</p></section>';
 return '<section class="goal-history"><h3>목표 달성 '+s.done+' / '+s.total+'</h3><ul>'+s.rows.map(r=>'<li>'+ (r.done?'✓ 달성':date>goalToday()?'□ 예정':'□ 미완료 / 체크 기록 없음')+' · '+escapeHtml(r.text)+' <small>'+escapeHtml(r.group)+'</small></li>').join('')+'</ul><button class="goal-edit" type="button" onclick="openGoalDate(\''+date+'\')">이 날짜 체크리스트 보기</button></section>';
}
function selectGoalDate(date){if(!isSafeCalendarDate(date))return;goalDate=date;renderGoalTracker();}
function openGoalDate(date){selectGoalDate(date);closeDetailModal();closeLedgerDetailModal();document.getElementById('goalTracker').scrollIntoView({behavior:'smooth',block:'start'});}
function renderGoalTracker(){
 const box=document.getElementById('goalChecklist');if(!box)return;
 const date=goalDate||goalToday(),s=goalSummary(date),today=goalToday();
 document.getElementById('goalDate').value=date;
 document.getElementById('goalProgress').textContent=(date>today?'예정 ':'달성 ')+s.done+' / '+s.total;
 const slogans=document.getElementById('goalActiveSlogans');slogans.replaceChildren();
 for(const p of Object.values(goalPlans))if(date>=p.start&&date<=p.end&&date>=(p.createdDate||p.start)&&(!p.stopAfter||date<=p.stopAfter)){
  const heading=document.createElement('h3'),period=document.createElement('p');heading.textContent=p.slogan;period.textContent=p.start+' ~ '+(p.stopAfter&&p.stopAfter<p.end?p.stopAfter:p.end);period.className='panel-hint';slogans.append(heading,period);
 }
 box.replaceChildren();
 for(const row of s.rows){
  const li=document.createElement('li'),label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),group=document.createElement('small');
  input.type='checkbox';input.checked=row.done;input.disabled=!canSync()||date>today||goalBusy.has(date+'/'+row.key);
  input.setAttribute('aria-label',row.text+' 달성');input.onchange=()=>toggleGoalRecord(date,row.key,input.checked);
  text.textContent=row.text;group.textContent=row.group;text.className=row.done?'done':'';text.append(group);label.append(input,text);li.append(label);box.append(li);
 }
 if(!s.total){const empty=document.createElement('li');empty.className='panel-hint';empty.textContent=date<goalStarted?'목표 추적 시작 전 날짜입니다.':'이날 진행하는 목표·반복 일정이 없습니다. 슬로건과 기간을 설정해 시작하세요.';box.append(empty);}
 const plans=document.getElementById('goalPlanList');plans.replaceChildren();
 for(const [id,p] of Object.entries(goalPlans)){
  if(!/^[\w-]+$/.test(id))continue;
  const card=document.createElement('div'),heading=document.createElement('strong'),meta=document.createElement('p');
  card.className='goal-plan';heading.textContent=p.slogan;meta.className='panel-hint';meta.textContent=p.start+' ~ '+(p.stopAfter&&p.stopAfter<p.end?p.stopAfter:p.end)+' · '+Object.values(p.items||{}).join(' / ');card.append(heading,meta);
  if(p.end>=today&&!p.stopAfter){const stop=document.createElement('button');stop.type='button';stop.className='goal-edit';stop.textContent=p.start>today?'시작 취소':'내일부터 종료';stop.onclick=()=>stopGoalPlan(id);card.append(stop);}
  plans.append(card);
 }
 if(!document.getElementById('goalStart').value){document.getElementById('goalStart').value=today;document.getElementById('goalEnd').value=today;}
 document.getElementById('goalCreate').disabled=goalPlanSaving||!canSync();
 const diaryHistory=document.getElementById('diaryGoalHistory');
 if(diaryHistory&&typeof diaryDate!=='undefined'&&diaryDate)diaryHistory.innerHTML=goalHistoryHtml(diaryDate);
}
async function createGoalPlan(){
 if(!canSync()||goalPlanSaving)return;
 const slogan=document.getElementById('goalSlogan').value.trim(),start=document.getElementById('goalStart').value,end=document.getElementById('goalEnd').value;
 const tasks=document.getElementById('goalTaskLines').value.split('\n').map(t=>t.trim()).filter(Boolean);
 if(!slogan||!tasks.length||tasks.length>50||tasks.some(t=>t.length>300)||slogan.length>150||!isSafeCalendarDate(start)||!isSafeCalendarDate(end)||end<start||start<goalToday()){goalMessage('슬로건과 목표(한 줄에 하나, 최대 50개), 오늘 이후의 시작일·종료일을 확인해 주세요.');return;}
 const id=goalId(),plan={slogan,start,end,createdDate:goalToday(),items:Object.fromEntries(tasks.map(text=>[goalId(),text]))};
 goalPlanSaving=true;renderGoalTracker();goalMessage('목표 저장 중…');
 try{await DATA_REF.child('goalTracker/plans/'+id).set(plan);if(!canSync())return;goalPlans[id]=plan;document.getElementById('goalSlogan').value='';document.getElementById('goalTaskLines').value='';goalMessage('목표 서버 저장 완료 ✓');render();}
 catch(e){goalMessage('목표 저장 실패. 입력은 유지됩니다. 연결 확인 후 다시 시작해 주세요.');}
 finally{goalPlanSaving=false;renderGoalTracker();}
}
async function stopGoalPlan(id){
 if(!canSync()||!goalPlans[id]||!confirm('기존 달성 기록은 보존하고 내일부터 이 목표 목록을 종료할까요?'))return;
 try{await DATA_REF.child('goalTracker/plans/'+id+'/stopAfter').set(goalToday());goalPlans[id].stopAfter=goalToday();goalMessage('종료 설정 저장 완료. 이전 기록은 유지됩니다.');render();}catch(e){goalMessage('종료 저장 실패. 다시 시도해 주세요.');}
}
async function toggleGoalRecord(date,key,done){
 if(!canSync()||!goalReady||date>goalToday()||!isSafeCalendarDate(date)||!/^[\w-]+$/.test(key)||goalBusy.has(date+'/'+key))return;
 const row=goalRows(date).find(r=>r.key===key);if(!row)return;
 const record={text:row.text,group:row.group,done:!!done,updatedAt:Date.now()};
 goalBusy.add(date+'/'+key);goalMessage('달성 기록 저장 중…');renderGoalTracker();
 try{await DATA_REF.child('goalTracker/records/'+date+'/'+key).set(record);if(!canSync())return;(goalRecords[date]||= {})[key]=record;goalMessage('달성 기록 서버 저장 완료 ✓');}
 catch(e){goalMessage('달성 기록 저장 실패 — 체크는 저장되지 않았습니다. 연결 확인 후 다시 체크해 주세요.');}
 finally{goalBusy.delete(date+'/'+key);render();if(detailDate)renderDetail(detailDate);if(ledgerDetailDateValue)renderLedgerDetail(ledgerDetailDateValue);}
}
function retryGoalSave(){syncGoalSchedule();}
function checkGoalMidnight(){
 const today=goalToday();if(goalLastToday===today)return;
 goalLastToday=today;goalDate=today;
 if(typeof render==='function'){render();syncGoalSchedule();}
}
setInterval(checkGoalMidnight,1000);
window.addEventListener('focus',checkGoalMidnight);
window.addEventListener('online',syncGoalSchedule);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkGoalMidnight();});
