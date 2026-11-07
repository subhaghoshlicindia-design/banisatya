const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const RTA=require('./rta-core.js');
function harness(failRead=false){
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{disabled:false,files:[],value:'',addEventListener(event,fn){this[event]=fn;},focus(){this.focused=true;}});return elements.get(id);};
 const fileInput=element('data-file');fileInput.files=[{name:'DEMO_WBR2.csv',size:100}];
 const importType=element('import-type');importType.value='WBR2';let saves=0;
 const data={category:'transactions',headers:['Investor Name','PAN','AMC','Folio Number','Scheme Name','Transaction ID','Transaction Date','Amount'],records:[['DEMO','AAAAA0001A','DEMO','DEMO-1','DEMO Growth','DEMO-T1','2026-11-07','100']],filename:'DEMO_WBR2.csv',importedAt:new Date().toISOString()};
 const datasets={};
 const context={document:{getElementById:element,querySelector:selector=>element(selector.slice(1))},fileInput,importType,activeRole:'distributor',datasets,readStatement:async()=>{if(failRead)throw Error('This ZIP is password-protected. Enter its ZIP password.');return data;},RTA,escapeHTML:String,setImportStatus:text=>{context.status=text;},Portal:{importFiles:async files=>{saves++;return RTA.merge({},files[0].data,files[0].code);}},searchInput:{value:''},renderRecords(){},renderReport(){},refreshStatementClientList(){},renderEmployeeDashboard(){},showToast(){},Date};
 const source=fs.readFileSync('app.js','utf8');const start=source.indexOf('let pendingUpload=null;'),end=source.indexOf('\ndocument.querySelector("#clear-data")',start);
 vm.runInNewContext(source.slice(start,end),context);
 return {element,context,saves:()=>saves};
}
test('Upload saves directly without requiring a separate preview click',async()=>{
 const h=harness();await h.element('upload-save-server').click();assert.equal(h.saves(),1);assert.match(h.context.status,/Saved to server: 1 WBR2 rows/);
});
test('Optional preview does not save data; password failure retains file and prevents saving',async()=>{
 const preview=harness();await preview.element('import-selected-file').click();assert.equal(preview.saves(),0);assert.equal(preview.element('upload-save-server').disabled,false);
 const failure=harness(true);await failure.element('upload-save-server').click();assert.equal(failure.saves(),0);assert.equal(failure.element('data-file').files.length,1);assert.equal(failure.element('zip-password').focused,true);assert.equal(failure.element('upload-save-server').disabled,false);
});

