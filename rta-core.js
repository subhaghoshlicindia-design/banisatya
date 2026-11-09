/* Shared import rules. No network requests or investor data leave this browser. */
(function (root) {
  'use strict';
  const norm = x => String(x == null ? '' : x).trim().toUpperCase();
  const header = x => norm(x).replace(/[^A-Z0-9]/g, '');
  const fields = {
    'Investor Name': ['INVNAME','INVESTOR','NAME','CLIENTNAME','INVESTORNAME'],
    PAN: ['PAN','PAN1','PANGNO','PANNO','PAN_NUMBER','ITPANNO'],
    AMC: ['AMC','AMC_CODE','AMCCODE','FUND','FUNDCODE'],
    'Folio Number': ['FOLIO','FOLIO_NO','FOLIONO','FOLIONUMBER','FOLIOCHK','ACNO','TD_ACNO','ACCOUNTNUMBER'],
    'Scheme Name': ['SCHEME','SCHEMENAME','PRODUCTNAME','PRODNAME','FUNDNAME'],
    'Scheme Code': ['SCHEMECODE','SCHEME_CODE','PRODUCT','PRODUCTCODE','PRODCODE','FUND_SCHEME'],
    'Transaction ID': ['TRXNNO','TRXN_NO','TRXN_NUMBER','TRANSACTIONNUMBER','TRANSACTIONID','TD_TRNO','TRANNO'],
    'Unique Transaction ID': ['UNIQUE_NO','UNIQUENO','UNIQUEID','TRXN_IDNO'],
    'Transaction Sequence': ['SEQ_NO','SEQNO','SEQUENCE_NO','SEQUENCENO'],
    'Transaction Suffix': ['TRXN_SUFFIX','TRXNSUFFIX','TRXN_SUFFI'],
    'Transaction Mode': ['TRXN_MODE','TRXNMODE','TRANSACTIONMODE'],
    'Transaction Source': ['SRC_CODE','SRCCODE','SOURCECODE'],
    'Source Serial Number': ['SRC_SERIAL','SRCSERIAL','SOURCE_SERIAL','SOURCESERIALNUMBER'],
    'User Transaction ID': ['USER_TRXNO','USERTRXNO','USER_TRXNN','USR_TRXNO'],
    'Reversal Code': ['REVERSAL_CODE','REVERSALCO','REVERSAL_C','REVERSALCODE'],
    'Transaction Date': ['TRADDATE','TRAD_DATE','TRXNDATE','TRXN_DATE','TRANSACTIONDATE','TD_TRDT','DATE','TRADEDATE'],
    'Transaction Type': ['TRXNTYPE','TRXN_TYPE','TRXN_NATURE','TRANSACTIONTYPE','TRDESC','TD_TRTYPE','TRXN_DESC'],
    Amount: ['AMOUNT','TRXN_AMOUNT','TRXNAMOUNT','TD_AMT','GROSSAMOUNT','NETAMOUNT'],
    Units: ['UNITS','UNITBALANCE','BALUNITS','BAL_UNITS','CLOSINGUNITS','TD_UNITS'],
    'Current Value': ['CURRENTVALUE','MARKETVALUE','AUM','AUMVALUE','CURRVALUE','CURVALUE','CURR_VAL','MKTVAL','MKT_VALUE','VALUATION'],
    'Invested Value': ['INVESTEDVALUE','COSTVALUE','PURCHASEVALUE','COST'],
    'SIP Amount': ['SIPAMOUNT','SIP_AMT','INSTALLMENTAMOUNT','AMOUNT'],
    'Registration ID': ['REGISTRATIONID','REGISTRATIONNO','REG_ID','SIPREGNO','SIP_REG_NO','AUT_TXN_NO','IHNO','TRANSACTIONNO'],
    'Start Date': ['STARTDATE','FROMDATE','FROM_DATE','SIPSTARTDATE'],
    'End Date': ['ENDDATE','TODATE','TO_DATE','SIPENDDATE'],
    Status: ['STATUS','SIPSTATUS','REGSTATUS','REMARKS'],
    'Brokerage Amount': ['BROKERAGEAMOUNT','BROKERAGE','COMMISSION','NET_AMOUNT','NETBROKERAGE','TOTALCOMM','TOTAL_COMMISSION','BROK_AMT','BROKERAGE_AMT'],
    'Period From': ['PERIODFROM','FROMDATE','FROM_DATE','BROKFROM'],
    'Period To': ['PERIODTO','TODATE','TO_DATE','BROKTO'],
    'Brokerage Type': ['BROKERAGETYPE','BROKTYPE','COMMTYPE'],
    ARN: ['ARN','BROKERCODE','BROKER_CODE','AGENTCODE'],
    Email: ['EMAIL','EMAILID'], Mobile: ['MOBILE','MOBILENO']
  };
  function normalize(data) {
    const indexes = Object.entries(fields).filter(([name]) => name !== 'SIP Amount' || data.category === 'sips').map(([name, aliases]) => {
      const exact=data.headers.findIndex(h=>header(h)===header(name));
      return [name,exact>=0?exact:data.headers.findIndex(h=>aliases.map(header).includes(header(h)))];
    });
    const present = indexes.filter(([,i]) => i >= 0);
    const used = new Set(present.map(([,i]) => i));
    const extras = data.headers.map((h,i) => [h,i]).filter(([,i]) => !used.has(i));
    const columns = [...present,...extras];
    return {...data, headers: columns.map(([h])=>h), records:data.records.map(r=>columns.map(([,i])=>String(r[i] == null ? '' : r[i]).trim()))};
  }
  function value(data,row,name) { const i=data.headers.indexOf(name); return i < 0 ? '' : row[i]; }
  function date(value) {
    const s=String(value || '').trim();
    const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : s.slice(0,10);
  }
  function excelInvestorKey(data,row){
    if(data.provider!=='Excel')return null;
    const group=norm(value(data,row,'Investor Group Code')),name=norm(value(data,row,'Investor Name')).replace(/\s+/g,' ');
    // Group codes may be shared by different family members. Never merge names
    // merely because the export assigns them the same group code.
    return group&&name?'folio:'+JSON.stringify(['Excel investor',group,name]):null;
  }
  const providerFor=code=>String(code).startsWith('EXCEL_')?'Excel':String(code).startsWith('WBR')?'CAMS':'KFintech';
  function key(data,row) {
    const get=n=>norm(value(data,row,n));
    const base=[data.provider,get('ARN'),get('AMC'),get('Folio Number'),get('Scheme Code') || get('Scheme Name')];
    if (data.category==='clients') return JSON.stringify([data.provider,get('AMC'),get('Folio Number')]);
    if (data.category==='holdings') return JSON.stringify(base);
    const id=get(data.category==='sips'?'Registration ID':'Transaction ID');
    if(data.category==='transactions' && data.provider==='Excel'){
      if(id&&!/^0+(?:\.0+)?$/.test(id))return JSON.stringify([...base,id,get('RTA'),date(value(data,row,'Transaction Date')),get('Transaction Type'),get('Transaction Source')]);
      return JSON.stringify([...base,...data.headers.map((h,i)=>[header(h),norm(row[i])]).sort((a,b)=>a[0].localeCompare(b[0]))]);
    }
    if(data.category==='transactions' && data.provider==='CAMS'){
      // CAMS transaction numbers can recur for different dates, types, modes and legs.
      // Amount and units are deliberately excluded: financial corrections must conflict.
      const usableId=id&&!/^0+$/.test(id);
      const unique=get('Unique Transaction ID'),sequence=get('Transaction Sequence');
      if(usableId||unique||sequence)return JSON.stringify([...base,usableId?id:'',unique,sequence,
        date(value(data,row,'Transaction Date')),get('Transaction Type'),get('Transaction Mode'),
        get('Transaction Source'),get('Source Serial Number'),get('User Transaction ID'),
        get('Transaction Suffix'),get('Reversal Code')]);
      // A missing/zero transaction number is not a reliable identifier. Preserve distinct
      // rows, and skip only complete identical rows rather than inventing a shared ID.
      return JSON.stringify([...base,...data.headers.map((h,i)=>[header(h),norm(row[i])]).sort((a,b)=>a[0].localeCompare(b[0]))]);
    }
    if(id) return JSON.stringify([...base,id,...(data.category==='brokerage'?[get('Period From'),get('Period To'),get('Brokerage Type')]:[])]);
    // Without an RTA ID, only identical complete rows can safely be considered duplicates.
    return JSON.stringify([...base,...data.headers.map((h,i)=>[header(h),norm(row[i])]).sort((a,b)=>a[0].localeCompare(b[0]))]);
  }
  function merge(existing,incoming,code) {
    if(code==='WBR3'){
      const parser=root.WBR3||(typeof require==='function'?require('./wbr3-core.js'):null);
      const data=parser.validate({...incoming});
      const same=JSON.stringify(existing.WBR3?.records)===JSON.stringify(data.records);
      data.importSummary={duplicates:same?data.records.length:0,updated:existing.WBR3&&!same?1:0,snapshot:true,rows:data.records.length};
      return {datasets:{...existing,WBR3:data},data};
    }
    const data=normalize({...incoming,provider:providerFor(code),reportCode:code});
    const get=(r,n)=>value(data,r,n);
    data.records.forEach((r,i)=>{
      if(!get(r,'Folio Number')) throw Error(`Row ${i+2}: Folio Number is required.`);
      if(data.category==='clients' && !get(r,'PAN') && !get(r,'Investor Name')) throw Error(`Row ${i+2}: PAN or investor name is required.`);
      if(data.category!=='clients' && !get(r,'Scheme Code') && !get(r,'Scheme Name')) throw Error(`Row ${i+2}: scheme is required.`);
      const amountField={transactions:'Amount',holdings:'Current Value',sips:'SIP Amount',brokerage:'Brokerage Amount'}[data.category];
      if(amountField && (!get(r,amountField) || !Number.isFinite(Number(get(r,amountField).replace(/[,\s]/g,'').replace(/^\((.*)\)$/,'-$1'))))) throw Error(`Row ${i+2}: valid ${amountField} is required.`);
      if(data.category==='transactions' && !get(r,'Transaction Date')) throw Error(`Row ${i+2}: transaction date is required.`);
    });
    const next={...existing};
    const categoryMatches=Object.keys(next).filter(c=>next[c].category===data.category);
    const crossSource=categoryMatches.some(c=>(providerFor(c)==='Excel')!==(data.provider==='Excel'));
    if(crossSource)throw Error('This category already contains '+(data.provider==='Excel'?'CAMS/KFintech mailbacks':'a combined Excel export')+'. Do not mix overlapping source formats. Keep one source format per category to avoid double counting.');
    const matches=categoryMatches.filter(c=>providerFor(c)===data.provider);
    // AUM is an explicit provider-wide snapshot. Different brokerage report layouts replace
    // the provider's brokerage set: summary and detail feeds must never be added together.
    const prior=matches.map(c=>normalize({...next[c],provider:data.provider}));
    const snapshot=code==='EXCEL_TX' || data.category==='holdings' || (data.category==='brokerage' && prior.some(d=>d.reportCode!==code));
    const headers=Array.from(new Set([...prior.flatMap(d=>d.headers),...data.headers]));
    const rebase=d=>d.records.map(r=>headers.map(h=>value(d,r,h)));
    const merged={...data,headers,records:[]};
    if(code==='EXCEL_TX'){
      // This platform ledger has no unique leg/lot sequence. Preserve every supplied
      // detail row; replacing the whole export makes repeat uploads idempotent.
      merged.records=data.records.map(row=>headers.map(h=>value(data,row,h)));
      merged.importSummary={duplicates:0,updated:0,snapshot:true,rows:merged.records.length};
      matches.forEach(c=>delete next[c]);next[code]=merged;return {datasets:next,data:merged};
    }
    const rows=new Map(),origins=new Map(); let duplicates=0,updated=0;
    if(!snapshot) prior.forEach(d=>rebase(d).forEach(r=>rows.set(key(merged,r),r)));
    rebase(data).forEach((r,index)=>{
      const k=key(merged,r), old=rows.get(k);
      if(old && JSON.stringify(old)===JSON.stringify(r)) duplicates++;
      else if(old){
        if(data.category==='transactions' || data.category==='brokerage'){
          const changed=headers.filter((h,i)=>old[i]!==r[i]);
          throw Error(`Row ${index+2} conflicts with ${origins.has(k)?'row '+origins.get(k)+' in this file':'a previously saved record'} for the same transaction identity. Different fields: ${changed.join(', ')}. No data saved; obtain a corrected RTA export or review these rows.`);
        }
        updated++;
      }
      rows.set(k,r);if(!origins.has(k))origins.set(k,index+2);
    });
    merged.records=Array.from(rows.values());
    merged.importSummary={duplicates,updated,snapshot,rows:merged.records.length};
    matches.forEach(c=>delete next[c]); next[code]=merged;
    return {datasets:next,data:merged};
  }
  root.RTA={normalize,value,key,merge,date,fields,providerFor,excelInvestorKey};
  if(typeof module!=='undefined') module.exports=root.RTA;
})(typeof window==='undefined'?global:window);
