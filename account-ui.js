(() => {
 if(!Portal.user)return;
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const distributor=Portal.user.role==='distributor';
 const panel=document.createElement('section');panel.className='panel account-panel';panel.hidden=true;
 panel.innerHTML=`<h2>Your account</h2><p>${escape(Portal.user.name)} · ${escape(Portal.user.email)} · ${escape(Portal.user.role)}</p><button type="button" id="account-password">Change password</button> <button type="button" id="account-logout">Sign out</button>
 ${distributor?`<h2>Employee access</h2><p>Create an employee account with a temporary password. Give it to the employee securely; they must change it before accessing reports.</p><form id="create-employee"><label>Name<input name="name" required maxlength="100" autocomplete="name"></label><label>Email<input name="email" type="email" required autocomplete="off"></label><label>Temporary password<input name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><button type="submit">Create employee</button></form><p id="employee-status" role="status"></p><div id="employee-list"></div><h2>Existing browser imports</h2><p>If you used this browser before the database was added, migrate its reports once. Review the selected workspace before proceeding.</p><button id="migrate-local" type="button">Migrate this browser's reports</button>`:''}`;
 document.querySelector('.dashboard-content').append(panel);
 const dialog=document.createElement('dialog');dialog.className='account-dialog';
 dialog.innerHTML=`<h2>Change your password</h2><p>Use 12–128 characters. Changing your password signs out your other devices.</p><form id="change-password"><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>New password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><button type="submit">Save password</button> <button type="button" id="password-cancel">Cancel</button> <button type="button" id="password-logout">Sign out</button><p id="password-status" role="status"></p></form>`;
 document.body.append(dialog);
 const change=document.getElementById('change-password');
 const openPassword=()=>{change.reset();document.getElementById('password-status').textContent='';document.getElementById('password-cancel').hidden=Portal.user.mustChangePassword;dialog.showModal();};
 document.getElementById('account-password').onclick=openPassword;document.getElementById('account-logout').onclick=Portal.logout;
 document.getElementById('password-logout').onclick=Portal.logout;
 document.getElementById('password-cancel').onclick=()=>dialog.close();
 dialog.addEventListener('cancel',e=>{if(Portal.user.mustChangePassword)e.preventDefault();});
 change.onsubmit=async event=>{
  event.preventDefault();const button=change.querySelector('[type=submit]');button.disabled=true;
  try{const result=await Portal.request('/api/password',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(change)))});Portal.user=result.user;Portal.csrf=result.csrf;location.reload();}
  catch(e){document.getElementById('password-status').textContent=e.message;}finally{button.disabled=false;}
 };
 async function employees(){
  if(!distributor)return;
  try{const result=await Portal.request('/api/users');const target=document.getElementById('employee-list');target.innerHTML=result.users.filter(u=>u.role==='employee').map(u=>`<article class="employee-account"><strong>${escape(u.name)}</strong><span>${escape(u.email)} · ${u.active?'Active':'Disabled'}${u.must_change?' · Password change required':''}</span><button type="button" data-toggle="${escape(u.id)}" data-active="${u.active}">${u.active?'Disable':'Enable'}</button> <button type="button" data-reset="${escape(u.id)}">Reset password</button></article>`).join('')||'<p>No employees yet.</p>';
   target.querySelectorAll('[data-toggle]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await Portal.request('/api/users/'+button.dataset.toggle,{method:'PATCH',body:JSON.stringify({active:button.dataset.active!=='1'})});await employees();}catch(e){document.getElementById('employee-status').textContent=e.message;button.disabled=false;}});
   target.querySelectorAll('[data-reset]').forEach(button=>button.onclick=()=>{resetDialog.dataset.user=button.dataset.reset;resetForm.reset();resetDialog.showModal();});
  }catch(e){document.getElementById('employee-status').textContent=e.message;}
 }
 let resetDialog,resetForm;
 if(distributor){
  resetDialog=document.createElement('dialog');resetDialog.className='account-dialog';resetDialog.innerHTML='<h2>Reset employee password</h2><p>This signs out all sessions for this employee.</p><form id="reset-employee"><label>New temporary password<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><button type="submit">Reset password</button> <button type="button" id="reset-cancel">Cancel</button><p id="reset-status" role="status"></p></form>';document.body.append(resetDialog);resetForm=document.getElementById('reset-employee');document.getElementById('reset-cancel').onclick=()=>resetDialog.close();
  resetForm.onsubmit=async e=>{e.preventDefault();try{await Portal.request('/api/users/'+resetDialog.dataset.user,{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(resetForm)))});resetDialog.close();await employees();}catch(e){document.getElementById('reset-status').textContent=e.message;}};
  const form=document.getElementById('create-employee');form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await Portal.request('/api/users',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});form.reset();document.getElementById('employee-status').textContent='Employee created. Share their temporary password securely.';await employees();}catch(e){document.getElementById('employee-status').textContent=e.message;}finally{button.disabled=false;}};
  document.getElementById('migrate-local').onclick=async()=>{
   try{const saved=JSON.parse(localStorage.getItem('artha.portfolio-data.v3')||'{}');const files=Object.entries(saved).map(([code,data])=>({code,data}));if(!files.length)throw Error('No old browser imports were found.');if(!confirm('Import the old reports from this browser into the signed-in shared workspace?'))return;await Portal.importFiles(files);window.dispatchEvent(new Event('portal-state'));showToast('Browser reports migrated. Original local data was preserved.');}
   catch(e){showToast(e.message);}
  };
 }
 const accountLink=document.createElement('button');accountLink.type='button';accountLink.textContent='Account and password';accountLink.onclick=()=>{document.getElementById('wealth-account-menu').hidden=true;setView('Settings');};document.getElementById('wealth-account-menu').append(accountLink);
 const base=setView;setView=view=>{base(view);panel.hidden=activeView!=='Settings';if(!panel.hidden)employees();};
 document.querySelector('#top-profile').addEventListener('click',()=>setView('Settings'));
 document.querySelector('#profile-button').addEventListener('click',()=>setView('Settings'));
 if(Portal.user.mustChangePassword)openPassword();
})();
