(() => {
 const role=document.querySelector('#employee-login-form')?'employee':'distributor';
 const form=document.getElementById(role+'-login-form'),error=document.getElementById(role+'-login-error'),input=document.getElementById(role+'-password');
 form.onsubmit=async e=>{
   e.preventDefault();if(!form.reportValidity())return;error.textContent='';const button=form.querySelector('[type=submit]');button.disabled=true;
   try{const response=await fetch('/api/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,email:document.getElementById(role+'-email').value,password:input.value})});if(!response.headers.get('content-type')?.includes('application/json'))throw Error('The login server is unavailable. Open https://banisatya-free-4h4y.onrender.com/ and try again.');const result=await response.json();if(!response.ok)throw Error(result.error);window.location.assign('/');}
   catch(e){error.textContent=e.message||'Unable to sign in.';}finally{button.disabled=false;}
 };
 document.querySelector('.password-toggle').onclick=e=>{input.type=input.type==='password'?'text':'password';e.currentTarget.textContent=input.type==='password'?'Show':'Hide';};
 document.getElementById(role+'-forgot-link').onclick=e=>{e.preventDefault();error.textContent=role==='employee'?'Ask your distributor to reset your password.':'The server administrator can reset distributor access using the recovery command documented in SERVER-SETUP.md.';};
})();
