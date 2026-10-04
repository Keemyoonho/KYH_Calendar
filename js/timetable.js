// Independent weekday routines. Never write the whole calendar from this module.
const TIMETABLE_DAYS=['일','월','화','수','목','금','토'];
let weeklyTimetable={},timetableDay=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Seoul'})).getDay();
let timetableEdit=null,timetableBusy=false;
const timetableEl=id=>document.getElementById(id);
function timetableMinutes(time){return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)?Number(time.slice(0,2))*60+Number(time.slice(3)):NaN;}
function timetableSegments(block){
  const start=timetableMinutes(block.start),end=timetableMinutes(block.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start===end)return [];
  return end>start?[[start,end]]:[[start,1440],...(end>0?[[0,end]]:[])];
}
function timetableNormalize(value){
  const result={};
  if(!value||typeof value!=='object')return result;
  for(const [id,item] of Object.entries(value)) {
    if(!/^[A-Za-z0-9_-]+$/.test(id)||!item||typeof item.title!=='string'||!timetableSegments(item).length)continue;
    result[id]={title:item.title.slice(0,80),start:item.start,end:item.end};
  }
  return result;
}
function timetableSignature(value){return JSON.stringify(Object.entries(timetableNormalize(value)).sort(([a],[b])=>a.localeCompare(b)));}
function timetableEntries(){return Object.entries(timetableNormalize(weeklyTimetable[timetableDay])).sort(([,a],[,b])=>a.start.localeCompare(b.start));}
function receiveWeeklyTimetable(data){
  weeklyTimetable={};for(let day=0;day<7;day++)weeklyTimetable[day]=timetableNormalize(data.weeklyTimetable?.[day]);
  renderWeeklyTimetable();
}
function timetableMessage(message){timetableEl('timetableStatus').textContent=message;}
function selectTimetableDay(day){
  if(timetableBusy||!Number.isInteger(day)||day<0||day>6)return;
  const dirty=timetableEdit||timetableEl('timetableTitle').value.trim();
  if(dirty&&!confirm('작성 중인 시간표 입력을 버리고 요일을 바꿀까요?'))return;
  timetableDay=day;resetTimetableEditor();renderWeeklyTimetable();
}
function resetTimetableEditor(){
  if(timetableBusy)return;
  timetableEdit=null;timetableEl('timetableForm').reset();
  timetableEl('timetableSave').textContent='추가';timetableEl('timetableCancel').hidden=true;timetableMessage('');
}
function editTimetableBlock(id){
  if(timetableBusy)return;
  const item=weeklyTimetable[timetableDay]?.[id];if(!item)return;
  timetableEdit={id,original:{...item}};
  timetableEl('timetableTitle').value=item.title;timetableEl('timetableStart').value=item.start;timetableEl('timetableEnd').value=item.end;
  timetableEl('timetableSave').textContent='수정 저장';timetableEl('timetableCancel').hidden=false;
  timetableEl('timetableSettings').open=true;timetableMessage('');timetableEl('timetableTitle').focus();
}
function timetableOverlaps(items){
  const ranges=Object.values(items).flatMap(timetableSegments).sort((a,b)=>a[0]-b[0]);
  return ranges.some((range,i)=>i>0&&range[0]<ranges[i-1][1]);
}
async function saveTimetableBlock(){
  if(timetableBusy||!timetableEl('timetableForm').reportValidity())return;
  const block={title:timetableEl('timetableTitle').value.trim(),start:timetableEl('timetableStart').value,end:timetableEl('timetableEnd').value};
  if(!block.title){timetableMessage('할 일을 입력해 주세요.');return;}
  if(!timetableSegments(block).length){timetableMessage('시작과 종료는 서로 다른 시간으로 설정해 주세요.');return;}
  const items=timetableNormalize(weeklyTimetable[timetableDay]);
  if(timetableEdit&&JSON.stringify(items[timetableEdit.id])!==JSON.stringify(timetableEdit.original)){
    timetableMessage('다른 기기에서 이 항목이 변경되었습니다. 수정 취소 후 다시 선택해 주세요.');return;
  }
  const id=timetableEdit?.id||('t_'+Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('_'));
  const next={...items,[id]:block};
  if(timetableOverlaps(next)){timetableMessage('기존 시간대와 겹칩니다. 시작·종료 시간을 조정해 주세요.');return;}
  await commitTimetableDay(items,next);
}
async function deleteTimetableBlock(id){
  if(timetableBusy)return;
  const items=timetableNormalize(weeklyTimetable[timetableDay]);if(!items[id])return;
  if(!confirm('이 요일의 “'+items[id].title+'” 시간대를 삭제할까요?'))return;
  const next={...items};delete next[id];await commitTimetableDay(items,next);
}
async function commitTimetableDay(previous,next){
  if(!canSync()){timetableMessage('본인 로그인과 서버 연결을 먼저 확인해 주세요.');return;}
  const day=timetableDay,epoch=authEpoch;
  timetableBusy=true;renderWeeklyTimetable();timetableMessage('서버에 저장 중…');
  try {
    // Compare-and-swap only this weekday: concurrent edits cannot silently overwrite it.
    const result=await DATA_REF.child('weeklyTimetable/'+day).transaction(current=>{
      if(!canSync()||authEpoch!==epoch||timetableSignature(current)!==timetableSignature(previous))return;
      return Object.keys(next).length?next:null;
    },undefined,false);
    if(epoch!==authEpoch||!canSync())return;
    if(!result.committed){
      weeklyTimetable[day]=timetableNormalize(result.snapshot.val());
      timetableMessage('다른 기기에서 시간표가 바뀌었습니다. 최신 목록을 확인한 후 다시 저장해 주세요.');return;
    }
    weeklyTimetable[day]=timetableNormalize(result.snapshot.val());
    timetableBusy=false;resetTimetableEditor();timetableMessage('서버 저장 완료');
  } catch(e) {
    if(epoch===authEpoch)timetableMessage('저장 실패 — 입력은 유지됩니다. 연결 확인 후 다시 시도해 주세요.');
  } finally {timetableBusy=false;renderWeeklyTimetable();}
}
function timetablePoint(minute,radius){const angle=minute/1440*Math.PI*2-Math.PI/2;return [Math.cos(angle)*radius,Math.sin(angle)*radius];}
function timetableArc(start,end){
  const a=timetablePoint(start,133),b=timetablePoint(end,133),c=timetablePoint(end,65),d=timetablePoint(start,65),large=end-start>720?1:0;
  return `M ${a} A 133 133 0 ${large} 1 ${b} L ${c} A 65 65 0 ${large} 0 ${d} Z`;
}
function renderWeeklyTimetable(){
  if(!timetableEl('weeklyTimetable'))return;
  const entries=timetableEntries(),esc=value=>escapeHtml(String(value));
  timetableEl('timetableWeekdays').innerHTML=[1,2,3,4,5,6,0].map(day=>`<button type="button" aria-label="${TIMETABLE_DAYS[day]}요일 시간표" aria-pressed="${day===timetableDay}" onclick="selectTimetableDay(${day})" ${timetableBusy?'disabled':''}>${TIMETABLE_DAYS[day]}</button>`).join('');
  const duration=entries.reduce((sum,[,item])=>sum+timetableSegments(item).reduce((n,[a,b])=>n+b-a,0),0);
  timetableEl('timetableDayLabel').textContent=TIMETABLE_DAYS[timetableDay]+'요일';
  const timeLabel=minutes=>`${Math.floor(minutes/60)}시간${minutes%60?' '+minutes%60+'분':''}`;
  timetableEl('timetableTotal').textContent=entries.length?`${timeLabel(duration)} 계획 · ${timeLabel(1440-duration)} 여유`:'시간을 추가해 나만의 하루를 구성하세요';
  timetableEl('timetableCount').textContent=entries.length+'개';
  timetableEl('timetableFields').disabled=timetableBusy;
  timetableEl('timetableList').innerHTML=entries.map(([id,item],i)=>`<li><span class="timetable-number" style="--tone:${50+(i%5)*22}">${i+1}</span><div><strong>${esc(item.title)}</strong><small>${esc(item.start)} – ${item.end<=item.start?'다음 날 ':''}${esc(item.end)}</small></div><button type="button" class="goal-edit" onclick="editTimetableBlock('${id}')" ${timetableBusy?'disabled':''} aria-label="${esc(item.title)} 수정">수정</button><button type="button" class="goal-edit" onclick="deleteTimetableBlock('${id}')" ${timetableBusy?'disabled':''} aria-label="${esc(item.title)} 삭제">삭제</button></li>`).join('');
  let arcs='',ticks='';
  entries.forEach(([id,item],i)=>timetableSegments(item).forEach(([start,end])=>{
    const mid=timetablePoint((start+end)/2,100);
    arcs+=`<g class="timetable-sector"><title>${esc(item.title)}: ${esc(item.start)} – ${item.end<=item.start?'다음 날 ':''}${esc(item.end)}</title><path d="${timetableArc(start,end)}" fill="rgb(${50+(i%5)*22},${50+(i%5)*22},${50+(i%5)*22})"/>${end-start>=45?`<text x="${mid[0]}" y="${mid[1]}" class="timetable-sector-label">${end-start>=120?esc(item.title.length>5?item.title.slice(0,4)+'…':item.title):i+1}</text>`:''}</g>`;
  }));
  for(let hour=0;hour<24;hour++){
    const a=timetablePoint(hour*60,138),b=timetablePoint(hour*60,hour%3===0?146:142),label=timetablePoint(hour*60,159);
    ticks+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>${hour%3===0?`<text x="${label[0]}" y="${label[1]}">${String(hour).padStart(2,'0')}</text>`:''}`;
  }
  timetableEl('timetableDial').innerHTML=`<defs><linearGradient id="dialRim" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#858585"/><stop offset="1" stop-color="#303030"/></linearGradient><radialGradient id="dialFace"><stop stop-color="var(--glass-solid)"/><stop offset="1" stop-color="var(--glass-panel)"/></radialGradient></defs><ellipse cx="200" cy="193" rx="153" ry="112" fill="#000" opacity=".13"/><g transform="translate(200 171) scale(1 .78)"><circle r="166" fill="url(#dialRim)"/></g><g transform="translate(200 157) scale(1 .78)"><circle r="166" fill="url(#dialFace)" stroke="var(--glass-edge)" stroke-width="2"/><circle r="133" class="timetable-empty-ring"/>${arcs}<g class="timetable-ticks">${ticks}</g><circle r="64" fill="var(--glass-solid)" stroke="var(--glass-line)"/><text class="timetable-center" y="-2">24</text><text class="timetable-center-sub" y="23">HOURS</text></g>`;
  timetableEl('timetableDial').setAttribute('aria-label',TIMETABLE_DAYS[timetableDay]+'요일 24시간 원형 시간표, '+entries.length+'개 시간대. 상세 내용은 아래 목록');
}
