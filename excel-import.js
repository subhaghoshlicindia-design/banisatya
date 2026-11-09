/* Dedicated Excel importer. Reuses the shared RTA validation and server import API. */
(function(root){
 'use strict';
 const common=['Investor Name','PAN','AMC','Folio Number'];
 const fields={
  clients:[...common,'Email','Mobile'],
  transactions:[...common,'Scheme Name','Scheme Code','Transaction ID','Transaction Date','Transaction Type','Transaction Mode','Transaction Sequence','Transaction Suffix','Unique Transaction ID','Transaction Source','Source Serial Number','User Transaction ID','Reversal Code','Units','Amount','Price','Stamp Duty','TDS','RTA','Investor Group Code','ARN'],
  holdings:[...common,'Scheme Name','Scheme Code','Units','Current Value','Invested Value','NAV','NAV Date','Investor Group Code','ARN'],
  sips:[...common,'Scheme Name','Scheme Code','Registration ID','SIP Amount','Start Date','End Date','Status'],
  brokerage:[...common,'Scheme Name','Scheme Code','Transaction ID','Brokerage Amount','Period From','Period To','Brokerage Type']
 };
 const dateFields=new Set(['Transaction Date','Start Date','End Date','Period From','Period To','NAV Date']);
 const norm=value=>String(value??'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
 const iso=(y,m,d)=>{const check=new Date(Date.UTC(y,m-1,d));if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d)throw Error('Invalid calendar date. Use YYYY-MM-DD or Excel date cells.');return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;};
 function cell(value,field,serialDate){
  if(value==null||value==='')return '';
  if(Object.prototype.toString.call(value)==='[object Date]')return iso(value.getFullYear(),value.getMonth()+1,value.getDate());
  if(dateFields.has(field)){
   if(typeof value==='number'){const parsed=value>=1&&value<=2958465&&serialDate?.(value);if(!parsed)throw Error('Invalid Excel date. Use date-formatted cells or YYYY-MM-DD text.');return iso(parsed.y,parsed.m,parsed.d);}
   const text=String(value).trim();let match=text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/);
   if(match)return iso(+match[1],+match[2],+match[3]);
   match=text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);if(match)return iso(+match[3],+match[2],+match[1]);
   throw Error('Unrecognized date. Use YYYY-MM-DD, DD/MM/YYYY, or Excel date cells.');
  }
  if(typeof value==='number'&&!Number.isFinite(value))throw Error('Invalid numeric cell.');
  if(typeof value==='number'&&/ID|PAN|Folio|Code|Sequence|Mobile|ARN/.test(field)&&!Number.isSafeInteger(value))throw Error('Store identifiers as Text in Excel to preserve every digit.');
  return String(value).trim();
 }
 const aliases={'Scheme Name':['Fund'],'Transaction Date':['Trans. Date'],'Transaction Type':['Trans. Type'],'Transaction ID':['RTA Tran No'],'Transaction Source':['Tran. Source'],'Invested Value':['Invested Amount'],'Units':['Balance Units'],'Price':['Trade Price'],'Investor Group Code':['Group Code','Investor Gr.Code']};
 function mapping(headers,category,RTA){return Object.fromEntries(fields[category].map(field=>{const exact=headers.findIndex(h=>norm(h)===norm(field));return [field,exact>=0?exact:headers.findIndex(h=>[...(aliases[field]||[]),...(RTA.fields[field]||[])].map(norm).includes(norm(h)))];}));}
 function detect(rows){
  for(let i=0;i<Math.min(rows.length,50);i++){const names=new Set(rows[i].map(norm));
   if(['INVESTOR','FUND','FOLIONO','AUM','BALANCEUNITS'].every(h=>names.has(h)))return {category:'holdings',code:'EXCEL_AUM',headerRow:i+1,label:'Folio No. Wise AUM List'};
   if(['TRANSDATE','INVESTOR','FUND','FOLIONO','TRANSTYPE','AMOUNT','RTATRANNO'].every(h=>names.has(h)))return {category:'transactions',code:'EXCEL_TX',headerRow:i+1,label:'Transactions Report'};
  }return null;
 }
 function footer(row){const values=row.map(v=>String(v??'').trim()).filter(Boolean);return values.length>0&&values.every(v=>/^(?:Data Source\s*[-:]|Transactions are considered upto)/i.test(v));}

 function build({rows,headerRow,category,map,filename,serialDate}){
  if(!Number.isSafeInteger(headerRow)||headerRow<1||headerRow>rows.length)throw Error('Choose a valid header row.');
  const selected=fields[category].filter(field=>Number.isInteger(map[field])&&map[field]>=0);
  if(!selected.includes('Folio Number'))throw Error('Map the Folio Number column.');
  if(category==='clients'&&!selected.includes('Investor Name')&&!selected.includes('PAN'))throw Error('Map Investor Name or PAN.');
  if(category!=='clients'&&!selected.includes('Scheme Name')&&!selected.includes('Scheme Code'))throw Error('Map Scheme Name or Scheme Code.');
  const amount={transactions:'Amount',holdings:'Current Value',sips:'SIP Amount',brokerage:'Brokerage Amount'}[category];
  if(amount&&!selected.includes(amount))throw Error('Map '+amount+'.');
  if(category==='transactions'&&!selected.includes('Transaction Date'))throw Error('Map Transaction Date.');
  if(new Set(selected.map(f=>map[f])).size!==selected.length)throw Error('Each Excel column can map to only one field.');
  if(selected.some(f=>map[f]>=rows[headerRow-1].length))throw Error('A mapped column is outside the selected header row.');
  const records=[];let skippedFooterRows=0;
  const profile=detect(rows);
  rows.slice(headerRow).forEach((row,index)=>{
   if(profile){
    const first=row.map(v=>String(v??'').trim()).find(Boolean)||'';
    const folio=row[map['Folio Number']],scheme=row[map['Scheme Name']]||row[map['Scheme Code']];
    if(footer(row)||(/^(?:Grand\s+)?Total:?$/i.test(first)&&!String(folio??'').trim()&&!String(scheme??'').trim())){skippedFooterRows++;return;}
   }
   if(!selected.some(f=>row[map[f]]!=null&&String(row[map[f]]).trim()!==''))return;
   try{records.push(selected.map(field=>cell(row[map[field]],field,serialDate)));}catch(e){throw Error(`Excel row ${headerRow+index+1}: ${e.message}`);}
  });
  if(!records.length)throw Error('No data rows found below the selected header.');
  if(records.length>100000)throw Error('More than 100,000 rows. Split this sheet into smaller workbooks.');
  return {headers:selected,records,category,filename,skippedFooterRows,importedAt:new Date().toISOString()};
 }
 root.ExcelImport={fields,mapping,build,cell,detect};if(typeof module==='object')module.exports=root.ExcelImport;
 if(typeof document==='undefined'||!root.Portal?.user||root.Portal.user.role!=='distributor')return;
 const card=document.createElement('details');card.className='excel-import-card';card.id='excel-import-section';
 card.innerHTML=`<summary>Import from Excel (.xlsx / .xls)</summary><div class="excel-import-body"><p>Upload your Excel client master, transactions, AUM, SIP or brokerage data. AUM List and Transactions Report exports are detected automatically. Combined exports must not be mixed with overlapping RTA mailbacks in the same category. Choose one sheet, map its columns, review the preview, then save to the shared server.</p><div class="excel-controls"><label>Report type<select id="excel-code">${['Excel','CAMS','KFintech'].map(provider=>`<optgroup label="${provider}">${Object.entries(SOURCES).filter(([code])=>code!=='WBR3'&&RTA.providerFor(code)===provider).map(([code,s])=>`<option value="${code}">${code} - ${s.label}</option>`).join('')}</optgroup>`).join('')}</select></label><label>Excel workbook<input id="excel-file" type="file" accept=".xlsx,.xls"></label><label>Worksheet<select id="excel-sheet" disabled></select></label><label>Column headings on row<input id="excel-header" type="number" min="1" max="1000" value="1" disabled></label></div><p>Use YYYY-MM-DD or Excel date cells. Store PAN, folios and reference IDs as Text. Remove summary/total rows and save recalculated formula values before importing.</p><button type="button" id="excel-template">Download Excel template</button><div id="excel-mapping"></div><button type="button" id="excel-preview" disabled>Preview Excel data</button> <button type="button" id="excel-save" disabled>Upload Excel &amp; save to server</button><p id="excel-status" role="status">Choose an Excel workbook to begin.</p><div id="excel-preview-table" hidden></div></div>`;
 document.querySelector('.upload-workflow').before(card);
 const $=id=>document.getElementById('excel-'+id),escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 $('code').value='WBR2';let workbook=null,rows=[],pending=null,filename='';
 const category=()=>SOURCES[$('code').value].category;
 function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('login-error',error);}
 function invalidate(){pending=null;$('save').disabled=true;$('preview-table').hidden=true;$('preview-table').innerHTML='';}
 function drawMapping(){
  invalidate();$('mapping').innerHTML='';$('preview').disabled=true;if(!rows.length)return;
  const h=Number($('header').value);if(!Number.isSafeInteger(h)||h<1||h>rows.length){status('Choose the row containing your column headings.',true);return;}
  const headers=rows[h-1].map((value,index)=>String(value??'').trim()||`Column ${index+1}`),map=mapping(headers,category(),RTA);
  $('mapping').innerHTML='<h4>Column mapping</h4><p>Confirm the suggested mapping. Only mapped columns will be imported.</p><div class="excel-map-grid">'+fields[category()].map(field=>`<label>${escape(field)}<select data-excel-field="${escape(field)}"><option value="-1">Not mapped</option>${headers.map((h,i)=>`<option value="${i}" ${map[field]===i?'selected':''}>${i+1}. ${escape(h)}</option>`).join('')}</select></label>`).join('')+'</div>';
  $('mapping').querySelectorAll('select').forEach(select=>select.onchange=()=>{invalidate();status('Mapping changed. Preview again before saving.');});$('preview').disabled=false;status('Confirm the columns, then click Preview Excel data.');
 }
 function readSheet(){
  rows=[];invalidate();if(!workbook)return;
  rows=XLSX.utils.sheet_to_json(workbook.Sheets[$('sheet').value],{header:1,raw:true,defval:'',blankrows:true,range:0});
  const profile=detect(rows);$('code').disabled=!!profile;if(profile){$('code').value=profile.code;$('header').value=String(profile.headerRow);drawMapping();status('Detected '+profile.label+'. Detail rows will be imported; report totals and footer notes are excluded. Preview to verify.');return;}
  if(/(?:Clientwise|AMC wise|Sale Channel Wise).*AUM|Transactions Summary/i.test($('sheet').value)){drawMapping();$('preview').disabled=true;status('This is a summary sheet. Choose Folio No. Wise AUM List or Transactions Report for investor-level imports.',true);return;}
  let best=0,score=0;rows.slice(0,50).forEach((r,i)=>{const hits=Object.values(mapping(r,category(),RTA)).filter(n=>n>=0).length;if(hits>score){best=i;score=hits;}});$('header').value=String(best+1);drawMapping();
 }
 $('file').onchange=async()=>{
  workbook=null;rows=[];filename='';invalidate();$('mapping').innerHTML='';$('sheet').innerHTML='';$('sheet').disabled=true;$('header').disabled=true;$('preview').disabled=true;$('code').disabled=false;
  const file=$('file').files[0];if(!file)return;
  try{if(!/\.(xlsx|xls)$/i.test(file.name))throw Error('Choose an XLSX or XLS workbook.');if(file.size>10*1024*1024)throw Error('Workbook exceeds 10 MB. Split it into smaller files.');if(!root.XLSX)throw Error('Excel support could not load. Refresh with an internet connection.');
   status('Reading Excel workbook…');workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});if(!workbook.SheetNames.length)throw Error('The workbook has no worksheets.');filename=file.name;
   $('sheet').innerHTML=workbook.SheetNames.map(name=>`<option>${escape(name)}</option>`).join('');$('sheet').disabled=false;$('header').disabled=false;
   const detail=workbook.SheetNames.find(name=>detect(XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,raw:true,defval:'',blankrows:true,range:'A1:AG50'})));
   if(detail)$('sheet').value=detail;readSheet();
  }catch(e){workbook=null;status('Could not read Excel: '+e.message,true);}
 };
 $('sheet').onchange=readSheet;$('header').onchange=drawMapping;$('code').onchange=()=>{if(workbook)readSheet();else invalidate();};
 $('preview').onclick=()=>{
  invalidate();try{
   const map=Object.fromEntries([...$('mapping').querySelectorAll('select')].map(s=>[s.dataset.excelField,Number(s.value)]));
   const code=$('code').value,data=build({rows,headerRow:Number($('header').value),category:category(),map,filename:filename+' / '+$('sheet').value,serialDate:n=>XLSX.SSF.parse_date_code(n,{date1904:!!workbook.Workbook?.WBProps?.date1904})});
   const check=RTA.merge(datasets,data,code);pending={code,data};$('preview-table').innerHTML=`<p>${data.records.length} detail rows; ${data.skippedFooterRows} report total/footer rows excluded. ${code==='EXCEL_TX'?'Every detail row is preserved; repeat uploads replace the previous combined transaction export.':check.data.importSummary.duplicates+' identical duplicates will be skipped.'} No data saved yet.</p>${check.data.importSummary.snapshot?'<p>This combined Excel export replaces the previous saved report of this category. Upload the full period you want to retain. Every transaction detail row is preserved, including distinct lots that share an RTA transaction number. Other report categories are unchanged.</p>':''}<div class="excel-table-scroll"><table><thead><tr>${data.headers.map(h=>`<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${data.records.slice(0,5).map(row=>'<tr>'+row.map(v=>`<td>${escape(v)}</td>`).join('')+'</tr>').join('')}</tbody></table></div><p>Showing the first ${Math.min(5,data.records.length)} row(s).</p>`;
   $('preview-table').hidden=false;$('save').disabled=false;status('Excel data validated. Review the sample, then upload to the shared server.');
  }catch(e){status('Preview failed: '+e.message,true);}
 };
 $('save').onclick=async()=>{
  if(!pending)return;const file=pending;
  const controls=[...card.querySelectorAll('input,select,button')],disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);status('Uploading Excel data to the shared server…');
  try{const saved=await Portal.importFiles([file]),data=saved.datasets[file.code];Object.keys(datasets).forEach(code=>delete datasets[code]);Object.assign(datasets,saved.datasets);displayedSource=file.code;showAllRecords=false;searchInput.value='';renderRecords();renderReport();refreshStatementClientList();renderEmployeeDashboard();document.querySelector('#last-updated').textContent='Saved '+new Date(data.importedAt).toLocaleString();invalidate();status(`Saved to server: ${data.records.length} ${file.code} rows; ${data.importSummary.snapshot?'previous snapshot replaced':data.importSummary.duplicates+' duplicates skipped'}. Employees with permission can generate investor and family PDFs from this data.`);}
  catch(e){status('Excel upload failed: '+e.message+' Your preview is retained for retry.',true);}
  finally{controls.forEach((c,i)=>c.disabled=disabled[i]);$('save').disabled=!pending;}
 };
 $('template').onclick=()=>{try{if(!root.XLSX)throw Error('Excel support is unavailable. Refresh with an internet connection.');const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([fields[category()]]);sheet['!cols']=fields[category()].map(()=>({wch:24}));XLSX.utils.book_append_sheet(book,sheet,'Report');XLSX.writeFile(book,`Banisatya_${$('code').value}_template.xlsx`);}catch(e){status(e.message,true);}};
})(typeof window==='object'?window:globalThis);
