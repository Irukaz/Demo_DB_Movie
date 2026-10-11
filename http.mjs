import http from 'node:http';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg'};
export function createServer(store, assets, origin = process.env.APP_ORIGIN) {
  const send=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));};
  return http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    try {
      const pathname=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET'&&pathname==='/api/health') {await store.get();return send(res,200,{ok:true,database:'PostgreSQL',mode:'shared-demo'});}
      if(req.method==='GET'&&pathname==='/api/database')return send(res,200,await store.database(new URL(req.url,'http://localhost').searchParams.get('table')));
      if(req.method==='GET'&&pathname==='/api/ddl'){res.writeHead(200,{'content-type':'text/plain; charset=utf-8','content-disposition':'attachment; filename=cinema67-ddl.sql'});return res.end(store.ddl());}
      if(req.method==='GET'&&pathname==='/api/state') return send(res,200,await store.get());
      if(req.method==='POST'&&['/api/state','/api/reset'].includes(pathname)) {
        const requestOrigin=req.headers.origin;
        const expected=origin||`${req.headers['x-forwarded-proto']||'http'}://${req.headers.host}`;
        if(!requestOrigin||requestOrigin!==expected||req.headers['sec-fetch-site']==='cross-site') return send(res,403,{error:'ไม่อนุญาตคำขอจากเว็บไซต์อื่น'});
        if(!req.headers['content-type']?.startsWith('application/json')) return send(res,415,{error:'ต้องส่งข้อมูล JSON'});
        let body='',size=0;
        for await(const chunk of req) {size+=chunk.length;if(size>2_000_000){send(res,413,{error:'ข้อมูลใหญ่เกินขอบเขต Demo'});return;}body+=chunk;}
        let input;try{input=JSON.parse(body)}catch{return send(res,400,{error:'JSON ไม่ถูกต้อง'});}
        const value=pathname==='/api/reset'?await store.reset(input.revision):await store.put(input.data,input.revision);
        return send(res,200,value);
      }
      if(pathname.startsWith('/api/')) return send(res,404,{error:'ไม่พบคำสั่งนี้'});
      if(!['GET','HEAD'].includes(req.method)) return send(res,405,{error:'ไม่รองรับคำขอนี้'});
      const key=pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1));
      const asset=assets.get(key);
      if(!asset) return send(res,404,{error:'ไม่พบไฟล์'});
      if(typeof asset==='string') {res.writeHead(302,{location:asset,'cache-control':'public, max-age=86400'});return res.end();}
      const extension=key.slice(key.lastIndexOf('.'));
      res.writeHead(200,{'content-type':types[extension]||'application/octet-stream','cache-control':'no-cache'});
      res.end(req.method==='HEAD'?undefined:asset);
    }catch(e){
      if(e.status) return send(res,e.status,{error:e.message});
      console.error('Request failed:',e.code||e.name);
      send(res,500,{error:'บันทึกไม่สำเร็จ กรุณาลองใหม่'});
    }
  });
}
