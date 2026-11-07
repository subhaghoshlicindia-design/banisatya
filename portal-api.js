/* Session cookies stay HttpOnly; only the CSRF token is held in memory. */
window.Portal={user:null,csrf:null,state:{revision:0,datasets:{},families:{}},busy:0};
Portal.request=async function(url,options={}){
  Portal.busy++;
  try{
    const response=await fetch(url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(Portal.csrf?{'X-CSRF-Token':Portal.csrf}:{}),...options.headers}});
    const result=await response.json();
    if(!response.ok){if(response.status===401&&Portal.user){window.location.assign('/');}throw new Error(result.error||'Request failed.');}
    return result;
  }finally{Portal.busy--;}
};
Portal.importFiles=async files=>{
  const result=await Portal.request('/api/imports',{method:'POST',body:JSON.stringify({files,revision:Portal.state.revision})});
  Portal.state=result;return result;
};
Portal.saveFamilies=async families=>{
  const result=await Portal.request('/api/families',{method:'PUT',body:JSON.stringify({families,revision:Portal.state.revision})});Portal.state=result;return result;
};
Portal.clearData=async()=>{const result=await Portal.request('/api/datasets',{method:'DELETE',body:JSON.stringify({revision:Portal.state.revision})});Portal.state=result;return result;};
Portal.logout=async()=>{try{await Portal.request('/api/logout',{method:'POST',body:'{}'});window.location.assign('/');}catch(e){alert('Sign out failed: '+e.message);}};
(async()=>{
  try{const me=await Portal.request('/api/me');Portal.user=me.user;Portal.csrf=me.csrf;if(!me.user.mustChangePassword)Portal.state=await Portal.request('/api/state');}
  catch(e){if(e.message!=='Please sign in.')console.warn('Session unavailable:',e.message);}
  for(const src of ['rta-core.js','app.js','rta-pdf.js','rta-portal.js','account-ui.js']){
    await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.body.append(script);});
  }
  if(Portal.user&&!Portal.user.mustChangePassword)setInterval(async()=>{
    if(Portal.busy||document.hidden)return;
    try{const result=await Portal.request('/api/state');if(Portal.busy)return;if(result.revision>Portal.state.revision){Portal.state=result;window.dispatchEvent(new Event('portal-state'));}}
    catch(e){const banner=document.querySelector('.demo-banner');if(banner)banner.textContent='Shared data could not refresh: '+e.message;}
  },15000);
})();
