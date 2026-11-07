/* Offline administrator recovery. NEW_PASSWORD is read from the environment. */
const {createPortal,passwordHash}=require('./server.cjs');
(async()=>{
 const [command,target]=process.argv.slice(2);const app=createPortal();
 try{
  if(command==='reset-distributor'){
   if(!target||!process.env.NEW_PASSWORD)throw Error('Set NEW_PASSWORD, then run: node manage.cjs reset-distributor email');
   const user=app.db.prepare("SELECT * FROM users WHERE email=? AND role='distributor'").get(target.trim().toLowerCase());if(!user)throw Error('Distributor not found.');
   const ph=await passwordHash(process.env.NEW_PASSWORD);app.db.exec('BEGIN IMMEDIATE');try{app.db.prepare('UPDATE users SET password_hash=?,must_change=1 WHERE id=?').run(ph,user.id);app.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);app.db.prepare('INSERT INTO audit(workspace_id,user_id,action,detail,created_at) VALUES(?,?,?,?,?)').run(user.workspace_id,user.id,'administrator_recovery','{}',new Date().toISOString());app.db.exec('COMMIT');}catch(e){app.db.exec('ROLLBACK');throw e;}console.log('Distributor password reset; all existing sessions revoked.');
  }else if(command==='backup'){
   if(!target)throw Error('Usage: node manage.cjs backup destination.sqlite');const {backup}=require('node:sqlite');await backup(app.db,target);console.log('Consistent database backup completed.');
  }else throw Error('Commands: reset-distributor email | backup destination.sqlite');
 }finally{app.db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
