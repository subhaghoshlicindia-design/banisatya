const {test}=require('node:test');
const assert=require('node:assert/strict');
const zip=require('./zip-reader.min.js');
const {extract}=require('./zip-import.js');
async function archive(names,options={}){
 const writer=new zip.ZipWriter(new zip.BlobWriter(),{useWebWorkers:false});
 for(const name of names)await writer.add(name,new zip.TextReader('FOLIO_NO,PRODCODE,TRADDATE,AMOUNT\nDEMO01,DEMO,2026-11-07,100'),{...options,useWebWorkers:false});
 return new File([await writer.close()],'07112026133510_230546215R2.zip');
}
test('CAMS encrypted R2 mailback: missing/wrong password, decryption and report selection',async()=>{
 const file=await archive(['07112026133510_230546215R2.dbf'],{password:'synthetic-zip-test',zipCrypto:true});
 await assert.rejects(()=>extract(file,'','WBR2'),/password-protected/);
 await assert.rejects(()=>extract(file,'wrong','WBR2'),/Could not unlock/);
 await assert.rejects(()=>extract(file,'synthetic-zip-test','WBR9'),/Select WBR2/);
 const unpacked=await extract(file,'synthetic-zip-test','WBR2');
 assert.equal(unpacked.name,'07112026133510_230546215R2.dbf');
 assert.match(await unpacked.text(),/FOLIO_NO,PRODCODE/);
});
test('ordinary mailbacks, multiple reports, malformed archives and size limits',async()=>{
 const file=await archive(['nested/DEMO_WBR2.csv']);
 assert.equal((await extract(file,'','WBR2')).name,'DEMO_WBR2.csv');
 await assert.rejects(()=>extract(new File([new Uint8Array(10*1024*1024+1)],'big.zip'),'','WBR2'),/exceeds/);
 await assert.rejects(()=>extract(new File(['not zip'],'bad.zip'),'','WBR2'));
 await assert.rejects(async()=>extract(await archive(['WBR2.csv','WBR9.csv']),'','WBR2'),/exactly one/);
});

