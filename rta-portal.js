/* RTA reporting and explicitly managed investor families. */
(() => {
  'use strict';
  importType.innerHTML = ['Excel','CAMS','KFintech'].map(provider => `<optgroup label="${provider}">${Object.entries(SOURCES).filter(([c]) => RTA.providerFor(c)===provider).map(([c,s])=>`<option value="${c}">${c} - ${s.label}</option>`).join('')}</optgroup>`).join('');
  const original = document.querySelector('.statement-builder');
  original.hidden = true;
  document.querySelector('.other-reports')?.setAttribute('hidden','');
  const panel=document.createElement('section');
  panel.className='rta-report-builder';
  panel.innerHTML=`<h3>Investor, family and group reports</h3>
    <p>Select an individual client, saved family or saved group. Reports use imported records and saved client profiles.</p>
    <div class="rta-controls">
      <label>Scope<select id="rta-scope"><option value="investor">Individual investor</option><option value="family">Saved family</option><option value="group">Saved group</option></select></label>
      <label>Client / family / group<select id="rta-person"></select></label>
      <label>Report<select id="rta-kind"><option value="all">Complete portfolio</option>${Object.entries(CATEGORY_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>From date<input type="date" id="rta-from"></label><label>To date<input type="date" id="rta-to"></label>
    </div>
    <p>AUM shows the imported snapshot, not historical valuation. Dates filter transactions; SIP and brokerage rows require dates or periods when a filter is selected.</p>
    <button type="button" id="rta-preview-button">Generate report</button> <button type="button" id="rta-download" disabled>Download PDF</button>
    <p id="rta-status" role="status"></p><div id="rta-preview"></div>
    <details><summary>Manage investor families</summary><label>Family name<input id="rta-family-name" maxlength="80" placeholder="e.g. Mahanti family"></label>
    <div id="rta-family-members" class="rta-members"></div><button type="button" id="rta-save-family">Save family</button> <button type="button" id="rta-delete-family">Delete selected family</button><p>Choose a saved family above to edit its membership. No relationship is inferred from investor names.</p></details>`;
  original.before(panel);
  document.querySelector('#reports-section .report-heading p').textContent='Generate and download investor, family or group reports as PDF.';
  const $=id=>document.getElementById(id);
  const familyKey='artha.rta-families.v1';
  let report=null;
  function families(){return structuredClone(Portal.state.families);}
  function entries(){return Object.entries(datasets).filter(([code])=>code!=='WBR3').map(([sourceCode,data])=>({sourceCode,data:RTA.normalize({...data,category:sourceCategory(sourceCode),provider:RTA.providerFor(sourceCode)})}));}
  let catalogueInputs=[],catalogueCache=null,catalogueMaster=null;
  function catalogue(){
    const inputs=Object.entries(datasets),master=Portal.state.master||null;
    if(catalogueCache&&catalogueMaster===master&&inputs.length===catalogueInputs.length&&inputs.every(([code,data],i)=>code===catalogueInputs[i][0]&&data===catalogueInputs[i][1]))return catalogueCache;
    catalogueInputs=inputs;catalogueMaster=master;catalogueCache=ClientMaster.catalogue(entries(),master||ClientMaster.empty());return catalogueCache;
  }
  Portal.catalogue=catalogue;

  employeeAllocation=()=>{const values=new Map();categoryEntries('holdings').forEach(({data})=>data.records.forEach(r=>{const name=valueFor(r,data.headers,columnAliases.scheme),amount=parseAmount(valueFor(r,data.headers,columnAliases.currentValue));if(name&&amount>0)values.set(name,(values.get(name)||0)+amount);}));return Array.from(values,([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);};
  employeeClientCount=()=>String(catalogue().people.length);
  // Keep the existing dashboard client chart aligned with PAN/folio identification.
  statementClients=()=>catalogue().people.map(p=>({...p,folios:[]}));
  clientIdentity=(row,data)=>{const one=RTA.normalize({...data,records:[row],provider:data.provider||RTA.providerFor(data.sourceCode||'')});return catalogue().identity(one,one.records[0]);};
  function invalidate(){ report=null; $('rta-download').disabled=true; $('rta-preview').innerHTML=''; $('rta-status').textContent='Generate a report to use the current selection.'; }
  function refresh(){
    const previous=$('rta-person').value, cat=catalogue(), saved=families();
    const scope=$('rta-scope').value,choices=scope==='family'?Object.entries(saved).map(([key,f])=>({key,label:f.name})):scope==='group'?Object.entries(Portal.state.master?.groups||{}).map(([key,g])=>({key,label:g.name})):cat.people;
    $('rta-person').innerHTML='<option value="">Choose...</option>'+choices.map(p=>`<option value="${escapeHTML(p.key)}">${escapeHTML(p.label)}</option>`).join('');
    if(choices.some(p=>p.key===previous))$('rta-person').value=previous;
    $('rta-family-members').innerHTML=cat.people.map(p=>`<label><input type="checkbox" value="${escapeHTML(p.key)}">${escapeHTML(p.label)}</label>`).join('');
    invalidate();
  }
  function selectFamily(){
    const f=$('rta-scope').value==='family'?families()[$('rta-person').value]:null;
    $('rta-family-name').value=f?f.name:'';
    $('rta-family-members').querySelectorAll('input').forEach(i=>i.checked=Boolean(f&&f.members.some(k=>ClientMaster.resolve(k,Portal.state.master)===i.value)));
    invalidate();
  }
  function generate(){
    const cat=catalogue(),scope=$('rta-scope').value,isFamily=scope==='family',selected=$('rta-person').value;
    const family=isFamily?families()[selected]:scope==='group'?Portal.state.master?.groups?.[selected]:null;
    const members=ClientMaster.selection(scope,selected,cat,families(),Portal.state.master||ClientMaster.empty());
    const from=$('rta-from').value,to=$('rta-to').value,kind=$('rta-kind').value;
    if(from&&to&&from>to)throw Error('From date must be before the to date.');
    const blocks=[]; let excluded=0;
    for(const person of members){
      for(const {sourceCode,data} of cat.list){
        if(kind!=='all'&&data.category!==kind)continue;
        const rows=data.records.filter(row=>{
          if(cat.identity(data,row)!==person.key)return false;
          if(!from&&!to || ['clients','holdings'].includes(data.category))return true;
          const dates=['Transaction Date',...(data.category==='sips'?['Start Date']:['Period To'])].map(n=>RTA.date(RTA.value(data,row,n))).filter(Boolean);
          const date=dates[0];
          if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)){excluded++;return false;}
          return (!from||date>=from)&&(!to||date<=to);
        });
        if(rows.length)blocks.push({investor:person.label,investorName:person.name,title:person.label+' | '+CATEGORY_LABELS[data.category]+' | '+sourceCode,data:{...data,records:rows}});
      }
    }
    const summary=Object.entries({holdings:'Current Value',transactions:'Amount',sips:'SIP Amount',brokerage:'Brokerage Amount'}).flatMap(([category,field])=>{
      const selected=blocks.filter(b=>b.data.category===category);
      return selected.length ? [CATEGORY_LABELS[category]+': INR '+selected.reduce((total,b)=>total+b.data.records.reduce((sum,r)=>sum+(parseAmount(RTA.value(b.data,r,field))||0),0),0).toLocaleString('en-IN',{maximumFractionDigits:2})] : [];
    });
    const title=(family?family.name:members[0].name)+' - '+$('rta-kind').selectedOptions[0].text;
    report={title,reportName:family?family.name:members[0].name,scopeType:scope,members:members.map(p=>({name:p.name,label:p.label})),generated:new Date().toLocaleString('en-IN'),scope:members.map(p=>p.label).join('; '),period:`${from||'Beginning'} to ${to||'Latest'}`,blocks,excluded,summary};
    $('rta-preview').innerHTML=`<h3>${escapeHTML(title)}</h3><p>${escapeHTML(report.scope)}</p><p>${escapeHTML(report.period)}</p><p>${summary.map(escapeHTML).join(' | ')}</p>`+blocks.map(b=>statementTable(b.title,b.data)).join('');
    $('rta-status').textContent=`${blocks.reduce((s,b)=>s+b.data.records.length,0)} records; ${excluded} undated records excluded by date filter. AUM is the latest imported snapshot. ${blocks.length?'':'No matching data.'}`;
    $('rta-download').disabled=!blocks.length||(Portal.user?.role==='employee'&&blocks.some(b=>!Portal.state.permissions?.[b.data.category]?.download));
  }
  $('rta-preview-button').onclick=()=>{invalidate();try{generate();}catch(e){$('rta-status').textContent=e.message;}};
  $('rta-save-family').onclick=async()=>{
    const name=$('rta-family-name').value.trim(),members=Array.from($('rta-family-members').querySelectorAll('input:checked'),i=>i.value);
    if(!name||!members.length){showToast('Enter a family name and select at least one member.');return;}
    const saved=families(); const id=$('rta-scope').value==='family'&&saved[$('rta-person').value]?$('rta-person').value:('family-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
    saved[id]={name,members};
    try{await Portal.saveFamilies(saved);$('rta-scope').value='family';refresh();$('rta-person').value=id;selectFamily();showToast('Family saved.');}catch(e){showToast('Family could not be saved: '+e.message);}
  };
  $('rta-delete-family').onclick=async()=>{
    const id=$('rta-person').value,saved=families();if($('rta-scope').value!=='family'||!saved[id])return;
    if(!confirm('Delete this family group? Investor data will be preserved.'))return;
    delete saved[id];try{await Portal.saveFamilies(saved);refresh();}catch(e){showToast(e.message);}
  };
  $('rta-scope').onchange=()=>{refresh();selectFamily();};$('rta-person').onchange=selectFamily;
  ['rta-kind','rta-from','rta-to'].forEach(id=>$(id).onchange=invalidate);
  const oldRefresh=refreshStatementClientList;
  refreshStatementClientList=()=>{oldRefresh();refresh();};
  window.addEventListener('portal-state',refresh);
  if(Portal.user?.role!=='distributor')panel.querySelector('details').hidden=true;
  // A small offline PDF writer uses browser-rendered pages, preserving Unicode investor names.
  // Each page is a JPEG XObject inside a standards-based PDF; no CDN dependency is needed.
  async function download(){
    if(!report)return;
    const saved=report; $('rta-download').disabled=true;
    try{
      await Portal.request('/api/reports/authorize-download',{method:'POST',body:JSON.stringify({categories:[...new Set(saved.blocks.map(b=>b.data.category))]})});
      const pdf=await window.RTAPdf(saved);
      const url=URL.createObjectURL(new Blob([pdf],{type:'application/pdf'}));
      const link=document.createElement('a');link.href=url;link.download=saved.title.replace(/[^a-z0-9 -]/gi,'').slice(0,90)+'.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    }catch(e){$('rta-status').textContent='PDF download failed: '+e.message;}finally{$('rta-download').disabled=!report;}
  }
  $('rta-download').onclick=download;
  if(Portal.user?.role==='employee')for(const option of $('rta-kind').options)if(option.value!=='all'&&!Portal.state.permissions?.[option.value]?.view)option.remove();
  refresh();renderRecords();renderEmployeeDashboard();
})();
