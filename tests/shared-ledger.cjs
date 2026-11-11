const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base='http://127.0.0.1:8123';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 let state={transactions:[],recurring:[],budgets:{},categoryRules:{}}, version=0, fail=false;
 const pages=[];const errors=[];
 async function page(email){
  const context=await browser.newContext();const p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/supabase-client.js',r=>r.fulfill({contentType:'application/javascript',body:`window.supabase={createClient:()=>({auth:{onAuthStateChange:()=>{},getSession:async()=>({data:{session:null}}),signInWithPassword:async({email,password})=>({data:{session:{user:{email}}}}),signOut:async()=>({})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{const r=await fetch('/mock/read');return r.json()}})})}),rpc:async(name,args)=>{const r=await fetch('/mock/save',{method:'POST',body:JSON.stringify(args)});return r.json()}})};` }));
  await p.route('**/mock/read',r=>r.fulfill({json:{data:{state,version}}}));
  await p.route('**/mock/save',async r=>{const x=r.request().postDataJSON();if(fail)return r.fulfill({json:{error:{code:'network'}}});if(x.expected_version!==version)return r.fulfill({json:{error:{code:'40001'}}});state=x.new_state;version++;await r.fulfill({json:{data:[{version}]}});});
  await p.goto(base);assert.equal(await p.locator('.shell').isVisible(),false);
  await p.fill('#loginEmail',email);await p.fill('#loginPassword','test-password');await p.click('#loginForm button');await p.waitForFunction(()=>sharedReady);return p;
 }
 const a=await page('member1@example.com'), b=await page('member2@example.com');
 await a.click('#addTop');await a.fill('#description','테스트 점심');await a.fill('#amount','9000');await a.click('#saveEntry');await a.waitForFunction(()=>data.transactions.length===1&&!ledgerBusy);assert.equal(state.transactions.length,1);
 await b.evaluate(()=>pollLedger());await b.waitForFunction(()=>data.transactions.length===1);assert.equal(await b.locator('#count').textContent(),'1');
 // Editing a stale copy cannot overwrite the other device's update.
 await a.click('#addTop');await a.fill('#description','충돌 테스트');await a.fill('#amount','1000');version++;
 await a.click('#saveEntry');await a.waitForFunction(()=>!!rejectedDraft);assert.equal(state.transactions.length,1);assert.equal(await a.locator('#syncRecovery').isVisible(),true);
 a.on('dialog',d=>d.accept());await a.click('#recoverLedger');await a.waitForFunction(()=>sharedReady);assert.equal(await a.evaluate(()=>data.transactions.length),1);
 // Network failure preserves a recoverable draft and does not claim success.
 fail=true;await a.click('.nav[data-page=entry]');await a.fill('#description','실패 테스트');await a.fill('#amount','2000');await a.click('#saveEntry');await a.waitForFunction(()=>!!rejectedDraft);assert.equal(await a.evaluate(()=>rejectedDraft.transactions.length),2);assert.equal(state.transactions.length,1);
 fail=false;await a.click('#recoverLedger');await a.waitForFunction(()=>sharedReady);
 // Account and backup actions live in Settings.
 await a.click('.nav[data-page=settings]');
 assert.equal(await a.locator('#settings').isVisible(),true);
 assert.equal(await a.locator('#accountEmail').textContent(),'member1@example.com');
 assert.equal(await a.locator('#addTop').isVisible(),false);
 // Legacy JSON backup migration writes the shared ledger.
 await a.locator('#importLedger').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({state:{transactions:[{id:'legacy-1',date:'2026-11-01',kind:'수입',description:'이전 급여',category:'급여',amount:10000}],recurring:[],budgets:{'2026-11':{'외식비':50000}},categoryRules:{}}}))});
 await a.waitForFunction(()=>data.transactions[0]?.id==='legacy-1'&&!ledgerBusy);assert.equal(state.transactions[0].id,'legacy-1');
 await b.evaluate(()=>pollLedger());assert.equal(await b.evaluate(()=>data.transactions[0].id),'legacy-1');
 await a.click('#logout');await a.waitForFunction(()=>!sharedReady);assert.equal(await a.locator('.shell').isVisible(),false);assert.equal(await a.evaluate(()=>data.transactions.length),0);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: login gate, save, two-device sync, conflict, failure recovery, legacy import, logout');
})().catch(e=>{console.error(e);process.exit(1)});
