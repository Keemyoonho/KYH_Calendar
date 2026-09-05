// Diary content is intentionally excluded from Firebase and shared calendar backups.
const DIARY_KEY='yoonho_private_diary_v1';
let diaryRecords={},diaryDate='',diaryTasks=[],diarySaveFailed=false;
try {const data=JSON.parse(localStorage.getItem(DIARY_KEY)||'{}');if(data&&typeof data==='object'&&!Array.isArray(data))diaryRecords=data;}catch(e){}
function openDiary(date){
  if(diarySaveFailed&&!confirm('저장하지 못한 내용이 있습니다. 다른 날짜로 이동할까요?'))return;
  diaryDate=date;diarySaveFailed=false;
  const record=diaryRecords[date]||{};
  diaryTasks=Array.isArray(record.tasks)?record.tasks.map(t=>({...t})):[];
  document.getElementById('diaryHeading').textContent='📝 '+date+' 일기';
  document.getElementById('diaryEditor').hidden=false;
  document.getElementById('diaryBody').value=record.body||'';
  document.getElementById('diaryMood').value=record.mood||'';
  document.getElementById('diaryTaskInput').value='';
  document.getElementById('diarySaveStatus').textContent='작성하면 이 브라우저에 자동 저장됩니다.';
  document.getElementById('diarySchedule').textContent='이날 일정: '+(getEventsForDate(date).map(e=>e.title).join(' · ')||'등록된 일정 없음');
  renderDiaryTasks();
  document.getElementById('diaryPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderDiaryTasks(){
  document.getElementById('diaryTasks').innerHTML=diaryTasks.map((t,i)=>`<li class="todo-item"><input type="checkbox" aria-label="한 일 ${i+1} 완료" ${t.done?'checked':''} onchange="toggleDiaryTask(${i})"><span class="${t.done?'done':''}">${escapeHtml(t.text)}</span><button type="button" class="del-todo" aria-label="한 일 ${i+1} 삭제" onclick="deleteDiaryTask(${i})">✕</button></li>`).join('');
}
function addDiaryTask(){const input=document.getElementById('diaryTaskInput'),text=input.value.trim();if(!diaryDate||!text)return;diaryTasks.push({text,done:true});input.value='';renderDiaryTasks();saveDiary();}
function toggleDiaryTask(i){diaryTasks[i].done=!diaryTasks[i].done;renderDiaryTasks();saveDiary();}
function deleteDiaryTask(i){diaryTasks.splice(i,1);renderDiaryTasks();saveDiary();}
function saveDiary(){
  if(!diaryDate)return;
  diaryRecords[diaryDate]={body:document.getElementById('diaryBody').value,mood:document.getElementById('diaryMood').value,tasks:diaryTasks.map(t=>({...t}))};
  try{localStorage.setItem(DIARY_KEY,JSON.stringify(diaryRecords));diarySaveFailed=false;document.getElementById('diarySaveStatus').textContent='이 브라우저에 저장됨 ✓';}
  catch(e){diarySaveFailed=true;document.getElementById('diarySaveStatus').textContent='저장 실패: 저장 공간이나 브라우저 설정을 확인하고 내용을 따로 복사해 주세요.';}
  render();
}
window.addEventListener('beforeunload',e=>{if(diarySaveFailed){e.preventDefault();e.returnValue='';}});
