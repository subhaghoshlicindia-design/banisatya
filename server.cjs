'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const {DatabaseSync}=require('node:sqlite');
const RTA=require('./rta-core.js');
const scrypt=promisify(crypto.scrypt);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const random=()=>crypto.randomBytes(32).toString('base64url');
const codes={clients:['WBR9','MFSD211','MFSD311'],transactions:['WBR2','WBR2A','MFSD201','MFSD307'],holdings:['WBR22','MFSD203','MFSD310'],sips:['WBR49','MFSD243','MFSD313','MFSD230'],brokerage:['WBR6','WBR77','MFSD205','MFSD208']};
const categories=Object.fromEntries(Object.entries(codes).flatMap(([category,list])=>list.map(code=>[code,category])));
function fail(status,message){const e=new Error(message);e.status=status;throw e;}
function email(value){const s=String(value||'').trim().toLowerCase();if(s.length>254||!/^\S+@\S+\.\S+$/.test(s))fail(400,'Enter a valid email address.');return s;}
function password(value){if(typeof value!=='string'||value.length<12||value.length>128)fail(400,'Use a password between 12 and 128 characters.');return value;}
async function passwordHash(value){const salt=random();const derived=await scrypt(password(value),salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return salt+':'+derived.toString('hex');}
async function verify(value,stored){if(typeof value!=='string'||value.length>128)return false;const [salt,key]=stored.split(':');const derived=await scrypt(value,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return crypto.timingSafeEqual(derived,Buffer.from(key,'hex'));}
function createPortal(options={}){
 const production=options.production??process.env.NODE_ENV==='production';
 const rawOrigin=options.origin||process.env.PORTAL_ORIGIN||(production?process.env.RENDER_EXTERNAL_URL:undefined);
 let configuredOrigin;
 if(rawOrigin){const parsed=new URL(rawOrigin);if(parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error('PORTAL_ORIGIN must be a bare origin without credentials, path or query.');configuredOrigin=parsed.origin;}
 if(production&&(!configuredOrigin||new URL(configuredOrigin).protocol!=='https:'))throw Error('Production requires an HTTPS PORTAL_ORIGIN or RENDER_EXTERNAL_URL.');
 const dataFile=options.database||process.env.DATABASE_PATH||path.join(__dirname,'data','portal.sqlite');
 if(dataFile!==':memory:')fs.mkdirSync(path.dirname(path.resolve(dataFile)),{recursive:true});
 const db=new DatabaseSync(dataFile);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS workspaces(id INTEGER PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, workspace_id INTEGER NOT NULL REFERENCES workspaces(id), email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('distributor','employee')), password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS datasets(workspace_id INTEGER NOT NULL REFERENCES workspaces(id), code TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(workspace_id,code));
 CREATE TABLE IF NOT EXISTS families(workspace_id INTEGER NOT NULL REFERENCES workspaces(id), id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(workspace_id,id));
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);`);
 const setupToken=options.setupToken||process.env.SETUP_TOKEN||random();
 const cookieName=production?'__Host-artha-session':'artha-session';
 const statement=(sql,...args)=>db.prepare(sql).get(...args);
 function publicUser(u){return {id:u.id,name:u.name,email:u.email,role:u.role,mustChangePassword:Boolean(u.must_change)};}
 function state(workspace){return {revision:statement('SELECT revision FROM workspaces WHERE id=?',workspace).revision,datasets:Object.fromEntries(db.prepare('SELECT code,data FROM datasets WHERE workspace_id=?').all(workspace).map(x=>[x.code,JSON.parse(x.data)])),families:Object.fromEntries(db.prepare('SELECT id,data FROM families WHERE workspace_id=?').all(workspace).map(x=>[x.id,JSON.parse(x.data)]))};}
 function audit(u,action,detail={}){db.prepare('INSERT INTO audit(workspace_id,user_id,action,detail,created_at) VALUES(?,?,?,?,?)').run(u.workspace_id,u.id,action,JSON.stringify(detail),new Date().toISOString());}
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
 function revision(u,expected){if(!Number.isSafeInteger(expected)||statement('SELECT revision FROM workspaces WHERE id=?',u.workspace_id).revision!==expected)fail(409,'Shared data changed on another device. Refresh and try again.');}
 function increment(u){db.prepare('UPDATE workspaces SET revision=revision+1 WHERE id=?').run(u.workspace_id);}
 function writeDatasets(u,next){db.prepare('DELETE FROM datasets WHERE workspace_id=?').run(u.workspace_id);const insert=db.prepare('INSERT INTO datasets(workspace_id,code,data) VALUES(?,?,?)');for(const [code,data] of Object.entries(next))insert.run(u.workspace_id,code,JSON.stringify(data));increment(u);}
 function rate(key,max){const now=Date.now();const a=statement('SELECT * FROM attempts WHERE key=?',key);if(a&&a.until>now&&a.count>=max)fail(429,'Too many attempts. Try again in 15 minutes.');db.prepare('INSERT INTO attempts(key,count,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN until<? THEN 1 ELSE count+1 END, until=CASE WHEN until<? THEN excluded.until ELSE until END').run(key,now+900000,now,now);}
 async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>25*1024*1024)fail(413,'Request exceeds 25 MB. Split the upload.');chunks.push(chunk);}try{const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail(400,'JSON object required.');return parsed;}catch{fail(400,'Invalid JSON request.');}}
 function authenticate(req){const cookies=String(req.headers.cookie||'').split(';').map(c=>c.trim().split('='));const token=cookies.find(([n])=>n===cookieName)?.[1];const s=token&&statement('SELECT sessions.*,users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires>? AND active=1',hash(token),Date.now());if(!s)fail(401,'Please sign in.');return s;}
 function session(res,u){const token=random(),csrf=random();db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),u.id,csrf,Date.now()+8*60*60*1000);res.setHeader('Set-Cookie',`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${production?'; Secure':''}`);return csrf;}
 const staticFiles=new Set(['index.html','styles.css','app.js','rta-core.js','rta-portal.js','rta-pdf.js','portal-api.js','account-ui.js','login.js','setup.html','setup.js','employee-login.html','employee-login.js','distributor-login.html','distributor-login.js']);
 const server=http.createServer(async(req,res)=>{
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://cdn.sheetjs.com; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
   if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
   const send=(status,payload)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));};
   try{
    const url=new URL(req.url,'http://localhost');const route=url.pathname;
    if(!route.startsWith('/api/')){
      if(!['GET','HEAD'].includes(req.method))fail(405,'Method not allowed.');
      const file=route==='/'?'index.html':route.slice(1);if(!staticFiles.has(file))fail(404,'Not found.');
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(req.method==='HEAD'?undefined:fs.readFileSync(path.join(__dirname,file)));return;
    }
    if(route==='/api/health'&&req.method==='GET'){statement('SELECT 1');send(200,{ok:true});return;}
    const mutation=!['GET','HEAD'].includes(req.method);
    if(mutation){
      const expected=configuredOrigin||`http://${req.headers.host}`;
      if(req.headers.origin!==expected)fail(403,'Request origin is not allowed.');
      if(!String(req.headers['content-type']||'').startsWith('application/json'))fail(415,'JSON content type required.');
    }
    if(route==='/api/setup-status'&&req.method==='GET'){send(200,{needsSetup:!statement('SELECT id FROM users LIMIT 1')});return;}
    if(route==='/api/setup'&&req.method==='POST'){
      rate('setup:'+req.socket.remoteAddress,10);const b=await body(req);
      if(statement('SELECT id FROM users LIMIT 1'))fail(409,'Initial setup is already complete.');
      if(typeof b.token!=='string'||!crypto.timingSafeEqual(Buffer.from(hash(b.token)),Buffer.from(hash(setupToken))))fail(403,'Invalid setup token.');
      const mail=email(b.email),name=String(b.name||'').trim().slice(0,100);if(!name)fail(400,'Name is required.');
      const ph=await passwordHash(b.password),id=crypto.randomUUID();
      transaction(()=>{if(statement('SELECT id FROM users LIMIT 1'))fail(409,'Setup already complete.');db.prepare('INSERT INTO workspaces(id,name) VALUES(1,?)').run('Distributor workspace');db.prepare('INSERT INTO users(id,workspace_id,email,name,role,password_hash) VALUES(?,1,?,?,?,?)').run(id,mail,name,'distributor',ph);});
      send(201,{ok:true});return;
    }
    if(route==='/api/login'&&req.method==='POST'){
      const b=await body(req),mail=email(b.email);rate('ip:'+req.socket.remoteAddress,40);rate('email:'+mail,10);
      const u=statement('SELECT * FROM users WHERE email=?',mail);const dummy='dummy:'+ '00'.repeat(64);
      const valid=await verify(b.password,u?.password_hash||dummy);
      const current=u&&statement('SELECT * FROM users WHERE id=?',u.id);
      if(!valid||!current?.active||current.role!==b.role||current.password_hash!==u.password_hash)fail(401,'Email, password or login type is incorrect.');
      db.prepare('DELETE FROM attempts WHERE key=?').run('email:'+mail);
      const csrf=session(res,u);audit(u,'login');send(200,{user:publicUser(u),csrf});return;
    }
    const u=authenticate(req);
    if(mutation&&req.headers['x-csrf-token']!==u.csrf)fail(403,'Session verification failed. Refresh and try again.');
    if(route==='/api/me'&&req.method==='GET'){send(200,{user:publicUser(u),csrf:u.csrf});return;}
    if(route==='/api/logout'&&req.method==='POST'){
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(u.token_hash);res.setHeader('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${production?'; Secure':''}`);send(200,{ok:true});return;
    }
    if(route==='/api/password'&&req.method==='POST'){
      rate('password:'+u.id,10);const b=await body(req);if(!await verify(b.currentPassword,u.password_hash))fail(400,'Current password is incorrect.');const ph=await passwordHash(b.password);
      transaction(()=>{if(statement('SELECT password_hash FROM users WHERE id=?',u.id).password_hash!==u.password_hash)fail(409,'Your account changed. Sign in again.');db.prepare('UPDATE users SET password_hash=?,must_change=0 WHERE id=?').run(ph,u.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);audit(u,'password_changed');});
      const csrf=session(res,u);send(200,{user:{...publicUser(u),mustChangePassword:false},csrf});return;
    }
    if(u.must_change)fail(403,'Change your temporary password before accessing portfolio data.');
    if(route==='/api/state'&&req.method==='GET'){send(200,state(u.workspace_id));return;}
    if(route==='/api/imports'&&req.method==='POST'){
      if(u.role!=='distributor')fail(403,'Only distributors can upload reports.');const b=await body(req);
      if(!Array.isArray(b.files)||!b.files.length||b.files.length>25)fail(400,'Select between 1 and 25 report files.');
      const result=transaction(()=>{
        revision(u,b.revision);let next=state(u.workspace_id).datasets;const summaries=[];
        for(const file of b.files){const category=categories[file.code],d=file.data;if(!category||!d||!Array.isArray(d.headers)||!Array.isArray(d.records)||d.headers.length>200||d.records.length>100000||!d.headers.length||!d.records.length)fail(400,'Invalid or unsupported report.');
          if(d.headers.some(h=>typeof h!=='string'||h.length>200)||d.records.some(r=>!Array.isArray(r)||r.length!==d.headers.length||r.some(v=>typeof v!=='string'||v.length>10000)))fail(400,'Invalid report cells.');
          const incoming={headers:d.headers,records:d.records,category,sourceCode:file.code,filename:String(d.filename||file.code).slice(0,200),importedAt:new Date().toISOString()};
          let merged;try{merged=RTA.merge(next,incoming,file.code);}catch(e){fail(400,e.message);}next=merged.datasets;summaries.push({code:file.code,...merged.data.importSummary});
        }
        writeDatasets(u,next);audit(u,'reports_imported',{summaries});return {...state(u.workspace_id),summaries};
      });send(200,result);return;
    }
    if(route==='/api/datasets'&&req.method==='DELETE'){
      if(u.role!=='distributor')fail(403,'Only distributors can clear data.');const b=await body(req);
      transaction(()=>{revision(u,b.revision);writeDatasets(u,{});audit(u,'reports_cleared');});send(200,state(u.workspace_id));return;
    }
    if(route==='/api/families'&&req.method==='PUT'){
      if(u.role!=='distributor')fail(403,'Only distributors can manage families.');const b=await body(req);
      if(!b.families||typeof b.families!=='object'||Array.isArray(b.families)||Object.keys(b.families).length>2000)fail(400,'Invalid families.');
      for(const [id,f] of Object.entries(b.families))if(!/^[a-zA-Z0-9-]{1,100}$/.test(id)||!f||typeof f.name!=='string'||!f.name.trim()||f.name.length>80||!Array.isArray(f.members)||!f.members.length||f.members.length>500||f.members.some(m=>typeof m!=='string'||m.length>500||!m.match(/^(pan:|folio:)/)))fail(400,'Invalid family membership.');
      transaction(()=>{revision(u,b.revision);db.prepare('DELETE FROM families WHERE workspace_id=?').run(u.workspace_id);for(const [id,f] of Object.entries(b.families))db.prepare('INSERT INTO families VALUES(?,?,?)').run(u.workspace_id,id,JSON.stringify({name:f.name.trim(),members:[...new Set(f.members)]}));increment(u);audit(u,'families_updated');});send(200,state(u.workspace_id));return;
    }
    if(route==='/api/users'&&req.method==='GET'){
      if(u.role!=='distributor')fail(403,'Distributor access required.');send(200,{users:db.prepare('SELECT id,email,name,role,active,must_change FROM users WHERE workspace_id=? ORDER BY name').all(u.workspace_id)});return;
    }
    if(route==='/api/users'&&req.method==='POST'){
      if(u.role!=='distributor')fail(403,'Distributor access required.');const b=await body(req),mail=email(b.email),name=String(b.name||'').trim();if(!name||name.length>100)fail(400,'Enter an employee name.');
      const ph=await passwordHash(b.password);if(statement('SELECT id FROM users WHERE email=?',mail))fail(409,'This email already has an account.');
      transaction(()=>{db.prepare('INSERT INTO users(id,workspace_id,email,name,role,password_hash,must_change) VALUES(?,?,?,?,?,?,1)').run(crypto.randomUUID(),u.workspace_id,mail,name,'employee',ph);audit(u,'employee_created',{email:mail});});send(201,{ok:true});return;
    }
    if(route.startsWith('/api/users/')&&req.method==='PATCH'){
      if(u.role!=='distributor')fail(403,'Distributor access required.');const id=route.slice('/api/users/'.length),target=statement('SELECT * FROM users WHERE id=? AND workspace_id=? AND role=?',id,u.workspace_id,'employee');if(!target)fail(404,'Employee not found.');const b=await body(req);let ph;if(b.password!==undefined)ph=await passwordHash(b.password);if(b.active!==undefined&&typeof b.active!=='boolean')fail(400,'Invalid active status.');
      transaction(()=>{if(ph)db.prepare('UPDATE users SET password_hash=?,must_change=1 WHERE id=?').run(ph,id);if(b.active!==undefined)db.prepare('UPDATE users SET active=? WHERE id=?').run(b.active?1:0,id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);audit(u,'employee_updated',{id,passwordReset:Boolean(ph),active:b.active});});send(200,{ok:true});return;
    }
    fail(404,'API route not found.');
   }catch(e){if(!res.headersSent)send(e.status||500,{error:e.status?e.message:'Server error. Please try again.'});else res.end();if(!e.status)console.error('Portal request failed:',e.message);}
 });
 server.on('close',()=>db.close());server.requestTimeout=30000;
 return {server,db,setupToken};
}
if(require.main===module){
 const app=createPortal();const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
 app.server.listen(port,host,()=>{
  console.log(`Artha portal listening on ${host}:${port}`);
  if(!app.db.prepare('SELECT id FROM users LIMIT 1').get())console.log(process.env.SETUP_TOKEN?'Initial setup: open /setup.html and use SETUP_TOKEN from your hosting environment.':`Initial setup: open /setup.html. Setup token: ${app.setupToken}`);
 });
 let stopping=false;
 const stop=()=>{
  if(stopping)return;stopping=true;console.log('Closing portal connections for shutdown.');
  app.server.close();app.server.closeIdleConnections();
  setTimeout(()=>app.server.closeAllConnections(),25000).unref();
 };
 process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
module.exports={createPortal,passwordHash};
