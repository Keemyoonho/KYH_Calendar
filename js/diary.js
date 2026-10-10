// Date notes replace the retired diary. No old records are imported.
let dateNotes={},noteDrafts={},noteMessages={},retiredDiaryDeleting=false;
const noteBusy=new Set();
function noteText(record){return typeof record?.text==='string'?record.text:'';}
function hasUnsavedDateNotes(){return Object.keys(noteDrafts).length>0||noteBusy.size>0;}
function receiveDateNotes(data){dateNotes=data.dateNotes&&typeof data.dateNotes==='object'?data.dateNotes:{};}
async function purgeRetiredDiary(data){
 if(!canSync()||retiredDiaryDeleting)return;
 try{for(const key of ['yoonho_private_diary_v1','yoonho_diary_pending_v2','yoonho_diary_migrated_v2'])localStorage.removeItem(key);}catch(e){}
 if(!Object.hasOwn(data,'diaryRecords')&&!Object.hasOwn(data,'diaryImports')){document.body.dataset.retiredDiary='deleted';return;}
 retiredDiaryDeleting=true;
 try{
  await DATA_REF.update({diaryRecords:null,diaryImports:null});
  document.body.dataset.retiredDiary='deleted';
 }catch(e){document.body.dataset.retiredDiary='failed';setSyncStatus('err','기존 일기 삭제 실패 — 새로고침해 다시 시도해 주세요.');}
 finally{retiredDiaryDeleting=false;}
}
function dateNoteBadge(date){return noteText(dateNotes[date])?'<div class="date-note-badge">📝 메모</div>':'';}
function dateNoteHtml(date){
 const text=noteDrafts[date]?.text??noteText(dateNotes[date]),busy=noteBusy.has(date);
 return `<section class="date-note-editor" aria-label="이날의 짧은 일기"><label for="dateNoteText">📝 짧은 일기 · 메모</label><textarea id="dateNoteText" rows="3" maxlength="1000" placeholder="오늘 있었던 일이나 기억할 내용을 남겨보세요." oninput="editDateNote('${date}',this.value)" ${busy?'disabled':''}>${escapeHtml(text)}</textarea><div class="date-note-actions"><button type="button" class="todo-add-btn" onclick="saveDateNote('${date}')" ${busy?'disabled':''}>메모 저장</button><button type="button" class="goal-edit" onclick="reloadDateNote('${date}')" ${busy?'disabled':''}>서버 기록 불러오기</button></div><p id="dateNoteStatus" role="status">${escapeHtml(noteMessages[date]||(noteDrafts[date]?'저장하지 않은 입력이 있습니다.':'최대 1,000자 · 저장 버튼을 눌러 주세요.'))}</p></section>`;
}
function editDateNote(date,text){
 if(!isSafeCalendarDate(date)||noteBusy.has(date))return;
 if(!noteDrafts[date])noteDrafts[date]={base:noteText(dateNotes[date]),text};
 noteDrafts[date].text=text;noteMessages[date]='저장하지 않은 입력이 있습니다.';
 document.getElementById('dateNoteStatus').textContent=noteMessages[date];
}
function reloadDateNote(date){
 if(noteBusy.has(date))return;
 if(noteDrafts[date]&&!confirm('작성 중인 입력을 버리고 서버 기록을 불러올까요?'))return;
 delete noteDrafts[date];noteMessages[date]='서버에서 마지막으로 받은 기록입니다.';
 if(detailDate===date)renderDetail(date);
}
async function saveDateNote(date){
 if(!isSafeCalendarDate(date)||noteBusy.has(date))return;
 if(!canSync()){noteMessages[date]='서버 연결과 로그인을 확인해 주세요.';if(detailDate===date)renderDetail(date);return;}
 const draft=noteDrafts[date];if(!draft)return;
 if(draft.text.length>1000)return;
 const epoch=authEpoch,record=draft.text.trim()?{text:draft.text,updatedAt:Date.now()}:null;
 noteBusy.add(date);noteMessages[date]='서버 저장 중…';if(detailDate===date)renderDetail(date);
 try{
  const result=await DATA_REF.child('dateNotes/'+date).transaction(current=>{
   if(!canSync()||epoch!==authEpoch)return;
   return noteText(current)===draft.base?record:undefined;
  },undefined,false);
  if(epoch!==authEpoch||!canSync())return;
  dateNotes[date]=result.snapshot.val();
  if(!result.committed){noteMessages[date]='다른 기기에서 수정되었습니다. 입력을 복사해 두고 서버 기록을 불러와 주세요.';}
  else{delete noteDrafts[date];noteMessages[date]='서버 저장 완료 ✓';}
 }catch(e){if(epoch===authEpoch)noteMessages[date]='저장 실패 — 입력은 유지됩니다. 연결 확인 후 다시 저장해 주세요.';}
 finally{noteBusy.delete(date);if(epoch===authEpoch&&canSync()){render();if(detailDate===date)renderDetail(date);}}
}
window.addEventListener('beforeunload',e=>{if(hasUnsavedDateNotes()){e.preventDefault();e.returnValue='';}});
