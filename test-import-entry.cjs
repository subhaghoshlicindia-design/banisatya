const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const X=require('./sheetjs.min.js'),R=require('./rta-core.js'),E=require('./excel-import.js'),Z=require('./zip-import.js'),zip=require('./zip-reader.min.js');
const app=fs.readFileSync('app.js','utf8');
function reader(){
 const password={value:''};let extractions=0;
 const context={document:{querySelector:()=>({}),getElementById:()=>password},window:{XLSX:X},ExcelImport:E,RTA:R,RTAZip:{extract:async(...args)=>{extractions++;return Z.extract(...args);}},File,TextDecoder};
 vm.createContext(context);vm.runInContext(app.slice(0,app.indexOf('\nfunction valueFor')),context);
 return {read:(...args)=>context.readStatement(...args),password,extractions:()=>extractions};
}
function workbook(rows,name='Details'){
 const book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([['Summary only']]),'Summary');X.utils.book_append_sheet(book,X.utils.aoa_to_sheet(rows),name);
 return new File([X.write(book,{type:'array',bookType:'xlsx'})],'custom.xlsx');
}
const aumRows=[['AUM report title'],['Group Code','Investor','AMC','Fund','Folio No.','Invested Amount','Balance Units','NAV','NAV Date','AUM'],['G1','DEMO','DEMO AMC','DEMO Fund','0001',100,10,12,'07/11/2026',120],['Total','','','','','','','','',120]];
const txRows=[['Transactions title'],['Trans. Date','Investor','AMC','Fund','Folio No.','Trans. Type','Amount','Trade Price','Units','RTA','RTA Tran No','Tran. Source','Investor Gr.Code'],['07/11/2026','DEMO','DEMO AMC','DEMO Fund','0001','SIP',100,10,10,'CAMS','T1','RTA','G1'],Array(13).fill('Data Source -Value Research And AMFI')];
async function archive(file,name='custom.zip'){
 const writer=new zip.ZipWriter(new zip.BlobWriter(),{useWebWorkers:false});await writer.add(file.name,new zip.BlobReader(file),{password:'synthetic-archive-password',useWebWorkers:false});return new File([await writer.close()],name);
}
test('Main upload recognizes Excel detail sheets and ignores totals even with another report selected',async()=>{
 const h=reader();const aum=await h.read(workbook(aumRows),'WBR3');assert.equal(aum.sourceCode,'EXCEL_AUM');assert.equal(aum.records.length,1);assert.equal(aum.skippedFooterRows,1);assert.equal(R.merge({},aum,aum.sourceCode).data.records.length,1);
 const tx=await h.read(workbook(txRows),'EXCEL_CLIENTS');assert.equal(tx.sourceCode,'EXCEL_TX');assert.equal(tx.records.length,1);assert.equal(tx.skippedFooterRows,1);assert.equal(R.merge({},tx,tx.sourceCode).data.records.length,1);
});
test('Main upload accepts Excel inside an encrypted ZIP and detects the report before saving',async()=>{
 const h=reader();h.password.value='synthetic-archive-password';const file=await archive(workbook(aumRows));const data=await h.read(file,'WBR3');assert.equal(data.sourceCode,'EXCEL_AUM');assert.equal(data.records.length,1);assert.equal(h.password.value,'');assert.equal(h.extractions(),1);
 assert.equal((await h.read(file,'EXCEL_CLIENTS')).records.length,1);assert.equal(h.extractions(),1);
});
test('Correcting the report choice after ZIP validation fails reuses the unlocked file without retaining its password',async()=>{
 const h=reader(),file=await archive(new File(['FOLIO_NO,INV_NAME\n0001,DEMO Investor'],'custom.csv'));
 h.password.value='synthetic-archive-password';await assert.rejects(()=>h.read(file,'WBR2'));assert.equal(h.password.value,'');
 const data=await h.read(file,'WBR9');assert.equal(data.category,'clients');assert.equal(data.records.length,1);assert.equal(h.extractions(),1);
});
test('Bulk upload retains one supplied ZIP password through all selected archives',async()=>{
 const values=new Map(),get=id=>{if(!values.has(id))values.set(id,{value:'',disabled:false,textContent:''});return values.get(id);};get('zip-password').value='synthetic-batch-password';
 let handler;const seen=[];let saved;
 const context={bulkInput:{files:[{name:'DEMO_WBR9.zip'},{name:'DEMO_WBR2.zip'}],addEventListener:(_,fn)=>handler=fn},bulkButton:{},document:{querySelector:get,getElementById:get},sourceCodeFromFilename:n=>n.includes('WBR9')?'WBR9':'WBR2',activeRole:'distributor',datasets:{},readStatement:async(file,code,password)=>{seen.push(password);get('zip-password').value='';return code==='WBR9'?{headers:['Folio Number','Investor Name'],records:[['0001','DEMO']],category:'clients',filename:file.name}:{headers:['Folio Number','Scheme Name','Amount','Transaction Date'],records:[['0001','DEMO','100','2026-11-07']],category:'transactions',filename:file.name};},RTA:R,window:{confirm:()=>true},Portal:{importFiles:async files=>{saved=files;return {datasets:{WBR9:files[0].data,WBR2:files[1].data}};}},SOURCES:{WBR9:{},WBR2:{}},sourceCategory:c=>c==='WBR9'?'clients':'transactions',importType:{},searchInput:{},setImportStatus(){},setView(){},renderReport(){},refreshStatementClientList(){},showToast(){},Date};
 const start=app.indexOf('bulkInput.addEventListener("change"'),end=app.indexOf('let pendingUpload=null;',start);vm.runInNewContext(app.slice(start,end),context);await handler();
 assert.deepEqual(seen,['synthetic-batch-password','synthetic-batch-password']);assert.equal(saved.length,2);assert.equal(get('zip-password').value,'');
});
test('Server errors are readable and stale import revisions refresh before the user retries',async()=>{
 const source=fs.readFileSync('portal-api.js','utf8'),events=[];let calls=0;
 const window={location:{assign(){}},dispatchEvent:e=>events.push(e.type)};
 const context={window,Event,fetch:async()=>{calls++;return calls===1?{status:409,ok:false,headers:{get:()=> 'application/json'},json:async()=>({error:'Stale revision'})}:{status:200,ok:true,headers:{get:()=> 'application/json'},json:async()=>({revision:2,datasets:{},families:{}})};}};
 vm.createContext(context);vm.runInContext("Object.defineProperty(globalThis,'Portal',{get:()=>window.Portal});"+source.slice(0,source.indexOf('(async()=>{')),context);
 await assert.rejects(()=>window.Portal.importFiles([]),/latest data is now loaded/);assert.equal(window.Portal.state.revision,2);assert.deepEqual(events,['portal-state']);assert.equal(window.Portal.busy,0);
 context.fetch=async()=>({status:503,ok:false,headers:{get:()=> 'text/html'}});await assert.rejects(()=>window.Portal.request('/api/imports'),/shared server could not respond/);assert.equal(window.Portal.busy,0);
});
test('Hidden legacy reports do not build thousands of unused table rows after upload',()=>{
 const preview={textContent:'stale content'},context={document:{querySelector:selector=>selector==='#report-preview'?preview:{hidden:true}}};
 const start=app.indexOf('function renderReport()'),end=app.indexOf('\nfunction statementClients()',start);vm.runInNewContext(app.slice(start,end),context);context.renderReport();assert.equal(preview.textContent,'');
});
test('Investor catalogue is reused until imported datasets change',()=>{
 const source=fs.readFileSync('rta-portal.js','utf8');let normalized=0;
 const data={headers:['AMC','Folio Number','Investor Name'],records:[['DEMO','0001','DEMO Investor']],category:'clients'};
 const context={Portal:{state:{master:{clients:{},merges:{},groups:{}}}},ClientMaster:require('./client-master-core.js'),datasets:{WBR9:data},sourceCategory:()=> 'clients',RTA:{...R,normalize:(...args)=>{normalized++;return R.normalize(...args);}}};
 const start=source.indexOf('  function entries()'),end=source.indexOf('  employeeAllocation=',start);vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 const first=context.catalogue();assert.equal(context.catalogue(),first);assert.equal(normalized,1);
 context.datasets.WBR9={...data,records:[['DEMO','0001','UPDATED Investor']]};assert.notEqual(context.catalogue(),first);assert.equal(normalized,2);assert.match(context.catalogue().people[0].label,/UPDATED Investor/);
});

test('PAN-based investor catalogue groups different AMCs and folios without merging different PANs',()=>{
 const source=fs.readFileSync('rta-portal.js','utf8'),headers=['Investor Name','PAN','AMC','Folio Number','Scheme Name','Current Value'];
 const data={headers,records:[['DEMO','ABCDE1234F','AMC ONE','001','Fund One','100'],['demo','ABCDE1234F','AMC TWO','002','Fund Two','200'],['DEMO','FGHIJ5678K','AMC ONE','003','Fund Three','300']],category:'holdings',investorMatching:'pan'};
 const context={Portal:{state:{master:{clients:{},merges:{},groups:{}}}},ClientMaster:require('./client-master-core.js'),datasets:{EXCEL_AUM:data},sourceCategory:()=> 'holdings',RTA:R};vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function entries()'),source.indexOf('  employeeAllocation=')),context);
 const cat=context.catalogue(),d=cat.list[0].data;assert.equal(cat.people.length,2);assert.equal(cat.identity(d,d.records[0]),cat.identity(d,d.records[1]));assert.notEqual(cat.identity(d,d.records[0]),cat.identity(d,d.records[2]));assert.equal(d.records.length,3);
});
