const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('./excel-import.js'),R=require('./rta-core.js');
const aumHeaders=['Group Code','Investor','AMC','Fund','Folio No.','Invested Amount','Balance Units','NAV','NAV Date','AUM'];
const txHeaders=['Trans. Date','Investor','AMC','Fund','Folio No.','Trans. Type','Amount','Trade Price','Units','RTA','RTA Tran No','Tran. Source','Investor Gr.Code'];
function prepare(rows){const p=E.detect(rows);return {p,data:E.build({rows,headerRow:p.headerRow,category:p.category,map:E.mapping(rows[p.headerRow-1],p.category,R),filename:'DEMO.xlsx'})};}
test('Recognize supplied AUM and transaction layouts, title rows, footer notes and total rows',()=>{
 const rows=[['Report date'],['AUM Report'],aumHeaders,['G1','DEMO','DEMO AMC','DEMO Fund','001',100,10,12,'07/11/2026',120],['Total','','','','','','','','',120],Array(10).fill('Transactions are considered upto 07/11/2026'),Array(10).fill('Data Source -Value Research And AMFI')];
 const a=prepare(rows);assert.equal(a.p.code,'EXCEL_AUM');assert.equal(a.p.headerRow,3);assert.equal(a.data.records.length,1);assert.equal(a.data.skippedFooterRows,3);assert.equal(R.value(R.normalize(a.data),R.normalize(a.data).records[0],'Current Value'),'120');
 const tx=prepare([['Title'],['Transactions Report'],[],txHeaders,['07/11/2026','DEMO','DEMO AMC','DEMO Fund','001','SIP',100,10,10,'KARVY','T1','RTA','G1'],Array(13).fill('Data Source -Value Research And AMFI')]);
 assert.equal(tx.p.code,'EXCEL_TX');assert.equal(tx.p.headerRow,4);assert.equal(tx.data.records.length,1);assert.equal(tx.data.skippedFooterRows,1);assert.equal(tx.data.records[0][tx.data.headers.indexOf('Price')],'10');
 assert.equal(E.detect([['Group Code','Investor','Equity','Debt','Total AUM']]),null);
});
test('Combined transaction snapshots preserve every lot and remain idempotent when uploaded again',()=>{
 const row=['07/11/2026','DEMO','DEMO AMC','DEMO Fund','001','SIP',100,10,10,'CAMS','T1','RTA','G1'],leg=[...row];leg[6]=200;leg[7]=20;
 const tx=prepare([txHeaders,row,leg,row]),first=R.merge({},tx.data,'EXCEL_TX');assert.equal(first.data.records.length,3);assert.equal(first.data.provider,'Excel');assert.equal(first.data.importSummary.snapshot,true);
 const repeated=R.merge(first.datasets,tx.data,'EXCEL_TX');assert.equal(repeated.data.records.length,3);
 const corrected=prepare([txHeaders,leg]);assert.equal(R.merge(repeated.datasets,corrected.data,'EXCEL_TX').data.records.length,1);
 const aum=prepare([aumHeaders,['G1','DEMO','DEMO AMC','DEMO Fund','001',100,10,12,'07/11/2026',120]]);const both=R.merge(first.datasets,aum.data,'EXCEL_AUM');assert.equal(both.datasets.EXCEL_TX.records.length,3);assert.equal(both.datasets.EXCEL_AUM.records.length,1);
 assert.throws(()=>R.merge(both.datasets,tx.data,'WBR2'),/Do not mix overlapping/);
});
test('Malformed detail rows are rejected rather than silently treated as report totals',()=>{
 assert.throws(()=>prepare([aumHeaders,['DEMO','DEMO','DEMO AMC','DEMO Fund','001',100,10,12,'invalid',120]]),/Unrecognized date/);
 const a=prepare([aumHeaders,['G1','DEMO','DEMO AMC','DEMO Fund','',100,10,12,'07/11/2026',120]]);assert.throws(()=>R.merge({},a.data,'EXCEL_AUM'),/Folio Number is required/);
});
test('Excel investor matching joins folios across exports without merging different family members',()=>{
 const a=prepare([aumHeaders,['G1','DEMO Person','DEMO AMC','DEMO Fund','001',100,10,12,'07/11/2026',120]]),tx=prepare([txHeaders,['07/11/2026','demo person','OTHER AMC','OTHER Fund','002','SIP',100,10,10,'KARVY','T1','RTA','G1']]);
 const first=R.merge({},a.data,'EXCEL_AUM').data,second=R.merge({},tx.data,'EXCEL_TX').data;
 assert.equal(R.excelInvestorKey(first,first.records[0]),R.excelInvestorKey(second,second.records[0]));
 const other=[...first.records[0]];other[first.headers.indexOf('Investor Name')]='DEMO Other Person';assert.notEqual(R.excelInvestorKey(first,first.records[0]),R.excelInvestorKey(first,other));
});
test('Combined Excel reports persist through the API and are accessible to authorized employees',async()=>{
 const {createPortal}=require('./server.cjs');const app=await createPortal({database:':memory:',production:false,setupToken:'test-only-bootstrap'});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port;
 async function call(route,auth={},body){const response=await fetch(origin+route,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(auth.cookie?{Cookie:auth.cookie}:{}),...(auth.csrf?{'X-CSRF-Token':auth.csrf}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,json:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 try{
  await call('/api/setup',{}, {token:'test-only-bootstrap',name:'DEMO Admin',email:'excel-admin@example.test',password:'Synthetic-password-123'});
  const login=await call('/api/login',{}, {email:'excel-admin@example.test',password:'Synthetic-password-123',role:'distributor'}),admin={cookie:login.cookie,csrf:login.json.csrf};
  assert.equal((await call('/api/users',admin,{name:'DEMO Employee',email:'excel-employee@example.test',password:'Temporary-password-123'})).status,201);
  const employeeLogin=await call('/api/login',{}, {email:'excel-employee@example.test',password:'Temporary-password-123',role:'employee'}),changed=await call('/api/password',{cookie:employeeLogin.cookie,csrf:employeeLogin.json.csrf},{currentPassword:'Temporary-password-123',password:'Changed-password-123'}),employee={cookie:changed.cookie,csrf:changed.json.csrf};
  const tx=prepare([txHeaders,['07/11/2026','DEMO','DEMO AMC','DEMO Fund','001','SIP',100,10,10,'CAMS','T1','RTA','G1']]),aum=prepare([aumHeaders,['G1','DEMO','DEMO AMC','DEMO Fund','001',100,10,12,'07/11/2026',120]]);
  for(const {data} of [tx,aum]){data.headers.push('PAN');data.records.forEach(r=>r.push('ABCDE1234F'));data.investorMatching='pan';}
  const invalid=structuredClone(aum.data);invalid.records[0][invalid.headers.indexOf('PAN')]='07/11/2026';
  assert.equal((await call('/api/imports',admin,{revision:0,files:[{code:'EXCEL_TX',data:tx.data},{code:'EXCEL_AUM',data:invalid}]})).status,400);
  assert.deepEqual((await call('/api/state',admin)).json.datasets,{});
  const clients={headers:['AMC_CODE','FOLIOCHK','INV_NAME','PAN_NO','EMAIL'],records:[['DEMO AMC','001','DEMO Investor','ABCDE1234F','demo@example.test']],filename:'DEMO_WBR9.csv'};
  assert.equal((await call('/api/imports',admin,{revision:0,files:[{code:'EXCEL_TX',data:tx.data},{code:'EXCEL_AUM',data:aum.data},{code:'WBR9',data:clients}]})).status,200);
  assert.equal((await call('/api/state',employee)).json.datasets.WBR9.records.length,1);
  assert.equal((await call('/api/reports/authorize-download',employee,{categories:['clients']})).status,200);
  const loaded=await call('/api/state',employee);assert.equal(loaded.json.datasets.EXCEL_TX.records.length,1);assert.equal(loaded.json.datasets.EXCEL_AUM.records.length,1);assert.equal(loaded.json.datasets.EXCEL_AUM.provider,'Excel');
  assert.equal(loaded.json.datasets.EXCEL_AUM.investorMatching,'pan');assert.equal(R.value(loaded.json.datasets.EXCEL_AUM,loaded.json.datasets.EXCEL_AUM.records[0],'PAN'),'ABCDE1234F');
  assert.equal((await call('/api/reports/authorize-download',employee,{categories:['transactions','holdings']})).status,200);
  assert.equal((await call('/api/imports',employee,{revision:1,files:[{code:'EXCEL_TX',data:tx.data}]})).status,403);
 }finally{await new Promise(resolve=>app.server.close(resolve));}
});
