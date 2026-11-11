'use strict';
async function saveTransactionRows(rows) {
  const previous = data.transactions.slice();
  data.transactions.push(...rows);
  if (!persist()) { data.transactions = previous; return {saved: [], failed: rows.map(row => ({row, error:'저장 실패'}))}; }
  return {saved: rows, failed: []};
}
async function saveCategoryRule(description, kind, category) { rememberCategory(description, kind, category); return persist(); }
const notice = document.createElement('p');
notice.className = 'hint';
notice.textContent = '이 가계부는 현재 브라우저에 저장됩니다. 다른 기기와 자동 동기화되지 않으므로 정기적으로 백업하세요.';
document.querySelector('#overview .month-row').after(notice);
const backup = document.createElement('button'); backup.type='button'; backup.className='text-button'; backup.textContent='전체 백업';
backup.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({state:data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`하루가계부_백업_${localDate(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
const label=document.createElement('label');label.className='text-button';label.textContent='백업 가져오기';const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;label.append(input);
input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>20*1024*1024)throw Error('20MB 이하의 파일을 선택해 주세요.');const raw=JSON.parse(await file.text()), source=raw.state||raw;if(!source||!Array.isArray(source.transactions)||!Array.isArray(source.recurring)||!source.budgets||typeof source.budgets!=='object'||Array.isArray(source.budgets)||!source.transactions.every(x=>x&&typeof x.id==='string'&&typeof x.date==='string'&&typeof x.description==='string'&&typeof x.category==='string'&&['수입','지출'].includes(x.kind)&&Number.isSafeInteger(x.amount)&&x.amount>0)||!source.recurring.every(x=>x&&typeof x.id==='string'&&typeof x.description==='string'&&typeof x.category==='string'&&Number.isSafeInteger(x.amount)&&x.amount>0&&Number.isInteger(x.day)))throw Error('올바른 가계부 백업이 아닙니다.');if(!confirm('현재 브라우저의 기록을 백업 파일의 내용으로 교체합니다. 기존 기록을 먼저 백업했나요?'))return;const previous=data;data={transactions:source.transactions,recurring:source.recurring,budgets:source.budgets,categoryRules:source.categoryRules||{}};if(!persist()){data=previous;return}render();toast('백업을 가져왔습니다.')}catch(e){toast(e.message||'백업을 읽지 못했습니다.')}finally{input.value=''}};
document.querySelector('#overview .month-row').append(backup,label);
