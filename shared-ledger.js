'use strict';
const cloneLedger = value => JSON.parse(JSON.stringify(value));
const emptyLedger = () => ({transactions:[],recurring:[],budgets:{},categoryRules:{}});
let ledgerClient, ledgerVersion = null, acknowledged = emptyLedger(), ledgerBusy = false;
let ledgerGeneration = 0, ledgerPollBusy = false, ledgerDirty = false, rejectedDraft = null;
const shell = document.querySelector('.shell');
const authPanel = document.getElementById('authPanel');
const syncStatus = document.getElementById('syncStatus');
const authMessage = document.getElementById('authMessage');
function syncMessage(message) { syncStatus.textContent = message; }
function lockLedger(locked) { shell.inert = locked; }
function downloadLedger(state, prefix='하루가계부_백업') {
 const url=URL.createObjectURL(new Blob([JSON.stringify({state},null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=`${prefix}_${localDate(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function validateLedger(source) {
 const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
 const text=x=>typeof x==='string'&&x.length<=500;
 const amount=x=>Number.isSafeInteger(x)&&x>0;
 if(!object(source)||!Array.isArray(source.transactions)||!Array.isArray(source.recurring)||!object(source.budgets))throw Error('올바른 가계부 백업이 아닙니다.');
 const unique=rows=>new Set(rows.map(x=>x.id)).size===rows.length;
 if(!source.transactions.every(x=>object(x)&&text(x.id)&&x.id&&text(x.description)&&text(x.category)&&['수입','지출'].includes(x.kind)&&amount(x.amount)&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&!isNaN(Date.parse(x.date))&&new Date(x.date).toISOString().slice(0,10)===x.date)||!unique(source.transactions))throw Error('거래 내역 형식이 올바르지 않습니다.');
 if(!source.recurring.every(x=>object(x)&&text(x.id)&&x.id&&text(x.description)&&text(x.category)&&amount(x.amount)&&Number.isInteger(x.day)&&x.day>=1&&x.day<=31)||!unique(source.recurring))throw Error('고정 지출 형식이 올바르지 않습니다.');
 for(const [month,goals] of Object.entries(source.budgets))if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!object(goals)||!Object.values(goals).every(amount))throw Error('목표 지출 형식이 올바르지 않습니다.');
 if(source.categoryRules!==undefined&&(!object(source.categoryRules)||!Object.values(source.categoryRules).every(text)))throw Error('분류 기억 형식이 올바르지 않습니다.');
 return cloneLedger({transactions:source.transactions,recurring:source.recurring,budgets:source.budgets,categoryRules:source.categoryRules||{}});
}
async function fetchLedger() {
 const {data:row,error}=await ledgerClient.from('shared_ledger').select('state,version').eq('id',true).maybeSingle();
 if(error)throw Error('서버 연결 또는 장부 설정을 확인해 주세요.');
 if(!row){const e=Error('초대된 두 계정만 접근할 수 있습니다. 이메일 인증과 허용 목록을 확인해 주세요.');e.accessDenied=true;throw e;}
 return {state:validateLedger(row.state),version:row.version};
}
function acceptLedger(row) { data=cloneLedger(row.state);acknowledged=cloneLedger(row.state);ledgerVersion=row.version;ledgerDirty=false;render();syncMessage('서버 저장 완료 · 다른 기기와 5초마다 동기화'); }
async function persist() {
 if(!sharedReady||ledgerBusy){data=cloneLedger(acknowledged);toast('로그인과 서버 연결을 확인해 주세요.');return false;}
 ledgerBusy=true;lockLedger(true);syncMessage('서버에 저장 중…');
 const generation=ledgerGeneration, proposed=cloneLedger(data);
 try {
  validateLedger(proposed);
  const {data:result,error}=await ledgerClient.rpc('save_shared_ledger',{expected_version:ledgerVersion,new_state:proposed});
  if(error||!result?.length)throw Error(error?.code==='40001'?'다른 기기에서 장부가 변경되었습니다. 최신 기록을 불러온 뒤 다시 입력해 주세요.':'저장 여부를 확인하지 못했습니다. 최신 기록을 확인해 주세요.');
  if(generation!==ledgerGeneration)return false;
  ledgerVersion=result[0].version;acknowledged=proposed;ledgerDirty=false;syncMessage('서버 저장 완료');return true;
 } catch(e) {
  if(generation!==ledgerGeneration)return false;
  rejectedDraft=proposed;data=cloneLedger(acknowledged);sharedReady=false;
  document.getElementById('syncRecovery').hidden=false;syncMessage(e.message);toast('서버 저장 실패 · 복구 안내를 확인해 주세요.');return false;
 } finally {ledgerBusy=false;lockLedger(!sharedReady);}
}
async function saveTransactionRows(rows) { data.transactions.push(...rows);return await persist()?{saved:rows,failed:[]}:{saved:[],failed:rows.map(row=>({row,error:'서버 저장 실패'}))}; }
async function saveCategoryRule(description,kind,category) { rememberCategory(description,kind,category);return persist(); }
async function pollLedger(force=false) {
 if(!sharedReady||ledgerBusy||ledgerPollBusy)return;
 ledgerPollBusy=true;const generation=ledgerGeneration;
 try{const row=await fetchLedger();if(generation!==ledgerGeneration||ledgerBusy)return;if(row.version>ledgerVersion){if(!force&&(ledgerDirty||document.querySelector('#editId').value)){syncMessage('새 기록이 있습니다. 입력을 마친 뒤 최신 기록을 불러오세요.');return;}acceptLedger(row);}}
 catch(e){if(e.accessDenied){sharedReady=false;lockLedger(true);shell.hidden=true;authPanel.hidden=false;authMessage.textContent=e.message;data=emptyLedger();acknowledged=emptyLedger();render();}else syncMessage(e.message+' · 자동 재연결 중');}finally{ledgerPollBusy=false;}
}
async function connectSession(session) {
 const generation=++ledgerGeneration;sharedReady=false;lockLedger(true);shell.hidden=true;authPanel.hidden=false;
 data=emptyLedger();acknowledged=emptyLedger();ledgerVersion=null;render();resetEntry();preview=[];document.getElementById('preview').innerHTML='';document.getElementById('parseText').value='';
 if(!session){authMessage.textContent='초대된 이메일로 로그인하세요.';return;}
 authMessage.textContent='공유 장부를 불러오는 중…';
 try{const row=await fetchLedger();if(generation!==ledgerGeneration)return;acceptLedger(row);sharedReady=true;shell.hidden=false;authPanel.hidden=true;document.getElementById('accountEmail').textContent=session.user.email;lockLedger(false);}
 catch(e){if(generation===ledgerGeneration)authMessage.textContent=e.message;}
}
document.getElementById('loginForm').onsubmit=async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;authMessage.textContent='로그인 중…';
 try{const {data:result,error}=await ledgerClient.auth.signInWithPassword({email:document.getElementById('loginEmail').value.trim(),password:document.getElementById('loginPassword').value});if(error)throw Error('로그인에 실패했습니다. 이메일·비밀번호와 이메일 인증을 확인해 주세요.');document.getElementById('loginPassword').value='';await connectSession(result.session);}catch(error){authMessage.textContent=error.message;}finally{button.disabled=false;}
};
document.getElementById('logout').onclick=document.getElementById('authLogout').onclick=async()=>{await ledgerClient.auth.signOut();await connectSession(null);};
document.getElementById('refreshLedger').onclick=()=>{if(ledgerDirty&&!confirm('입력 중인 내용을 취소하고 최신 기록을 불러올까요?'))return;ledgerDirty=false;resetEntry();pollLedger(true);};
document.getElementById('draftBackup').onclick=()=>{if(rejectedDraft)downloadLedger(rejectedDraft,'저장실패_복구용');};
document.getElementById('recoverLedger').onclick=async()=>{if(!confirm('저장 실패 내용을 복구용 백업으로 보관했나요? 서버의 최신 기록을 불러옵니다.'))return;try{const row=await fetchLedger();acceptLedger(row);sharedReady=true;rejectedDraft=null;resetEntry();document.getElementById('syncRecovery').hidden=true;lockLedger(false);}catch(e){syncMessage(e.message);}};
document.getElementById('backupLedger').onclick=()=>downloadLedger(data);
document.getElementById('importLedger').onchange=async e=>{
 try{const file=e.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw Error('20MB 이하 파일을 선택해 주세요.');const raw=JSON.parse(await file.text()),source=validateLedger(raw.state||raw);if(!confirm(`공유 장부 전체를 백업의 ${source.transactions.length}건으로 교체합니다. 두 사람 모두에게 적용됩니다. 현재 장부를 백업했나요?`))return;data=source;if(await persist()){render();toast('백업을 공유 장부로 이전했습니다.');}}
 catch(error){toast(error.message||'백업을 읽지 못했습니다.');}finally{e.target.value='';}
};
document.getElementById('importLocal').onclick=async()=>{try{const raw=localStorage.getItem(storageKey);if(!raw)throw Error('이 브라우저에 이전 기록이 없습니다. JSON 백업을 가져오세요.');const source=validateLedger(JSON.parse(raw));if(!confirm(`이 브라우저의 이전 기록 ${source.transactions.length}건으로 공유 장부를 교체할까요? 먼저 전체 백업을 내려받으세요.`))return;data=source;if(await persist()){render();toast('이전 브라우저 기록을 이전했습니다.');}}catch(e){toast(e.message);}};
shell.addEventListener('input',e=>{if(e.target.matches('input,textarea,select'))ledgerDirty=true;});
window.addEventListener('beforeunload',e=>{if(ledgerBusy||rejectedDraft){e.preventDefault();e.returnValue='';}});
(async()=>{try{
 if(!window.supabase)throw Error('로그인 모듈을 불러오지 못했습니다. 새로고침해 주세요.');
 ledgerClient=window.supabase.createClient(SUPABASE_CONFIG.url,SUPABASE_CONFIG.publishableKey,{global:{fetch:(url,options={})=>fetch(url,{...options,signal:options.signal||AbortSignal.timeout(20000)})}});
 ledgerClient.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT')setTimeout(()=>connectSession(null),0);});
 const {data:result,error}=await ledgerClient.auth.getSession();if(error)throw error;await connectSession(result.session);
 setInterval(()=>pollLedger(),5000);window.addEventListener('focus',()=>pollLedger());
}catch(e){authMessage.textContent=e.message;}})();
