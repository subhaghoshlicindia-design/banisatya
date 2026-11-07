const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPortal}=require('./server.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('authenticated shared workspace, permissions, duplicate imports, revocation and persistence',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'artha-test-')),database=path.join(directory,'test.sqlite');
 let app=createPortal({database,setupToken:'test-bootstrap-token'});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));let origin='http://127.0.0.1:'+app.server.address().port;
 async function call(route,{method='GET',body,cookie,csrf,requestOrigin=origin}={}){
  const res=await fetch(origin+route,{method,headers:{Origin:requestOrigin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:res.status,json:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0],headers:res.headers};
 }
 try{
  assert.equal((await call('/api/state')).status,401);
  assert.deepEqual((await call('/api/health')).json,{ok:true});
  assert.equal((await call('/api/setup',{method:'POST',body:{token:'wrong'}})).status,403);
  const admin={email:'distributor@example.test',name:'Distributor Test',password:'A-long-test-password!'};
  assert.equal((await call('/api/setup',{method:'POST',body:{...admin,token:'test-bootstrap-token'}})).status,201);
  assert.equal((await call('/api/setup',{method:'POST',body:{...admin,token:'test-bootstrap-token'}})).status,409);
  assert.equal((await call('/api/login',{method:'POST',body:{...admin,role:'employee'}})).status,401);
  let login=await call('/api/login',{method:'POST',body:{...admin,role:'distributor'}});
  assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  const auth={cookie:login.cookie,csrf:login.json.csrf};
  assert.equal((await call('/api/users',{...auth,method:'POST',body:{name:'E',email:'employee@example.test',password:'Temporary-pass-123'}})).status,201);
  const elogin=await call('/api/login',{method:'POST',body:{email:'employee@example.test',password:'Temporary-pass-123',role:'employee'}});assert.equal(elogin.status,200);
  const eauth={cookie:elogin.cookie,csrf:elogin.json.csrf};assert.equal((await call('/api/state',eauth)).status,403);
  const change=await call('/api/password',{...eauth,method:'POST',body:{currentPassword:'Temporary-pass-123',password:'Changed-employee-123!'}});assert.equal(change.status,200);
  assert.equal((await call('/api/state',eauth)).status,401);
  const employee={cookie:change.cookie,csrf:change.json.csrf};assert.equal((await call('/api/state',employee)).status,200);
  const data={headers:['Investor Name','PAN','AMC','Folio Number','Scheme Name','Transaction ID','Transaction Date','Amount'],records:[['Investor','ABCDE1234F','A','01','Growth','T1','2026-11-01','1000']],filename:'WBR2.csv'};
  const files=[{code:'WBR2',data}];
  assert.equal((await call('/api/imports',{...employee,method:'POST',body:{files,revision:0}})).status,403);
  assert.equal((await call('/api/imports',{cookie:auth.cookie,method:'POST',body:{files,revision:0}})).status,403);
  assert.equal((await call('/api/imports',{...auth,requestOrigin:'https://attacker.test',method:'POST',body:{files,revision:0}})).status,403);
  let imported=await call('/api/imports',{...auth,method:'POST',body:{files,revision:0}});assert.equal(imported.status,200);assert.equal(imported.json.revision,1);
  assert.equal((await call('/api/state',employee)).json.datasets.WBR2.records.length,1);
  assert.equal((await call('/api/imports',{...auth,method:'POST',body:{files,revision:0}})).status,409);
  imported=await call('/api/imports',{...auth,method:'POST',body:{files,revision:1}});assert.equal(imported.json.summaries[0].duplicates,1);
  const bad=structuredClone(data);bad.records[0][7]='bad';assert.equal((await call('/api/imports',{...auth,method:'POST',body:{files:[...files,{code:'WBR2',data:bad}],revision:2}})).status,400);assert.equal((await call('/api/state',auth)).json.revision,2);
  const families={'family-test':{name:'Test Family',members:['pan:ABCDE1234F']}};
  assert.equal((await call('/api/families',{...employee,method:'PUT',body:{families,revision:2}})).status,403);
  assert.equal((await call('/api/families',{...auth,method:'PUT',body:{families,revision:2}})).status,200);
  assert.equal((await call('/api/state',employee)).json.families['family-test'].name,'Test Family');
  for(const url of ['/data/portal.sqlite','/server.cjs','/.env','/test-server.cjs'])assert.equal((await call(url)).status,404);
  const users=await call('/api/users',auth),id=users.json.users.find(u=>u.role==='employee').id;
  assert.equal((await call('/api/users/'+id,{...auth,method:'PATCH',body:{password:'Reset-employee-123!'}})).status,200);
  assert.equal((await call('/api/state',employee)).status,401);
  const resetLogin=await call('/api/login',{method:'POST',body:{email:'employee@example.test',password:'Reset-employee-123!',role:'employee'}});
  assert.equal(resetLogin.status,200);assert.equal(resetLogin.json.user.mustChangePassword,true);
  assert.equal((await call('/api/state',{cookie:resetLogin.cookie})).status,403);
  assert.equal((await call('/api/users/'+id,{...auth,method:'PATCH',body:{active:false}})).status,200);
  assert.equal((await call('/api/state',employee)).status,401);
  await new Promise(r=>app.server.close(r));app=createPortal({database});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+app.server.address().port;
  login=await call('/api/login',{method:'POST',body:{...admin,role:'distributor'}});assert.equal(login.status,200);
  const persisted=await call('/api/state',{cookie:login.cookie});assert.equal(persisted.json.datasets.WBR2.records.length,1);assert.equal(persisted.json.families['family-test'].name,'Test Family');
  assert.equal((await call('/api/logout',{cookie:login.cookie,csrf:login.json.csrf,method:'POST',body:{}})).status,200);
  assert.equal((await call('/api/state',{cookie:login.cookie})).status,401);
 }finally{await new Promise(r=>app.server.close(r));fs.rmSync(directory,{recursive:true,force:true});}
});
test('production requires HTTPS origin',()=>{assert.throws(()=>createPortal({production:true,origin:'http://insecure.example.test',database:':memory:'}),/HTTPS/);});
test('Render provides the default production origin without a custom domain',()=>{
 const previous={origin:process.env.PORTAL_ORIGIN,render:process.env.RENDER_EXTERNAL_URL};
 try{
  delete process.env.PORTAL_ORIGIN;process.env.RENDER_EXTERNAL_URL='https://artha-test.onrender.com';
  const app=createPortal({production:true,database:':memory:'});app.db.close();
 }finally{
  if(previous.origin===undefined)delete process.env.PORTAL_ORIGIN;else process.env.PORTAL_ORIGIN=previous.origin;
  if(previous.render===undefined)delete process.env.RENDER_EXTERNAL_URL;else process.env.RENDER_EXTERNAL_URL=previous.render;
 }
});
test('production origin validation and persistent database readiness',async()=>{
 assert.throws(()=>createPortal({origin:'https://example.test/path',database:':memory:'}),/bare origin/);
 const app=createPortal({production:true,origin:'https://portal.example.test/',database:':memory:',setupToken:'production-test-token'});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try{
  const headers={Origin:'https://portal.example.test','Content-Type':'application/json'};
  assert.equal((await fetch(base+'/api/health')).status,200);
  assert.equal((await fetch(base+'/api/state')).status,401);
  assert.equal((await fetch(base+'/api/setup',{method:'POST',headers,body:JSON.stringify({token:'production-test-token',email:'production@example.test',name:'Production Test',password:'Production-password-123!'})})).status,201);
  const login=await fetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({email:'production@example.test',password:'Production-password-123!',role:'distributor'})});
  assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/__Host-artha-session=.*; Secure$/);
  assert.match(login.headers.get('strict-transport-security'),/max-age/);
 }finally{await new Promise(r=>app.server.close(r));}
});
test('login throttling persists and malformed requests fail closed',async()=>{
 const app=createPortal({database:':memory:'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
 try{
  const headers={Origin:origin,'Content-Type':'application/json'};
  assert.equal((await fetch(origin+'/api/login',{method:'POST',headers,body:'null'})).status,400);
  for(let i=0;i<10;i++)assert.equal((await fetch(origin+'/api/login',{method:'POST',headers,body:JSON.stringify({email:'missing@example.test',password:'bad',role:'employee'})})).status,401);
  assert.equal((await fetch(origin+'/api/login',{method:'POST',headers,body:JSON.stringify({email:'missing@example.test',password:'bad',role:'employee'})})).status,429);
 }finally{await new Promise(r=>app.server.close(r));}
});
