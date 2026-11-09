const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('./rta-pdf.js');
const holdings=(member,records)=>({investor:member,investorName:member,data:{category:'holdings',headers:['Scheme Name','Folio Number','Units','Invested Value','Current Value','NAV','XIRR (%)'],records,provider:'CAMS',sourceCode:'WBR22'}});
test('Statement wealth and member totals use holdings only, with missing cost preserved',()=>{
 const report={blocks:[holdings('DEMO One',[['Equity','0001','10','80','100','10','']]),holdings('DEMO Two',[['Debt','0002','20','','200','10','']]),{investor:'DEMO One',data:{category:'transactions',headers:['Amount'],records:[['999999']]}}]};
 const m=M.model(report);assert.equal(m.totalValue,300);assert.equal(m.totalCost,null);assert.equal(m.members.length,2);assert.equal(m.members[0].value,100);assert.ok(Math.abs(m.members[0].weight-100/3)<1e-10);assert.equal(m.summary.find(r=>r.label==='Cost of current holdings').value,null);assert.equal(m.chart.reduce((s,x)=>s+x.value,0),300);assert.ok(!m.summary.some(r=>/insurance/i.test(r.label)));
 const incomplete=M.model({blocks:[holdings('DEMO',[['Equity','0001','10','80','','10','']])]});assert.equal(incomplete.totalValue,null);assert.equal(incomplete.chart.length,0);
});
test('Holding columns preserve zero, derive cost and weight correctly, and never infer XIRR',()=>{
 const block=holdings('DEMO',[['Equity','0001','1000','100000','125000','125','']]),values=M.holdingValues(block.data,block.data.records[0],250000);
 assert.equal(values.averageCost,100);assert.equal(values.weight,50);assert.equal(values.absoluteReturn,25);assert.equal(values.xirr,null);
 const zero=['Equity','0001','10','0','0','0','8.40%'];const z=M.holdingValues(block.data,zero,0);assert.equal(z.averageCost,0);assert.equal(z.value,0);assert.equal(z.absoluteReturn,null);assert.equal(z.xirr,8.4);assert.equal(z.weight,null);
});
test('Long statement rows continue across pages with repeated headers and all references intact',async()=>{
 const pages=[];let current;
 const context=()=>new Proxy({measureText:t=>({width:String(t).length*8}),fillText:(text,x,y)=>{assert.ok(y<=1710,'Content escaped the footer boundary');current.push(String(text));}},{get:(target,key)=>key in target?target[key]:(()=>{})});
 const canvas=()=>{current=[];const own=current;pages.push(own);return {getContext:()=>{current=own;return context();},toDataURL:()=>('data:image/jpeg;base64,'+Buffer.from('synthetic-image').toString('base64'))};};
 const c={window:{},Image:class{async decode(){}},document:{createElement:canvas},Uint8Array,TextEncoder,atob};vm.runInNewContext(fs.readFileSync('rta-pdf.js','utf8'),c);
 const data={category:'transactions',provider:'CAMS',sourceCode:'WBR2',headers:['Scheme Name','Folio Number','Transaction Date','Transaction Type','Transaction ID','Amount','Units'],records:Array.from({length:55},(_,i)=>['DEMO Long Name Growth Fund','0001','2026-10-01','PURCHASE','TESTREF'+i,'100','10'])};
 await c.window.RTAPdf({title:'DEMO Family',reportName:'DEMO Family',generated:'09-Nov-2026',period:'October 2026',blocks:[{investor:'DEMO Investor',data}]});
 assert.ok(pages.length>2);const text=pages.flat();for(let i=0;i<55;i++)assert.equal(text.filter(t=>t==='TESTREF'+i).length,1);assert.ok(text.some(t=>t.includes('continued')));assert.equal(text.filter(t=>/^Pg\. \d+ of \d+$/.test(t)).length,pages.length);
});
