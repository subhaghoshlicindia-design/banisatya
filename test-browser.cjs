const assert=require('node:assert/strict');
const {createPortal}=require('./server.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const fs=require('node:fs');
(async()=>{
 console.log('Starting browser integration');
 const app=await createPortal({database:':memory:',setupToken:'browser-test-token'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+app.server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 console.log('Browser launched');
 const errors=[];
 const watchdog=setTimeout(()=>{console.error('Browser test exceeded two minutes');process.exit(1);},180000);watchdog.unref();
 try{
  const first=await browser.newContext({acceptDownloads:true}),second=await browser.newContext({acceptDownloads:true});
  for(const c of [first,second]){await c.route('https://**/*',r=>r.abort());c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));}
  const distributor=await first.newPage(),employee=await second.newPage();
 for(const p of [distributor,employee]){p.setDefaultTimeout(12000);p.on('pageerror',e=>console.log('Page error:',e.message));}
  console.log('Opening setup');await distributor.goto(origin+'/setup.html',{waitUntil:'domcontentloaded'});console.log('Setup loaded');
  for(const [name,value] of Object.entries({token:'browser-test-token',name:'Distributor Test',email:'admin@example.test',password:'Distributor-pass-123!'}))await distributor.fill('[name='+name+']',value);
  await distributor.click('#setup-form button');await distributor.waitForURL('**/distributor-login.html');
  await distributor.fill('#distributor-email','admin@example.test');await distributor.fill('#distributor-password','Distributor-pass-123!');await distributor.click('#distributor-login-form button[type=submit]');
  console.log('Distributor signed in');await distributor.waitForSelector('#account-password',{state:'attached'});
  await distributor.click('.settings-link');
  for(const [name,value] of Object.entries({name:'Employee Test',email:'employee@example.test',password:'Temporary-pass-123!'}))await distributor.fill('#create-employee [name='+name+']',value);
  await distributor.click('#create-employee button');await distributor.waitForFunction(()=>document.querySelector('#employee-status').textContent.includes('Employee created'));
  console.log('Employee created');await employee.goto(origin+'/employee-login.html',{waitUntil:'domcontentloaded'});await employee.fill('#employee-email','employee@example.test');await employee.fill('#employee-password','Temporary-pass-123!');await employee.click('#employee-login-form button[type=submit]');
  await employee.waitForSelector('#change-password',{state:'visible'});
  await employee.fill('#change-password [name=currentPassword]','Temporary-pass-123!');await employee.fill('#change-password [name=password]','Employee-changed-123!');await employee.click('#change-password button[type=submit]');
  await employee.waitForSelector('#app-screen:not(.hidden)');
  assert.match(await employee.textContent('#employee-welcome-name'),/Employee/);
  await distributor.click('.nav-link[data-view=Overview]');
  async function upload(code,text){console.log('Uploading',code);await distributor.selectOption('#import-type',code);await distributor.setInputFiles('#data-file',{name:code+'.csv',mimeType:'text/csv',buffer:Buffer.from(text)});await distributor.waitForFunction(()=>document.querySelector('#import-status').textContent.startsWith('Imported'));}
  await upload('WBR9','Investor Name,PAN,AMC,Folio Number\nInvestor Test,ABCDE1234F,A,001');
  const tx='Investor Name,PAN,AMC,Folio Number,Scheme Name,Transaction ID,Transaction Date,Amount\nInvestor Test,ABCDE1234F,A,001,Growth,T1,2026-11-01,1000';
  await upload('WBR2',tx);await upload('WBR2',tx);assert.match(await distributor.textContent('#import-status'),/1 duplicates/);
  await upload('MFSD203','Investor Name,PAN,AMC,Folio Number,Scheme Name,Current Value\nInvestor Test,ABCDE1234F,B,002,Growth,2500');
  await upload('WBR49','Investor Name,PAN,AMC,Folio Number,Scheme Name,Registration ID,SIP Amount,Start Date\nInvestor Test,ABCDE1234F,A,001,Growth,S1,500,2026-11-01');
  await upload('WBR77','Investor Name,PAN,AMC,Folio Number,Scheme Name,Transaction ID,Brokerage Amount,Period To\nInvestor Test,ABCDE1234F,A,001,Growth,B1,10,2026-11-01');
  await distributor.click('.nav-link[data-view=Reports]');await distributor.selectOption('#rta-person','pan:ABCDE1234F');
  await distributor.click('.rta-report-builder details summary');await distributor.fill('#rta-family-name','Shared Family');await distributor.check('#rta-family-members input');await distributor.click('#rta-save-family');
  await distributor.waitForFunction(()=>document.querySelector('#rta-person').selectedOptions[0]?.textContent==='Shared Family');
  // Independent browser context receives the new database state without sharing storage.
  await employee.bringToFront();await employee.evaluate(()=>Portal.refresh());
  await employee.waitForFunction(()=>Object.keys(Portal.state.families).length===1,{},{timeout:15000});
  await employee.click('[data-wealth-view=Reports]');await employee.selectOption('#rta-scope','family');
  const familyValue=await employee.locator('#rta-person option').last().getAttribute('value');await employee.selectOption('#rta-person',familyValue);await employee.click('#rta-preview-button');
  assert.match(await employee.textContent('#rta-status'),/5 records/);
  assert.equal(await employee.locator('.rta-report-builder details').isVisible(),false);
  assert.equal(await employee.locator('.import-panel').isVisible(),false);
  const pdf=employee.waitForEvent('download');await employee.click('#rta-download');const download=await pdf;fs.mkdirSync('tmp/pdfs',{recursive:true});await download.saveAs('tmp/pdfs/shared-family.pdf');
  await employee.evaluate(()=>scrollTo(0,0));await employee.screenshot({path:'tmp/pdfs/shared-employee.png',fullPage:true});
  await distributor.click('.settings-link');await distributor.click('[data-toggle]');await distributor.waitForSelector('[data-toggle][data-active="0"]');
  await employee.reload();await employee.waitForSelector('#login-screen:not(.hidden)');
  assert.deepEqual(errors,[]);
  console.log('Browser integration passed: setup, real logins, employee creation, mandatory password change, five report imports, duplicate handling, cross-device synchronization, family PDF, access revocation.');
 }finally{console.log('Closing test browsers');await browser.close();console.log('Closing test server');app.server.closeAllConnections();await new Promise(r=>app.server.close(r));clearTimeout(watchdog);}
})().catch(e=>{console.error(e);process.exitCode=1;});
