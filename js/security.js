// Owner UID supplied by the user during authentication setup.
// This UI check is NOT a replacement for owner-only Realtime Database rules.
const OWNER_UID='xJ47cL6Qc2dkRJfajERKQ3eBMtw2';
let syncReady=false,authEpoch=0;
function isCalendarOwner(){const user=firebase.auth().currentUser;return !!OWNER_UID&&user?.uid===OWNER_UID;}
function canSync(){return syncReady&&isCalendarOwner();}
function lockCalendar(message){
  syncReady=false;clearTimeout(syncTimer);DATA_REF.off();
  document.body.classList.add('auth-locked');
  document.getElementById('authMessage').textContent=message;
}
function startSecurity(){
  if(typeof firebase.auth!=='function'){lockCalendar('로그인 모듈을 불러오지 못했습니다. 새로고침해 주세요.');return;}
  firebase.auth().onAuthStateChanged(user=>{
    authEpoch++;
    lockCalendar('본인 계정을 확인하고 있습니다.');
    document.getElementById('authUid').textContent='';
    if(!user){document.getElementById('authMessage').textContent='본인 Google 계정으로 로그인해 주세요.';return;}
    if(!OWNER_UID){document.getElementById('authMessage').textContent='본인 계정 지정이 필요합니다. 아래 UID를 관리자에게 전달해 주세요. 데이터 접근은 아직 차단되어 있습니다.';document.getElementById('authUid').textContent='Firebase UID: '+user.uid;return;}
    if(!isCalendarOwner()){document.getElementById('authMessage').textContent='허용된 본인 계정이 아닙니다.';return;}
    startRealtimeSync();
  });
}
async function loginCalendar(){
  try{
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
    const provider=new firebase.auth.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
    await firebase.auth().signInWithPopup(provider);
  }catch(e){
    const messages={'auth/operation-not-allowed':'Firebase에서 Google 로그인을 활성화해 주세요.','auth/unauthorized-domain':'Firebase 승인 도메인에 keemyoonho.github.io를 추가해 주세요.','auth/popup-blocked':'팝업을 허용한 뒤 다시 로그인해 주세요.','auth/popup-closed-by-user':'로그인이 취소되었습니다.'};
    document.getElementById('authMessage').textContent=messages[e.code]||'로그인 실패. Firebase 설정과 네트워크를 확인해 주세요.';
  }
}
async function logoutCalendar(){
  if(diarySaveFailed&&!confirm('저장하지 못한 일기가 있습니다. 따로 복사한 뒤 로그아웃해 주세요. 계속할까요?'))return;
  authEpoch++;lockCalendar('로그아웃 중입니다.');
  try{await firebase.auth().signOut();location.reload();}catch(e){document.getElementById('authMessage').textContent='로그아웃 실패. 다시 시도해 주세요.';}
}
