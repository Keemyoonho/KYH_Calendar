const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const nodes = new Map();
const days = Array.from({length:7},(_,d)=>({value:String(d),checked:false}));
function element(id){
  if(!nodes.has(id)) nodes.set(id,{value:'',checked:false,style:{},classList:{add(){},remove(){}},focus(){}});
  return nodes.get(id);
}
const ctx = vm.createContext({
  firebase:{initializeApp(){},database(){return {ref(){return {}}};}},
  localStorage:{getItem(){return null;},setItem(){}},
  document:{getElementById:element,querySelectorAll(selector){return selector.includes(':checked')?days.filter(d=>d.checked):days;},addEventListener(){}},
  setTimeout(){},clearTimeout(){},confirm(){return true;},alert(message){throw Error(message);},console
});
vm.runInContext(source.replace('updateThemeButton(); updateViewMode(); render(); startRealtimeSync();',''),ctx);
vm.runInContext('render=()=>{}; renderDetail=()=>{}; saveLocal=()=>{}; pushToFirebase=()=>{};',ctx);
const run = code=>vm.runInContext(code,ctx);
test('legacy weekly, multi-day boundaries, monthly/yearly and transactions',()=>{
  assert.equal(run("occursOn({date:'2026-09-07',repeat:'weekly'},'2026-09-14')"),true);
  assert.equal(run("occursOn({date:'2026-09-07',repeat:'weekly'},'2026-09-09')"),false);
  run("events=[{title:'운동',date:'2026-09-07',repeat:'weekly',repeatDays:[1,3,5],repeatEnd:'2026-09-18'}]");
  for(const date of ['2026-09-07','2026-09-09','2026-09-11','2026-09-18']) assert.equal(run(`getEventsForDate('${date}').length`),1);
  for(const date of ['2026-09-04','2026-09-08','2026-09-21']) assert.equal(run(`getEventsForDate('${date}').length`),0);
  assert.equal(run("occursOn({date:'2026-01-31',repeat:'monthly'},'2026-02-28')"),false);
  assert.equal(run("occursOn({date:'2024-02-29',repeat:'yearly'},'2028-02-29')"),true);
  run("transactions=[{date:'2026-09-07',repeat:'weekly'}]");
  assert.equal(run("getLedgerEntriesForDate('2026-09-14').length"),1);
});
test('single edit, move, edit again, cancel, serialization and whole-series edit',()=>{
  run("openAddModal('2026-09-09',0,'2026-09-09')");
  assert.equal(element('eventRepeatOptions').hidden,true);
  element('evtTitle').value='이번만 변경'; element('evtDate').value='2026-09-10';
  run('saveEvent()');
  assert.equal(run("getEventsForDate('2026-09-09').length"),0);
  assert.equal(run("getEventsForDate('2026-09-10')[0].title"),'이번만 변경');
  assert.equal(run("getEventsForDate('2026-09-11')[0].title"),'운동');
  assert.equal(run("nextOccurrence(events[0],'2026-09-09')"),'2026-09-10');
  run("events=JSON.parse(JSON.stringify(events)); openAddModal('2026-09-10',0,'2026-09-09')");
  element('evtDate').value='2026-09-11'; run('saveEvent()');
  assert.equal(run("getEventsForDate('2026-09-10').length"),0);
  assert.equal(run("getEventsForDate('2026-09-11').length"),2);
  run("cancelOccurrence(0,'2026-09-09','2026-09-11')");
  assert.equal(run("getEventsForDate('2026-09-11').length"),1);
  run('openAddModal(undefined,0)'); element('evtTitle').value='전체 변경'; run('saveEvent()');
  assert.equal(run("getEventsForDate('2026-09-09').length"),0);
  assert.equal(run("getEventsForDate('2026-09-14')[0].title"),'전체 변경');
});
test('validation and stale editor protection',()=>{
  run('openAddModal(undefined,0)'); days.forEach(d=>d.checked=false);
  assert.throws(()=>run('saveEvent()'),/요일/);
  days[1].checked=true; element('evtRepeatEnd').value='2026-09-01';
  assert.throws(()=>run('saveEvent()'),/종료일/);
  run('events=JSON.parse(JSON.stringify(events))');
  assert.throws(()=>run('saveEvent()'),/갱신/);
});
