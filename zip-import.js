/* CAMS mailback extraction. Passwords and archive bytes never leave this browser. */
(function(root){
  'use strict';
  const limit=10*1024*1024;
  async function extract(file,password,sourceCode){
    if(file.size>limit)throw Error('ZIP exceeds 10 MB. Request a smaller mailback.');
    const lib=root.zip||(typeof require==='function'?require('./zip-reader.min.js'):null);
    if(!lib)throw Error('ZIP support could not load. Refresh the portal and try again.');
    const reader=new lib.ZipReader(new lib.BlobReader(file),{useWebWorkers:false});
    try{
      const entries=await reader.getEntries();
      if(entries.length>50)throw Error('ZIP contains too many entries. Select one report archive.');
      const candidates=entries.filter(e=>!e.directory&&!e.filename.startsWith('__MACOSX/'));
      const dataFiles=candidates.filter(e=>/\.(dbf|csv|txt|xlsx|xls)$/i.test(e.filename)),pdfFiles=candidates.filter(e=>/\.pdf$/i.test(e.filename));
      const reports=sourceCode==='WBR3'&&pdfFiles.length?pdfFiles:dataFiles;
      if(!reports.length&&entries.some(e=>!e.directory&&/\.pdf$/i.test(e.filename)))throw Error('This ZIP contains a PDF statement. For a WBR3 Sales and AUM report, select WBR3 and upload again. WBR9 needs DBF, Excel or CSV investor details. No data was saved.');
      if(sourceCode==='WBR3'&&reports.length!==1)throw Error('WBR3 ZIP must contain exactly one PDF report.');
      if(reports.length!==1)throw Error('ZIP must contain exactly one DBF, CSV, TXT or Excel report. Extract multi-report archives and upload their files separately.');
      const entry=reports[0];
      if(/(^|[^a-z0-9])WBR9([^a-z0-9]|$)/i.test(entry.filename)&&sourceCode!=='WBR9')throw Error('This archive contains a WBR9 investor-details file. Select WBR9 - Investor static details / client master and upload again.');
      if(!Number.isSafeInteger(entry.uncompressedSize)||entry.uncompressedSize>limit)throw Error('Extracted report exceeds 10 MB. Request a smaller mailback.');
      if(entry.encrypted&&!password)throw Error('This ZIP is password-protected. Enter its ZIP password above, then click Upload & save to server.');
      if(/R2\.dbf$/i.test(entry.filename)&&sourceCode!=='WBR2')throw Error('This archive contains a CAMS R2 transaction file. Select WBR2 - Transactions and upload again.');
      let blob;
      try{blob=await entry.getData(new lib.BlobWriter(),{password:password||undefined,useWebWorkers:false,checkSignature:true,onprogress:n=>{if(n>limit)throw Error('Report exceeds the extraction size limit.');}});}
      catch{throw Error(entry.encrypted?'Could not unlock ZIP. Check its password and click Upload & save again. No data was saved.':'Could not read ZIP. It may be damaged or use an unsupported compression format.');}
      if(blob.size>limit)throw Error('Extracted report exceeds 10 MB.');
      return new File([blob],entry.filename.split(/[\\/]/).pop());
    }finally{await reader.close();}
  }
  root.RTAZip={extract};
  if(typeof module==='object')module.exports={extract};
})(typeof window==='object'?window:globalThis);
