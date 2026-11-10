const {test}=require('node:test');
const assert=require('node:assert/strict');
const Excel=require('./excel-import.js'),RTA=require('./rta-core.js');
test('Excel custom headers and title rows map without losing folio text or date cells',()=>{
 const rows=[['Banisatya transaction export'],['Client','Folio','Product','When','Value','Ref'],['DEMO','0000123','Growth',new Date(2026,10,7),1234.5,'DEMO-1'],[],['DEMO','0000123','Growth','08/11/2026',2000,'DEMO-2']];
 const map={'Investor Name':0,'Folio Number':1,'Scheme Name':2,'Transaction Date':3,Amount:4,'Transaction ID':5};
 const data=Excel.build({rows,headerRow:2,category:'transactions',map,filename:'DEMO.xlsx / Transactions'});
 assert.equal(data.records.length,2);assert.equal(data.records[0][data.headers.indexOf('Folio Number')],'0000123');assert.equal(data.records[0][data.headers.indexOf('Transaction Date')],'2026-11-07');assert.equal(data.records[1][data.headers.indexOf('Transaction Date')],'2026-11-08');
 const merged=RTA.merge({},data,'WBR2');assert.equal(merged.data.records.length,2);assert.equal(RTA.merge(merged.datasets,data,'WBR2').data.importSummary.duplicates,2);
});
test('Excel aliases, serial dates, invalid mappings and invalid calendar dates',()=>{
 const headers=['INV_NAME','FOLIO_NO','PRODCODE','TRADDATE','AMOUNT'];const map=Excel.mapping(headers,'transactions',RTA);
 assert.equal(map['Transaction Date'],3);assert.equal(map['Folio Number'],1);
 const options={rows:[headers,['DEMO','0001','P1',46333,100]],headerRow:1,category:'transactions',map,filename:'DEMO.xlsx',serialDate:()=>({y:2026,m:11,d:7})};
 assert.equal(Excel.build(options).records[0][3],'2026-11-07');
 assert.throws(()=>Excel.build({...options,map:{...map,Amount:-1}}),/Map Amount/);
 assert.throws(()=>Excel.build({...options,map:{...map,Amount:1}}),/only one/);
 assert.throws(()=>Excel.cell('31/02/2026','Transaction Date'),/Invalid calendar/);
 assert.throws(()=>Excel.cell('11/7/26','Transaction Date'),/Unrecognized date/);
 assert.throws(()=>Excel.cell(99999999999999999,'Transaction ID'),/identifiers as Text/);
 assert.throws(()=>Excel.build({...options,rows:[headers]}),/No data rows/);
});

test('PAN-based Excel import requires the real PAN column and validates every investor row',()=>{
 const headers=['Investor','PAN Number','AMC','Fund','Folio No.','AUM'];const map=Excel.mapping(headers,'holdings',RTA);
 const options={rows:[headers,['DEMO','abcde1234f','DEMO AMC','DEMO Fund','0001',100],['DEMO','ABCDE1234F','DEMO AMC','OTHER Fund','0002',200]],headerRow:1,category:'holdings',map,filename:'DEMO.xlsx',investorMatching:'pan'};
 const data=Excel.build(options);assert.equal(map.PAN,1);assert.equal(data.investorMatching,'pan');assert.equal(data.records[0][data.headers.indexOf('PAN')],'ABCDE1234F');assert.equal(RTA.merge({},data,'EXCEL_AUM').data.records.length,2);
 assert.throws(()=>Excel.build({...options,map:{...map,PAN:-1}}),/requires a PAN column/);
 assert.throws(()=>Excel.build({...options,rows:[headers,['DEMO','','DEMO AMC','DEMO Fund','0001',100]]}),/Excel row 2.*PAN is required/);
 assert.throws(()=>Excel.build({...options,rows:[headers,['DEMO','07\/11\/2026','DEMO AMC','DEMO Fund','0001',100]]}),/Invalid PAN format/);
 assert.throws(()=>RTA.merge({}, {...data,records:data.records.map(r=>r.map((v,i)=>i===data.headers.indexOf('PAN')?'':v))},'EXCEL_AUM'),/valid PAN/);
 const noPan=Excel.build({...options,investorMatching:'auto',map:{...map,PAN:-1}});assert.equal(noPan.records.length,2);
});
