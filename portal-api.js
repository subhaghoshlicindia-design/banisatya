/* Session cookies stay HttpOnly; only the CSRF token is held in memory. */
window.Portal={user:null,csrf:null,state:{revision:0,datasets:{},families:{},master:{clients:{},merges:{},groups:{}}},busy:0};
Portal.request=async function(url,options={}){
  Portal.busy++;
  try{
    const response=await fetch(url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(Portal.csrf?{'X-CSRF-Token':Portal.csrf}:{}),...options.headers}});
    const type=response.headers.get('content-type')||'';
    if(!type.includes('application/json'))throw Object.assign(new Error('The shared server could not respond. Wait a moment, refresh the portal and try again.'),{status:response.status});
    const result=await response.json();
    if(!response.ok){if(response.status===401&&Portal.user){window.location.assign('/');}throw Object.assign(new Error(result.error||'Request failed.'),{status:response.status});}
    return result;
  }finally{Portal.busy--;}
};
Portal.importFiles=async files=>{
  try{
    const result=await Portal.request('/api/imports',{method:'POST',body:JSON.stringify({files,revision:Portal.state.revision})});
    Portal.state=result;return result;
  }catch(error){
    if(error.status===409){Portal.state=await Portal.request('/api/state');window.dispatchEvent(new Event('portal-state'));throw Error('Shared data changed while you were preparing this upload. The latest data is now loaded. Review the file and click Upload again.');}
    throw error;
  }
};
Portal.saveFamilies=async families=>{
  const result=await Portal.request('/api/families',{method:'PUT',body:JSON.stringify({families,revision:Portal.state.revision})});Portal.state=result;return result;
};
Portal.updateMaster=async(action,payload)=>{
  const result=await Portal.request('/api/client-master',{method:'POST',body:JSON.stringify({action,payload,revision:Portal.state.revision})});Portal.state=result;window.dispatchEvent(new Event('portal-state'));return result;
};
Portal.clearData=async()=>{const result=await Portal.request('/api/datasets',{method:'DELETE',body:JSON.stringify({revision:Portal.state.revision})});Portal.state=result;return result;};
Portal.logout=async()=>{try{await Portal.request('/api/logout',{method:'POST',body:'{}'});window.location.assign('/');}catch(e){alert('Sign out failed: '+e.message);}};
(async()=>{
  try{const me=await Portal.request('/api/me');Portal.user=me.user;Portal.csrf=me.csrf;if(!me.user.mustChangePassword)Portal.state=await Portal.request('/api/state');}
  catch(e){if(e.message!=='Please sign in.')console.warn('Session unavailable:',e.message);}
  for(const src of ['wbr3-core.js','rta-core.js','client-master-core.js','app.js','rta-pdf.js','rta-portal.js','account-ui.js','client-master-ui.js','excel-import.js','wbr3-ui.js']){
    await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.body.append(script);});
  }
  Portal.refresh=async()=>{
    if(!Portal.user||Portal.user.mustChangePassword||Portal.busy||document.hidden)return;
    try{const result=await Portal.request('/api/state?afterRevision='+Portal.state.revision);if(Portal.busy)return;if(result.revision>Portal.state.revision){Portal.state=result;window.dispatchEvent(new Event('portal-state'));}}
    catch(e){const banner=document.querySelector('.demo-banner');if(banner)banner.textContent='Shared data could not refresh: '+e.message;}
  };
  if(Portal.user&&!Portal.user.mustChangePassword)setInterval(Portal.refresh,60000);
})();
