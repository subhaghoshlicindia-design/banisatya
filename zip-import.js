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
      const reports=entries.filter(e=>!e.directory&&!e.filename.startsWith('__MACOSX/')&&/\.(dbf|csv|txt|xlsx|xls)$/i.test(e.filename));
      if(reports.length!==1)throw Error('ZIP must contain exactly one DBF, CSV, TXT or Excel report. Extract multi-report archives and upload their files separately.');
      const entry=reports[0];
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

