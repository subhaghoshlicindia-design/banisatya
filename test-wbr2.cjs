const {test}=require('node:test');
const assert=require('node:assert/strict');
const RTA=require('./rta-core.js');
const headers=['AMC_CODE','FOLIO_NO','PRODCODE','INV_NAME','TRXNNO','TRADDATE','TRXN_TYPE','TRXN_MODE','SEQ_NO','TRXN_SUFFI','AMOUNT','UNITS'];
const row=['DEMO','DEMO-1','DEMO-PRODUCT','DEMO Investor','123','2026-11-01','P','N','1','A','100','10'];
const feed=records=>({headers,records,category:'transactions',filename:'DEMO_R2.dbf'});
test('CAMS reused transaction numbers distinguish date, type, mode, sequence and suffix',()=>{
 const rows=[row,...[5,6,7,8,9].map(i=>{const r=[...row];r[i]={5:'2026-11-02',6:'R',7:'R',8:'2',9:'B'}[i];return r;})];
 const first=RTA.merge({},feed(rows),'WBR2');assert.equal(first.data.records.length,6);
 const again=RTA.merge(first.datasets,feed(rows),'WBR2');assert.equal(again.data.records.length,6);assert.equal(again.data.importSummary.duplicates,6);
 const reordered=feed(rows);reordered.headers=[...headers].reverse();reordered.records=rows.map(r=>[...r].reverse());assert.equal(RTA.merge(first.datasets,reordered,'WBR2').data.records.length,6);
});
test('CAMS zero transaction IDs preserve distinct rows; true conflicting financial values still fail closed',()=>{
 const a=[...row],b=[...row];a[4]=b[4]='0';a[8]=b[8]='';b[10]='200';
 const merged=RTA.merge({},feed([a,b,a]),'WBR2');assert.equal(merged.data.records.length,2);assert.equal(merged.data.importSummary.duplicates,1);
 const changed=[...row];changed[10]='200';assert.throws(()=>RTA.merge({},feed([row,changed]),'WBR2'),/Row 3 conflicts with row 2.*Amount/);
 const existing=RTA.merge({},feed([row]),'WBR2');assert.throws(()=>RTA.merge(existing.datasets,feed([changed]),'WBR2'),/previously saved record/);assert.equal(existing.data.records.length,1);
});
test('CAMS DBF aliases and normalization round trips preserve the discriminators',()=>{
 const data=RTA.normalize({...feed([row]),provider:'CAMS'});assert.equal(RTA.value(data,data.records[0],'Transaction Suffix'),'A');assert.equal(RTA.value(data,data.records[0],'Transaction Sequence'),'1');assert.deepEqual(RTA.normalize(data),data);
});

