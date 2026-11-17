import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Pool} from 'pg';

// Local deployments use an atomic file; serverless deployments require PostgreSQL.
// The two adapters share transactional semantics and never expose records over HTTP.
export async function createAccountStore({directory,databaseUrl,schema='public'}) {
  if (!databaseUrl) {
    await fs.mkdir(directory,{recursive:true});
    const file=path.join(directory,'accounts.json');
    let state;
    try {state=JSON.parse(await fs.readFile(file,'utf8'));}
    catch(error){if(error.code!=='ENOENT')throw error;state={version:1,rows:{}};}
    if(state.version!==1||!state.rows)throw Error('Invalid account storage');
    let queue=Promise.resolve();
    const transaction=operation=>{
      const pending=queue.then(async()=>{
        const draft=structuredClone(state);
        const key=(kind,id)=>kind+':'+id;
        const tx={
          get:async(kind,id)=>structuredClone(draft.rows[key(kind,id)]?.data||null),
          list:async(kind,owner)=>Object.values(draft.rows).filter(row=>row.kind===kind&&(owner===undefined||row.owner===owner)).map(row=>structuredClone(row.data)),
          put:async(kind,id,owner,data)=>{draft.rows[key(kind,id)]={kind,id,owner,data:structuredClone(data)};},
          remove:async(kind,id)=>{delete draft.rows[key(kind,id)];},
        };
        const result=await operation(tx);
        if(JSON.stringify(draft)!==JSON.stringify(state)){
          const temporary=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
          try{await fs.writeFile(temporary,JSON.stringify(draft),{mode:0o600});await fs.rename(temporary,file);}
          finally{await fs.rm(temporary,{force:true});}
          state=draft;
        }
        return result;
      });
      queue=pending.catch(()=>{});
      return pending;
    };
    return {transaction,close:()=>queue,mode:'local'};
  }
  if(!/^[a-z][a-z0-9_]{0,39}$/.test(schema))throw Error('Invalid database schema');
  const connection=new URL(databaseUrl);
  if(!['localhost','127.0.0.1','[::1]'].includes(connection.hostname))connection.searchParams.set('sslmode','verify-full');
  const pool=new Pool({connectionString:connection.href,max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:20000,allowExitOnIdle:true});
  const table=`"${schema}"."jy_members"`;
  const initialization=await pool.connect();
  try{
    await initialization.query('BEGIN');await initialization.query('SELECT pg_advisory_xact_lock(hashtext($1))',['jy-members:'+schema]);
    await initialization.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"; CREATE TABLE IF NOT EXISTS ${table} (kind text NOT NULL,id text NOT NULL,owner text NOT NULL,data jsonb NOT NULL,PRIMARY KEY(kind,id)); CREATE INDEX IF NOT EXISTS jy_members_owner ON ${table} (kind,owner);`);
    await initialization.query('COMMIT');
  }catch(error){await initialization.query('ROLLBACK');initialization.release();await pool.end();throw error;}
  initialization.release();
  const transaction=async operation=>{
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      // Small atomic account/draft mutations also serialize across function instances.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['jy-members:'+schema]);
      const tx={
        get:async(kind,id)=>(await client.query(`SELECT data FROM ${table} WHERE kind=$1 AND id=$2`,[kind,id])).rows[0]?.data||null,
        list:async(kind,owner)=>(await client.query(`SELECT data FROM ${table} WHERE kind=$1${owner===undefined?'':' AND owner=$2'}`,owner===undefined?[kind]:[kind,owner])).rows.map(row=>row.data),
        put:async(kind,id,owner,data)=>{await client.query(`INSERT INTO ${table}(kind,id,owner,data) VALUES($1,$2,$3,$4) ON CONFLICT(kind,id) DO UPDATE SET owner=EXCLUDED.owner,data=EXCLUDED.data`,[kind,id,owner,JSON.stringify(data)]);},
        remove:async(kind,id)=>{await client.query(`DELETE FROM ${table} WHERE kind=$1 AND id=$2`,[kind,id]);},
      };
      const result=await operation(tx);await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  };
  return {transaction,close:()=>pool.end(),mode:'postgres'};
}
