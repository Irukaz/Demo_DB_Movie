import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg'};
const cookieName='cinema67_session';
const sign=(value,secret)=>createHmac('sha256',secret).update(value).digest('base64url');
const tokenFor=(user,secret)=>{const value=Buffer.from(JSON.stringify({id:user.id,exp:Date.now()+604800000})).toString('base64url');return value+'.'+sign(value,secret)};
const tokenData=(token,secret)=>{try{const [value,signature]=token.split('.'),a=Buffer.from(signature),b=Buffer.from(sign(value,secret));if(a.length!==b.length||!timingSafeEqual(a,b))return null;const data=JSON.parse(Buffer.from(value,'base64url'));return data.exp>Date.now()?data:null}catch{return null}};
const cookie=(req,name)=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim().split('=')))[name];

export function createServer(store, assets, origin = process.env.APP_ORIGIN, authSecret = process.env.AUTH_SECRET) {
  if(!authSecret)throw new Error('AUTH_SECRET is required');
  const send=(res,status,body,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(JSON.stringify(body));};
  const sameOrigin=req=>{const expected=origin||`${req.headers['x-forwarded-proto']||'http'}://${req.headers.host}`;return req.headers.origin===expected&&req.headers['sec-fetch-site']!=='cross-site'};
  const readJson=async(req,res)=>{if(!req.headers['content-type']?.startsWith('application/json')){send(res,415,{error:'ต้องส่งข้อมูล JSON'});return}let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>2_000_000){send(res,413,{error:'ข้อมูลใหญ่เกินขอบเขต Demo'});return}body+=chunk}try{return JSON.parse(body)}catch{send(res,400,{error:'JSON ไม่ถูกต้อง'})}};
  const sessionUser=async req=>{const data=tokenData(cookie(req,cookieName)||'',authSecret);return data?store.customer(data.id):null};
  return http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    try {
      const pathname=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET'&&pathname==='/api/health'){await store.get();return send(res,200,{ok:true,database:'PostgreSQL',mode:'shared-demo',login:true})}
      if(req.method==='GET'&&pathname==='/api/auth/me')return send(res,200,{user:await sessionUser(req)});
      if(req.method==='POST'&&['/api/auth/register','/api/auth/login','/api/auth/logout'].includes(pathname)){
        if(!sameOrigin(req))return send(res,403,{error:'ไม่อนุญาตคำขอจากเว็บไซต์อื่น'});
        const secure=String(origin||req.headers['x-forwarded-proto']||'').startsWith('https');
        if(pathname==='/api/auth/logout')return send(res,200,{ok:true},{'set-cookie':`${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure?'; Secure':''}`});
        const input=await readJson(req,res);if(!input)return;
        const user=pathname.endsWith('register')?await store.register(input):await store.authenticate(input.email,input.password);
        return send(res,200,{user},{'set-cookie':`${cookieName}=${tokenFor(user,authSecret)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure?'; Secure':''}`});
      }
      if(req.method==='GET'&&pathname==='/api/database')return send(res,200,await store.database(new URL(req.url,'http://localhost').searchParams.get('table')));
      if(req.method==='GET'&&pathname==='/api/ddl'){res.writeHead(200,{'content-type':'text/plain; charset=utf-8','content-disposition':'attachment; filename=cinema67-ddl.sql'});return res.end(store.ddl())}
      if(req.method==='GET'&&pathname==='/api/state')return send(res,200,await store.get());
      if(req.method==='POST'&&['/api/state','/api/reset'].includes(pathname)){
        if(!sameOrigin(req))return send(res,403,{error:'ไม่อนุญาตคำขอจากเว็บไซต์อื่น'});
        const input=await readJson(req,res);if(!input)return;
        const value=pathname==='/api/reset'?await store.reset(input.revision):await store.put(input.data,input.revision,await sessionUser(req));
        return send(res,200,value);
      }
      if(pathname.startsWith('/api/'))return send(res,404,{error:'ไม่พบคำสั่งนี้'});
      if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'ไม่รองรับคำขอนี้'});
      const key=pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1)),asset=assets.get(key);
      if(!asset)return send(res,404,{error:'ไม่พบไฟล์'});if(typeof asset==='string'){res.writeHead(302,{location:asset,'cache-control':'public, max-age=86400'});return res.end()}
      const extension=key.slice(key.lastIndexOf('.'));res.writeHead(200,{'content-type':types[extension]||'application/octet-stream','cache-control':'no-cache'});res.end(req.method==='HEAD'?undefined:asset);
    }catch(e){if(e.status)return send(res,e.status,{error:e.message});console.error('Request failed:',e.code||e.name);send(res,500,{error:'บันทึกไม่สำเร็จ กรุณาลองใหม่'})}
  });
}

