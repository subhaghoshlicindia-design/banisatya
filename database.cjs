'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const fs=require('node:fs'),path=require('node:path');
// All schema and parameterized queries use the common SQLite/Postgres subset.
const pgSql=sql=>{let i=0;return sql.replace(/\?/g,()=>'$'+(++i));};
async function openDatabase(options={}){
 const production=options.production??process.env.NODE_ENV==='production';
 const connectionString=options.databaseUrl||(options.database?undefined:process.env.DATABASE_URL);
 const context=new AsyncLocalStorage();let db;
 if(connectionString){
  const url=new URL(connectionString);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('DATABASE_URL must be a PostgreSQL connection string.');
  // Never let URL sslmode flags override certificate verification.
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
  const {Pool}=require('pg');
  const pool=options.pool||new Pool({connectionString:url.toString(),ssl:['localhost','127.0.0.1','[::1]'].includes(url.hostname)?undefined:{rejectUnauthorized:true},max:4,idleTimeoutMillis:10000,connectionTimeoutMillis:15000});
  pool.on('error',()=>console.error('Database pool connection interrupted.'));
  const query=async(sql,args=[])=>{const client=context.getStore()||pool;return client.query(pgSql(sql),args);};
  db={kind:'postgres',query,exec:sql=>query(sql),get:async(sql,...args)=>(await query(sql,args)).rows[0],all:async(sql,...args)=>(await query(sql,args)).rows,run:async(sql,...args)=>query(sql,args),close:()=>pool.end()};
  db.transaction=async fn=>{
   if(context.getStore())return fn();
   const client=await pool.connect();
   try{await client.query('BEGIN');const result=await context.run(client,fn);await client.query('COMMIT');return result;}
   catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  };
 }else{
  if(production&&!options.database)throw Error('DATABASE_URL is required in production. Refusing to save accounts on temporary server storage.');
  const file=options.database||process.env.DATABASE_PATH||path.join(__dirname,'data','portal.sqlite');
  if(file!==':memory:')fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
  const {DatabaseSync}=require('node:sqlite');const sqlite=new DatabaseSync(file);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  // One connection must not interleave another request inside an async transaction.
  let tail=Promise.resolve();
  const locked=async fn=>{if(context.getStore())return fn();let release;const next=new Promise(r=>release=r),previous=tail;tail=next;await previous;try{return await context.run(true,fn);}finally{release();}};
  db={kind:'sqlite',raw:sqlite,get:(sql,...args)=>locked(()=>sqlite.prepare(sql).get(...args)),all:(sql,...args)=>locked(()=>sqlite.prepare(sql).all(...args)),run:(sql,...args)=>locked(()=>sqlite.prepare(sql).run(...args)),exec:sql=>locked(()=>sqlite.exec(sql)),close:()=>{sqlite.close();}};
  db.transaction=fn=>locked(async()=>{if(db.inTransaction)return fn();db.inTransaction=true;sqlite.exec('BEGIN IMMEDIATE');try{const result=await fn();sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}finally{db.inTransaction=false;}});
 }
 const identity=db.kind==='postgres'?'BIGSERIAL PRIMARY KEY':'INTEGER PRIMARY KEY';
 try{await db.transaction(async()=>{
  if(db.kind==='postgres')await db.run('SELECT pg_advisory_xact_lock(78241355)');
  await db.exec(`
   CREATE TABLE IF NOT EXISTS workspaces(id INTEGER PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, workspace_id INTEGER NOT NULL REFERENCES workspaces(id), email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('distributor','employee')), password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires BIGINT NOT NULL);
   CREATE TABLE IF NOT EXISTS datasets(workspace_id INTEGER NOT NULL REFERENCES workspaces(id), code TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(workspace_id,code));
   CREATE TABLE IF NOT EXISTS families(workspace_id INTEGER NOT NULL REFERENCES workspaces(id), id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(workspace_id,id));
   CREATE TABLE IF NOT EXISTS audit(id ${identity}, workspace_id INTEGER NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until BIGINT NOT NULL);
  `);
 });}catch(e){await db.close();throw e;}
 return db;
}
module.exports={openDatabase,pgSql};
