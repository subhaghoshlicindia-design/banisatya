/* Separate distributor AUM summary; never used to infer investor holdings. */
(() => {
 'use strict';
 if(!Portal.user||Portal.user.mustChangePassword)return;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const panel=document.createElement('section');panel.className='wbr3-summary';panel.innerHTML='<h3>CAMS WBR3 Sales and AUM summary</h3><p>Scheme-level AUM and asset aging, in lakhs of INR. This report has no investor folios and is kept separate from investor and family statements.</p><div id="wbr3-content"></div><button type="button" id="wbr3-download" disabled>Download WBR3 AUM summary PDF</button><p id="wbr3-status" role="status"></p>';
 document.getElementById('reports-section').append(panel);
 const content=document.getElementById('wbr3-content'),button=document.getElementById('wbr3-download'),status=document.getElementById('wbr3-status');
 const canView=()=>Portal.user.role==='distributor'||Portal.state.permissions?.holdings?.view;
 const canDownload=()=>Portal.user.role==='distributor'||Portal.state.permissions?.holdings?.download;
 function tables(data){return [...new Set(data.records.map(r=>r[0]))].map(section=>{
  const indexes=section==='Scheme AUM'?[2,3,4,5,6,7,14]:[2,3,8,9,10,11,12,13,4,14];
  const rows=data.records.filter(r=>r[0]===section);
  return `<h4>${escape(section)} · ${escape(rows[0][1])}</h4><div class="wbr3-table-scroll"><table><thead><tr>${indexes.map(i=>`<th>${escape(data.headers[i])}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr class="${row[14]==='Detail'?'':'wbr3-total'}">${indexes.map(i=>`<td>${escape(row[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 }).join('');}
 WBR3.tables=tables;
 function render(){
  panel.hidden=!canView();if(panel.hidden)return;
  const data=Portal.state.datasets.WBR3;button.disabled=!data||!canDownload();
  if(!data){content.innerHTML='<p>No WBR3 AUM summary has been uploaded. The distributor can select Import CAMS WBR3 Sales and AUM in the upload section.</p>';return;}
  try{const s=WBR3.summary(data);content.innerHTML=`<p><strong>AUM: ${escape(s.lakhs.toFixed(2))} lakh INR (${escape(new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(s.rupees))}) · ${s.accounts} live accounts</strong></p><p>Source AUM date: ${escape(s.asOf)} · Last NAV: ${escape(s.navDate)} · Report date: ${escape(s.reportDate)}</p><p>Source: ${escape(data.filename)} · Saved: ${escape(new Date(data.importedAt).toLocaleString('en-IN'))}</p>${s.warnings.map(w=>`<p class="import-status error">${escape(w)}</p>`).join('')}${tables(data)}`;}
  catch(e){button.disabled=true;content.textContent='Saved WBR3 report could not be validated: '+e.message;}
 }
 button.onclick=async()=>{
  button.disabled=true;status.textContent='Preparing WBR3 summary PDF…';
  try{
   const data=Portal.state.datasets.WBR3;if(!data||!canView()||!canDownload())throw Error('AUM view and download permission is required.');
   const s=WBR3.summary(data);
   await Portal.request('/api/reports/authorize-download',{method:'POST',body:JSON.stringify({categories:['holdings']})});
   const blocks=[...new Set(data.records.map(r=>r[0]))].map(section=>({title:section,schemeContext:'As of '+data.records.find(r=>r[0]===section)[1]+' | Amounts in lakhs of INR',data:{...data,section,records:data.records.filter(r=>r[0]===section)}}));
   const report={title:'CAMS WBR3 - Sales and AUM summary',statementLabel:'DISTRIBUTOR AUM SUMMARY',unit:'lakhs of INR',generated:new Date().toLocaleString('en-IN'),scope:'Scheme and segment summary - no investor or folio allocation',period:`Source AUM: ${s.asOf} | Last NAV: ${s.navDate} | Source report: ${s.reportDate}`,summary:[`Total AUM: ${s.lakhs.toFixed(2)} lakh INR | Live accounts: ${s.accounts}`,'Totals and subtotals are reproduced; do not add them to detail rows.',...s.warnings],blocks};
   const pdf=await window.RTAPdf(report),url=URL.createObjectURL(new Blob([pdf],{type:'application/pdf'})),link=document.createElement('a');link.href=url;link.download='Banisatya-WBR3-AUM-summary.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status.textContent='WBR3 summary PDF downloaded.';
  }catch(e){status.textContent='Download failed: '+e.message;}finally{button.disabled=!Portal.state.datasets.WBR3||!canDownload();}
 };
 for(const key of ['importFiles','clearData']){const original=Portal[key];Portal[key]=async(...args)=>{const result=await original(...args);render();return result;};}
 window.addEventListener('portal-state',render);render();
})();
