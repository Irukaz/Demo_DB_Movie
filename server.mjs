import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createStore } from './store.mjs';
import { createServer } from './http.mjs';

if(!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before starting Cinema67');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000});
pool.on('error',e=>console.error('Database connection error:',e.code||e.name));
const store=await createStore(pool);
const root=fileURLToPath(new URL('./dist',import.meta.url));
const assets=new Map();
function collect(dir,prefix='') {for(const entry of readdirSync(dir,{withFileTypes:true})) {const key=prefix+entry.name;if(entry.isDirectory())collect(path.join(dir,entry.name),key+'/');else assets.set(key,readFileSync(path.join(dir,entry.name)));}}
collect(root);
const server=createServer(store,assets);
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Cinema67 ready with PostgreSQL'));
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close(async()=>{await pool.end();process.exit(0)}));
