/* Banisatya statement layout: reference-style cover, member breakup and tables. */
(function(root){
'use strict';
const norm=value=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const number=value=>{const text=String(value??'').trim().replace(/[,\s₹]/g,'').replace(/^\((.*)\)$/,'-$1');return text!==''&&Number.isFinite(Number(text))?Number(text):null;};
function get(data,row,...names){for(const name of names){let i=data.headers.indexOf(name);if(i<0)i=data.headers.findIndex(h=>norm(h)===norm(name));if(i>=0&&String(row[i]??'').trim())return String(row[i]).trim();}return '';}
const amount=(data,row,name)=>number(get(data,row,name));
const titles={holdings:'Investments in Mutual Funds',transactions:'Mutual Fund Transactions',clients:'Investor Details',sips:'SIP / STP / SWP Registrations',brokerage:'Brokerage and Commission','aum-summary':'CAMS WBR3 Sales and AUM'};
function sumComplete(rows,read){const values=rows.map(read);return values.length&&values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):null;}
function model(report){
 const blocks=report.blocks||[],holdings=blocks.filter(b=>b.data.category==='holdings'),holdingRows=holdings.flatMap(b=>b.data.records.map(row=>({data:b.data,row,member:b.investor||b.title||'Investor'})));
 const totalValue=sumComplete(holdingRows,x=>amount(x.data,x.row,'Current Value')),totalCost=sumComplete(holdingRows,x=>amount(x.data,x.row,'Invested Value'));
 const members=new Map();
 for(const block of blocks){if(block.data.category==='aum-summary')continue;const key=block.investor||block.title||'Investor',name=block.investorName||report.members?.find(p=>p.label===key)?.name||key;
  if(!members.has(key))members.set(key,{key,name,rows:[],counts:{clients:0,holdings:0,transactions:0,sips:0,brokerage:0}});
  const member=members.get(key);member.counts[block.data.category]=(member.counts[block.data.category]||0)+block.data.records.length;
  if(block.data.category==='holdings')member.rows.push(...block.data.records.map(row=>({data:block.data,row})));
 }
 for(const member of members.values()){member.value=sumComplete(member.rows,x=>amount(x.data,x.row,'Current Value'));member.cost=sumComplete(member.rows,x=>amount(x.data,x.row,'Invested Value'));member.weight=member.value!==null&&totalValue>0?member.value/totalValue*100:null;}
 const navDates=[...new Set(holdingRows.map(x=>get(x.data,x.row,'NAV Date')).filter(Boolean))].sort();
 const allocation=new Map();for(const {data,row} of holdingRows){const value=amount(data,row,'Current Value');if(value!==null&&value>0){const label=get(data,row,'AMC')||get(data,row,'Scheme Name','Scheme Code')||'Mutual funds';allocation.set(label,(allocation.get(label)||0)+value);}}
 const summary=[];let chartTitle='Mutual fund allocation by AMC',chart=[...allocation].map(([label,value])=>({label,value}));
 if(holdingRows.length){summary.push({label:'Fund value of mutual fund portfolio',value:totalValue},{label:'Cost of current holdings',value:totalCost},{label:'Difference from imported cost',value:totalValue!==null&&totalCost!==null?totalValue-totalCost:null},{label:'Total mutual fund value',value:totalValue,strong:true});}
 else if(blocks.some(b=>b.data.category==='aum-summary')){const d=blocks.find(b=>b.data.category==='aum-summary').data,grand=d.records.find(r=>get(d,r,'Section')==='Scheme AUM'&&get(d,r,'Row Type')==='Grand total');if(grand){summary.push({label:'Total AUM (lakhs of INR)',value:amount(d,grand,'Total Assets (Lakhs)'),strong:true},{label:'Live accounts',value:amount(d,grand,'Live Accounts'),count:true});}chartTitle='Scheme AUM by AMC (lakhs)';const groups=new Map();for(const b of blocks)for(const row of b.data.records){if(get(b.data,row,'Section')!=='Scheme AUM'||get(b.data,row,'Row Type')!=='Detail')continue;const label=get(b.data,row,'AMC'),value=amount(b.data,row,'Total Assets (Lakhs)');if(value>0)groups.set(label,(groups.get(label)||0)+value);}chart=[...groups].map(([label,value])=>({label,value}));}
 else{for(const category of ['clients','transactions','sips','brokerage']){const selected=blocks.filter(b=>b.data.category===category);if(!selected.length)continue;const field={transactions:'Amount',sips:'SIP Amount',brokerage:'Brokerage Amount'}[category];summary.push({label:titles[category]+' - records',value:selected.reduce((s,b)=>s+b.data.records.length,0),count:true});if(field)summary.push({label:category==='transactions'?'Transaction amount total (as supplied)':category==='sips'?'Plan amounts (as supplied)':'Brokerage amount total',value:sumComplete(selected.flatMap(b=>b.data.records.map(row=>({data:b.data,row}))),x=>amount(x.data,x.row,field)),strong:true});}chartTitle='Imported records by section';chart=blocks.map(b=>({label:titles[b.data.category],value:b.data.records.length}));}
 if(holdingRows.length&&(totalValue===null||totalValue<=0||holdingRows.some(x=>amount(x.data,x.row,'Current Value')<0)))chart=[];
 const combined=new Map();for(const slice of chart)combined.set(slice.label,(combined.get(slice.label)||0)+slice.value);chart=[...combined].map(([label,value])=>({label,value})).filter(s=>s.value>0).sort((a,b)=>b.value-a.value);if(chart.length>4)chart=[...chart.slice(0,3),{label:'Other',value:chart.slice(3).reduce((s,x)=>s+x.value,0)}];
 return {totalValue,totalCost,holdingRows,members:[...members.values()],navDates,summary,chart,chartTitle,hasHoldings:holdingRows.length>0,wbr3:blocks.some(b=>b.data.category==='aum-summary')};
}
function holdingValues(data,row,totalValue){const cost=amount(data,row,'Invested Value'),value=amount(data,row,'Current Value'),units=amount(data,row,'Units');return {cost,value,units,averageCost:cost!==null&&units>0?cost/units:null,weight:value!==null&&totalValue>0?value/totalValue*100:null,absoluteReturn:cost>0&&value!==null?(value-cost)/cost*100:null,xirr:number(get(data,row,'XIRR','XIRR (%)').replace(/%$/,''))};}
root.StatementModel={model,holdingValues,number,get};if(typeof module==='object')module.exports=root.StatementModel;
root.RTAPdf=async function(report){
 const logo=new Image();logo.src='banisatya-logo.svg';await logo.decode();
 const info=model(report),sheets=[],pages=[],left=44,width=1152,bottom=1618;
 const colors={navy:'#08285e',blue:'#174a8b',gold:'#c7a04c',paleGold:'#fbf5e6',paleBlue:'#edf3fa',ink:'#22324b',muted:'#627187',line:'#cdd8e5',white:'#ffffff'};
 let canvas,ctx,y,page=0;
 const money=v=>v===null||v===''||v===undefined?'-':Number(v).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
 const units=v=>v===null||v===''||v===undefined?'-':Number(v).toLocaleString('en-IN',{maximumFractionDigits:4});
 const percent=v=>v===null||v===undefined?'-':Number(v).toFixed(2);
 const date=value=>{const s=String(value||'').trim(),m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1].slice(-2)}`:s||'-';};
 function font(size=17,bold=false){ctx.font=`${bold?'600 ':''}${size}px Arial, sans-serif`;}
 function wrap(value,max,size=17,bold=false){font(size,bold);const lines=[];for(const paragraph of String(value??'-').split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(line&&ctx.measureText(line+' '+word).width>max){lines.push(line);line='';}if(ctx.measureText(word).width>max){for(const char of word){if(line&&ctx.measureText(line+char).width>max){lines.push(line);line='';}line+=char;}}else line+=(line?' ':'')+word;}lines.push(line||'');}return lines;}
 function begin(){
  canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;ctx=canvas.getContext('2d');ctx.fillStyle=colors.white;ctx.fillRect(0,0,1240,1754);page++;
  ctx.drawImage(logo,left,16,132,99);ctx.fillStyle=colors.navy;font(29,true);ctx.fillText('Banisatya Wealth Pvt Ltd',200,53);font(17);ctx.fillStyle=colors.muted;ctx.fillText('Where Integrity Creates Prosperity',200,81);font(14);ctx.fillText('Mutual Fund Wealth Desk',200,104);
  ctx.fillStyle=colors.navy;ctx.fillRect(left,124,width,44);ctx.fillStyle=colors.gold;ctx.fillRect(left,124,7,44);ctx.fillStyle=colors.white;font(22,true);ctx.fillText(report.statementLabel||'Wealth Portfolio Report',left+17,154);
  const name=report.reportName||report.title||'Portfolio statement',lines=wrap(name,width-330,22,true);let baseline=201;
  ctx.fillStyle=colors.navy;for(const line of lines){font(22,true);ctx.fillText(line,left+4,baseline);baseline+=27;}
  ctx.textAlign='right';font(14);ctx.fillStyle=colors.muted;ctx.fillText(String(report.generated||''),left+width-4,199);ctx.textAlign='left';
  y=Math.max(229,baseline+5);const period=wrap('Statement period: '+(report.period||'Latest imported data'),width-8,14);for(const line of period){font(14);ctx.fillText(line,left+4,y);y+=20;}y+=19;
 }
 function next(){sheets.push(canvas);begin();}
 function ensure(height){if(y+height>bottom)next();}
 function paragraph(value,{size=16,bold=false,color=colors.muted,gap=8}={}){const lines=wrap(value,width,size,bold);for(const line of lines){if(y+size+8>bottom)next();font(size,bold);ctx.fillStyle=color;ctx.fillText(line,left,y);y+=size+8;}y+=gap;}
 function sectionTitle(text){ensure(64);const h=40;font(20,true);const box=Math.min(width,ctx.measureText(text).width+58),x=left+(width-box)/2;ctx.fillStyle=colors.paleGold;ctx.fillRect(x,y,box,h);ctx.strokeStyle=colors.gold;ctx.lineWidth=1.5;ctx.strokeRect(x,y,box,h);ctx.fillStyle=colors.navy;ctx.textAlign='center';ctx.fillText(text,left+width/2,y+27);ctx.textAlign='left';y+=h+16;}
 function cover(){
  sectionTitle(info.wbr3?'Your AUM Report Summary':info.hasHoldings?'Your Wealth Portfolio Summary':'Your Report Summary');
  const start=y,summaryWidth=info.chart.length?665:width;let rowY=start+20;
  for(const row of info.summary){const lines=wrap(row.label,summaryWidth-230,17,row.strong),height=Math.max(44,lines.length*23+16);ctx.fillStyle=row.strong?colors.paleGold:colors.white;ctx.fillRect(left,rowY,summaryWidth,height);ctx.strokeStyle=row.strong?colors.gold:colors.line;ctx.beginPath();ctx.moveTo(left,rowY+height);ctx.lineTo(left+summaryWidth,rowY+height);ctx.stroke();font(17,row.strong);ctx.fillStyle=colors.ink;lines.forEach((line,i)=>ctx.fillText(line,left+10,rowY+26+i*23));ctx.textAlign='right';font(18,row.strong);ctx.fillText(row.count?(row.value===null?'-':String(row.value)):money(row.value),left+summaryWidth-12,rowY+26);ctx.textAlign='left';rowY+=height;}
  if(info.hasHoldings){const label=info.navDates.length===1?'Valuation date: '+date(info.navDates[0]):info.navDates.length?'Valuation dates: '+date(info.navDates[0])+' to '+date(info.navDates.at(-1)):'Valuation: latest imported snapshot';ctx.fillStyle=colors.muted;font(14);ctx.fillText(label,left+10,rowY+27);rowY+=40;}
  let chartBottom=start;
  if(info.chart.length){
   const chartX=left+875,chartY=start+139,radius=99,total=info.chart.reduce((s,x)=>s+x.value,0),palette=[colors.navy,colors.gold,'#4f80b4','#e5d1a3'];let angle=-Math.PI/2;
   info.chart.forEach((slice,i)=>{const end=angle+slice.value/total*Math.PI*2;ctx.beginPath();ctx.arc(chartX,chartY,radius,angle,end);ctx.arc(chartX,chartY,57,end,angle,true);ctx.closePath();ctx.fillStyle=palette[i%palette.length];ctx.fill();angle=end;});
   ctx.fillStyle=colors.navy;font(18,true);ctx.textAlign='center';ctx.fillText('100%',chartX,chartY+7);ctx.textAlign='left';chartBottom=start+268;
   const titleLines=wrap(info.chartTitle,400,15,true);titleLines.forEach(line=>{ctx.fillStyle=colors.blue;font(15,true);ctx.fillText(line,left+730,chartBottom);chartBottom+=21;});
   info.chart.forEach((slice,i)=>{const label=wrap(slice.label+' ('+(slice.value/total*100).toFixed(2)+'%)',370,15);ctx.fillStyle=palette[i%palette.length];ctx.fillRect(left+730,chartBottom+5,10,10);label.forEach((line,j)=>{ctx.fillStyle=colors.ink;font(15);ctx.fillText(line,left+749,chartBottom+16+j*20);});chartBottom+=label.length*20+10;});
  }
  y=Math.max(rowY,chartBottom)+25;
  if(info.members.length){
   sectionTitle(info.hasHoldings?'Memberwise Breakup of Investments':'Memberwise Report Breakup');
   const columns=info.hasHoldings?[['Member name',504,'left'],['Cost amount (INR)',220,'right'],['Market value (INR)',250,'right'],['Port. weight (%)',178,'right']]:[['Member name',492,'left'],['Client rows',132,'right'],['Transactions',176,'right'],['SIP rows',176,'right'],['Brokerage rows',176,'right']];
   tableHeader(columns.map(([label,w,align])=>({label,w,align})),16);let i=0;
   for(const member of info.members){const cells=info.hasHoldings?[member.name,money(member.cost),money(member.value),percent(member.weight)]:[member.name,String(member.counts.clients),String(member.counts.transactions),String(member.counts.sips),String(member.counts.brokerage)];const lines=cells.map((v,k)=>wrap(v,columns[k][1]-18,16));const height=Math.max(...lines.map(x=>x.length))*23+14;if(y+height>bottom){next();sectionTitle('Memberwise Breakup (continued)');tableHeader(columns.map(([label,w,align])=>({label,w,align})),16);}paintRow(columns.map(([label,w,align])=>({label,w,align})),lines,0,Math.max(...lines.map(x=>x.length)),i++,16);}
   if(info.hasHoldings)totalBand('Total mutual fund market value',info.totalValue,'INR');
  }
  const notices=info.wbr3?(report.summary||[]).filter(s=>/verify|later than|warning|do not add/i.test(s)):[];
  for(const notice of notices)paragraph(notice,{size:15,color:colors.blue});
  paragraph(info.wbr3?'WBR3 is a scheme and segment summary. Its amounts are not added to investor or family holdings.':'Values and sections reflect the imported records available for this selection. Missing values are shown as -. XIRR is shown only when supplied by the source.',{size:14});
  if(report.excluded)paragraph(report.excluded+' undated record(s) were excluded by the selected date filter.',{size:14});
 }
 const field=(label,w,value,align='left')=>({label,w,value,align});
 function layout(data){
  if(data.category==='aum-summary'){
   const exact=(row,name)=>String(row[data.headers.indexOf(name)]??'');
   const item=field('AMC / Classification',340,(d,r)=>exact(r,'AMC')+'\n'+exact(r,'Item'));
   if(data.section==='Scheme AUM')return [{...item,w:420},field('Total assets\n(lakhs)',180,(d,r)=>money(number(exact(r,'Total Assets (Lakhs)'))),'right'),field('Assets < 1 year\n(lakhs)',190,(d,r)=>money(number(exact(r,'Assets < 1 Year (Lakhs)'))),'right'),field('Assets > 1 year\n(lakhs)',190,(d,r)=>money(number(exact(r,'Assets > 1 Year (Lakhs)'))),'right'),field('Live\naccounts',172,(d,r)=>exact(r,'Live Accounts'),'right')];
   return [item,...['0-1m','1m-3m','3m-6m','6m-12m','12m-24m','>24m','Total Assets'].map(name=>field(name+'\n(lakhs)',116,(d,r)=>money(number(exact(r,name+' (Lakhs)'))),'right'))];
  }
  if(data.category==='holdings')return [field('Scheme',248,(d,r)=>get(d,r,'Scheme Name','Scheme Code')||'-'),field('Folio no.',130,(d,r)=>get(d,r,'Folio Number')||'-'),field('Inv.\nsince',90,(d,r)=>date(get(d,r,'Invested Since','Investment Since','First Investment Date'))),field('Units\nheld',100,(d,r)=>units(holdingValues(d,r,info.totalValue).units),'right'),field('Avg.\ncost',84,(d,r)=>money(holdingValues(d,r,info.totalValue).averageCost),'right'),field('Cost amount\n(INR)',112,(d,r)=>money(holdingValues(d,r,info.totalValue).cost),'right'),field('Present\nNAV',84,(d,r)=>units(number(get(d,r,'NAV','Price'))),'right'),field('Market value\n(INR)',118,(d,r)=>money(holdingValues(d,r,info.totalValue).value),'right'),field('Port.\nwgt.\n(%)',64,(d,r)=>percent(holdingValues(d,r,info.totalValue).weight),'right'),field('Abs.\nret.\n(%)',64,(d,r)=>percent(holdingValues(d,r,info.totalValue).absoluteReturn),'right'),field('XIRR\n(%)',58,(d,r)=>percent(holdingValues(d,r,info.totalValue).xirr),'right')];
  if(data.category==='transactions')return [field('Date',142,(d,r)=>date(get(d,r,'Transaction Date'))),field('Transaction',250,(d,r)=>({P:'Purchase',R:'Redemption',SI:'Switch in',SO:'Switch out',DR:'Dividend reinvestment',DP:'Dividend payout'}[get(d,r,'Transaction Type')]||get(d,r,'Transaction Type')||'-')),field('Reference / mode',248,(d,r)=>(get(d,r,'Transaction ID')||'-')+(get(d,r,'Transaction Mode')?'\nMode: '+get(d,r,'Transaction Mode'):'')),field('Units',168,(d,r)=>units(number(get(d,r,'Units'))),'right'),field('Price / NAV',156,(d,r)=>units(number(get(d,r,'Price','NAV','PURPRICE'))),'right'),field('Amount (INR)',188,(d,r)=>money(amount(d,r,'Amount')),'right')];
  if(data.category==='sips')return [field('Scheme / folio',322,(d,r)=>(get(d,r,'Scheme Name','Scheme Code')||'-')+'\n'+get(d,r,'Folio Number')),field('Registration',188,(d,r)=>get(d,r,'Registration ID')||'-'),field('Start date',152,(d,r)=>date(get(d,r,'Start Date'))),field('End date',152,(d,r)=>date(get(d,r,'End Date'))),field('Status',154,(d,r)=>get(d,r,'Status')||'-'),field('Plan amount\n(INR)',184,(d,r)=>money(amount(d,r,'SIP Amount')),'right')];
  if(data.category==='brokerage')return [field('Scheme / folio',340,(d,r)=>(get(d,r,'Scheme Name','Scheme Code')||'-')+'\n'+get(d,r,'Folio Number')),field('Period from',160,(d,r)=>date(get(d,r,'Period From'))),field('Period to',160,(d,r)=>date(get(d,r,'Period To'))),field('Type / reference',272,(d,r)=>[get(d,r,'Brokerage Type'),get(d,r,'Transaction ID')].filter(Boolean).join('\n')||'-'),field('Commission\n(INR)',220,(d,r)=>money(amount(d,r,'Brokerage Amount')),'right')];
  return [field('Investor name',292,(d,r)=>get(d,r,'Investor Name')||'-'),field('PAN',200,(d,r)=>get(d,r,'PAN')||'-'),field('Folio no.',230,(d,r)=>get(d,r,'Folio Number')||'-'),field('Email / mobile',430,(d,r)=>[get(d,r,'Email'),get(d,r,'Mobile')].filter(Boolean).join('\n')||'-')];
 }
 function tableHeader(columns,size=15){const lines=columns.map(c=>wrap(c.label,c.w-16,size,true)),height=Math.max(...lines.map(x=>x.length))*(size+6)+18;ctx.fillStyle=colors.paleBlue;ctx.fillRect(left,y,width,height);ctx.strokeStyle=colors.navy;ctx.lineWidth=1;ctx.strokeRect(left,y,width,height);let x=left;columns.forEach((c,i)=>{font(size,true);ctx.fillStyle=colors.navy;ctx.textAlign=c.align||'left';lines[i].forEach((line,j)=>ctx.fillText(line,c.align==='right'?x+c.w-8:x+8,y+size+10+j*(size+6)));x+=c.w;});ctx.textAlign='left';y+=height;}
 function paintRow(columns,lines,offset,count,index,size=16,kind=''){
  const step=size+7,height=count*step+14;ctx.fillStyle=kind==='Grand total'?colors.paleGold:kind==='Subtotal'?colors.paleBlue:index%2?'#f4f6f9':colors.white;ctx.fillRect(left,y,width,height);let x=left;
  columns.forEach((c,i)=>{font(size,kind==='Grand total'||kind==='Subtotal');ctx.fillStyle=colors.ink;ctx.textAlign=c.align||'left';lines[i].slice(offset,offset+count).forEach((line,j)=>ctx.fillText(line,c.align==='right'?x+c.w-8:x+8,y+size+6+j*step));x+=c.w;});ctx.textAlign='left';ctx.strokeStyle=colors.line;ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(left,y+height);ctx.lineTo(left+width,y+height);ctx.stroke();y+=height;return height;
 }
 function totalBand(label,value,unit=report.unit||'INR'){ensure(50);ctx.fillStyle=colors.paleGold;ctx.fillRect(left,y,width,42);ctx.strokeStyle=colors.gold;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+width,y);ctx.stroke();font(16,true);ctx.fillStyle=colors.navy;ctx.fillText(label,left+10,y+27);ctx.textAlign='right';ctx.fillText(unit+' '+money(value),left+width-10,y+27);ctx.textAlign='left';y+=57;}
 function blockHeader(block,columns,continued=false){
  sectionTitle((block.data.category==='aum-summary'?block.data.section:titles[block.data.category]||'Report')+(continued?' (continued)':''));
  const investor=block.investorName||block.investor||report.reportName||report.title;
  if(investor){const lines=wrap(investor,width-20,17,true),height=lines.length*23+14;ctx.fillStyle=colors.paleBlue;ctx.fillRect(left,y,width,height);ctx.fillStyle=colors.navy;font(17,true);lines.forEach((line,i)=>ctx.fillText(line,left+10,y+24+i*23));y+=height+8;}
  if(block.schemeContext)paragraph(block.schemeContext,{size:15,bold:true,color:colors.blue,gap:7});
  tableHeader(columns,block.data.category==='holdings'?14:15);
 }
 begin();cover();
 const order=['holdings','transactions','sips','brokerage','clients','aum-summary'];
 const displayBlocks=(report.blocks||[]).flatMap(block=>{
  if(block.data.category!=='transactions')return [block];const groups=new Map();
  for(const row of block.data.records){const scheme=get(block.data,row,'Scheme Name','Scheme Code')||'Scheme not supplied',folio=get(block.data,row,'Folio Number')||'-',key=JSON.stringify([scheme,folio]);if(!groups.has(key))groups.set(key,{scheme,folio,rows:[]});groups.get(key).rows.push(row);}
  return [...groups.values()].map(group=>({...block,schemeContext:group.scheme+' | Folio: '+group.folio,data:{...block.data,records:group.rows}}));
 }).sort((a,b)=>order.indexOf(a.data.category)-order.indexOf(b.data.category));
 if(displayBlocks.length)next();
 for(const block of displayBlocks){
  const data=block.data,columns=layout(data),size=data.category==='holdings'?15:16,step=size+7;
  const rows=data.records.map((row,index)=>({row,index}));if(data.category==='transactions')rows.sort((a,b)=>(root.RTA?.date(get(data,a.row,'Transaction Date'))||get(data,a.row,'Transaction Date')).localeCompare(root.RTA?.date(get(data,b.row,'Transaction Date'))||get(data,b.row,'Transaction Date'))||a.index-b.index);
  const totalField={holdings:'Current Value',transactions:'Amount',sips:'SIP Amount',brokerage:'Brokerage Amount'}[data.category];
  const heightOf=row=>Math.max(...columns.map(c=>wrap(c.value(data,row),c.w-16,size).length))*step+14;
  const bodyHeight=rows.length<=8?rows.reduce((s,x)=>s+heightOf(x.row),0):0;ensure(Math.min(1200,Math.max(230,bodyHeight?bodyHeight+220:230)));blockHeader(block,columns);
  for(let index=0;index<rows.length;index++){
   const row=rows[index].row,lines=columns.map(c=>wrap(c.value(data,row),c.w-16,size)),max=Math.max(...lines.map(x=>x.length));let offset=0;
   while(offset<max){
    if(y+step+14>bottom){next();blockHeader(block,columns,true);}
    let capacity=Math.max(1,Math.floor((bottom-y-14)/step));
    const reserve=index===rows.length-1&&totalField?60:0;
    if(offset===0&&((max>capacity&&max*step+14<1000)||(max*step+14+reserve>bottom-y&&max*step+14+reserve<1000))){next();blockHeader(block,columns,true);capacity=Math.max(1,Math.floor((bottom-y-14)/step));}
    const count=Math.min(max-offset,capacity);paintRow(columns,lines,offset,count,index,size,get(data,row,'Row Type'));offset+=count;if(offset<max){next();blockHeader(block,columns,true);}
   }
  }
  if(totalField){const total=sumComplete(data.records,row=>amount(data,row,totalField));totalBand(data.category==='holdings'?'Total market value':data.category==='transactions'?'Transaction amount total (as supplied)':data.category==='sips'?'Plan amount total (as supplied)':'Brokerage amount total',total,'INR');}
  y+=10;paragraph(data.records.length+' record(s) | '+(data.provider||'Imported data')+' '+(data.sourceCode||data.reportCode||'')+' | Imported: '+date(data.importedAt),{size:13,gap:18});
 }
 sheets.push(canvas);
 sheets.forEach((sheet,index)=>{const c=sheet.getContext('2d');c.textAlign='right';c.fillStyle=colors.paleGold;c.font='15px Arial, sans-serif';c.fillText('Pg. '+(index+1)+' of '+sheets.length,left+width-14,152);c.textAlign='left';c.strokeStyle=colors.gold;c.lineWidth=1.5;c.beginPath();c.moveTo(left,1652);c.lineTo(left+width,1652);c.stroke();c.fillStyle=colors.muted;c.font='13px Arial, sans-serif';c.fillText('Banisatya Wealth Pvt Ltd | Private & confidential | All amounts in '+(report.unit||'INR'),left,1676);c.fillText('Distributor-prepared from imported records. Reconcile with statements issued by the relevant AMC / RTA.',left,1698);pages.push(Uint8Array.from(atob(sheet.toDataURL('image/jpeg',0.94).split(',')[1]),char=>char.charCodeAt(0)));});
 const chunks=[],offsets=[0];let position=0;const enc=new TextEncoder();
 function append(data){const bytes=typeof data==='string'?enc.encode(data):data;chunks.push(bytes);position+=bytes.length;}
 function object(id,body){offsets[id]=position;append(id+' 0 obj\n');append(body);append('\nendobj\n');}
 append('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,'<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
 pages.forEach((jpeg,i)=>{const id=3+i*3;object(id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im '+(id+1)+' 0 R >> >> /Contents '+(id+2)+' 0 R >>');offsets[id+1]=position;append((id+1)+' 0 obj\n<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n');append(jpeg);append('\nendstream\nendobj\n');const stream='q 595.28 0 0 841.89 0 0 cm /Im Do Q\n';object(id+2,'<< /Length '+enc.encode(stream).length+' >>\nstream\n'+stream+'endstream');});
 const xref=position;append('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');for(let i=1;i<offsets.length;i++)append(String(offsets[i]).padStart(10,'0')+' 00000 n \n');append('trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');const result=new Uint8Array(position);let at=0;chunks.forEach(c=>{result.set(c,at);at+=c.length;});return result;
};
})(typeof window==='object'?window:globalThis);
