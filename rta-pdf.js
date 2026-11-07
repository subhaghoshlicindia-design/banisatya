/* Offline, multipage A4 PDF export. Browser fonts preserve Indian-language names. */
window.RTAPdf = async function (report) {
  const pages=[]; let canvas,ctx,y,page=0;
  function begin(){
    canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;
    ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1240,1754);
    ctx.fillStyle='#132d46';ctx.fillRect(0,0,1240,126);
    ctx.fillStyle='#ffffff';ctx.font='bold 30px sans-serif';ctx.fillText('ARTHA | Mutual Fund Report',64,72);
    ctx.font='18px sans-serif';ctx.fillText('Generated '+report.generated,64,104);y=168;page++;
  }
  function finish(){
    ctx.fillStyle='#526174';ctx.font='17px sans-serif';
    ctx.fillText('Imported RTA data | INR | Verify source statements | Page '+page,64,1700);
    pages.push(Uint8Array.from(atob(canvas.toDataURL('image/jpeg',0.92).split(',')[1]),c=>c.charCodeAt(0)));
  }
  function line(text,bold=false){
    if(y>1640){finish();begin();}
    ctx.fillStyle=bold?'#132d46':'#273548';ctx.font=(bold?'bold ':'')+'21px sans-serif';ctx.fillText(text,64,y);y+=31;
  }
  function write(text,bold=false){
    ctx.font=(bold?'bold ':'')+'21px sans-serif';
    let buffer='';
    for(const char of String(text).replace(/[\r\n\t]+/g,' ')){
      if(ctx.measureText(buffer+char).width>1100){line(buffer,bold);buffer='';ctx.font=(bold?'bold ':'')+'21px sans-serif';}
      buffer+=char;
    }
    line(buffer,bold);
  }
  begin();write(report.title,true);write('Investors: '+report.scope);write('Period: '+report.period);
  write('AUM is an imported snapshot. Date filters do not reconstruct historical AUM.');
  (report.summary||[]).forEach(s=>write(s,true));
  if(report.excluded)write(report.excluded+' undated records excluded by date filters.');
  for(const block of report.blocks){
    if(y>1450){finish();begin();}
    y+=20;write(block.title,true);
    write('Source: '+block.data.filename+' | Imported: '+block.data.importedAt);
    for(let i=0;i<block.data.records.length;i++){
      ctx.font='21px sans-serif';
      const required=43+block.data.headers.reduce((height,h,j)=>{const v=block.data.records[i][j];return height+(v!==''&&v!=null?Math.max(1,Math.ceil(ctx.measureText(h+': '+v).width/1080))*31:0);},0);
      if(required<1400 && y+required>1640){finish();begin();write(block.title+' (continued)',true);}
      write('Record '+(i+1),true);
      block.data.headers.forEach((h,j)=>{const v=block.data.records[i][j];if(v!==''&&v!=null)write(h+': '+v);});
      y+=12;
    }
  }
  finish();
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
