/* A4 investor-facing tables. Source data and permissions remain unchanged. */
window.RTAPdf = async function (report) {
  const logo=new Image();logo.src='banisatya-logo.svg';await logo.decode();
  const sheets=[],pages=[],left=64,width=1112,bottom=1580;
  let canvas,ctx,y,page=0;
  const colors={navy:'#08285e',blue:'#163d74',gold:'#c7a04c',ink:'#23344d',muted:'#5d6c80',line:'#dce3ed'};
  const norm=s=>String(s??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const number=s=>{const text=String(s??'').trim().replace(/[,\s₹]/g,'').replace(/^\((.*)\)$/,'-$1');return text!==''&&Number.isFinite(Number(text))?Number(text):null;};
  const money=s=>{const n=number(s);return n===null?'—':n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});};
  const units=s=>{const n=number(s);return n===null?'—':n.toLocaleString('en-IN',{maximumFractionDigits:4});};
  function date(s){const text=String(s||'').trim(),m=text.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:text||'—';}
  function get(d,row,...names){for(const name of names){const i=d.headers.findIndex(h=>norm(h)===norm(name));if(i>=0&&String(row[i]??'').trim())return String(row[i]).trim();}return '';}
  function font(size=20,bold=false){ctx.font=`${bold?'600 ':''}${size}px Arial, sans-serif`;}
  function wrap(value,max,size=20,bold=false){
    font(size,bold);const result=[];
    for(const paragraph of String(value??'—').split('\n')){
      let line='';for(const word of paragraph.split(/\s+/)){
        if(line&&ctx.measureText(line+' '+word).width>max){result.push(line);line='';}
        if(ctx.measureText(word).width>max){for(const char of word){if(line&&ctx.measureText(line+char).width>max){result.push(line);line='';}line+=char;}}
        else line+=(line?' ':'')+word;
      }result.push(line||'');
    }return result;
  }
  function begin(){
    canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,1240,1754);ctx.drawImage(logo,64,22,148,111);
    ctx.fillStyle=colors.navy;font(32,true);ctx.fillText('Banisatya Wealth Pvt Ltd',240,64);
    ctx.fillStyle=colors.muted;font(19);ctx.fillText('Where Integrity Creates Prosperity',240,96);
    ctx.fillStyle=colors.gold;ctx.fillRect(left,148,width,3);y=188;page++;
    ctx.fillStyle=colors.muted;font(16);ctx.fillText(report.statementLabel||'INVESTOR PORTFOLIO STATEMENT',left,y);
    ctx.textAlign='right';ctx.fillText('Generated '+report.generated,left+width,y);ctx.textAlign='left';y+=40;
  }
  function next(){sheets.push(canvas);begin();}
  function paragraph(value,{size=20,bold=false,color=colors.ink,gap=10}={}){
    const lines=wrap(value,width,size,bold),step=size+9;
    for(const line of lines){if(y+step>bottom)next();ctx.fillStyle=color;font(size,bold);ctx.fillText(line,left,y);y+=step;}y+=gap;
  }
  function ensure(height){if(y+height>bottom)next();}
  const field=(label,w,value,align='left')=>({label,w,value,align});
  function layout(category){
    if(category==='aum-summary'){
      // Preserve < and > in exact column names; ordinary normalized aliases remove them.
      const value=(d,r,name)=>String(r[d.headers.indexOf(name)]??'');
      const item=field('AMC / '+(currentWbr3Section==='Scheme AUM'?'Scheme':'Classification'),300,(d,r)=>value(d,r,'AMC')+'\n'+value(d,r,'Item'));
      if(currentWbr3Section==='Scheme AUM')return [{...item,w:350},field('Total assets (lakhs)',180,(d,r)=>money(value(d,r,'Total Assets (Lakhs)')),'right'),field('Assets < 1 year (lakhs)',190,(d,r)=>money(value(d,r,'Assets < 1 Year (Lakhs)')),'right'),field('Assets > 1 year (lakhs)',190,(d,r)=>money(value(d,r,'Assets > 1 Year (Lakhs)')),'right'),field('Live accounts',202,(d,r)=>value(d,r,'Live Accounts'),'right')];
      return [item,...['0-1m','1m-3m','3m-6m','6m-12m','12m-24m','>24m','Total Assets'].map(name=>field(name+' (lakhs)',116,(d,r)=>money(value(d,r,name+' (Lakhs)')),'right'))];
    }
    const scheme=(d,r)=>get(d,r,'Scheme Name','SCHEME','PRODNAME')||get(d,r,'Scheme Code','PRODCODE')||'—';
    const schemeFolio=(d,r)=>scheme(d,r)+'\nFolio: '+(get(d,r,'Folio Number','FOLIO_NO')||'—');
    const amount=(d,r)=>money(get(d,r,'Amount'));
    if(category==='transactions')return [
      field('Date',132,(d,r)=>date(get(d,r,'Transaction Date'))),
      field('Transaction',200,(d,r)=>{const value=get(d,r,'Transaction Type');return ({P:'Purchase',R:'Redemption',SI:'Switch in',SO:'Switch out',DR:'Dividend reinvestment',DP:'Dividend payout',TI:'Transfer in',TO:'Transfer out'})[value]||value||'—';}),
      field('Reference / Mode',244,(d,r)=>(get(d,r,'Transaction ID')||'—')+(get(d,r,'Transaction Mode')?'\nMode: '+get(d,r,'Transaction Mode'):'')),
      field('Units',160,(d,r)=>units(get(d,r,'Units')),'right'),field('Price / NAV',156,(d,r)=>units(get(d,r,'Price','NAV','PURPRICE')),'right'),field('Amount (INR)',220,amount,'right')];
    if(category==='holdings')return [field('Scheme / Folio',392,schemeFolio),field('Units',156,(d,r)=>units(get(d,r,'Units')),'right'),field('NAV / date',144,(d,r)=>units(get(d,r,'NAV','Price'))+(get(d,r,'NAV Date')?'\n'+date(get(d,r,'NAV Date')):''),'right'),field('Cost (INR)',200,(d,r)=>money(get(d,r,'Invested Value')),'right'),field('Value (INR)',220,(d,r)=>money(get(d,r,'Current Value')),'right')];
    if(category==='sips')return [field('Scheme / Folio',326,schemeFolio),field('Registration',180,(d,r)=>get(d,r,'Registration ID')||'—'),field('Start date',138,(d,r)=>date(get(d,r,'Start Date'))),field('End date',138,(d,r)=>date(get(d,r,'End Date'))),field('Status',150,(d,r)=>get(d,r,'Status')||'—'),field('Amount (INR)',180,(d,r)=>money(get(d,r,'SIP Amount')),'right')];
    if(category==='brokerage')return [field('Scheme / Folio',360,schemeFolio),field('Period from',156,(d,r)=>date(get(d,r,'Period From'))),field('Period to',156,(d,r)=>date(get(d,r,'Period To'))),field('Type',228,(d,r)=>get(d,r,'Brokerage Type')||'—'),field('Brokerage (INR)',212,(d,r)=>money(get(d,r,'Brokerage Amount')),'right')];
    return [field('Investor name',280,(d,r)=>get(d,r,'Investor Name')||'—'),field('PAN',194,(d,r)=>get(d,r,'PAN')||'—'),field('Folio',206,(d,r)=>get(d,r,'Folio Number')||'—'),field('Contact',432,(d,r)=>[get(d,r,'Email'),get(d,r,'Mobile')].filter(Boolean).join('\n')||'—')];
  }
  function tableHeader(columns){
    const lines=columns.map(c=>wrap(c.label,c.w-24,18,true)),height=Math.max(...lines.map(a=>a.length))*23+24;
    ctx.fillStyle=colors.navy;ctx.fillRect(left,y,width,height);let x=left;
    columns.forEach((c,i)=>{ctx.fillStyle='#fff';font(18,true);ctx.textAlign=c.align;lines[i].forEach((v,j)=>ctx.fillText(v,c.align==='right'?x+c.w-12:x+12,y+25+j*23));x+=c.w;});ctx.textAlign='left';y+=height;
  }
  function sectionHeader(block,columns,continued=false){
    const title=block.investor||String(block.title||'').split(' | ')[0];
    paragraph(title+(continued?' (continued)':''),{size:23,bold:true,color:colors.blue,gap:0});
    const labels={clients:'Investor details',holdings:'Holdings valuation',transactions:'Transaction statement',sips:'Systematic plans',brokerage:'Brokerage statement'};
    paragraph((labels[block.data.category]||'Report')+'  |  '+(block.data.provider||((block.data.sourceCode||'').startsWith('WBR')?'CAMS':'KFintech'))+'  '+((block.data.sourceCode||block.data.reportCode||'').startsWith('EXCEL_')?'combined export':block.data.sourceCode||block.data.reportCode||''),{size:18,color:colors.muted,gap:8});
    if(block.schemeContext)paragraph(block.schemeContext,{size:19,bold:true,color:colors.ink,gap:8});
    tableHeader(columns);
  }
  begin();
  paragraph(report.title,{size:30,bold:true,color:colors.navy,gap:8});
  paragraph((report.statementLabel?'Scope: ':'Investor / family: ')+report.scope,{size:19,gap:3});
  paragraph('Statement period: '+report.period,{size:19,gap:12});
  if(report.summary?.length){
    ensure(60);ctx.fillStyle='#f4f7fc';ctx.fillRect(left,y-18,width,36);ctx.fillStyle=colors.blue;font(20,true);ctx.fillText(report.statementLabel?'AUM SUMMARY':'PORTFOLIO OVERVIEW',left+12,y+6);y+=44;
    for(const summary of report.summary)paragraph(summary,{size:21,bold:true,color:colors.blue,gap:2});
    y+=12;
  }
  if(report.blocks.some(b=>b.data.category==='holdings'))paragraph('Valuation reflects the imported snapshot; the period filter does not reconstruct historical holdings.',{size:17,color:colors.muted,gap:8});
  if(report.excluded)paragraph(report.excluded+' undated record(s) excluded by the selected period.',{size:17,color:colors.muted,gap:8});
  const labels={transactions:['Amount','Transaction amount total (as supplied)'],holdings:['Current Value','Holdings value total'],sips:['SIP Amount','Plan amount total'],brokerage:['Brokerage Amount','Brokerage total']};
  let currentWbr3Section='';
  const displayBlocks=report.blocks.flatMap(block=>{
    if(block.data.category!=='transactions')return [block];
    const groups=new Map();for(const row of block.data.records){const scheme=get(block.data,row,'Scheme Name')||get(block.data,row,'Scheme Code')||'Scheme not provided',folio=get(block.data,row,'Folio Number')||'—',key=JSON.stringify([scheme,folio]);if(!groups.has(key))groups.set(key,{scheme,folio,rows:[]});groups.get(key).rows.push(row);}
    return [...groups.values()].map(group=>({...block,schemeContext:group.scheme+' | Folio: '+group.folio,data:{...block.data,records:group.rows}}));
  });
  for(const block of displayBlocks){
    const d=block.data;currentWbr3Section=d.section||'';const columns=layout(d.category);y+=14;
    const first=d.records[0];
    const firstLines=first?Math.max(...columns.map(c=>wrap(c.value(d,first),c.w-24,18).length)):1;
    const titleHeight=wrap(block.investor||String(block.title||'').split(' | ')[0],width,23,true).length*32;
    const contextHeight=block.schemeContext?wrap(block.schemeContext,width,19,true).length*28+10:0;
    const smallHeight=d.records.length<=8?d.records.reduce((sum,row)=>sum+Math.max(...columns.map(c=>wrap(c.value(d,row),c.w-24,18).length))*24+20,0)+titleHeight+contextHeight+240:0;
    ensure(Math.min(1300,Math.max(smallHeight,titleHeight+contextHeight+150+firstLines*24)));sectionHeader(block,columns);
    const rows=d.records.map((r,index)=>({r,index}));
    if(d.category==='transactions')rows.sort((a,b)=>{const av=get(d,a.r,'Transaction Date'),bv=get(d,b.r,'Transaction Date');return (window.RTA?.date(av)||av).localeCompare(window.RTA?.date(bv)||bv)||a.index-b.index;});
    for(const [displayIndex,{r,index}] of rows.entries()){
      const lines=columns.map(c=>wrap(c.value(d,r),c.w-24,18));let offset=0,max=Math.max(...lines.map(a=>a.length));
      while(offset<max){
        if(y+48>bottom){next();sectionHeader(block,columns,true);}
        const capacity=Math.max(1,Math.floor((bottom-y-20)/24));
        if(offset===0&&max>capacity&&max*24+20<1100){next();sectionHeader(block,columns,true);continue;}
        const count=Math.min(max-offset,capacity),height=count*24+20;ctx.fillStyle=displayIndex%2?'#f3f6fb':'#fff';ctx.fillRect(left,y,width,height);let x=left;
        columns.forEach((c,i)=>{ctx.fillStyle=colors.ink;font(18);ctx.textAlign=c.align;lines[i].slice(offset,offset+count).forEach((v,j)=>ctx.fillText(v,c.align==='right'?x+c.w-12:x+12,y+26+j*24));ctx.strokeStyle=colors.line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+height);ctx.stroke();x+=c.w;});ctx.textAlign='left';
        ctx.strokeStyle=colors.line;ctx.strokeRect(left,y,width,height);y+=height;offset+=count;
        if(offset<max){next();sectionHeader(block,columns,true);}
      }
    }
    const totalField=labels[d.category];
    if(totalField){
      const numbers=d.records.map(r=>number(get(d,r,totalField[0]))).filter(n=>n!==null);
      if(numbers.length){if(y+90>bottom){next();sectionHeader(block,columns,true);}ctx.fillStyle='#eaf0f9';ctx.fillRect(left,y,width,48);ctx.fillStyle=colors.blue;font(18,true);ctx.fillText(totalField[1],left+12,y+31);ctx.textAlign='right';ctx.fillText('INR '+money(numbers.reduce((a,b)=>a+b,0)),left+width-12,y+31);ctx.textAlign='left';y+=78;}
    }
    y+=24;
    paragraph(d.records.length+' record(s) | Data imported: '+date(d.importedAt),{size:16,color:colors.muted,gap:10});
  }
  sheets.push(canvas);
  sheets.forEach((sheet,index)=>{
    const c=sheet.getContext('2d');c.strokeStyle=colors.gold;c.lineWidth=2;c.beginPath();c.moveTo(left,1650);c.lineTo(left+width,1650);c.stroke();
    c.fillStyle=colors.muted;c.font='16px Arial, sans-serif';c.fillText('Banisatya Wealth Pvt Ltd | Private & confidential | All amounts in '+(report.unit||'INR'),left,1684);c.textAlign='right';c.fillText('Page '+(index+1)+' of '+sheets.length,left+width,1684);c.textAlign='left';c.font='14px Arial, sans-serif';c.fillText('Distributor-prepared from imported records. Reconcile with statements issued by the relevant AMC / RTA.',left,1714);
    pages.push(Uint8Array.from(atob(sheet.toDataURL('image/jpeg',0.94).split(',')[1]),char=>char.charCodeAt(0)));
  });
  const chunks=[],offsets=[0];let position=0;
  const enc=new TextEncoder();
  function append(data){const bytes=typeof data==='string'?enc.encode(data):data;chunks.push(bytes);position+=bytes.length;}
  function object(id,body){offsets[id]=position;append(id+' 0 obj\n');append(body);append('\nendobj\n');}
  append('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,'<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
  pages.forEach((jpeg,i)=>{
    const id=3+i*3;
    object(id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im '+(id+1)+' 0 R >> >> /Contents '+(id+2)+' 0 R >>');
    offsets[id+1]=position;append((id+1)+' 0 obj\n<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n');append(jpeg);append('\nendstream\nendobj\n');
    const stream='q 595.28 0 0 841.89 0 0 cm /Im Do Q\n';
    object(id+2,'<< /Length '+enc.encode(stream).length+' >>\nstream\n'+stream+'endstream');
  });
  const xref=position;append('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');
  for(let i=1;i<offsets.length;i++)append(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
  append('trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');
  const result=new Uint8Array(position);let at=0;chunks.forEach(c=>{result.set(c,at);at+=c.length;});return result;
};
