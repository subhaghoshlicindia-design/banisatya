/* CAMS WBR3 summary tables. Amounts stay in the source unit: lakhs of INR. */
(function(root){
 'use strict';
 const headers=['Section','As Of Date','AMC','Item','Total Assets (Lakhs)','Assets < 1 Year (Lakhs)','Assets > 1 Year (Lakhs)','Live Accounts','0-1m (Lakhs)','1m-3m (Lakhs)','3m-6m (Lakhs)','6m-12m (Lakhs)','12m-24m (Lakhs)','>24m (Lakhs)','Row Type','Report Date','Last NAV Date'];
 const sections={'1':'Scheme AUM','2d':'Scheme Type Aging','2e':'Segment Aging'};
 const number=s=>{const x=String(s).replace(/,/g,'');if(!/^-?\d+(?:\.\d{1,2})?$/.test(x))throw Error('WBR3 contains an invalid amount.');return Number(x);};
 function date(s){const m=String(s).match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];if(!m||!months.includes(m[2].toLowerCase()))throw Error('WBR3 contains an unsupported date.');const value=`${m[3]}-${String(months.indexOf(m[2].toLowerCase())+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`;const d=new Date(value);if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==value)throw Error('WBR3 contains an invalid date.');return value;}
 const val=(data,row,name)=>row[data.headers.indexOf(name)];
 function validate(input){
  if(!input||!Array.isArray(input.headers)||JSON.stringify(input.headers)!==JSON.stringify(headers)||!Array.isArray(input.records)||!input.records.length||input.records.length>10000)throw Error('Unrecognized WBR3 table layout. Upload the original CAMS WBR3 PDF.');
  const data={...input,category:'aum-summary',provider:'CAMS',sourceCode:'WBR3',reportCode:'WBR3'},groups=new Map();
  for(const row of data.records){
   if(!Array.isArray(row)||row.length!==headers.length||row.some(v=>typeof v!=='string'||v.length>1000))throw Error('Invalid WBR3 table cells.');
   const section=row[0];if(!Object.values(sections).includes(section)||!row[2]||!row[3]||!['Detail','Subtotal','Grand total'].includes(row[14]))throw Error('Incomplete WBR3 row.');
   for(const i of [1,15,16])if(!/^\d{4}-\d{2}-\d{2}$/.test(row[i])||!Number.isFinite(+new Date(row[i]))||new Date(row[i]).toISOString().slice(0,10)!==row[i])throw Error('Invalid WBR3 report date.');
   const numeric=section==='Scheme AUM'?[4,5,6,7]:[4,8,9,10,11,12,13];
   for(const i of numeric){if(number(row[i])<0)throw Error('Negative WBR3 assets require review.');}
   if(section==='Scheme AUM'&&!/^\d+$/.test(row[7]))throw Error('WBR3 live accounts must be whole numbers.');
   const fields=section==='Scheme AUM'?[5,6]:[8,9,10,11,12,13];
   if(Math.abs(fields.reduce((s,i)=>s+number(row[i]),0)-number(row[4]))>0.01*(fields.length+1)+1e-8)throw Error('WBR3 asset aging does not reconcile with its row total. No data saved.');
   const key=JSON.stringify([section,row[1]]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
  }
  for(const [key,rows] of groups){
   const detail=rows.filter(r=>r[14]==='Detail'),grand=rows.filter(r=>r[14]==='Grand total');
   if(!detail.length||grand.length!==1)throw Error('Each WBR3 section needs detail rows and exactly one grand total.');
   const ids=detail.map(r=>JSON.stringify([r[2],r[3]]));if(new Set(ids).size!==ids.length)throw Error('Repeated WBR3 detail rows require review.');
   const columns=JSON.parse(key)[0]==='Scheme AUM'?[4,5,6,7]:[4,8,9,10,11,12,13];
   const reconcile=(parts,total)=>{for(const i of columns){const tolerance=i===7?0:0.01*(parts.length+1)+1e-8;if(Math.abs(parts.reduce((s,r)=>s+number(r[i]),0)-number(total[i]))>tolerance)throw Error('WBR3 detail rows do not reconcile with the printed totals. No data saved.');}};
   reconcile(detail,grand[0]);
   for(const subtotal of rows.filter(r=>r[14]==='Subtotal')){const parts=detail.filter(r=>r[2]===subtotal[2]);if(!parts.length)throw Error('WBR3 subtotal has no matching AMC details.');reconcile(parts,subtotal);}
  }
  if(!data.records.some(r=>r[0]==='Scheme AUM'))throw Error('WBR3 Section 1 scheme AUM was not found.');
  for(const section of Object.values(sections))if(new Set(data.records.filter(r=>r[0]===section).map(r=>r[1])).size>1)throw Error('Each WBR3 section must have one as-of date.');
  if(new Set(data.records.map(r=>r[15]+'|'+r[16])).size!==1)throw Error('WBR3 rows must belong to one report and NAV date.');
  return data;
 }
 function parseLines(lines,filename){
  if(!/WBR\s*3\s*\.?.*Sales and Assets/i.test(lines.join(' ')))throw Error('This PDF is not a recognized CAMS WBR3 Sales and Assets report.');
  const report=lines.join(' ').match(/Report Date\s*:\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i),nav=lines.join(' ').match(/Last NAV Date processed\s*:\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i);
  if(!report||!nav)throw Error('WBR3 report date or last NAV date is missing.');
  let section='',asOf='',amc='';const records=[];
  for(const raw of lines){const line=raw.replace(/\s+/g,' ').trim();
   if(/^Section\s+/i.test(line)){const m=line.match(/^Section\s+(1|2d|2e)\s*:.*as on\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/i);section=m?sections[m[1].toLowerCase()]:'';if(m){asOf=date(m[2]);amc='';}continue;}
   if(!section)continue;
   if(/^Risk Factors/i.test(line)){section='';continue;}
   const tokens=line.split(' '),count=section==='Scheme AUM'?4:7;
   const numbers=tokens.slice(-count);
   if(numbers.length===count&&numbers.every(s=>/^-?[\d,]+(?:\.\d{1,2})?$/.test(s))){
    const label=tokens.slice(0,-count).join(' ').replace(/^-\s*/,'');if(!label||!amc)throw Error('WBR3 table row has no AMC or description.');
    const kind=/^Grand\s*total$/i.test(label)?'Grand total':/^Sub\s*total$/i.test(label)?'Subtotal':'Detail';
    const row=Array(headers.length).fill('');Object.assign(row,{0:section,1:asOf,2:kind==='Grand total'?'All AMCs':amc,3:label,14:kind,15:date(report[1]),16:date(nav[1])});
    if(section==='Scheme AUM')[4,5,6,7].forEach((i,n)=>row[i]=numbers[n].replace(/,/g,''));else{[8,9,10,11,12,13,4].forEach((i,n)=>row[i]=numbers[n].replace(/,/g,''));}
    records.push(row);continue;
   }
   if(/Mutual Fund$/i.test(line)){amc=line;continue;}
   if(/^[-]\s*/.test(line)||/^(Sub\s*total|Grand\s*total)\b/i.test(line))throw Error('A WBR3 row could not be read completely. No data saved.');
  }
  return validate({headers:[...headers],records,filename,importedAt:new Date().toISOString()});
 }
 function linesFromItems(items){
  const lines=[];for(const item of items.filter(i=>typeof i.str==='string'&&i.str.trim()).sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4])){let line=lines.find(l=>Math.abs(l.y-item.transform[5])<1.5);if(!line){line={y:item.transform[5],items:[]};lines.push(line);}line.items.push(item);}
  return lines.sort((a,b)=>b.y-a.y).map(l=>l.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' '));
 }
 async function readPdf(file,password=''){
  const pdfjs=await import('./pdfjs.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./pdf.worker.mjs',location.href).href;
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),password,isEvalSupported:false,disableFontFace:true,useSystemFonts:true});let pdf;
  try{pdf=await task.promise;if(pdf.numPages>50)throw Error('WBR3 PDF exceeds 50 pages. Request a smaller report.');const lines=[];for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n);lines.push(...linesFromItems((await page.getTextContent()).items));}return parseLines(lines,file.name);}
  catch(e){if(e.name==='PasswordException')throw Error('This PDF needs its PDF password. Enter it in the password field and retry.');throw e;}finally{await task.destroy();}
 }
 function summary(data){validate(data);const rows=data.records,grand=rows.find(r=>r[0]==='Scheme AUM'&&r[14]==='Grand total');return {lakhs:number(grand[4]),rupees:Math.round(number(grand[4])*100000),accounts:Number(grand[7]),asOf:grand[1],navDate:grand[16],reportDate:grand[15],warnings:[...new Set(rows.filter(r=>r[1]>r[15]).map(r=>'The source '+r[0]+' as-of date '+r[1]+' is later than its report date '+r[15]+'. Verify this date with CAMS.'))]};}
 root.WBR3={headers,validate,parseLines,linesFromItems,readPdf,summary,val};if(typeof module==='object')module.exports=root.WBR3;
})(typeof window==='object'?window:globalThis);
