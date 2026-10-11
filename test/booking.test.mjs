import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createStore } from '../store.mjs';
import { createServer } from '../http.mjs';
import { buildSeed } from '../seed.mjs';
import { keyId } from '../relational.mjs';

test('shared PostgreSQL booking transactions, validation, cancellation, expiry and reset',async()=>{
  const pg=new PGlite();
  let tail=Promise.resolve();
  const query=async(sql,args)=>args===undefined&&sql.includes(';')?{rows:await pg.exec(sql)}:pg.query(sql,args);
  const pool={query,connect:async()=>{
    const preceding=tail;let release;tail=new Promise(resolve=>release=resolve);await preceding;
    return {query,release};
  }};
  const store=await createStore(pool);
  const first=await store.get();
  assert.equal(first.data.movies[0].name,'Dune: Part Two');
  const user=await store.register({firstName:'Demo',lastName:'Member',email:'demo@example.com',phone:'0812345678',password:'Demo1234'});
  assert.equal((await store.authenticate('DEMO@example.com','Demo1234')).id,user.id);
  await assert.rejects(store.register({firstName:'ซ้ำ',lastName:'อีเมล',email:'demo@example.com',phone:'0822222222',password:'Demo1234'}),e=>e.status===409);
  await assert.rejects(store.register({firstName:'ซ้ำ',lastName:'เบอร์',email:'new@example.com',phone:'0812345678',password:'Demo1234'}),e=>e.status===409);
  const next=structuredClone(first.data);
  const draft={...next.bookings[0],id:'C67-1004',seats:['C1','C2'],status:'pending',items:{p3:1},promo:'MOVIE10',amount:1,discount:999,deadline:Date.now()+600000};
  next.bookings.push(draft);next.nextId++;
  // Two clients use the same revision. Only one transaction may commit.
  const attempts=await Promise.allSettled([store.put(structuredClone(next),first.revision,user),store.put(structuredClone(next),first.revision,user)]);
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);
  const rejected=attempts.find(a=>a.status==='rejected');assert.equal(rejected.reason.status,409);
  let state=await store.get();let booking=state.data.bookings.find(b=>b.id==='C67-1004');
  assert.equal(booking.amount,458);assert.equal(booking.discount,51);
  const duplicate=structuredClone(state.data);duplicate.bookings.push({...booking,id:'C67-1005'});duplicate.nextId++;
  await assert.rejects(store.put(duplicate,state.revision,user),e=>e.status===409);
  // Database unique index protects the seat independently of JavaScript validation.
  await assert.rejects(pg.query("INSERT INTO cinema67.ticket(ticket_id,order_id,showtime_seat_id,promotion_id,ticket_code,book_datetime,ticket_status) SELECT ticket_id+1,order_id,showtime_seat_id,promotion_id,'DUPLICATE',book_datetime,ticket_status FROM cinema67.ticket WHERE order_id=$1 LIMIT 1",[keyId('C67-1004')]),e=>e.code==='23505');
  booking.status='paid';state=await store.put(state.data,state.revision);
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM cinema67.ticket WHERE order_id=${keyId('C67-1004')}`)).rows[0].n,2);
  const tampered=structuredClone(state.data);tampered.bookings.find(b=>b.id==='C67-1004').amount=0;
  await assert.rejects(store.put(tampered,state.revision),/แก้ยอด/);
  state.data.bookings.find(b=>b.id==='C67-1004').status='cancelled';state=await store.put(state.data,state.revision);
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM cinema67.ticket WHERE order_id=${keyId('C67-1004')} AND ticket_status IN ('HELD','BOOKED')`)).rows[0].n,0);
  const exp=structuredClone(state.data);exp.bookings.push({...draft,id:'C67-1005',status:'pending'});exp.nextId++;
  state=await store.put(exp,state.revision,user);
  state.data.bookings.find(b=>b.id==='C67-1005').deadline=Date.now()-1;
  state=await store.put(state.data,state.revision);assert.equal(state.data.bookings.at(-1).status,'expired');
  // A new store simulates restart: existing records survive initialization.
  const restarted=await createStore(pool);assert.equal((await restarted.get()).data.bookings.length,5);
  const legacy=structuredClone(state.data);
  delete legacy.catalogueVersion;
  legacy.movies=legacy.movies.filter(m=>Number(m.id.slice(1))<8);
  legacy.rooms=legacy.rooms.filter(r=>Number(r.movie.slice(1))<8);
  await pg.query('UPDATE demo_state SET data=$1 WHERE id=1',[legacy]);
  const upgraded=await createStore(pool), migrated=await upgraded.get();
  assert.equal(migrated.data.movies.length,15);
  assert.equal(migrated.data.bookings.length,5);
  assert.deepEqual(migrated.data.bookings,state.data.bookings);
  assert.equal(migrated.data.rooms.filter(r=>r.movie==='m11').length,3);
  const secondUpgrade=await createStore(pool);
  assert.equal((await secondUpgrade.get()).revision,migrated.revision);
  state=migrated;
  const dbView=await restarted.database();assert.equal(dbView.tables.length,15);assert.equal(dbView.tables.find(t=>t.name==='MOVIE').count,15);
  const reset=await restarted.reset(state.revision);assert.equal(reset.data.bookings.length,buildSeed().bookings.length);
  const server=createServer(store,new Map([['index.html',Buffer.from('<html>Demo</html>')]]),undefined,'test-auth-secret');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(url+'/api/health')).status,200);
    assert.equal((await fetch(url+'/')).status,200);
    const login=await fetch(url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({email:'demo@example.com',password:'Demo1234'})});
    assert.equal(login.status,200);const session=login.headers.get('set-cookie').split(';')[0];
    assert.equal((await (await fetch(url+'/api/auth/me',{headers:{Cookie:session}})).json()).user.email,'demo@example.com');
    const body=JSON.stringify({revision:reset.revision});
    assert.equal((await fetch(url+'/api/reset',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.test'},body})).status,403);
    assert.equal((await fetch(url+'/api/reset',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body})).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));await pg.close();}
});

