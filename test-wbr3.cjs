const {test}=require('node:test');
const assert=require('node:assert/strict');
const W=require('./wbr3-core.js'),R=require('./rta-core.js');
const lines=[
 'WBR3.Sales and Assets in Mutual Funds','Report Date : 07-Nov-2026 11:24:21 PM','Last NAV Date processed : 06-Nov-2026',
 'Section 1 : Indicactive Assets in Lakhs of Rupees as on 30-Nov-2026','DEMO Mutual Fund',
 '- DEMO Growth Fund 10.00 6.00 4.00 2','- DEMO Balanced Fund 20.00 12.00 8.00 3','Subtotal 30.00 18.00 12.00 5','Grandtotal 30.00 18.00 12.00 5',
 'Section 2d : Assets by age by Scheme Type as on 06-Nov-2026','DEMO Mutual Fund','DEMO Type 1.00 2.00 3.00 4.00 10.00 10.00 30.00','Subtotal 1.00 2.00 3.00 4.00 10.00 10.00 30.00','Grand Total 1.00 2.00 3.00 4.00 10.00 10.00 30.00',
 'Section 2e : Assets by age by Segment as on 06-Nov-2026','DEMO Mutual Fund','Retail 1.00 2.00 3.00 4.00 10.00 10.00 30.00','Subtotal 1.00 2.00 3.00 4.00 10.00 10.00 30.00','Grand Total 1.00 2.00 3.00 4.00 10.00 10.00 30.00','Risk Factors : source notice'
];
const sample=()=>W.parseLines(lines,'DEMO_WBR3.pdf');
test('WBR3 parses all three source tables, preserves lakhs and flags the source future date',()=>{
 const data=sample(),s=W.summary(data);assert.equal(data.records.length,10);assert.equal(s.lakhs,30);assert.equal(s.rupees,3000000);assert.equal(s.accounts,5);assert.equal(s.navDate,'2026-11-06');assert.equal(s.warnings.length,1);assert.equal(data.headers.includes('Folio Number'),false);
 assert.throws(()=>W.parseLines(['not WBR3'],'wrong.pdf'),/not a recognized/);
 const bad=lines.map(l=>l.replace('Grandtotal 30.00 18.00 12.00 5','Grandtotal 31.00 18.00 13.00 5'));assert.throws(()=>W.parseLines(bad,'wrong.pdf'),/reconcile/);
 const truncated=lines.map(l=>l.replace('- DEMO Growth Fund 10.00 6.00 4.00 2','- DEMO Growth Fund 10.00 6.00'));assert.throws(()=>W.parseLines(truncated,'wrong.pdf'),/could not be read/);
});
test('WBR3 snapshot is idempotent and never replaces folio holdings or adds them to its totals',()=>{
 const holdings={headers:['AMC','Folio Number','Scheme Name','Current Value'],records:[['DEMO','001','DEMO Growth','123']],category:'holdings'};
 const existing=R.merge({},holdings,'WBR22');const first=R.merge(existing.datasets,sample(),'WBR3');
 assert.equal(first.datasets.WBR22.records.length,1);assert.equal(first.data.category,'aum-summary');
 const repeated=R.merge(first.datasets,sample(),'WBR3');assert.equal(repeated.data.importSummary.duplicates,10);assert.equal(repeated.data.records.length,10);
 assert.equal(R.merge(repeated.datasets,holdings,'WBR22').datasets.WBR3.records.length,10);
});
test('PDF text coordinates reconstruct separate rows in reading order',()=>{
 const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y]});
 assert.deepEqual(W.linesFromItems([item('5',100,20),item('Name',0,40),item('10.00',90,40),item('Total',0,20)]),['Name 10.00','Total 5']);
});
test('Downloaded WBR3 PDF renders different under-one-year and over-one-year values accurately',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),printed=[];
 const ctx=new Proxy({measureText:t=>({width:String(t).length*9}),fillText:t=>printed.push(String(t))},{get:(target,key)=>key in target?target[key]:(()=>{})});
 const canvas=()=>({getContext:()=>ctx,toDataURL:()=>('data:image/jpeg;base64,'+Buffer.from('synthetic-image').toString('base64'))});
 const context={window:{RTA:R},Image:class{async decode(){}},document:{createElement:canvas},Uint8Array,TextEncoder,atob,Blob};
 vm.runInNewContext(fs.readFileSync('rta-pdf.js','utf8'),context);
 const data=sample();await context.window.RTAPdf({title:'DEMO WBR3',statementLabel:'DISTRIBUTOR AUM SUMMARY',unit:'lakhs of INR',generated:'DEMO',scope:'DEMO',period:'DEMO',blocks:[{title:'Scheme AUM',data:{...data,section:'Scheme AUM',records:data.records.filter(r=>r[0]==='Scheme AUM')}}]});
 assert.equal(printed.filter(t=>t==='4.00').length,1);assert.equal(printed.filter(t=>t==='8.00').length,1);assert.equal(printed.filter(t=>t==='12.00').length,3);
 assert.ok(printed.some(t=>t.includes('All amounts in lakhs of INR')));
});
test('WBR3 tables save in the shared server and obey employee AUM view/download permissions',async()=>{
 const {createPortal}=require('./server.cjs');const app=await createPortal({database:':memory:',production:false,setupToken:'wbr3-test-bootstrap'});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port;
 const call=async(route,auth={},body,method=body?'POST':'GET')=>{const r=await fetch(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(auth.cookie?{Cookie:auth.cookie}:{}),...(auth.csrf?{'X-CSRF-Token':auth.csrf}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,json:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
  await call('/api/setup',{}, {token:'wbr3-test-bootstrap',name:'DEMO Distributor',email:'wbr3-admin@example.test',password:'Synthetic-password-123'});
  const login=await call('/api/login',{}, {email:'wbr3-admin@example.test',password:'Synthetic-password-123',role:'distributor'}),admin={cookie:login.cookie,csrf:login.json.csrf};
  await call('/api/users',admin,{name:'DEMO Employee',email:'wbr3-employee@example.test',password:'Temporary-password-123'});
  const signed=await call('/api/login',{}, {email:'wbr3-employee@example.test',password:'Temporary-password-123',role:'employee'}),changed=await call('/api/password',{cookie:signed.cookie,csrf:signed.json.csrf},{currentPassword:'Temporary-password-123',password:'Changed-password-123'}),employee={cookie:changed.cookie,csrf:changed.json.csrf};
  const files=[{code:'WBR3',data:sample()}];let saved=await call('/api/imports',admin,{files,revision:0});assert.equal(saved.status,200);
  assert.equal((await call('/api/state',employee)).json.datasets.WBR3.category,'aum-summary');
  saved=await call('/api/imports',admin,{files,revision:1});assert.equal(saved.json.summaries[0].duplicates,10);
  assert.equal((await call('/api/reports/authorize-download',employee,{categories:['holdings']})).status,200);
  assert.equal((await call('/api/imports',employee,{files,revision:2})).status,403);
  const bad=sample();bad.records[0][4]='999';assert.equal((await call('/api/imports',admin,{files:[{code:'WBR3',data:bad}],revision:2})).status,400);assert.equal((await call('/api/state',admin)).json.revision,2);
  const users=(await call('/api/users',admin)).json.users,id=users.find(u=>u.role==='employee').id;
  const permissions=Object.fromEntries(['clients','transactions','holdings','sips','brokerage'].map(k=>[k,{view:k!=='holdings',download:k!=='holdings'}]));
  assert.equal((await call('/api/users/'+id,admin,{permissions},'PATCH')).status,200);
  const again=await call('/api/login',{}, {email:'wbr3-employee@example.test',password:'Changed-password-123',role:'employee'}),limited={cookie:again.cookie,csrf:again.json.csrf};
  assert.equal((await call('/api/state',limited)).json.datasets.WBR3,undefined);assert.equal((await call('/api/reports/authorize-download',limited,{categories:['holdings']})).status,403);
  for(const path of ['/pdfjs.mjs','/pdf.worker.mjs','/wbr3-core.js','/wbr3-ui.js']){const asset=await fetch(origin+path);assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/javascript/);}
 }finally{await new Promise(resolve=>app.server.close(resolve));}
});
