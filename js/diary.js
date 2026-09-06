// Owner-only cloud diary; legacy local records are backed up before migration.
const DIARY_KEY='yoonho_private_diary_v1',DIARY_PENDING_KEY='yoonho_diary_pending_v2';
let diaryRecords={},diaryDate='',diaryTasks=[],diarySaveFailed=false;
let diaryBases={},diaryPending={},diaryImports={},diaryMigrationRunning=false,diaryMigrationDone=false;
const diaryInflight=new Set();
let diaryLegacy={};
try{diaryLegacy=JSON.parse(localStorage.getItem(DIARY_KEY)||'{}')||{};diaryMigrationDone=localStorage.getItem('yoonho_diary_migrated_v2')==='yes';diaryPending=JSON.parse(localStorage.getItem(DIARY_PENDING_KEY)||'{}')||{};}catch(e){}
function cleanDiary(r={}){return {body:String(r?.body||''),mood:['😊','😐','😔','😴'].includes(r?.mood)?r.mood:'',tasks:Array.isArray(r?.tasks)?r.tasks.filter(t=>t&&typeof t.text==='string').map(t=>({text:t.text,done:!!t.done})):[]};}
function sameDiary(a,b){return JSON.stringify(cleanDiary(a))===JSON.stringify(cleanDiary(b));}
function diaryMessage(message){document.getElementById('diarySaveStatus').textContent=message;}
function persistDiaryPending(){try{localStorage.setItem(DIARY_PENDING_KEY,JSON.stringify(diaryPending));}catch(e){}diarySaveFailed=Object.keys(diaryPending).length>0;}
function receiveDiary(data){
 diaryRecords=Object.fromEntries(Object.entries(data.diaryRecords||{}).filter(([date])=>isSafeCalendarDate(date)).map(([date,r])=>[date,cleanDiary(r)]));
 diaryImports=data.diaryImports||{};
 for(const [date,p] of Object.entries(diaryPending))if(isSafeCalendarDate(date))diaryRecords[date]=cleanDiary(p.record);
 if(diaryDate&&!diaryPending[diaryDate])fillDiaryEditor();
 renderDiaryImports();
 if(canSync()){migrateDiary();retryDiary();}
}
function fillDiaryEditor(){
 const r=cleanDiary(diaryRecords[diaryDate]);diaryBases[diaryDate]=r;diaryTasks=r.tasks;
 document.getElementById('diaryBody').value=r.body;document.getElementById('diaryMood').value=r.mood;renderDiaryTasks();
}
function openDiary(date){
 if(!canSync())return;
 diaryDate=date;
 document.getElementById('diaryHeading').textContent='📝 '+date+' 일기';
 document.getElementById('diaryEditor').hidden=false;
 fillDiaryEditor();document.getElementById('diaryTaskInput').value='';
 diaryMessage(diaryPending[date]?'서버 저장 대기 중입니다. 브라우저 데이터를 삭제하지 마세요.':'본인 계정으로 자동 저장·동기화됩니다.');
 document.getElementById('diarySchedule').textContent='이날 일정: '+(getEventsForDate(date).map(e=>e.title).join(' · ')||'등록된 일정 없음');
 document.getElementById('diaryPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderDiaryTasks(){
 document.getElementById('diaryTasks').innerHTML=diaryTasks.map((t,i)=>`<li class="todo-item"><input type="checkbox" aria-label="한 일 ${i+1} 완료" ${t.done?'checked':''} onchange="toggleDiaryTask(${i})"><span class="${t.done?'done':''}">${escapeHtml(t.text)}</span><button type="button" class="del-todo" aria-label="한 일 ${i+1} 삭제" onclick="deleteDiaryTask(${i})">✕</button></li>`).join('');
}
function addDiaryTask(){const input=document.getElementById('diaryTaskInput'),text=input.value.trim();if(!diaryDate||!text)return;diaryTasks.push({text,done:true});input.value='';renderDiaryTasks();saveDiary();}
function toggleDiaryTask(i){diaryTasks[i].done=!diaryTasks[i].done;renderDiaryTasks();saveDiary();}
function deleteDiaryTask(i){diaryTasks.splice(i,1);renderDiaryTasks();saveDiary();}
function saveDiary(){
 if(!diaryDate||!canSync())return;
 const record=cleanDiary({body:document.getElementById('diaryBody').value,mood:document.getElementById('diaryMood').value,tasks:diaryTasks});
 const base=diaryPending[diaryDate]?.base||diaryBases[diaryDate]||cleanDiary({});
 diaryPending[diaryDate]={record,base};diaryRecords[diaryDate]=record;persistDiaryPending();
 diaryMessage('서버 저장 중… 완료 전에는 브라우저 데이터를 삭제하지 마세요.');render();flushDiary(diaryDate);
}
async function backupDiary(records,reason){
 if(!canSync())throw Error('locked');
 const ref=DATA_REF.child('diaryImports').push();
 await ref.set({reason,records,createdAt:Date.now()});
}
async function migrateDiary(){
 if(diaryMigrationDone||diaryMigrationRunning||!canSync())return;
 diaryMigrationRunning=true;
 try{
  const records=Object.fromEntries(Object.entries(diaryLegacy).filter(([date])=>isSafeCalendarDate(date)).map(([date,r])=>[date,cleanDiary(r)]));
  if(Object.keys(records).length){
   document.getElementById('diaryCloudStatus').textContent='기존 브라우저 일기를 서버로 옮기는 중입니다. 완료 전에는 브라우저 데이터를 삭제하지 마세요.';
   await backupDiary(records,'기존 브라우저 일기 원본');
   for(const [date,record] of Object.entries(records)){if(!canSync())throw Error('locked');await DATA_REF.child('diaryRecords/'+date).transaction(current=>current===null?record:undefined,undefined,false);}
  }
  diaryMigrationDone=true;try{localStorage.setItem('yoonho_diary_migrated_v2','yes');}catch(e){}
  document.getElementById('diaryCloudStatus').textContent='본인 계정으로 저장·동기화합니다. ‘서버 저장 완료’를 확인한 뒤 브라우저 데이터를 삭제해 주세요.';
 }catch(e){document.getElementById('diaryCloudStatus').textContent='기존 일기 이전이 완료되지 않았습니다. 브라우저 데이터를 삭제하지 말고 저장 재시도를 눌러주세요.';}
 finally{diaryMigrationRunning=false;}
}
async function flushDiary(date){
 if(!canSync()||diaryInflight.has(date)||!diaryPending[date])return;
 const job=diaryPending[date];diaryInflight.add(date);
 let success=false;
 try{
  const result=await DATA_REF.child('diaryRecords/'+date).transaction(current=>{
   if(!canSync())return;
   if(sameDiary(current,job.base)||sameDiary(current,job.record))return job.record;
   return undefined;
  },undefined,false);
  if(!canSync())throw Error('locked');
  if(!result.committed){
   await backupDiary({[date]:job.record},'동시 수정으로 보관한 일기');
   if(diaryPending[date]===job){delete diaryPending[date];diaryRecords[date]=cleanDiary(result.snapshot.val());}
   diaryMessage('다른 기기의 기록과 겹쳤습니다. 입력 내용은 서버에 별도 보존했습니다. 날짜를 다시 눌러 최신 기록을 확인해 주세요.');
  }else{
   diaryBases[date]=job.record;
   if(diaryPending[date]===job)delete diaryPending[date];else if(diaryPending[date])diaryPending[date].base=job.record;
   if(diaryDate===date&&!diaryPending[date])diaryMessage('서버 저장 완료 ✓ 브라우저 데이터를 삭제해도 다시 로그인하면 불러옵니다.');
  }
  persistDiaryPending();success=true;
 }catch(e){diarySaveFailed=true;diaryMessage('서버 저장 미완료. 브라우저 데이터를 삭제하지 말고 연결 확인 후 저장 재시도를 눌러주세요.');}
 finally{diaryInflight.delete(date);if(success&&diaryPending[date])flushDiary(date);}
}
function retryDiary(){if(!canSync())return;for(const date of Object.keys(diaryPending))if(isSafeCalendarDate(date))flushDiary(date);migrateDiary();}
function renderDiaryImports(){
 const box=document.getElementById('diaryImports');
 if(!box)return;
 box.innerHTML=Object.values(diaryImports).map(entry=>`<details><summary>${escapeHtml(entry.reason||'일기 원본')} · ${Object.keys(entry.records||{}).length}일</summary>${Object.entries(entry.records||{}).map(([date,raw])=>{const r=cleanDiary(raw);return `<h4>${escapeHtml(date)} ${escapeHtml(r.mood)}</h4><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(r.body)}\n${escapeHtml(r.tasks.map(t=>(t.done?'✓ ':'□ ')+t.text).join('\n'))}</pre>`;}).join('')}</details>`).join('');
}
window.addEventListener('beforeunload',e=>{if(diarySaveFailed||diaryMigrationRunning){e.preventDefault();e.returnValue='';}});
