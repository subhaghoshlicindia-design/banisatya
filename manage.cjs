/* Administrator operations. Credentials are read from the environment, not arguments. */
const {createPortal,passwordHash}=require('./server.cjs');
const fs=require('node:fs');
const tables={workspaces:['id','name','revision'],users:['id','workspace_id','email','name','role','password_hash','active','must_change'],datasets:['workspace_id','code','data'],families:['workspace_id','id','data'],audit:['id','workspace_id','user_id','action','detail','created_at']};
(async()=>{
 const [command,target]=process.argv.slice(2);const app=await createPortal(),db=app.db;
 try{
  if(command==='reset-distributor'){
   if(!target||!process.env.NEW_PASSWORD)throw Error('Set NEW_PASSWORD, then run: node manage.cjs reset-distributor email');
   const user=await db.get("SELECT * FROM users WHERE email=? AND role='distributor'",target.trim().toLowerCase());if(!user)throw Error('Distributor not found.');
   const ph=await passwordHash(process.env.NEW_PASSWORD);
   await db.transaction(async()=>{await db.run('UPDATE users SET password_hash=?,must_change=1 WHERE id=?',ph,user.id);await db.run('DELETE FROM sessions WHERE user_id=?',user.id);await db.run('INSERT INTO audit(workspace_id,user_id,action,detail,created_at) VALUES(?,?,?,?,?)',user.workspace_id,user.id,'administrator_recovery','{}',new Date().toISOString());});
   console.log('Distributor password reset; all existing sessions revoked.');
  }else if(command==='backup'){
   if(!target)throw Error('Usage: node manage.cjs backup destination.backup.json (or destination.sqlite for local SQLite)');
   if(db.kind==='sqlite'&&target.endsWith('.sqlite')){const {backup}=require('node:sqlite');await backup(db.raw,target);}
   else{
    if(!target.endsWith('.backup.json'))throw Error('Use a private destination ending in .backup.json.');
    const data=await db.transaction(async()=>{
     if(db.kind==='postgres')await db.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
     const snapshot={version:1,createdAt:new Date().toISOString(),tables:{}};
     for(const table of Object.keys(tables))snapshot.tables[table]=await db.all('SELECT * FROM '+table);
     return snapshot;
    });
    fs.writeFileSync(target,JSON.stringify(data),{flag:'wx',mode:0o600});
   }
   console.log('Consistent private backup completed. Account password hashes are included; store it securely.');
  }else if(command==='migrate-sqlite'){
   if(db.kind!=='postgres'||!target)throw Error('Set DATABASE_URL to an empty PostgreSQL database, then run: node manage.cjs migrate-sqlite local.sqlite');
   const {DatabaseSync}=require('node:sqlite');const source=new DatabaseSync(target,{readOnly:true});
   try{await db.transaction(async()=>{
    await db.run('SELECT pg_advisory_xact_lock(78241355)');
    if(await db.get('SELECT id FROM users LIMIT 1')||await db.get('SELECT id FROM workspaces LIMIT 1'))throw Error('Destination is not empty. Migration cancelled; no data changed.');
    for(const [table,columns] of Object.entries(tables))for(const row of source.prepare('SELECT * FROM '+table).all())await db.run(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`,...columns.map(c=>row[c]));
    await db.run("SELECT setval(pg_get_serial_sequence('audit','id'),COALESCE((SELECT MAX(id) FROM audit),1),EXISTS(SELECT 1 FROM audit))");
   });}finally{source.close();}
   console.log('SQLite migration completed. Accounts, reports and families copied; users must sign in again. Source database preserved.');
  }else throw Error('Commands: reset-distributor email | backup destination | migrate-sqlite source.sqlite');
 }finally{await db.close();}
})().catch(()=>{console.error('Administrator command failed. Check the command, private destination and database configuration. No credentials have been logged.');process.exitCode=1;});
