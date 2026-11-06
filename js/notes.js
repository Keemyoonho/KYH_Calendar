// Independent, owner-synced library. Legacy date notes remain intact.
let noteLibrary={categories:{},notes:{}},activeNoteCategory='all',libraryDraft=null,libraryBusy=false;
const safeNoteKey=k=>/^[a-zA-Z0-9_-]+$/.test(k);
const noteClone=v=>JSON.parse(JSON.stringify(v??null));
function receiveNoteLibrary(data){noteLibrary=data.noteLibrary&&typeof data.noteLibrary==='object'?data.noteLibrary:{categories:{},notes:{}};}
function hasLibraryDraft(){return libraryBusy||!!libraryDraft?.dirty;}
function libraryCategories(){return {uncategorized:'미분류',legacy:'기존 메모',...Object.fromEntries(Object.entries(noteLibrary.categories||{}).filter(([id,c])=>safeNoteKey(id)&&typeof c?.name==='string').map(([id,c])=>[id,c.name]))};}
function libraryNotes(){
 const result={};
 for(const [date,n] of Object.entries(dateNotes))if(isSafeCalendarDate(date)&&noteText(n))result['date_'+date]={title:date+' 메모',text:noteText(n),category:'legacy',updatedAt:n.updatedAt||0};
 for(const [id,n] of Object.entries(noteLibrary.notes||{}))if(safeNoteKey(id)){if(n?.deleted)delete result[id];else if(n&&typeof n==='object')result[id]=n;}
 return result;
}
function libraryStatus(message){document.getElementById('notesStatus').textContent=message;}
function editorStatus(message){document.getElementById('noteEditorStatus').textContent=message;}
function noteCategoryOf(n){return Object.hasOwn(libraryCategories(),n.category)?n.category:'uncategorized';}
function renderNotesPanel(){
 const categories=libraryCategories(),notes=Object.values(libraryNotes());
 if(activeNoteCategory!=='all'&&!Object.hasOwn(categories,activeNoteCategory))activeNoteCategory='all';
 document.getElementById('noteCategories').innerHTML=Object.entries({all:'모든 메모',...categories}).map(([id,name])=>`<button type="button" class="notes-folder ${activeNoteCategory===id?'selected':''}" onclick="selectNoteCategory('${id}')" aria-pressed="${activeNoteCategory===id}"><span>▱ ${escapeHtml(name)}</span><small>${id==='all'?notes.length:notes.filter(n=>noteCategoryOf(n)===id).length}</small></button>`).join('');
 document.getElementById('notesCategoryTitle').textContent=activeNoteCategory==='all'?'모든 메모':categories[activeNoteCategory];
 document.getElementById('noteCategoryActions').innerHTML=Object.hasOwn(noteLibrary.categories||{},activeNoteCategory)?'<button type="button" onclick="renameNoteCategory()">이름 수정</button><button type="button" onclick="deleteNoteCategory()">카테고리 삭제</button>':'';
 renderNoteCards();
 // Background sync never replaces an in-progress editor.
 if(libraryDraft)updateNoteCategoryOptions();
}
function renderNoteCards(){
 const query=document.getElementById('notesSearch').value.trim().toLocaleLowerCase();
 const entries=Object.entries(libraryNotes()).filter(([,n])=>(activeNoteCategory==='all'||noteCategoryOf(n)===activeNoteCategory)&&`${n.title||''} ${n.text||''}`.toLocaleLowerCase().includes(query)).sort((a,b)=>(Number(b[1].updatedAt)||0)-(Number(a[1].updatedAt)||0));
 document.getElementById('notesCount').textContent=`${entries.length}개의 메모`;
 document.getElementById('notesBody').innerHTML=entries.map(([id,n])=>`<button class="note-card" type="button" onclick="openLibraryNote('${id}')"><div class="note-card-paper"><strong>${escapeHtml(n.title||'제목 없는 메모')}</strong><p>${escapeHtml(n.text||'내용 없음')}</p></div><div class="note-card-caption"><strong>${escapeHtml(n.title||'제목 없는 메모')}</strong><small>${escapeHtml(libraryCategories()[noteCategoryOf(n)])}${Number(n.updatedAt)>0?' · '+new Date(n.updatedAt).toLocaleDateString('ko-KR'):''}</small></div></button>`).join('')||'<div class="notes-empty">'+(query?'검색 결과가 없습니다.':'아직 메모가 없습니다.<br>새 메모를 추가해 보세요.')+'</div>';
}
function selectNoteCategory(id){activeNoteCategory=id;renderNotesPanel();}
function uniqueNoteId(prefix){return prefix+'_'+Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('');}
async function transactNoteLibrary(change){
 if(libraryBusy)return false;
 if(!canSync()){libraryStatus('로그인과 서버 연결을 확인해 주세요.');return false;}
 const epoch=authEpoch;libraryBusy=true;libraryStatus('저장 중…');document.getElementById('noteEditor').inert=true;
 try{
  const result=await DATA_REF.child('noteLibrary').transaction(current=>{
   if(!canSync()||epoch!==authEpoch)return;
   const next=noteClone(current)||{};next.categories||={};next.notes||={};
   return change(next)?next:undefined;
  },undefined,false);
  if(epoch!==authEpoch||!canSync())return false;
  receiveNoteLibrary({noteLibrary:result.snapshot.val()});
  libraryStatus(result.committed?'서버 저장 완료 ✓':'다른 기기에서 변경되었습니다. 저장본을 확인한 뒤 다시 시도해 주세요.');
  return result.committed;
 }catch(e){libraryStatus('저장 실패 — 입력은 유지됩니다. 연결 확인 후 다시 저장해 주세요.');return false;}
 finally{libraryBusy=false;document.getElementById('noteEditor').inert=false;if(epoch===authEpoch&&canSync())renderNotesPanel();}
}
async function addNoteCategory(){
 const input=document.getElementById('newNoteCategory'),name=input.value.trim();if(!name||name.length>60)return;
 const id=uniqueNoteId('cat');
 if(await transactNoteLibrary(lib=>{lib.categories[id]={name};return true;})){input.value='';selectNoteCategory(id);}
}
async function renameNoteCategory(){
 const id=activeNoteCategory,base=noteClone(noteLibrary.categories?.[id]);if(!base)return;
 const name=prompt('카테고리 이름',base.name)?.trim();if(!name||name.length>60)return;
 await transactNoteLibrary(lib=>{if(lib.categories[id]?.name!==base.name)return false;lib.categories[id]={...lib.categories[id],name};return true;});
}
async function deleteNoteCategory(){
 const id=activeNoteCategory,base=noteClone(noteLibrary.categories?.[id]);if(!base||!confirm('카테고리를 삭제할까요? 포함된 메모는 미분류로 이동합니다.'))return;
 await transactNoteLibrary(lib=>{if(lib.categories[id]?.name!==base.name)return false;delete lib.categories[id];for(const n of Object.values(lib.notes))if(n.category===id)n.category='uncategorized';return true;});
}
function canLeaveLibraryNote(){return !libraryBusy&&(!libraryDraft?.dirty||confirm('저장하지 않은 입력을 버릴까요?'));}
function newLibraryNote(){
 if(!canLeaveLibraryNote())return;
 libraryDraft={id:uniqueNoteId('note'),base:null,title:'',text:'',category:activeNoteCategory==='all'?'uncategorized':activeNoteCategory,dirty:false};showLibraryEditor();
}
function openLibraryNote(id){
 if(!safeNoteKey(id)||!canLeaveLibraryNote())return;
 const n=libraryNotes()[id];if(!n)return;
 libraryDraft={id,base:noteClone(noteLibrary.notes?.[id]),title:n.title||'',text:n.text||'',category:noteCategoryOf(n),dirty:false};showLibraryEditor();
}
function updateNoteCategoryOptions(){
 const select=document.getElementById('libraryNoteCategory'),category=libraryDraft.category;
 select.innerHTML=Object.entries(libraryCategories()).map(([id,name])=>`<option value="${id}">${escapeHtml(name)}</option>`).join('');
 select.value=Object.hasOwn(libraryCategories(),category)?category:'uncategorized';
}
function showLibraryEditor(){
 document.getElementById('noteEditor').hidden=false;updateNoteCategoryOptions();
 document.getElementById('libraryNoteTitle').value=libraryDraft.title;
 document.getElementById('libraryNoteBody').value=libraryDraft.text;
 editorStatus('');document.getElementById('noteEditor').scrollIntoView({block:'nearest'});document.getElementById('libraryNoteTitle').focus({preventScroll:true});
}
function editLibraryNote(){if(!libraryDraft||libraryBusy)return;Object.assign(libraryDraft,{title:document.getElementById('libraryNoteTitle').value,text:document.getElementById('libraryNoteBody').value,category:document.getElementById('libraryNoteCategory').value,dirty:true});editorStatus('미저장');}
function closeLibraryNote(){if(!canLeaveLibraryNote())return;libraryDraft=null;document.getElementById('noteEditor').hidden=true;}
function reloadLibraryNote(){if(!libraryDraft||!canLeaveLibraryNote())return;const id=libraryDraft.id;libraryDraft=null;if(libraryNotes()[id])openLibraryNote(id);else{document.getElementById('noteEditor').hidden=true;libraryStatus('저장된 메모가 없습니다.');}}
function sameLibraryNote(a,b){if(!a||!b)return (a??null)===(b??null);return [...new Set([...Object.keys(a),...Object.keys(b)])].every(k=>a[k]===b[k]);}
async function saveLibraryNote(){
 if(!libraryDraft||libraryBusy)return;editLibraryNote();const draft=noteClone(libraryDraft);
 if(!draft.title.trim()&&!draft.text.trim()){editorStatus('제목 또는 내용을 입력해 주세요.');return;}
 if(draft.title.length>150||draft.text.length>20000)return;
 const record={title:draft.title.trim(),text:draft.text,category:draft.category,updatedAt:Date.now()};
 const saved=await transactNoteLibrary(lib=>{if(!sameLibraryNote(lib.notes[draft.id],draft.base))return false;if(!['uncategorized','legacy'].includes(record.category)&&!lib.categories[record.category])record.category='uncategorized';lib.notes[draft.id]=record;return true;});
 if(saved&&libraryDraft?.id===draft.id){libraryDraft.base=noteClone(record);libraryDraft.dirty=false;editorStatus('서버 저장 완료 ✓');}else editorStatus('저장되지 않았습니다. 위 안내를 확인해 주세요.');
}
async function deleteLibraryNote(){
 if(!libraryDraft||libraryBusy||!confirm('이 메모를 삭제할까요?'))return;const draft=noteClone(libraryDraft);
 if(await transactNoteLibrary(lib=>{if(!sameLibraryNote(lib.notes[draft.id],draft.base))return false;lib.notes[draft.id]={deleted:true,updatedAt:Date.now()};return true;})){libraryDraft=null;document.getElementById('noteEditor').hidden=true;}
}
