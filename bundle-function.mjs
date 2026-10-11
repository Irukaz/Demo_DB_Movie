import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { buildSeed } from './seed.mjs';
import { brotliCompressSync } from 'node:zlib';

const seed=buildSeed();
const base=Date.now();
const schema=readFileSync(new URL('./schema.sql',import.meta.url),'utf8');
const store=readFileSync(new URL('./store.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('readFileSync(new URL(\'./schema.sql\',import.meta.url),\'utf8\')','SCHEMA');
const http=readFileSync(new URL('./http.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const entries=[];
for(const name of ['index.html','app.js','films.js','theme.js','style.css']) entries.push([name,readFileSync(new URL('./dist/'+name,import.meta.url)).toString('base64')]);
const packed=brotliCompressSync(Buffer.from(JSON.stringify(entries))).toString('base64');
const posters={dune:'6izwz7rsy95ARzTR3poZ8H6c5pp.jpg',inception:'oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',interstellar:'gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',spiderverse:'8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg',oppenheimer:'ptpr0kGAckfQkJeJIt8st5dglvd.jpg',yourname:'q719jXXEzOoYaps6babgKnONONX.jpg'};
const imageRoutes=Object.entries(posters).map(([name,file])=>['assets/'+name+'.jpg','https://image.tmdb.org/t/p/w500/'+file]);
imageRoutes.push(['assets/coach.jpg','https://cdn.majorcineplex.com/uploads/movie/5200/thumb_5200.jpg']);
const relational=readFileSync(new URL('./relational.mjs',import.meta.url),'utf8');
const source=`import http from 'node:http';
import { brotliDecompressSync } from 'node:zlib';
import { Pool } from 'pg@8.16.3';
const SCHEMA=${JSON.stringify(schema)};
const seedFixture=${JSON.stringify(seed)};
function buildSeed(){
 const data=structuredClone(seedFixture), delta=Date.now()-${base};
 const dayOffset=Math.floor((Date.now()+25200000)/86400000)-Math.floor((${base}+25200000)/86400000);
 const shiftDate=value=>new Date(new Date(value+'T12:00:00+07:00').getTime()+dayOffset*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'});
 for(const b of data.bookings){b.date=shiftDate(b.date);b.created+=delta;if(b.deadline)b.deadline+=delta;}
 for(const r of data.requests){r.date=shiftDate(r.date);r.created+=delta;}
 for(const c of data.complaints)c.created+=delta;
 return data;
}
${relational}
${store}
${http}
const packed=${JSON.stringify(packed)};
const assets=new Map(JSON.parse(brotliDecompressSync(Buffer.from(packed,'base64')).toString()).map(([name,base64])=>[name,Buffer.from(base64,'base64')]));
for(const [name,url] of ${JSON.stringify(imageRoutes)}) assets.set(name,url);
if(!Bun.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:Bun.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000});
pool.on('error',e=>console.error('Database connection error:',e.code||e.name));
const store=await createStore(pool);
const server=createServer(store,assets,Bun.env.APP_ORIGIN);
server.listen(Number(Bun.env.PORT)||3000,'0.0.0.0',()=>console.log('Cinema67 ready with PostgreSQL'));
`;
const body=source.slice(source.indexOf('const SCHEMA=')).replace(/\bexport /g,'');
const compressed=brotliCompressSync(Buffer.from(body)).toString('base64');
const deploymentSource="import http from 'node:http';\nimport {brotliDecompressSync} from 'node:zlib';\nimport {Pool} from 'pg@8.16.3';\nconst AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;\nawait new AsyncFunction('Bun','Pool','http','brotliDecompressSync',brotliDecompressSync(Buffer.from("+JSON.stringify(compressed)+",'base64')).toString())(Bun,Pool,http,brotliDecompressSync);\n";
writeFileSync(new URL('./railway-function.ts',import.meta.url),deploymentSource);
if(Buffer.byteLength(deploymentSource)>96*1024)throw new Error('Railway function exceeds 96 KB');
console.log(JSON.stringify({bytes:Buffer.byteLength(deploymentSource),assets:entries.length}));
